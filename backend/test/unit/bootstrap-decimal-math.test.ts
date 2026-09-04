// D10: Unit test verifying Decimal multiplication produces exact values,
// not floating-point artifacts. This test does NOT require a database.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

describe('D10: Bootstrap Decimal Math (Unit Test)', () => {
  it('multiplies Decimal * BigInt using .times() to avoid float artifacts', () => {
    // Case 1: 0.3 * 1 should equal exactly 0.3, not 0.30000000000000004
    const units1 = new Prisma.Decimal('0.3');
    const priceMinor1 = new Prisma.Decimal('1');
    const result1 = units1.times(priceMinor1);
    expect(result1.toNumber()).toBe(0.3);
    expect(String(result1)).toBe('0.3');

    // Case 2: 0.1 * 3 should equal exactly 0.3, not 0.30000000000000004
    const units2 = new Prisma.Decimal('0.1');
    const priceMinor2 = new Prisma.Decimal('3');
    const result2 = units2.times(priceMinor2);
    expect(result2.toNumber()).toBe(0.3);
    expect(String(result2)).toBe('0.3');

    // Case 3: 0.7 * 1000000 should equal exactly 700000
    const units3 = new Prisma.Decimal('0.7');
    const priceMinor3 = new Prisma.Decimal('1000000');
    const result3 = units3.times(priceMinor3);
    expect(result3.toNumber()).toBe(700000);
    expect(String(result3)).toBe('700000');

    // Case 4: Compare buggy approach (Number * Number) vs correct (Decimal.times())
    const unitsNum = 0.1;
    const priceMinorNum = 3;
    const buggyResult = unitsNum * priceMinorNum;
    expect(buggyResult).toBe(0.30000000000000004); // This is the bug

    // With Decimal.times(), the result is exact
    const correctResult = new Prisma.Decimal('0.1').times(new Prisma.Decimal('3'));
    expect(correctResult.toNumber()).toBe(0.3); // Exact value
  });

  it('preserves precision across different magnitude orders', () => {
    // Small decimals with large integers
    const cases = [
      { units: '0.01', price: '50000', expected: '500' },
      { units: '0.025', price: '40000', expected: '1000' },
      { units: '1.5', price: '666666', expected: '999999' },
    ];

    for (const testCase of cases) {
      const units = new Prisma.Decimal(testCase.units);
      const price = new Prisma.Decimal(testCase.price);
      const result = units.times(price);
      expect(result.toString()).toBe(testCase.expected);
    }
  });
});
