import { loadEnv, EnvValidationError } from './config/env.js'
import { buildApp } from './app.js'
import { getPrismaClient, disconnectPrisma } from './db/client.js'

// Process entry point for the API. Fails fast on invalid env config before
// anything else runs. Deliberately separate from app.ts so tests can build
// the app without binding a port or reading real process.env.
async function main(): Promise<void> {
  const env = loadEnv()
  const prisma = getPrismaClient()

  const app = await buildApp({ env, prisma })

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    await app.close()
    await disconnectPrisma()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  await app.listen({ host: '0.0.0.0', port: env.API_PORT })
}

main().catch((err) => {
  // QA Attempt 1, Finding 14: don't dump a full stack trace for the
  // expected fail-fast config-validation path — just the readable message.
  if (err instanceof EnvValidationError) {
    console.error(`Fatal error during API startup: ${err.message}`)
  } else {
    console.error('Fatal error during API startup:', err)
  }
  process.exit(1)
})
