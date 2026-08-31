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

    request.log.error({ err: error, requestId }, 'unhandled error')
    reply
      .status(500)
      .send(toErrorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred.', requestId))
  })

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send(toErrorEnvelope('NOT_FOUND', 'Resource not found.', request.id))
  })
}
