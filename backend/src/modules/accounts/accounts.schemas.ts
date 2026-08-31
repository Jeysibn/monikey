import { z } from 'zod';
import { accountTypeSchema } from '../ledger/ledger.schemas';

export const createAccountSchema = z.object({
  name: z.string().min(1).max(100),
  institution: z.string().max(100).nullable().optional(),
  accountType: accountTypeSchema.exclude(['credit_card']),
  currencyCode: z.string().length(3).default('PHP'),
  openingBalanceMinor: z.number().int().nonnegative().default(0),
  lastFour: z.string().length(4).nullable().optional(),
});

export const createCreditCardSchema = z.object({
  name: z.string().min(1).max(100),
  institution: z.string().max(100).nullable().optional(),
  currencyCode: z.string().length(3).default('PHP'),
  openingBalanceMinor: z.number().int().nonnegative().default(0),
  lastFour: z.string().length(4).nullable().optional(),
  network: z.enum(['visa', 'mastercard']),
  creditLimitMinor: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(31),
  minimumPaymentMinor: z.number().int().nonnegative().default(0),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  institution: z.string().max(100).nullable().optional(),
  lastFour: z.string().length(4).nullable().optional(),
});

export interface AccountView {
  id: string;
  userId: string;
  name: string;
  institution: string | null;
  accountType: string;
  classification: 'asset' | 'liability';
  currencyCode: string;
  openingBalanceMinor: number;
  currentBalanceMinor: number;
  lastFour: string | null;
  syncStatus: string;
  manual: boolean;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creditCardDetail?: {
    network: string;
    creditLimitMinor: number;
    dueDay: number;
    minimumPaymentMinor: number;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateCreditCardInput = z.infer<typeof createCreditCardSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;