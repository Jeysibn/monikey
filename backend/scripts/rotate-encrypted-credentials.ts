import { PrismaClient } from '@prisma/client'
import { decryptForUser, encryptForUser } from '../src/common/crypto/encryption.js'

/**
 * Re-encrypt provider credentials after an ENCRYPTION_SECRET rotation.
 * Dry-run is the default; pass --apply only after validating the count.
 */
const apply = process.argv.includes('--apply')
const previousSecret = process.env.ENCRYPTION_SECRET_PREVIOUS
const nextSecret = process.env.ENCRYPTION_SECRET

if (!previousSecret || !nextSecret) {
  throw new Error('ENCRYPTION_SECRET_PREVIOUS and ENCRYPTION_SECRET are required')
}
if (previousSecret === nextSecret) {
  throw new Error('ENCRYPTION_SECRET_PREVIOUS must differ from ENCRYPTION_SECRET')
}

const prisma = new PrismaClient()

try {
  const items = await prisma.plaidItem.findMany({
    select: { id: true, userId: true, encryptedAccessToken: true },
  })

  let decryptable = 0
  for (const item of items) {
    const plaintext = decryptForUser(item.encryptedAccessToken, item.userId, previousSecret)
    decryptable += 1

    if (apply) {
      await prisma.plaidItem.update({
        where: { id: item.id },
        data: { encryptedAccessToken: encryptForUser(plaintext, item.userId, nextSecret) },
      })
    }
  }

  console.log(`${apply ? 'Re-encrypted' : 'Validated'} ${decryptable} encrypted credential(s).`)
  if (!apply) console.log('Dry run only. Re-run with --apply to persist the rotation.')
} finally {
  await prisma.$disconnect()
}
