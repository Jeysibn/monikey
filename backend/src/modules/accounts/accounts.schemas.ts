import { z } from 'zod';
import { accountTypeSchema, minorUnitInput } from '../ledger/ledger.schemas.js';

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  institution: z.string().max(100).nullable().optional(),
  accountType: accountTypeSchema.exclude(['credit_card']),
  currencyCode: z.string().length(3).default('PHP'),
  openingBalanceMinor: minorUnitInput.default(0n),
  lastFour: z.string().length(4).nullable().optional(),
});

export const createCreditCardSchema = z.object({
  name: z.string().min(1).max(100),
  institution: z.string().max(100).nullable().optional(),
  currencyCode: z.string().length(3).default('PHP'),
  openingBalanceMinor: minorUnitInput.default(0n),
  lastFour: z.string().length(4).nullable().optional(),
  network: z.enum(['visa', 'mastercard']),
  creditLimitMinor: minorUnitInput.pipe(z.bigint().positive()),
  dueDay: z.number().int().min(1).max(31),
  minimumPaymentMinor: minorUnitInput.default(0n),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  institution: z.string().max(100).nullable().optional(),
  lastFour: z.string().length(4).nullable().optional(),
  // Manual balance correction (e.g. reconciling with a real-world statement).
  // This overwrites the stored balance directly rather than posting a
  // transaction — appropriate for manual accounts, which have no external
  // sync to reconcile against.
  currentBalanceMinor: z.union([z.string().regex(/^-?\d+$/), z.number().int()]).transform((value) => BigInt(value)).optional(),
});

export interface AccountView {
  id: string;
  userId: string;
  name: string;
  institution: string | null;
  accountType: string;
  classification: 'asset' | 'liability';
  currencyCode: string;
  openingBalanceMinor: string;
  currentBalanceMinor: string;
  lastFour: string | null;
  syncStatus: string;
  manual: boolean;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creditCardDetail?: {
    network: string;
    creditLimitMinor: string;
    dueDay: number;
    minimumPaymentMinor: string;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateCreditCardInput = z.infer<typeof createCreditCardSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
