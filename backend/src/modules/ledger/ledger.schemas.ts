import { z } from 'zod';

export const accountTypeSchema = z.enum(['checking', 'savings', 'ewallet', 'cash', 'credit_card']);

export const transactionTypeSchema = z.enum(['income', 'expense', 'transfer']);
export const transactionSourceSchema = z.enum(['manual', 'ocr', 'recurring', 'import']);
export const transactionStatusSchema = z.enum(['cleared', 'pending']);

export const postTransactionSchema = z.object({
  type: transactionTypeSchema,
  title: z.string().min(1).max(255),
  categoryId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  fromAccountId: z.string().uuid().nullable().optional(),
  toAccountId: z.string().uuid().nullable().optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  occurredTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  amountMinor: z.number().int().positive(),
  feeMinor: z.number().int().nonnegative().default(0),
  currencyCode: z.string().length(3).default('PHP'),
  source: transactionSourceSchema.default('manual'),
  status: transactionStatusSchema.default('cleared'),
  note: z.string().nullable().optional(),
  idempotencyKey: z.string().max(128).nullable().optional(),
});

export const reverseTransactionSchema = z.object({
  idempotencyKey: z.string().max(128).nullable().optional(),
});

export const updateTransactionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  occurredTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  amountMinor: z.number().int().positive().optional(),
  feeMinor: z.number().int().nonnegative().optional(),
  status: transactionStatusSchema.optional(),
  note: z.string().nullable().optional(),
});

export type PostTransactionInput = z.infer<typeof postTransactionSchema>;
export type ReverseTransactionInput = z.infer<typeof reverseTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export interface TransactionView {
  id: string;
  userId: string;
  type: 'income' | 'expense' | 'transfer';
  title: string;
  categoryId: string | null;
  goalId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  occurredOn: string;
  occurredTime: string | null;
  amountMinor: number;
  feeMinor: number;
  currencyCode: string;
  source: 'manual' | 'ocr' | 'recurring' | 'import';
  status: 'cleared' | 'pending';
  note: string | null;
  idempotencyKey: string | null;
  reversedTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostTransactionResult {
  transaction: TransactionView;
  balanceEffects: Array<{
    accountId: string;
    role: string;
    deltaMinor: number;
    balanceAfterMinor: number;
  }>;
}

export interface ReverseTransactionResult {
  reversedTransaction: TransactionView;
  compensatingTransaction: TransactionView;
  balanceEffects: Array<{
    accountId: string;
    role: string;
    deltaMinor: number;
    balanceAfterMinor: number;
  }>;
}

export interface UpdateTransactionResult {
  transaction: TransactionView;
  balanceEffects: Array<{
    accountId: string;
    role: string;
    deltaMinor: number;
    balanceAfterMinor: number;
  }>;
}

export interface TransactionQuery {
  userId: string;
  cursor?: string;
  limit?: number;
  fromDate?: string;
  toDate?: string;
  type?: 'income' | 'expense' | 'transfer';
  categoryId?: string;
  accountId?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
