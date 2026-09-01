import pino from 'pino'
import { loadEnv, EnvValidationError } from './config/env.js'
import { buildLoggerOptions } from './config/logger.js'
import { getPrismaClient, disconnectPrisma, pingDatabase } from './db/client.js'
import { createLedgerModule } from './modules/ledger/ledger.module.js'
import { processDueRecurringItems } from './modules/recurring/recurring.worker.js'
import { enqueueDueBillNotifications, enqueueWeeklySummaryNotifications } from './modules/notifications/outbox.js'
import { createEmailProvider } from './modules/notifications/email.js'
import { deliverNotificationOutbox } from './modules/notifications/delivery.js'
import { createQuoteProvider, refreshQuoteSnapshots } from './modules/investments/quotes.js'

// Phase 1 worker process: proves out the separate-process topology (same
// backend image, different command) required by compose.yaml. Job handlers
// (recurring due checks, market refresh, email outbox, etc.) land in later
// phases via JobModule — this only verifies DB connectivity and stays alive.
async function main(): Promise<void> {
  const env = loadEnv()
  const logger = pino(buildLoggerOptions(env))
  const prisma = getPrismaClient()

  await pingDatabase(prisma)
  const ledger = createLedgerModule(prisma)
  const emailProvider = createEmailProvider(env)
  const quoteProvider = createQuoteProvider(env, fetch, { prisma, logger })
  const runRecurring = async () => {
    const todayIso = new Date().toISOString().slice(0, 10)
    await enqueueDueBillNotifications(prisma, todayIso)
    if (new Date(`${todayIso}T00:00:00Z`).getUTCDay() === 1) await enqueueWeeklySummaryNotifications(prisma, todayIso)
    await deliverNotificationOutbox(prisma, emailProvider)
    const { processed, failed } = await processDueRecurringItems(prisma, ledger.service, todayIso, logger)
    if (env.QUOTE_PROVIDER === 'live') {
      try {
        const refreshed = await refreshQuoteSnapshots(prisma, quoteProvider)
        if (refreshed > 0) logger.info({ refreshed }, 'refreshed investment quotes')
      } catch (err) {
        // Market-data outages are non-critical: retain the last snapshot and
        // allow recurring payments and notification delivery to complete.
        logger.warn({ err }, 'investment quote refresh skipped')
      }
    }
    if (processed > 0) logger.info({ processed, todayIso }, 'processed recurring payments')
    if (failed > 0) logger.warn({ failed, todayIso }, 'some recurring items failed and were paused')
  }
  await runRecurring()
  logger.info('worker connected to database; recurring due-job runner registered')

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down')
    await disconnectPrisma()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // Keep the process alive; a real scheduler/queue loop arrives with JobModule.
  setInterval(() => { void runRecurring().catch((err) => logger.error({ err }, 'recurring due-job run failed')) }, 60_000)
}

main().catch((err) => {
  if (err instanceof EnvValidationError) {
    console.error(`Fatal error during worker startup: ${err.message}`)
  } else {
    console.error('Fatal error during worker startup:', err)
  }
  process.exit(1)
})
