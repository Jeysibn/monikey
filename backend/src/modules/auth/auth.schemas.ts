import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(256),
  displayName: z.string().trim().min(1).max(120),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(256),
})
export type LoginInput = z.infer<typeof loginSchema>
