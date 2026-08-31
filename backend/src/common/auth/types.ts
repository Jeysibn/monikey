// Module augmentation so `request.user`/`request.sessionId` are properly
// typed wherever a Fastify request is handled, instead of `any`. Populated
// by the `authGuard` preHandler in `authGuard.ts`.
export interface AuthenticatedUser {
  id: string
  email: string
  displayName: string
  timezone: string
  baseCurrency: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
    sessionId?: string
  }
}
