// Stable domain error codes per the implementation plan (§7.2). Extend this
// union as later phases introduce new business rules — do not repurpose an
// existing code for a different meaning.
export type AppErrorCode =
  | 'ASSET_OVERDRAFT'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'CARD_PAYMENT_EXCEEDS_OWED'
  | 'GOAL_OVERFUNDED'
  | 'GOAL_INACTIVE'
  | 'UNKNOWN_ACCOUNT'
  | 'UNKNOWN_CATEGORY'
  | 'UNKNOWN_TRANSACTION'
  | 'UNKNOWN_GOAL'
  | 'CATEGORY_NOT_ALLOWED'
  | 'TRANSFER_SAME_ACCOUNT'
  | 'INVALID_TRANSACTION_KIND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RECURRING_OCCURRENCE_ALREADY_POSTED'
  | 'INSUFFICIENT_HOLDING_UNITS'
  | 'EXTERNAL_PROVIDER_UNAVAILABLE'
  | 'EXTERNAL_PROVIDER_QUOTA_REACHED'
  | 'ACCOUNT_ARCHIVED'
  | 'ACCOUNT_NOT_EMPTY'
  | 'ALREADY_REVERSED'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  // Added in Phase 2 (AuthModule) for login/register rate limiting (plan
  // §16.1) — `@fastify/rate-limit`'s `errorResponseBuilder` throws whatever
  // it returns into the normal Fastify error pipeline, so it needs a code
  // this envelope already understands rather than falling through to a
  // generic 500.
  | 'RATE_LIMITED'

/**
 * Thrown by domain/application code to signal a business-rule or client
 * error with a stable machine-readable code. The centralized Fastify error
 * handler maps this (and other error shapes) into the standard envelope.
 */
export class AppError extends Error {
  readonly code: AppErrorCode
  readonly statusCode: number
  readonly field?: string

  constructor(code: AppErrorCode, message: string, options?: { statusCode?: number; field?: string; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'AppError'
    this.code = code
    this.statusCode = options?.statusCode ?? defaultStatusForCode(code)
    this.field = options?.field
  }
}

function defaultStatusForCode(code: AppErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'NOT_FOUND':
    case 'UNKNOWN_ACCOUNT':
    case 'UNKNOWN_CATEGORY':
    case 'UNKNOWN_TRANSACTION':
    case 'UNKNOWN_GOAL':
      return 404
    case 'IDEMPOTENCY_CONFLICT':
      return 409
    case 'RATE_LIMITED':
      return 429
    case 'VALIDATION_ERROR':
    case 'ASSET_OVERDRAFT':
    case 'CREDIT_LIMIT_EXCEEDED':
    case 'CARD_PAYMENT_EXCEEDS_OWED':
    case 'GOAL_OVERFUNDED':
    case 'GOAL_INACTIVE':
    case 'CATEGORY_NOT_ALLOWED':
    case 'TRANSFER_SAME_ACCOUNT':
    case 'INVALID_TRANSACTION_KIND':
    case 'RECURRING_OCCURRENCE_ALREADY_POSTED':
    case 'INSUFFICIENT_HOLDING_UNITS':
    case 'ACCOUNT_ARCHIVED':
    case 'ACCOUNT_NOT_EMPTY':
    case 'ALREADY_REVERSED':
      return 422
    case 'EXTERNAL_PROVIDER_UNAVAILABLE':
    case 'EXTERNAL_PROVIDER_QUOTA_REACHED':
      return 502
    case 'INTERNAL_ERROR':
    default:
      return 500
  }
}

export interface ErrorEnvelope {
  error: {
    code: AppErrorCode
    message: string
    field?: string
    requestId: string
  }
}

export function toErrorEnvelope(
  code: AppErrorCode,
  message: string,
  requestId: string,
  field?: string,
): ErrorEnvelope {
  return { error: { code, message, ...(field !== undefined ? { field } : {}), requestId } }
}
