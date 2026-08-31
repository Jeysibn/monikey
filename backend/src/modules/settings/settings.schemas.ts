import { z } from 'zod'

// QA Attempt 1 (Phase 2), Finding D5: a bare non-empty/length check let
// `"Not/AReal_Zone"` and arbitrary strings (including `<script>...</script>`)
// straight into `users.timezone`, a column later phases (reports, recurring
// due-dates) will use directly for date-bucketing. `Intl.supportedValuesOf`
// (Node >= 18) returns the runtime's actual IANA tz database — validate
// against that instead of a permissive shape check, consistent with how
// `baseCurrency` below is already regex-checked rather than merely
// length-bounded.
const VALID_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'))

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => VALID_TIMEZONES.has(value), { message: 'timezone must be a valid IANA time zone name' })

export const updateSettingsSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  timezone: timezoneSchema.optional(),
  baseCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'baseCurrency must be a 3-letter ISO-4217 code')
    .optional(),
  billDueReminders: z.boolean().optional(),
  budgetNearLimitWarnings: z.boolean().optional(),
  weeklySummaryEmail: z.boolean().optional(),
  hideCents: z.boolean().optional(),
  externalAiEnabled: z.boolean().optional(),
  externalOcrEnabled: z.boolean().optional(),
  detailedAiContextEnabled: z.boolean().optional(),
})
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
