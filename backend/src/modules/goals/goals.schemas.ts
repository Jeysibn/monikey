import { z } from 'zod'

export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetMinor: z.number().int().positive(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthlyContributionMinor: z.number().int().positive().nullable().optional(),
  currencyCode: z.string().length(3).default('PHP'),
})

export const updateGoalSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  targetMinor: z.number().int().positive().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  monthlyContributionMinor: z.number().int().positive().nullable().optional(),
})

export const fundGoalSchema = z.object({
  sourceAccountId: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().max(128).nullable().optional(),
})

export interface GoalView {
  id: string
  userId: string
  name: string
  targetMinor: number
  currentMinor: number
  currencyCode: string
  targetDate: string
  completedDate: string | null
  monthlyContributionMinor: number | null
  status: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CreateGoalInput = z.infer<typeof createGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>
export type FundGoalInput = z.infer<typeof fundGoalSchema>
