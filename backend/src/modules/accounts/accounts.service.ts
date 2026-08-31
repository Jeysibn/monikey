import { PrismaClient } from '@prisma/client';
import { AccountsRepository } from './accounts.repository.js.js.js.js';
import type { AccountView, CreateAccountInput, CreateCreditCardInput, UpdateAccountInput } from './accounts.schemas.js.js.js.js';

export class AccountsService {
  constructor(private prisma: PrismaClient, private repo: AccountsRepository) {}

  async listAccounts(userId: string): Promise<AccountView[]> {
    return this.repo.listAccounts(userId);
  }

  async getAccount(userId: string, id: string): Promise<AccountView | null> {
    return this.repo.getAccount(userId, id);
  }

  async createAccount(userId: string, input: CreateAccountInput): Promise<AccountView> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.createAccount(tx as any, userId, input);
    });
  }

  async createCreditCard(userId: string, input: CreateCreditCardInput): Promise<AccountView> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.createCreditCard(tx as any, userId, input);
    });
  }

  async updateAccount(userId: string, id: string, input: UpdateAccountInput): Promise<AccountView> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.updateAccount(tx as any, userId, id, input);
    });
  }

  async archiveAccount(userId: string, id: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      return this.repo.archiveAccount(tx as any, userId, id);
    });
  }
}