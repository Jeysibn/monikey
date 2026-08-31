import { PrismaClient } from '@prisma/client'

let client: PrismaClient | undefined

/** Lazily-constructed singleton Prisma client, shared across app/worker within one process. */
export function getPrismaClient(): PrismaClient {
  client ??= new PrismaClient()
  return client
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
