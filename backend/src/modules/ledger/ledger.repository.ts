import { PrismaClient, Prisma } from '@prisma/client';
import type { TransactionView, PostTransactionResult, ReverseTransactionResult, TransactionQuery, Page, PostTransactionInput } from './ledger.schemas.js';
import { AppError } from '../../common/errors/appError.js';

type BalanceEffectRole = 'source' | 'destination' | 'expense' | 'income' | 'card_charge' | 'card_payment' | 'fee';

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export class LedgerRepository {
  constructor(private prisma: PrismaClient) {}

  async getTransaction(id: string, userId: string): Promise<TransactionView | null> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    return tx ? this.mapTransaction(tx) : null;
  }

  async listTransactions(query: TransactionQuery): Promise<Page<TransactionView>> {
    const { userId, cursor, limit = 50, fromDate, toDate, type, categoryId, accountId } = query;

    const where: Prisma.TransactionWhereInput = { userId };
    if (fromDate || toDate) where.occurredOn = { ...(fromDate ? { gte: new Date(fromDate) } : {}), ...(toDate ? { lte: new Date(toDate) } : {}) };
    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;
    if (accountId) {
      where.OR = [{ fromAccountId: accountId }, { toAccountId: accountId }];
    }
    if (cursor) where.id = { lt: cursor };

    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { occurredOn: 'desc' },
      take: limit + 1,
    });

    const hasMore = transactions.length > limit;
    const items = hasMore ? transactions.slice(0, limit) : transactions;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    return {
      items: items.map(this.mapTransaction),
      nextCursor,
      hasMore,
    };
  }

  async postTransaction(
    tx: PrismaTx,
    userId: string,
    input: PostTransactionInput
  ): Promise<PostTransactionResult> {
    const { type, title, categoryId, goalId, fromAccountId, toAccountId, occurredOn, occurredTime, amountMinor, feeMinor, currencyCode, source, status, note, idempotencyKey } = input;

    // Lock affected accounts
    const accountIds = new Set<string>();
    if (fromAccountId) accountIds.add(fromAccountId);
    if (toAccountId) accountIds.add(toAccountId);
    if (categoryId) {
      const cat = await tx.category.findUnique({ where: { id: categoryId } });
      if (!cat || (cat.userId && cat.userId !== userId)) {
        throw new AppError('UNKNOWN_CATEGORY', 'Category not found.', { field: 'categoryId' });
      }
    }
    if (goalId) {
      const goal = await tx.goal.findUnique({ where: { id: goalId } });
      if (!goal || goal.userId !== userId) {
        throw new AppError('UNKNOWN_GOAL', 'Goal not found.', { field: 'goalId' });
      }
    }

    const accounts = await Promise.all(
      Array.from(accountIds).map(id =>
        tx.financialAccount.findUnique({
          where: { id },
          include: { creditCardDetail: true },
        })
      )
    );

    const accountMap = new Map(accounts.filter(Boolean).map(a => [a!.id, a!]));
    for (const id of accountIds) {
      if (!accountMap.has(id)) {
        throw new AppError('UNKNOWN_ACCOUNT', `Account ${id} not found.`, { field: 'accountId' });
      }
      const acc = accountMap.get(id)!;
      if (acc.userId !== userId) {
        throw new AppError('UNKNOWN_ACCOUNT', `Account ${id} not owned by user.`, { field: 'accountId' });
      }
    }

    // Validate invariants
    this.validateInvariants(type, accountMap, fromAccountId ?? null, toAccountId ?? null, amountMinor, feeMinor);

    // Create transaction
    const transaction = await tx.transaction.create({
      data: {
        userId,
        type,
        title,
        categoryId,
        goalId,
        fromAccountId,
        toAccountId,
        occurredOn: new Date(occurredOn),
        occurredTime: occurredTime ? new Date(`1970-01-01T${occurredTime}Z`) : null,
        amountMinor: BigInt(amountMinor),
        feeMinor: BigInt(feeMinor),
        currencyCode,
        source,
        status,
        note,
        idempotencyKey: idempotencyKey ?? undefined,
      },
    });

    // Calculate balance effects
    const balanceEffects = this.calculateBalanceEffects(type, accountMap, fromAccountId ?? null, toAccountId ?? null, amountMinor, feeMinor);

    // Insert balance effects and update account balances
    for (const effect of balanceEffects) {
      await tx.transactionBalanceEffect.create({
        data: {
          transactionId: transaction.id,
          accountId: effect.accountId,
          role: effect.role,
          deltaMinor: BigInt(effect.deltaMinor),
          balanceAfterMinor: BigInt(effect.balanceAfterMinor),
        },
      });

      await tx.financialAccount.update({
        where: { id: effect.accountId },
        data: { currentBalanceMinor: BigInt(effect.balanceAfterMinor) },
      });
    }

    // Handle goal funding
    if (goalId && type === 'transfer') {
      const goal = await tx.goal.findUnique({ where: { id: goalId } });
      if (!goal) throw new AppError('UNKNOWN_GOAL', 'Goal not found.', { field: 'goalId' });
      if (!goal.active) throw new AppError('GOAL_INACTIVE', 'Goal is not active.', { field: 'goalId' });

      const remaining = Number(goal.targetMinor) - Number(goal.currentMinor);
      if (amountMinor > remaining) {
        throw new AppError('GOAL_OVERFUNDED', 'Funding exceeds goal target.', { field: 'amountMinor' });
      }

      await tx.goal.update({
        where: { id: goalId },
        data: { currentMinor: { increment: BigInt(amountMinor) } },
      });

      // TODO(Phase 3+): Add goal_contributions table and migration
      // await tx.goalContribution.create({
      //   data: {
      //     goalId,
      //     transactionId: transaction.id,
      //     sourceAccountId: fromAccountId!,
      //     amountMinor: BigInt(amountMinor),
      //   },
      // });
    }

    return {
      transaction: this.mapTransaction(transaction),
      balanceEffects,
    };
  }

  async reverseTransaction(
    tx: PrismaTx,
    userId: string,
    transactionId: string,
    idempotencyKey?: string
  ): Promise<ReverseTransactionResult> {
    const original = await tx.transaction.findFirst({
      where: { id: transactionId, userId },
      include: { balanceEffects: true },
    });

    if (!original) {
      throw new AppError('UNKNOWN_TRANSACTION', 'Transaction not found.', { field: 'id' });
    }
    if (original.reversedTransactionId) {
      throw new AppError('ALREADY_REVERSED', 'Transaction already reversed.', { field: 'id' });
    }

    // Lock affected accounts
    const accountIds = new Set(original.balanceEffects.map(e => e.accountId));
    const accounts = await Promise.all(
      Array.from(accountIds).map(id =>
        tx.financialAccount.findUnique({ where: { id }, include: { creditCardDetail: true } })
      )
    );
    const accountMap = new Map(accounts.filter(Boolean).map(a => [a!.id, a!]));

    // Create compensating transaction
    const compensating = await tx.transaction.create({
      data: {
        userId,
        type: original.type,
        title: `Reversal: ${original.title}`,
        categoryId: original.categoryId,
        goalId: original.goalId,
        fromAccountId: original.fromAccountId,
        toAccountId: original.toAccountId,
        occurredOn: new Date(),
        occurredTime: null,
        amountMinor: original.amountMinor,
        feeMinor: original.feeMinor,
        currencyCode: original.currencyCode,
        source: 'manual',
        status: 'cleared',
        note: `Reversal of transaction ${original.id}`,
        idempotencyKey,
        reversedTransactionId: original.id,
      },
    });

    // Create compensating balance effects (opposite deltas)
    const compensatingEffects = original.balanceEffects.map(e => {
      const account = accountMap.get(e.accountId)!;
      const currentBalance = Number(account.currentBalanceMinor);
      const delta = -Number(e.deltaMinor);
      const balanceAfter = currentBalance + delta;

      return { ...e, deltaMinor: delta, balanceAfterMinor: balanceAfter };
    });

    for (const effect of compensatingEffects) {
      await tx.transactionBalanceEffect.create({
        data: {
          transactionId: compensating.id,
          accountId: effect.accountId,
          role: effect.role,
          deltaMinor: BigInt(effect.deltaMinor),
          balanceAfterMinor: BigInt(effect.balanceAfterMinor),
        },
      });

      await tx.financialAccount.update({
        where: { id: effect.accountId },
        data: { currentBalanceMinor: BigInt(effect.balanceAfterMinor) },
      });
    }

    // Update original transaction
    await tx.transaction.update({
      where: { id: original.id },
      data: { reversedTransactionId: compensating.id },
    });

    // Handle goal contribution reversal
    if (original.goalId) {
      await tx.goal.update({
        where: { id: original.goalId },
        data: { currentMinor: { decrement: original.amountMinor } },
      });

      // TODO(Phase 3+): Add goal_contributions table and migration
      // await tx.goalContribution.deleteMany({
      //   where: { transactionId: original.id },
      // });
    }

    return {
      reversedTransaction: this.mapTransaction(original),
      compensatingTransaction: this.mapTransaction(compensating),
      balanceEffects: compensatingEffects,
    };
  }

  private validateInvariants(
    type: string,
    accountMap: Map<string, any>,
    fromAccountId: string | null,
    toAccountId: string | null,
    amountMinor: number,
    feeMinor: number
  ): void {
    const totalAmount = amountMinor + feeMinor;

    switch (type) {
      case 'expense': {
        if (!fromAccountId) throw new AppError('INVALID_TRANSACTION_KIND', 'Expense requires fromAccountId.', { field: 'fromAccountId' });
        const acc = accountMap.get(fromAccountId)!;
        if (acc.classification !== 'asset') throw new AppError('INVALID_TRANSACTION_KIND', 'Expense must use an asset account.', { field: 'fromAccountId' });
        if (Number(acc.currentBalanceMinor) < totalAmount) {
          throw new AppError('ASSET_OVERDRAFT', 'This transaction would overdraw the selected account.', { field: 'amountMinor' });
        }
        break;
      }
      case 'income': {
        if (!toAccountId) throw new AppError('INVALID_TRANSACTION_KIND', 'Income requires toAccountId.', { field: 'toAccountId' });
        const acc = accountMap.get(toAccountId)!;
        if (acc.classification !== 'asset') throw new AppError('INVALID_TRANSACTION_KIND', 'Income must use an asset account.', { field: 'toAccountId' });
        break;
      }
      case 'transfer': {
        if (!fromAccountId || !toAccountId) throw new AppError('INVALID_TRANSACTION_KIND', 'Transfer requires fromAccountId and toAccountId.', { field: 'fromAccountId' });
        if (fromAccountId === toAccountId) throw new AppError('TRANSFER_SAME_ACCOUNT', 'Transfer cannot use the same source and destination.', { field: 'fromAccountId' });
        const fromAcc = accountMap.get(fromAccountId)!;
        const toAcc = accountMap.get(toAccountId)!;

        if (fromAcc.classification === 'liability' && fromAcc.accountType === 'credit_card') {
          // Card payment: from asset to card liability
          if (toAcc.classification !== 'liability' || toAcc.accountType !== 'credit_card') {
            throw new AppError('INVALID_TRANSACTION_KIND', 'Card payment must go to a credit card account.', { field: 'toAccountId' });
          }
          const cardDetail = toAcc.creditCardDetail;
          if (!cardDetail) throw new AppError('UNKNOWN_ACCOUNT', 'Credit card details not found.', { field: 'toAccountId' });
          const owed = Number(toAcc.currentBalanceMinor);
          if (owed === 0) throw new AppError('CARD_PAYMENT_EXCEEDS_OWED', 'Card has no balance to pay.', { field: 'amountMinor' });
          if (amountMinor > owed) {
            throw new AppError('CARD_PAYMENT_EXCEEDS_OWED', 'Card payment cannot exceed amount owed.', { field: 'amountMinor' });
          }
          // fromAcc must be asset
          if (fromAcc.classification !== 'asset') {
            throw new AppError('INVALID_TRANSACTION_KIND', 'Card payment must come from an asset account.', { field: 'fromAccountId' });
          }
          if (Number(fromAcc.currentBalanceMinor) < totalAmount) {
            throw new AppError('ASSET_OVERDRAFT', 'This transaction would overdraw the selected account.', { field: 'amountMinor' });
          }
        } else if (fromAcc.classification === 'asset' && toAcc.classification === 'asset') {
          // Asset to asset transfer
          if (Number(fromAcc.currentBalanceMinor) < totalAmount) {
            throw new AppError('ASSET_OVERDRAFT', 'This transaction would overdraw the selected account.', { field: 'amountMinor' });
          }
        } else {
          throw new AppError('INVALID_TRANSACTION_KIND', 'Invalid transfer account combination.', { field: 'fromAccountId' });
        }
        break;
      }
    }
  }

  private calculateBalanceEffects(
    type: string,
    accountMap: Map<string, any>,
    fromAccountId: string | null,
    toAccountId: string | null,
    amountMinor: number,
    feeMinor: number
  ): Array<{ accountId: string; role: BalanceEffectRole; deltaMinor: number; balanceAfterMinor: number }> {
    const effects: Array<{ accountId: string; role: BalanceEffectRole; deltaMinor: number; balanceAfterMinor: number }> = [];

    switch (type) {
      case 'expense': {
        const acc = accountMap.get(fromAccountId!)!;
        const newBalance = Number(acc.currentBalanceMinor) - amountMinor - feeMinor;
        effects.push({ accountId: fromAccountId!, role: 'expense', deltaMinor: -amountMinor, balanceAfterMinor: newBalance });
        if (feeMinor > 0) {
          effects.push({ accountId: fromAccountId!, role: 'fee', deltaMinor: -feeMinor, balanceAfterMinor: newBalance });
        }
        break;
      }
      case 'income': {
        const acc = accountMap.get(toAccountId!)!;
        const newBalance = Number(acc.currentBalanceMinor) + amountMinor;
        effects.push({ accountId: toAccountId!, role: 'income', deltaMinor: amountMinor, balanceAfterMinor: newBalance });
        if (feeMinor > 0) {
          const newBalanceWithFee = newBalance - feeMinor;
          effects.push({ accountId: toAccountId!, role: 'fee', deltaMinor: -feeMinor, balanceAfterMinor: newBalanceWithFee });
        }
        break;
      }
      case 'transfer': {
        const fromAcc = accountMap.get(fromAccountId!)!;
        const toAcc = accountMap.get(toAccountId!)!;
        const totalAmount = amountMinor + feeMinor;

        if (fromAcc.classification === 'liability' && fromAcc.accountType === 'credit_card') {
          // This shouldn't happen for transfers (card payments are handled above)
        } else if (toAcc.classification === 'liability' && toAcc.accountType === 'credit_card') {
          // Card payment: asset -> card liability
          const fromNewBalance = Number(fromAcc.currentBalanceMinor) - totalAmount;
          effects.push({ accountId: fromAccountId!, role: 'card_payment', deltaMinor: -amountMinor, balanceAfterMinor: fromNewBalance });
          if (feeMinor > 0) {
            effects.push({ accountId: fromAccountId!, role: 'fee', deltaMinor: -feeMinor, balanceAfterMinor: fromNewBalance });
          }
          const toNewBalance = Number(toAcc.currentBalanceMinor) - amountMinor;
          effects.push({ accountId: toAccountId!, role: 'card_payment', deltaMinor: -amountMinor, balanceAfterMinor: toNewBalance });
        } else {
          // Asset to asset transfer
          const fromNewBalance = Number(fromAcc.currentBalanceMinor) - totalAmount;
          const toNewBalance = Number(toAcc.currentBalanceMinor) + amountMinor;
          effects.push({ accountId: fromAccountId!, role: 'source', deltaMinor: -amountMinor, balanceAfterMinor: fromNewBalance });
          effects.push({ accountId: toAccountId!, role: 'destination', deltaMinor: amountMinor, balanceAfterMinor: toNewBalance });
          if (feeMinor > 0) {
            effects.push({ accountId: fromAccountId!, role: 'fee', deltaMinor: -feeMinor, balanceAfterMinor: fromNewBalance });
          }
        }
        break;
      }
    }

    return effects;
  }

  private mapTransaction(tx: any): TransactionView {
    return {
      id: tx.id,
      userId: tx.userId,
      type: tx.type,
      title: tx.title,
      categoryId: tx.categoryId,
      goalId: tx.goalId,
      fromAccountId: tx.fromAccountId,
      toAccountId: tx.toAccountId,
      occurredOn: tx.occurredOn.toISOString().split('T')[0],
      occurredTime: tx.occurredTime ? tx.occurredTime.toISOString().split('T')[1].slice(0, 5) : null,
      amountMinor: Number(tx.amountMinor),
      feeMinor: Number(tx.feeMinor),
      currencyCode: tx.currencyCode,
      source: tx.source,
      status: tx.status,
      note: tx.note,
      idempotencyKey: tx.idempotencyKey,
      reversedTransactionId: tx.reversedTransactionId,
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
    };
  }
}
