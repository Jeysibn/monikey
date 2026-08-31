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
  EMAIL_PROVIDER: z.enum(['mailpit', 'resend', 'stub']).default('mailpit'),
  MAILPIT_URL: z.string().url().default('http://mailpit:8025/api/v1/send'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('monikey@example.com'),

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
