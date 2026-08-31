import { PrismaClient } from '@prisma/client';
import { LedgerRepository } from './ledger.repository.js';
import { AppError } from '../../common/errors/appError.js';
import type { PostTransactionInput, ReverseTransactionInput, TransactionView, PostTransactionResult, ReverseTransactionResult, TransactionQuery, Page } from './ledger.schemas.js';

export class LedgerService {
  constructor(private prisma: PrismaClient, private repo: LedgerRepository) {}

  async postTransaction(userId: string, input: PostTransactionInput): Promise<PostTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.postTransaction(tx as any, userId, input);
    });
  }

  async reverseTransaction(userId: string, transactionId: string, input: ReverseTransactionInput): Promise<ReverseTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.reverseTransaction(tx as any, userId, transactionId, input.idempotencyKey ?? undefined);
    });
  }

  async getTransaction(userId: string, id: string): Promise<TransactionView | null> {
    return this.repo.getTransaction(id, userId);
  }

  async listTransactions(query: TransactionQuery): Promise<Page<TransactionView>> {
    return this.repo.listTransactions(query);
  }
}
