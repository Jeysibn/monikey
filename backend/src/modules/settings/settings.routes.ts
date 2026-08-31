import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import type { Env } from '../../config/env.js'
import type { Clock } from '../../common/auth/authGuard.js'
import { authGuard } from '../../common/auth/authGuard.js'
import { originCheckPreHandler } from '../../common/auth/originCheck.js'
import { AppError } from '../../common/errors/appError.js'
import { getSettingsForUser, updateSettingsForUser } from './settings.repository.js.js.js.js.js'
import { updateSettingsSchema } from './settings.schemas.js.js.js.js.js'

export interface SettingsRoutesOptions {
  prisma: PrismaClient
  env: Env
  clock?: Clock
}

export async function settingsRoutes(app: FastifyInstance, opts: SettingsRoutesOptions): Promise<void> {
  const { prisma, env, clock } = opts
  const requireAuth = authGuard({ prisma, clock })
  const requireOrigin = originCheckPreHandler(env)

  app.get('/settings', { preHandler: requireAuth }, async (request) => {
    // request.user is always set here — requireAuth throws before this
    // handler runs otherwise. The `?? throw` is unreachable defense against
    // TypeScript's optional typing, not a real runtime path.
    if (!request.user) throw new AppError('UNAUTHORIZED', 'Authentication required.', { statusCode: 401 })
    return getSettingsForUser(prisma, request.user.id)
  })

  app.put('/settings', { preHandler: [requireOrigin, requireAuth] }, async (request) => {
    if (!request.user) throw new AppError('UNAUTHORIZED', 'Authentication required.', { statusCode: 401 })
    const input = updateSettingsSchema.parse(request.body)
    return updateSettingsForUser(prisma, request.user.id, input)
  })
}
