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

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(256),
})
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(256) })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
