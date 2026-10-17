import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import { bigintToDecimal, bigintToString, decimalToBigint, parseWeight } from '../src/lib/amounts.js';

describe('parseWeight', () => {
  it('accepts digit strings up to 40 chars', () => {
    expect(parseWeight('0')).toBe(0n);
    expect(parseWeight('123456789012345678901234567890')).toBe(123456789012345678901234567890n);
    expect(parseWeight('9'.repeat(40))).toBe(BigInt('9'.repeat(40)));
  });
  it('rejects non-strings, empty, signs, decimals, whitespace, overlong', () => {
    expect(parseWeight(5)).toBeNull();
    expect(parseWeight('')).toBeNull();
    expect(parseWeight('-1')).toBeNull();
    expect(parseWeight('+1')).toBeNull();
    expect(parseWeight('1.5')).toBeNull();
    expect(parseWeight(' 1')).toBeNull();
    expect(parseWeight('1e3')).toBeNull();
    expect(parseWeight('1'.repeat(41))).toBeNull();
  });
});

describe('decimal conversions', () => {
  it('round-trips signed integers through Prisma.Decimal', () => {
    const neg = -98765432109876543210n;
    expect(decimalToBigint(bigintToDecimal(neg))).toBe(neg);
    expect(decimalToBigint(new Prisma.Decimal('42'))).toBe(42n);
    expect(decimalToBigint('7')).toBe(7n);
  });
  it('handles Decimal values beyond 1e21 without exponent notation', () => {
    const big = BigInt('123456789012345678901234567890123456789');
    const dec = new Prisma.Decimal(big.toString());
    expect(dec.toString()).toContain('e'); // the hazard this guards against
    expect(decimalToBigint(dec)).toBe(big);
    expect(decimalToBigint(bigintToDecimal(-big))).toBe(-big);
  });
  it('refuses fractional decimals', () => {
    expect(() => decimalToBigint(new Prisma.Decimal('1.5'))).toThrow();
  });
  it('formats wire strings', () => {
    expect(bigintToString(-3n)).toBe('-3');
  });
});
