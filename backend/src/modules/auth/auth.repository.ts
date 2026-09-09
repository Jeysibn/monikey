import type { PrismaClient } from '@prisma/client'

/** Normalizes email exactly once, at the boundary — lowercase + trim, applied before both uniqueness checks and storage. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function findUserByEmail(prisma: PrismaClient, email: string) {
  return prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
}

export interface CreateUserInput {
  email: string
  passwordHash: string
  displayName: string
}

export async function createUserWithDefaults(prisma: PrismaClient, input: CreateUserInput) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        displayName: input.displayName,
      },
    })
    await tx.userPreferences.create({ data: { userId: user.id } })
    return user
  })
}

export interface CreateSessionInput {
  userId: string
  tokenHash: string
  expiresAt: Date
  userAgent?: string | null
}

export function createSession(prisma: PrismaClient, input: CreateSessionInput) {
  return prisma.userSession.create({
    data: {
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      userAgent: input.userAgent ?? undefined,
    },
  })
}

export function deleteSessionById(prisma: PrismaClient, sessionId: string) {
  return prisma.userSession.delete({ where: { id: sessionId } }).catch(() => undefined)
}

export interface CreatePasswordResetTokenInput {
  userId: string
  tokenHash: string
  expiresAt: Date
}

export function createPasswordResetToken(prisma: PrismaClient, input: CreatePasswordResetTokenInput) {
  return prisma.passwordResetToken.create({
    data: { userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt },
  })
}

export function findPasswordResetTokenByHash(prisma: PrismaClient, tokenHash: string) {
  return prisma.passwordResetToken.findUnique({ where: { tokenHash } })
}

export function markPasswordResetTokenUsed(prisma: PrismaClient, id: string, usedAt: Date) {
  return prisma.passwordResetToken.update({ where: { id }, data: { usedAt } })
}

export function updateUserPassword(prisma: PrismaClient, userId: string, passwordHash: string) {
  return prisma.user.update({ where: { id: userId }, data: { passwordHash } })
}

/** Invalidate every active session for a user — called after a password reset so a leaked/stolen session cookie stops working immediately. */
export function deleteAllSessionsForUser(prisma: PrismaClient, userId: string) {
  return prisma.userSession.deleteMany({ where: { userId } })
}
