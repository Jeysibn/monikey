import { readFile, writeFile } from 'node:fs/promises'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'

const outputPath = new URL('../../docs/openapi.generated.json', import.meta.url)
const checkOnly = process.argv.includes('--check')

const env = loadEnv({
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://monikey:monikey@localhost:5432/monikey',
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:8080',
  LOG_LEVEL: 'silent',
})
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL })
const app = await buildApp({ env, prisma })
try {
  await app.ready()
  const document = JSON.stringify(app.swagger(), null, 2) + '\n'
  if (checkOnly) {
    const current = await readFile(outputPath, 'utf8')
    if (current !== document) {
      console.error('OpenAPI document is stale. Run `npm run api:openapi` and commit docs/openapi.generated.json.')
      process.exitCode = 1
    }
  } else {
    await writeFile(outputPath, document)
  }
} finally {
  await app.close()
  await prisma.$disconnect()
}
