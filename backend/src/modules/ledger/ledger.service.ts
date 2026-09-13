import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { LedgerRepository } from './ledger.repository.js';
import type { PostTransactionInput, ReverseTransactionInput, UpdateTransactionInput, TransactionView, PostTransactionResult, ReverseTransactionResult, UpdateTransactionResult, TransactionQuery, Page } from './ledger.schemas.js';

export class LedgerService {
  constructor(private prisma: PrismaClient, private repo: LedgerRepository) {}

  async postTransaction(userId: string, input: PostTransactionInput): Promise<PostTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.postTransaction(tx as any, userId, input);
    });
  }

  async postTransactionWithCallback<T>(userId: string, input: PostTransactionInput, callback: (tx: Prisma.TransactionClient, result: PostTransactionResult) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const result = await this.repo.postTransaction(tx as any, userId, input);
      return callback(tx, result);
    });
  }

  async reverseTransaction(userId: string, transactionId: string, input: ReverseTransactionInput): Promise<ReverseTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.reverseTransaction(tx as any, userId, transactionId, input.idempotencyKey ?? undefined);
    });
  }

  /**
   * Reverses a cash movement and lets the caller delete/adjust the
   * non-ledger record that caused it (e.g. a crypto trade) inside the SAME
   * database transaction. Both must succeed or neither does — a caller must
   * never call `reverseTransaction` and then separately delete its own
   * record, because a failure between two independent transactions leaves
   * cash reversed with the originating record still intact (or vice versa).
   */
  async reverseTransactionWithCallback<T>(userId: string, transactionId: string, input: ReverseTransactionInput, callback: (tx: Prisma.TransactionClient, result: ReverseTransactionResult) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const result = await this.repo.reverseTransaction(tx as any, userId, transactionId, input.idempotencyKey ?? undefined);
      return callback(tx, result);
    });
  }

  async updateTransaction(userId: string, transactionId: string, input: UpdateTransactionInput): Promise<UpdateTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.updateTransaction(tx as any, userId, transactionId, input);
    });
  }

  async getTransaction(userId: string, id: string): Promise<TransactionView | null> {
    return this.repo.getTransaction(id, userId);
  }

  async listTransactions(query: TransactionQuery): Promise<Page<TransactionView>> {
    return this.repo.listTransactions(query);
  }
}
