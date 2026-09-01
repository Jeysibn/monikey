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
  // Phase 9: Receipt OCR
  | 'INVALID_RECEIPT_TYPE'
  | 'RECEIPT_TOO_LARGE'
  | 'INVALID_RECEIPT_FORMAT'
  | 'RECEIPT_NOT_FOUND'
  | 'RECEIPT_ALREADY_COMMITTED'
  | 'RECEIPT_NOT_READY'
  | 'RECEIPT_LINKED_TO_TRANSACTION'
  | 'EXTERNAL_OCR_DISABLED'
  | 'OCR_PROCESSING_FAILED'
  | 'OCR_PROVIDER_ERROR'
  | 'OCR_PROVIDER_TIMEOUT'
  | 'OCR_NO_TEXT'
  | 'STORAGE_WRITE_FAILED'
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_DELETE_FAILED'
  | 'STORAGE_NOT_FOUND'
  | 'INVALID_STORAGE_KEY'
  | 'INVALID_REQUEST'
  // Phase 11: Imports (Plaid Sandbox + manual CSV)
  | 'DUPLICATE_IMPORT'
  | 'INVALID_STATE'
  | 'INVALID_TOKEN'
  | 'PLAID_UNAVAILABLE'
  | 'PLAID_EXCHANGE_FAILED'
  | 'ENCRYPTION_NOT_CONFIGURED'
  | 'DECRYPTION_FAILED'

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
    case 'OCR_PROVIDER_ERROR':
    case 'OCR_PROVIDER_TIMEOUT':
    case 'ENCRYPTION_NOT_CONFIGURED':
    case 'DECRYPTION_FAILED':
      return 502
    case 'INVALID_RECEIPT_TYPE':
    case 'INVALID_RECEIPT_FORMAT':
    case 'INVALID_REQUEST':
    case 'OCR_NO_TEXT':
      return 400
    case 'RECEIPT_TOO_LARGE':
      return 413
    case 'RECEIPT_NOT_FOUND':
    case 'STORAGE_NOT_FOUND':
      return 404
    case 'RECEIPT_ALREADY_COMMITTED':
    case 'RECEIPT_NOT_READY':
    case 'RECEIPT_LINKED_TO_TRANSACTION':
    case 'EXTERNAL_OCR_DISABLED':
    case 'INVALID_STORAGE_KEY':
    case 'OCR_PROCESSING_FAILED':
    case 'STORAGE_WRITE_FAILED':
    case 'STORAGE_READ_FAILED':
    case 'STORAGE_DELETE_FAILED':
      return 422
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
