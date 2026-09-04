import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from './appError.js'
import { toErrorEnvelope } from './appError.js'

/**
 * Centralized error mapper. Registered once via `app.setErrorHandler`. Maps:
 * - AppError -> its own code/status/field
 * - ZodError / Fastify schema validation errors -> VALIDATION_ERROR (400)
 * - anything else -> INTERNAL_ERROR (500), logged, message not leaked to the client
 *
 * Always returns the stable envelope: { error: { code, message, field?, requestId } }.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, requestId }, 'app error (5xx)')
      } else {
        request.log.warn({ err: error, requestId }, 'app error')
      }
      reply.status(error.statusCode).send(toErrorEnvelope(error.code, error.message, requestId, error.field))
      return
    }

    if (error instanceof ZodError) {
      const first = error.issues[0]
      const field = first ? first.path.join('.') : undefined
      const message = first ? first.message : 'Invalid request.'
      reply.status(400).send(toErrorEnvelope('VALIDATION_ERROR', message, requestId, field))
      return
    }

    // Fastify's built-in schema validation surfaces as FastifyError with a `validation` array.
    const fastifyError = error as FastifyError
    if (Array.isArray(fastifyError.validation) && fastifyError.validation.length > 0) {
      const first = fastifyError.validation[0]
      const missingProperty = first?.params?.missingProperty
      const field =
        first?.instancePath?.replace(/^\//, '').replace(/\//g, '.') ||
        (typeof missingProperty === 'string' ? missingProperty : undefined)
      reply
        .status(400)
        .send(toErrorEnvelope('VALIDATION_ERROR', fastifyError.message ?? 'Invalid request.', requestId, field))
      return
    }

    // QA Attempt 1 (Phase 2), Finding D4: Fastify's own body-parsing errors
    // (malformed JSON, an unsupported/missing Content-Type for a route that
    // requires one, a body over `bodyLimit`) arrive here as a `FastifyError`
    // with a correct `statusCode` already set (400/415/413) — but nothing
    // in this handler ever looked at it before falling through to the
    // generic 500 branch below. Phase 1 had no body-accepting routes, so
    // this was latent but unreachable until Phase 2's auth/settings POST/PUT
    // endpoints. Only trust a genuine 4xx here: a library that mistakenly
    // sets `statusCode` on a real 5xx failure should still be logged and
    // reported as `INTERNAL_ERROR`, not echoed back as some arbitrary code.
    if (
      typeof fastifyError.statusCode === 'number' &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      request.log.warn({ err: error, requestId }, 'client request error')
      reply
        .status(fastifyError.statusCode)
        .send(toErrorEnvelope('VALIDATION_ERROR', fastifyError.message || 'Invalid request.', requestId))
      return
    }

    request.log.error({ err: error, requestId }, 'unhandled error')
    reply
      .status(500)
      .send(toErrorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred.', requestId))
  })

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send(toErrorEnvelope('NOT_FOUND', 'Resource not found.', request.id))
  })
}
