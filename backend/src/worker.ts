import pino from 'pino'
import { loadEnv, EnvValidationError } from './config/env.js'
import { buildLoggerOptions } from './config/logger.js'
import { getPrismaClient, disconnectPrisma, pingDatabase } from './db/client.js'
import { createLedgerModule } from './modules/ledger/ledger.module.js'
import { processDueRecurringItems } from './modules/recurring/recurring.worker.js'
import { enqueueDueBillNotifications, enqueueWeeklySummaryNotifications } from './modules/notifications/outbox.js'
import { createEmailProvider } from './modules/notifications/email.js'
import { deliverNotificationOutbox } from './modules/notifications/delivery.js'
import { createQuoteProvider, refreshQuoteSnapshots, type RefreshQuoteSnapshotsPrisma } from './modules/investments/quotes.js'
import { generateDailySnapshots } from './modules/reports/snapshots.worker.js'
import { createFxModule } from './modules/fx/fx.module.js'
import { createFxRatesProvider } from './integrations/adapters/frankfurter/index.js'
import { claimDueJob, enqueueJob, failJob, finishJob } from './modules/worker/jobs.js'
import { recordWorkerJob } from './modules/health/metrics.js'

// The worker runs in the same backend image as the API but owns durable job
// claiming and processing. PostgreSQL remains the source of truth for job
// state, retries, and scheduling.
async function main(): Promise<void> {
  const env = loadEnv()
  const logger = pino(buildLoggerOptions(env))
  const prisma = getPrismaClient()

  await pingDatabase(prisma)
  const ledger = createLedgerModule(prisma)
  const emailProvider = createEmailProvider(env)
  const quoteProvider = createQuoteProvider(env, fetch, { prisma, logger })
  const fxProvider = createFxRatesProvider(env, fetch, { prisma, logger })
  const fxService = createFxModule(prisma, fxProvider, logger)
  const runRecurring = async () => {
    const todayIso = new Date().toISOString().slice(0, 10)
    const today = new Date(todayIso)
    const expiredSessions = await prisma.userSession.deleteMany({ where: { expiresAt: { lte: new Date() } } })
    if (expiredSessions.count > 0) logger.info({ count: expiredSessions.count }, 'removed expired sessions')
    await enqueueDueBillNotifications(prisma, todayIso)
    if (new Date(`${todayIso}T00:00:00Z`).getUTCDay() === 1) await enqueueWeeklySummaryNotifications(prisma, todayIso)
    await deliverNotificationOutbox(prisma, emailProvider)
    const { processed, failed } = await processDueRecurringItems(prisma, ledger.service, todayIso, logger)
    if (env.QUOTE_PROVIDER === 'live') {
      try {
        const refreshed = await refreshQuoteSnapshots(prisma as unknown as RefreshQuoteSnapshotsPrisma, quoteProvider)
        if (refreshed > 0) logger.info({ refreshed }, 'refreshed investment quotes')
      } catch (err) {
        // Market-data outages are non-critical: retain the last snapshot and
        // allow recurring payments and notification delivery to complete.
        logger.warn({ err }, 'investment quote refresh skipped')
      }
    }
    // Phase 8: FX rate refresh for active currencies
    if (env.FX_PROVIDER === 'frankfurter') {
      try {
        const refreshed = await fxService.refreshRatesForActiveCurrencies(today)
        if (refreshed > 0) logger.info({ refreshed }, 'refreshed FX rates for active currencies')
      } catch (err) {
        // FX outages are non-critical: reports fall back to cached rates marked stale.
        logger.warn({ err }, 'FX rate refresh skipped')
      }
    }
    try {
      const generated = await generateDailySnapshots(prisma, today)
      if (generated > 0) logger.info({ generated, todayIso }, 'generated daily finance snapshots')
    } catch (err) {
      // Snapshot generation failures are non-critical: reports fall back to
      // computing from ledger history if snapshots are unavailable.
      logger.warn({ err }, 'daily snapshot generation skipped')
    }
    if (processed > 0) logger.info({ processed, todayIso }, 'processed recurring payments')
    if (failed > 0) logger.warn({ failed, todayIso }, 'some recurring items failed and were paused')
  }
  const tick = async () => {
    const todayIso = new Date().toISOString().slice(0, 10)
    await enqueueJob(prisma, { type: 'daily-finance-maintenance', runAt: new Date(), dedupKey: `daily-finance-maintenance:${todayIso}` })
    const jobId = await claimDueJob(prisma)
    if (!jobId) return
    try { await runRecurring(); await finishJob(prisma, jobId); recordWorkerJob('succeeded') }
    catch (err) { await failJob(prisma, jobId, err); recordWorkerJob('failed'); logger.error({ err, jobId }, 'worker job failed') }
  }
  await tick()
  logger.info('worker connected to database; durable job runner registered')

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down')
    await disconnectPrisma()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  setInterval(() => { void tick().catch((err) => logger.error({ err }, 'job scheduler tick failed')) }, 60_000)
}

main().catch((err) => {
  if (err instanceof EnvValidationError) {
    console.error(`Fatal error during worker startup: ${err.message}`)
  } else {
    console.error('Fatal error during worker startup:', err)
  }
  process.exit(1)
})
