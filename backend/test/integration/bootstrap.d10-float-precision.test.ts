// D10 Regression Test: Verify that bootstrap trade amountMinor uses Decimal
// arithmetic (not Number multiplication) to preserve floating-point precision.
// Reproduces the exact bug: units * priceMinor with Number() caused
// 0.30000000000000004 instead of exact value.
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { BootstrapService } from '../../src/modules/bootstrap/bootstrap.service.js';
import { LedgerService } from '../../src/modules/ledger/ledger.service.js';
import { LedgerRepository } from '../../src/modules/ledger/ledger.repository.js';
import { AccountsService } from '../../src/modules/accounts/accounts.service.js';
import { AccountsRepository } from '../../src/modules/accounts/accounts.repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const describeIfDb = databaseUrl ? describe : describe.skip;

describeIfDb('D10: Bootstrap float-precision fix for investment trades', () => {
  it('computes trade amountMinor using Decimal.times() to avoid float artifacts', async () => {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

    try {
      // Set up test user
      const userId = randomUUID();
      const userEmail = `${randomUUID()}@d10-test.test`;
      await prisma.user.create({
        data: {
          id: userId,
          email: userEmail,
          passwordHash: 'test',
          displayName: 'D10 Test User',
          timezone: 'Asia/Manila',
          baseCurrency: 'PHP',
        },
      });

      // Create an instrument
      const instrumentId = randomUUID();
      await prisma.instrument.create({
        data: {
          id: instrumentId,
          ticker: 'TEST',
          name: 'Test Instrument',
          assetClass: 'equity',
          sector: 'Technology',
        },
      });

      // Create a cash account
      const accountId = randomUUID();
      await prisma.financialAccount.create({
        data: {
          id: accountId,
          userId,
          name: 'Cash',
          accountType: 'checking',
          classification: 'asset',
          currentBalanceMinor: 1000000,
          openingBalanceMinor: 1000000,
        },
      });

      // Create a trade with units that would cause floating-point precision
      // issues if converted to Number before multiplication.
      // Case 1: units = 0.3, priceMinor = 1 (minor unit)
      // Expected: amountMinor = 0.3
      // Buggy result: 0.30000000000000004
      const tradeId1 = randomUUID();
      await prisma.investmentTrade.create({
        data: {
          id: tradeId1,
          userId,
          instrumentId,
          type: 'buy',
          units: new Prisma.Decimal('0.3'),
          priceMinor: 1n,
          occurredOn: new Date('2026-09-01'),
          cashAccountId: accountId,
        },
      });

      // Case 2: units = 0.1, priceMinor = 3 (minor units, 0.03 in major units)
      // Expected: amountMinor = 0.3
      // Buggy result: 0.30000000000000004
      const tradeId2 = randomUUID();
      await prisma.investmentTrade.create({
        data: {
          id: tradeId2,
          userId,
          instrumentId,
          type: 'buy',
          units: new Prisma.Decimal('0.1'),
          priceMinor: 3n,
          occurredOn: new Date('2026-09-02'),
          cashAccountId: accountId,
        },
      });

      // Case 3: units = 0.7, priceMinor = 1000000
      // Expected: amountMinor = 700000
      // Buggy result: might have precision issues
      const tradeId3 = randomUUID();
      await prisma.investmentTrade.create({
        data: {
          id: tradeId3,
          userId,
          instrumentId,
          type: 'buy',
          units: new Prisma.Decimal('0.7'),
          priceMinor: 1000000n,
          occurredOn: new Date('2026-09-03'),
          cashAccountId: accountId,
        },
      });

      // Call bootstrap to get the investment trades
      const ledgerService = new LedgerService(prisma, new LedgerRepository(prisma));
      const accountsService = new AccountsService(prisma, new AccountsRepository(prisma));
      const bootstrapService = new BootstrapService(prisma, ledgerService, accountsService);

      const bootstrap = await bootstrapService.getBootstrap(userId);

      // Verify the trades have exact amountMinor values without float artifacts
      const trades = bootstrap.investmentActivity.trades;
      expect(trades).toHaveLength(3);

      // Trade 1: units=0.3, priceMinor=1, expected amountMinor=0.3
      const trade1 = trades.find((t) => t.id === tradeId1)!;
      expect(trade1).toBeDefined();
      expect(trade1.units).toBe(0.3);
      expect(trade1.priceMinor).toBe(1);
      // Critical: amountMinor must be exactly 0.3, not 0.30000000000000004
      expect(trade1.amountMinor).toBe(0.3);
      expect(String(trade1.amountMinor)).not.toContain('30000000000000004');

      // Trade 2: units=0.1, priceMinor=3, expected amountMinor=0.3
      const trade2 = trades.find((t) => t.id === tradeId2)!;
      expect(trade2).toBeDefined();
      expect(trade2.units).toBe(0.1);
      expect(trade2.priceMinor).toBe(3);
      // Critical: amountMinor must be exactly 0.3, not 0.30000000000000004
      expect(trade2.amountMinor).toBe(0.3);
      expect(String(trade2.amountMinor)).not.toContain('30000000000000004');

      // Trade 3: units=0.7, priceMinor=1000000, expected amountMinor=700000
      const trade3 = trades.find((t) => t.id === tradeId3)!;
      expect(trade3).toBeDefined();
      expect(trade3.units).toBe(0.7);
      expect(trade3.priceMinor).toBe(1000000);
      expect(trade3.amountMinor).toBe(700000);
    } finally {
      await prisma.$disconnect();
    }
  });
});
