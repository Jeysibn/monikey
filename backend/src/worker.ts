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
import { localDateIso } from './common/timezone.js'

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
  const calendarUsers = async () => prisma.user.findMany({ select: { id: true, timezone: true } })
  const runRecurring = async () => {
    const users = await calendarUsers()
    const processDate = users[0] ? localDateIso(users[0].timezone) : localDateIso('UTC')
    const today = new Date(`${processDate}T00:00:00Z`)
    const expiredSessions = await prisma.userSession.deleteMany({ where: { expiresAt: { lte: new Date() } } })
    if (expiredSessions.count > 0) logger.info({ count: expiredSessions.count }, 'removed expired sessions')
    for (const user of users) {
      const userTodayIso = localDateIso(user.timezone)
      await enqueueDueBillNotifications(prisma, userTodayIso, user.id)
      if (new Date(`${userTodayIso}T00:00:00Z`).getUTCDay() === 1) await enqueueWeeklySummaryNotifications(prisma, userTodayIso, user.id)
      const result = await processDueRecurringItems(prisma, ledger.service, userTodayIso, logger, user.id)
      if (result.processed > 0) logger.info({ processed: result.processed, userId: user.id, todayIso: userTodayIso }, 'processed recurring payments')
      if (result.failed > 0) logger.warn({ failed: result.failed, userId: user.id, todayIso: userTodayIso }, 'some recurring items failed and were paused')
      const generated = await generateDailySnapshots(prisma, new Date(`${userTodayIso}T00:00:00Z`), user.id)
      if (generated > 0) logger.info({ generated, userId: user.id, todayIso: userTodayIso }, 'generated daily finance snapshots')
    }
    await deliverNotificationOutbox(prisma, emailProvider)
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
  }
  const tick = async () => {
    const users = await calendarUsers()
    const calendarKey = users.map((user) => `${user.id}:${localDateIso(user.timezone)}`).sort().join('|') || localDateIso('UTC')
    await enqueueJob(prisma, { type: 'daily-finance-maintenance', runAt: new Date(), dedupKey: `daily-finance-maintenance:${calendarKey}` })
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
