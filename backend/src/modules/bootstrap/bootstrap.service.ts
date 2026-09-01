import { PrismaClient, Prisma } from '@prisma/client';
import { LedgerService } from '../ledger/ledger.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import type { AccountView } from '../accounts/accounts.schemas.js';
import type { TransactionView } from '../ledger/ledger.schemas.js';

export interface FinanceState {
  accounts: AccountView[];
  transactions: TransactionView[];
  categories: Array<{
    id: string;
    userId: string | null;
    name: string;
    color: string;
    budgetable: boolean;
    allowsIncome: boolean;
    allowsExpense: boolean;
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  budgets: Array<{
    id: string;
    userId: string;
    periodStart: string;
    periodEnd: string;
    incomePoolMinor: number;
    createdAt: string;
    updatedAt: string;
    allocations: Array<{
      id: string;
      budgetPeriodId: string;
      categoryId: string;
      allocatedMinor: number;
    }>;
  }>;
  goals: Array<{
    id: string;
    userId: string;
    name: string;
    targetMinor: number;
    currentMinor: number;
    currencyCode: string;
    targetDate: string;
    completedDate: string | null;
    monthlyContributionMinor: number | null;
    status: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  recurring: Array<{
    id: string; userId: string; merchant: string; amountMinor: number; frequency: string; nextDueDate: string;
    accountId: string; categoryId: string; autopay: boolean; status: string; lastPaidDate: string | null;
    createdAt: string; updatedAt: string;
  }>;
}

export interface BootstrapResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    timezone: string;
    baseCurrency: string;
  };
  financeState: FinanceState;
  recurring: Array<any>;
  investmentActivity: {
    trades: Array<any>;
    dividends: Array<any>;
  };
  settings: {
    displayName: string;
    timezone: string;
    baseCurrency: string;
    billDueReminders: boolean;
    budgetNearLimitWarnings: boolean;
    weeklySummaryEmail: boolean;
    hideCents: boolean;
    externalAiEnabled: boolean;
    externalOcrEnabled: boolean;
    detailedAiContextEnabled: boolean;
  };
  serverDate: string;
  dataVersion: string;
}

export class BootstrapService {
  constructor(
    private prisma: PrismaClient,
    private ledgerService: LedgerService,
    private accountsService: AccountsService
  ) {}

  async getBootstrap(userId: string): Promise<BootstrapResponse> {
    const [user, accounts, categories, transactions, goals, preferences, budgetPeriods, recurring, investmentTrades, dividends] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.accountsService.listAccounts(userId),
      this.prisma.category.findMany({ where: { OR: [{ userId }, { userId: null }], archivedAt: null } }),
      this.ledgerService.listTransactions({ userId, limit: 1000 }),
      this.prisma.goal.findMany({ where: { userId } }),
      this.prisma.userPreferences.findUnique({ where: { userId } }),
      this.prisma.budgetPeriod.findMany({ where: { userId }, include: { allocations: true }, orderBy: { periodStart: 'desc' } }),
      this.prisma.recurringItem.findMany({ where: { userId }, orderBy: { nextDueDate: 'asc' } }),
      this.prisma.investmentTrade.findMany({ where: { userId }, include: { instrument: true }, orderBy: { occurredOn: 'asc' } }),
      this.prisma.dividend.findMany({ where: { userId }, include: { instrument: true }, orderBy: { occurredOn: 'desc' } }),
    ]);

    if (!user) throw new Error('User not found');

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timezone: user.timezone,
        baseCurrency: user.baseCurrency,
      },
      financeState: {
        accounts,
        transactions: transactions.items,
        categories: categories.map((c) => ({
          id: c.id,
          userId: c.userId ?? null,
          name: c.name,
          color: c.color,
          budgetable: c.budgetable,
          allowsIncome: c.allowsIncome,
          allowsExpense: c.allowsExpense,
          archivedAt: c.archivedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        budgets: budgetPeriods.map((period) => ({ id: period.id, userId: period.userId, periodStart: period.periodStart.toISOString().slice(0, 10), periodEnd: period.periodEnd.toISOString().slice(0, 10), incomePoolMinor: Number(period.incomePoolMinor), createdAt: period.createdAt.toISOString(), updatedAt: period.updatedAt.toISOString(), allocations: period.allocations.map((allocation) => ({ id: allocation.id, budgetPeriodId: allocation.budgetPeriodId, categoryId: allocation.categoryId, allocatedMinor: Number(allocation.allocatedMinor) })) })),
        goals: goals.map((g) => ({
          id: g.id,
          userId: g.userId,
          name: g.name,
          targetMinor: Number(g.targetMinor),
          currentMinor: Number(g.currentMinor),
          currencyCode: g.currencyCode,
          targetDate: g.targetDate.toISOString().split('T')[0]!,
          completedDate: g.completedDate?.toISOString().split('T')[0] ?? null,
          monthlyContributionMinor: g.monthlyContributionMinor ? Number(g.monthlyContributionMinor) : null,
          status: g.status,
          active: g.active,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
        })),
        recurring: recurring.map((item) => ({ id: item.id, userId: item.userId, merchant: item.merchant, amountMinor: Number(item.amountMinor), frequency: item.frequency, nextDueDate: item.nextDueDate.toISOString().slice(0, 10), accountId: item.accountId, categoryId: item.categoryId, autopay: item.autopay, status: item.status, lastPaidDate: item.lastPaidDate?.toISOString().slice(0, 10) ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
      },
      recurring: recurring.map((item) => ({ id: item.id, userId: item.userId, merchant: item.merchant, amountMinor: Number(item.amountMinor), frequency: item.frequency, nextDueDate: item.nextDueDate.toISOString().slice(0, 10), accountId: item.accountId, categoryId: item.categoryId, autopay: item.autopay, status: item.status, lastPaidDate: item.lastPaidDate?.toISOString().slice(0, 10) ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
      investmentActivity: {
        trades: investmentTrades.map((trade) => {
          // D10: Use Prisma.Decimal for money multiplication, not Number
          // to preserve precision and avoid floating-point artifacts.
          const units = new Prisma.Decimal(trade.units.toString());
          const priceMinor = new Prisma.Decimal(trade.priceMinor.toString());
          const amountMinor = units.times(priceMinor);
          return {
            id: trade.id,
            ticker: trade.instrument.ticker,
            type: trade.type,
            units: Number(trade.units),
            priceMinor: Number(trade.priceMinor),
            amountMinor: amountMinor.toNumber(),
            occurredOn: trade.occurredOn.toISOString().slice(0, 10),
            note: trade.note ?? null,
          };
        }),
        dividends: dividends.map((dividend) => ({ id: dividend.id, ticker: dividend.instrument.ticker, amountMinor: Number(dividend.amountMinor), occurredOn: dividend.occurredOn.toISOString().slice(0, 10), note: dividend.note ?? null })),
      },
      settings: {
        displayName: user.displayName,
        timezone: user.timezone,
        baseCurrency: user.baseCurrency,
        billDueReminders: preferences?.billDueReminders ?? true,
        budgetNearLimitWarnings: preferences?.budgetNearLimitWarnings ?? true,
        weeklySummaryEmail: preferences?.weeklySummaryEmail ?? false,
        hideCents: preferences?.hideCents ?? false,
        externalAiEnabled: preferences?.externalAiEnabled ?? false,
        externalOcrEnabled: preferences?.externalOcrEnabled ?? false,
        detailedAiContextEnabled: preferences?.detailedAiContextEnabled ?? false,
      },
      serverDate: new Date().toISOString().split('T')[0]!,
      dataVersion: '1.0',
    };
  }
}
