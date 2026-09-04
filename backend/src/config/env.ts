import { z } from 'zod'

// Zod-validated environment configuration. Fails fast (throws) on missing or
// malformed required values instead of letting the app boot into a broken
// state. Keep provider/integration variables optional here — Phase 1 ships
// with INTEGRATIONS_MODE=stub and no external provider keys required.

const booleanFromString = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(['true', 'false']))
  .transform((value) => value === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().url().default('http://localhost:8080'),
  APP_TIMEZONE: z.string().min(1).default('Asia/Manila'),

  // QA Attempt 1, Finding 5: a bare `.min(1)` accepted any non-empty string
  // ("not-a-url-at-all"), so a badly-configured DATABASE_URL still passed
  // env validation and booted an API that could never reach a database.
  // Require an actual postgres(ql):// connection string shape.
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .regex(/^postgres(ql)?:\/\/\S+$/, 'DATABASE_URL must be a postgres:// or postgresql:// connection string'),

  SESSION_SECURE: booleanFromString.default(false),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  INTEGRATIONS_MODE: z.enum(['stub', 'live']).default('stub'),
  QUOTE_PROVIDER: z.enum(['stub', 'live']).default('stub'),
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
  ALPHA_VANTAGE_URL: z.string().url().default('https://www.alphavantage.co/query'),
  COINGECKO_URL: z.string().url().default('https://api.coingecko.com/api/v3/simple/price'),
  // Plan §18 local quota budgets, enforced in quotes.ts before a live
  // provider call — never rely on the vendor's own free-tier limit alone.
  ALPHA_VANTAGE_MAX_CALLS_PER_DAY: z.coerce.number().int().positive().default(20),
  COINGECKO_MAX_CALLS_PER_MONTH: z.coerce.number().int().positive().default(9000),
  FX_PROVIDER: z.enum(['stub', 'frankfurter']).default('stub'),
  FRANKFURTER_BASE_URL: z.string().url().default('https://api.frankfurter.dev'),
  FRANKFURTER_MAX_CALLS_PER_DAY: z.coerce.number().int().positive().default(100),
  EMAIL_PROVIDER: z.enum(['mailpit', 'resend', 'stub']).default('mailpit'),
  MAILPIT_URL: z.string().url().default('http://mailpit:8025/api/v1/send'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('monikey@example.com'),

  // Phase 9: OCR provider and receipt storage configuration.
  // OCR is disabled by default (OCR_PROVIDER=stub) until user opts in via settings.
  OCR_PROVIDER: z.enum(['stub', 'ocrspace']).default('stub'),
  OCRSPACE_API_KEY: z.string().optional(),
  // Plan §18 local quota budgets for OCR.Space (free tier limits: 450/day, 20000/month).
  OCRSPACE_MAX_CALLS_PER_DAY: z.coerce.number().int().positive().default(450),
  OCRSPACE_MAX_CALLS_PER_MONTH: z.coerce.number().int().positive().default(20000),

  // Object store configuration (filesystem by default).
  OBJECT_STORE: z.enum(['filesystem']).default('filesystem'),
  RECEIPT_STORAGE_PATH: z.string().min(1).default('/data/receipts'),

  // Phase 10: AI provider configuration.
  // AI is disabled by default (AI_PROVIDER=stub) until user opts in via settings.
  AI_PROVIDER: z.enum(['stub', 'gemini']).default('stub'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash').optional(),
  // Plan §18 local quota budgets for Gemini. Free tier provides ~60 RPM and token limits.
  // Conservative defaults leave headroom for retries without exhausting quota.
  GEMINI_MAX_CALLS_PER_DAY: z.coerce.number().int().positive().default(50),
  GEMINI_MAX_CALLS_PER_MONTH: z.coerce.number().int().positive().default(1000),

  // Phase 11: Plaid Sandbox and manual import configuration.
  // Plaid is sandbox-only by default; production Philippine bank sync is out of scope.
  // BANK_PROVIDER can be 'stub' (deterministic, no network calls) or 'plaid_sandbox' (Plaid test environment).
  BANK_PROVIDER: z.enum(['stub', 'plaid_sandbox']).default('stub'),
  PLAID_ENV: z.enum(['sandbox', 'development', 'production']).default('sandbox'),
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),
  PLAID_WEBHOOK_SECRET: z.string().optional(), // For verifying Plaid webhook signatures
  // Encryption secret for protecting third-party API credentials at rest.
  // IMPORTANT: Must be a strong random value, never committed to version control, never logged.
  // Generate with: `openssl rand -hex 32` (produces 64-char hex string for 256-bit key).
  // Used to derive keys via PBKDF2 (user_id + ENCRYPTION_SECRET) for AES-256-GCM encryption.
  ENCRYPTION_SECRET: z.string().min(32, 'ENCRYPTION_SECRET must be at least 32 characters (generate with `openssl rand -hex 32`)').optional(),
  // Import batch limits to prevent runaway processing
  IMPORT_MAX_TRANSACTIONS_PER_BATCH: z.coerce.number().int().positive().default(10000),
  IMPORT_MAX_CSV_FILESIZE_BYTES: z.coerce.number().int().positive().default(5242880), // 5 MB default

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  ALLOW_TEST_CLOCK: booleanFromString.default(false),
})

export type Env = z.infer<typeof envSchema>

/**
 * Thrown by `loadEnv()` on bad/missing config. Distinguished from a generic
 * Error so process entry points can print just `.message` (a readable,
 * actionable list of issues) instead of a full stack trace on this
 * specific, expected fail-fast path (QA Attempt 1, Finding 14).
 */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvValidationError'
  }
}

let cachedEnv: Env | undefined

/**
 * Parses and validates `process.env`. Throws synchronously with a readable
 * message on the first bad/missing required variable — call this once at
 * process startup (in server.ts/worker.ts), never inside a request handler.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new EnvValidationError(`Invalid environment configuration:\n${issues}`)
  }
  return result.data
}

/** Cached accessor for use outside of explicit dependency injection (e.g. one-off scripts). */
export function getEnv(): Env {
  cachedEnv ??= loadEnv()
  return cachedEnv
}

/** Test helper: clears the cached env so a fresh loadEnv() call re-reads process.env. */
export function resetEnvCache(): void {
  cachedEnv = undefined
}
