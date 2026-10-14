/** Stage 7B: set a synthetic login password for the rehearsal users (authorized metadata change; disposable DB only). */
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/common/auth/password.js'

const prisma = new PrismaClient()
const hash = await hashPassword(process.env.REHEARSAL_PASSWORD ?? 'Rehearsal-Pass-1!')
const r = await prisma.user.updateMany({ where: { email: { endsWith: '@rehearsal.test' } }, data: { passwordHash: hash } })
console.log(`updated ${r.count} rehearsal users`)
await prisma.$disconnect()
