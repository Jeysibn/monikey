import { PrismaClient } from '@prisma/client'

let client: PrismaClient | undefined

/**
 * Prisma's default `maxWait` (2s) is how long an interactive transaction may wait for a pooled
 * connection. A burst of concurrent writes to one row (double-click, offline replay) queues behind a row
 * lock while holding connections, so on a small pool the queued requests used to fail with a 500
 * ("Unable to start a transaction in the given time") instead of waiting their turn and replaying.
 * Keep `timeout` at its default; individual calls may still raise it.
 */
const transactionOptions = { maxWait: 15_000 }

/** Lazily-constructed singleton Prisma client, shared across app/worker within one process. */
export function getPrismaClient(): PrismaClient {
  client ??= new PrismaClient({ transactionOptions })
  return client
}

/** Factory for creating a new Prisma client connected to a specific database URL.
 * Used primarily for test isolation, where each test may need its own client.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({
    transactionOptions,
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  })
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect()
    client = undefined
  }
}

/** Cheap connectivity probe used by /health/ready. Throws if the DB is unreachable. */
export async function pingDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
}
