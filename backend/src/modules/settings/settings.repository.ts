import type { Prisma, PrismaClient } from '@prisma/client'
import type { UpdateSettingsInput } from './settings.schemas.js.js.js.js.js'

export interface SettingsView {
  displayName: string
  timezone: string
  baseCurrency: string
  billDueReminders: boolean
  budgetNearLimitWarnings: boolean
  weeklySummaryEmail: boolean
  hideCents: boolean
  externalAiEnabled: boolean
  externalOcrEnabled: boolean
  detailedAiContextEnabled: boolean
}

/**
 * Reads settings scoped strictly to `userId` — always the session-resolved
 * ID from `request.user`, never a client-supplied value (plan §16.2). There
 * is deliberately no overload that accepts an arbitrary/unscoped user id.
 */
export async function getSettingsForUser(prisma: PrismaClient, userId: string): Promise<SettingsView> {
  const [user, preferences] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    // Every registered user gets a UserPreferences row at registration time
    // (auth.repository.createUserWithDefaults), so this should always
    // exist; upsert only as defense-in-depth against a legacy/seeded row.
    prisma.userPreferences.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
  ])

  return toView(user, preferences)
}

export async function updateSettingsForUser(
  prisma: PrismaClient,
  userId: string,
  input: UpdateSettingsInput,
): Promise<SettingsView> {
  const userUpdate: Prisma.UserUpdateInput = {}
  if (input.displayName !== undefined) userUpdate.displayName = input.displayName
  if (input.timezone !== undefined) userUpdate.timezone = input.timezone
  if (input.baseCurrency !== undefined) userUpdate.baseCurrency = input.baseCurrency

  const preferencesUpdate: Prisma.UserPreferencesUpdateInput = {}
  if (input.billDueReminders !== undefined) preferencesUpdate.billDueReminders = input.billDueReminders
  if (input.budgetNearLimitWarnings !== undefined)
    preferencesUpdate.budgetNearLimitWarnings = input.budgetNearLimitWarnings
  if (input.weeklySummaryEmail !== undefined) preferencesUpdate.weeklySummaryEmail = input.weeklySummaryEmail
  if (input.hideCents !== undefined) preferencesUpdate.hideCents = input.hideCents
  if (input.externalAiEnabled !== undefined) preferencesUpdate.externalAiEnabled = input.externalAiEnabled
  if (input.externalOcrEnabled !== undefined) preferencesUpdate.externalOcrEnabled = input.externalOcrEnabled
  if (input.detailedAiContextEnabled !== undefined)
    preferencesUpdate.detailedAiContextEnabled = input.detailedAiContextEnabled

  const preferencesCreate: Prisma.UserPreferencesUncheckedCreateInput = { userId }
  if (input.billDueReminders !== undefined) preferencesCreate.billDueReminders = input.billDueReminders
  if (input.budgetNearLimitWarnings !== undefined)
    preferencesCreate.budgetNearLimitWarnings = input.budgetNearLimitWarnings
  if (input.weeklySummaryEmail !== undefined) preferencesCreate.weeklySummaryEmail = input.weeklySummaryEmail
  if (input.hideCents !== undefined) preferencesCreate.hideCents = input.hideCents
  if (input.externalAiEnabled !== undefined) preferencesCreate.externalAiEnabled = input.externalAiEnabled
  if (input.externalOcrEnabled !== undefined) preferencesCreate.externalOcrEnabled = input.externalOcrEnabled
  if (input.detailedAiContextEnabled !== undefined)
    preferencesCreate.detailedAiContextEnabled = input.detailedAiContextEnabled

  const [user, preferences] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: userUpdate }),
    prisma.userPreferences.upsert({
      where: { userId },
      create: preferencesCreate,
      update: preferencesUpdate,
    }),
  ])

  return toView(user, preferences)
}

function toView(
  user: { displayName: string; timezone: string; baseCurrency: string },
  preferences: {
    billDueReminders: boolean
    budgetNearLimitWarnings: boolean
    weeklySummaryEmail: boolean
    hideCents: boolean
    externalAiEnabled: boolean
    externalOcrEnabled: boolean
    detailedAiContextEnabled: boolean
  },
): SettingsView {
  return {
    displayName: user.displayName,
    timezone: user.timezone,
    baseCurrency: user.baseCurrency,
    billDueReminders: preferences.billDueReminders,
    budgetNearLimitWarnings: preferences.budgetNearLimitWarnings,
    weeklySummaryEmail: preferences.weeklySummaryEmail,
    hideCents: preferences.hideCents,
    externalAiEnabled: preferences.externalAiEnabled,
    externalOcrEnabled: preferences.externalOcrEnabled,
    detailedAiContextEnabled: preferences.detailedAiContextEnabled,
  }
}
