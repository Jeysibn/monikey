import pino from 'pino'
import { loadEnv, EnvValidationError } from './config/env.js'
import { buildLoggerOptions } from './config/logger.js'
import { getPrismaClient, disconnectPrisma, pingDatabase } from './db/client.js'

// Phase 1 worker process: proves out the separate-process topology (same
// backend image, different command) required by compose.yaml. Job handlers
// (recurring due checks, market refresh, email outbox, etc.) land in later
// phases via JobModule — this only verifies DB connectivity and stays alive.
async function main(): Promise<void> {
  const env = loadEnv()
  const logger = pino(buildLoggerOptions(env))
  const prisma = getPrismaClient()

  await pingDatabase(prisma)
  logger.info('worker connected to database; no jobs registered yet (Phase 1 scaffold)')

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down')
    await disconnectPrisma()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // Keep the process alive; a real scheduler/queue loop arrives with JobModule.
  setInterval(() => {
    logger.debug('worker heartbeat')
  }, 60_000)
}

main().catch((err) => {
  if (err instanceof EnvValidationError) {
    console.error(`Fatal error during worker startup: ${err.message}`)
  } else {
    console.error('Fatal error during worker startup:', err)
  }
  process.exit(1)
})
