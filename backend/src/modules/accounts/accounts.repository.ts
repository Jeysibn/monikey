import { PrismaClient } from '@prisma/client';
import type { AccountView, CreateAccountInput, CreateCreditCardInput, UpdateAccountInput } from './accounts.schemas.js';
import { AppError } from '../../common/errors/appError.js';

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export class AccountsRepository {
  constructor(private prisma: PrismaClient) {}

  async listAccounts(userId: string): Promise<AccountView[]> {
    const accounts = await this.prisma.financialAccount.findMany({
      where: { userId, archivedAt: null },
      include: { creditCardDetail: true },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(this.mapAccount);
  }

  async getAccount(userId: string, id: string): Promise<AccountView | null> {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id, userId },
      include: { creditCardDetail: true },
    });
    return account ? this.mapAccount(account) : null;
  }

  async createAccount(
    tx: PrismaTx,
    userId: string,
    input: CreateAccountInput
  ): Promise<AccountView> {
    const { name, institution, accountType, currencyCode, openingBalanceMinor, lastFour } = input;

    const account = await tx.financialAccount.create({
      data: {
        userId,
        name,
        institution,
        accountType,
        classification: 'asset',
        currencyCode,
        openingBalanceMinor: BigInt(openingBalanceMinor),
        currentBalanceMinor: BigInt(openingBalanceMinor),
        lastFour,
        syncStatus: 'manual',
        manual: true,
      },
      include: { creditCardDetail: true },
    });

    return this.mapAccount(account);
  }

  async createCreditCard(
    tx: PrismaTx,
    userId: string,
    input: CreateCreditCardInput
  ): Promise<AccountView> {
    const { name, institution, currencyCode, openingBalanceMinor, lastFour, network, creditLimitMinor, dueDay, minimumPaymentMinor } = input;

    // Create the liability account
    const account = await tx.financialAccount.create({
      data: {
        userId,
        name,
        institution,
        accountType: 'credit_card',
        classification: 'liability',
        currencyCode,
        openingBalanceMinor: BigInt(openingBalanceMinor),
        currentBalanceMinor: BigInt(openingBalanceMinor),
        lastFour,
        syncStatus: 'manual',
        manual: true,
      },
    });

    // Create credit card details
    await tx.creditCardDetail.create({
      data: {
        accountId: account.id,
        network,
        creditLimitMinor: BigInt(creditLimitMinor),
        dueDay,
        minimumPaymentMinor: BigInt(minimumPaymentMinor),
      },
    });

    const fullAccount = await tx.financialAccount.findUnique({
      where: { id: account.id },
      include: { creditCardDetail: true },
    });

    return this.mapAccount(fullAccount!);
  }

  async updateAccount(
    tx: PrismaTx,
    userId: string,
    id: string,
    input: UpdateAccountInput
  ): Promise<AccountView> {
    const account = await tx.financialAccount.findFirst({ where: { id, userId } });
    if (!account) throw new AppError('UNKNOWN_ACCOUNT', 'Account not found.', { field: 'id' });
    if (account.archivedAt) throw new AppError('ACCOUNT_ARCHIVED', 'Cannot update archived account.', { field: 'id' });

    const updated = await tx.financialAccount.update({
      where: { id },
      data: input,
      include: { creditCardDetail: true },
    });

    return this.mapAccount(updated);
  }

  async archiveAccount(
    tx: PrismaTx,
    userId: string,
    id: string
  ): Promise<void> {
    const account = await tx.financialAccount.findFirst({ where: { id, userId } });
    if (!account) throw new AppError('UNKNOWN_ACCOUNT', 'Account not found.', { field: 'id' });
    if (account.archivedAt) throw new AppError('ACCOUNT_ARCHIVED', 'Account already archived.', { field: 'id' });

    // Archiving just hides the account from active views — it keeps its
    // balance and transaction history intact, so a non-zero balance (or a
    // credit card's detail row, which every credit card always has) is not a
    // reason to block it.

    await tx.financialAccount.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  private mapAccount(account: any): AccountView {
    return {
      id: account.id,
      userId: account.userId,
      name: account.name,
      institution: account.institution,
      accountType: account.accountType,
      classification: account.classification,
      currencyCode: account.currencyCode,
      openingBalanceMinor: Number(account.openingBalanceMinor),
      currentBalanceMinor: Number(account.currentBalanceMinor),
      lastFour: account.lastFour,
      syncStatus: account.syncStatus,
      manual: account.manual,
      version: account.version,
      archivedAt: account.archivedAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
      creditCardDetail: account.creditCardDetail ? {
        network: account.creditCardDetail.network,
        creditLimitMinor: Number(account.creditCardDetail.creditLimitMinor),
        dueDay: account.creditCardDetail.dueDay,
        minimumPaymentMinor: Number(account.creditCardDetail.minimumPaymentMinor),
        createdAt: account.creditCardDetail.createdAt.toISOString(),
        updatedAt: account.creditCardDetail.updatedAt.toISOString(),
      } : null,
    };
  }
}
