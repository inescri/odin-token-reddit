import { describe, expect, it } from 'vitest';

import { displayExponent, formatCompactAmount, formatSignedAmount, formatTokenAmount } from './amounts';

describe('amounts', () => {
  it('formatTokenAmount handles sign, zero padding, trailing zeros', () => {
    expect(formatTokenAmount(123456789000n, 11)).toBe('1.23456789');
    expect(formatTokenAmount(-5n, 11)).toBe('-0.00000000005');
    expect(formatTokenAmount(100000000000n, 11)).toBe('1');
    expect(formatTokenAmount(7n, 0)).toBe('7');
  });
  it('displayExponent sums divisibility and decimals', () => {
    expect(displayExponent({ divisibility: 8, decimals: 3 })).toBe(11);
  });
  it('compact keeps non-zero amounts visible', () => {
    expect(formatCompactAmount(0n, 11)).toBe('0');
    expect(formatCompactAmount(1n, 11)).toBe('<0.001');
    expect(formatCompactAmount(-1n, 11)).toBe('-<0.001');
    expect(formatCompactAmount(123456700000000n, 11)).toBe('1,234.567');
    expect(formatCompactAmount(123456789000000n, 11)).toBe('1,234.567');
  });
  it('signed adds plus', () => {
    expect(formatSignedAmount(100000000000n, 11)).toBe('+1');
    expect(formatSignedAmount(-100000000000n, 11)).toBe('-1');
    expect(formatSignedAmount(0n, 11)).toBe('0');
  });
  it('abbreviates values ≥ 1,000 with one truncated decimal', () => {
    const short = (n: bigint, exponent = 0) => formatCompactAmount(n, exponent, { abbreviate: true });
    expect(short(999n)).toBe('999');
    expect(short(1_000n)).toBe('1K');
    expect(short(1_234n)).toBe('1.2K');
    expect(short(1_999n)).toBe('1.9K');
    expect(short(20_000n)).toBe('20K');
    expect(short(999_999n)).toBe('999.9K');
    expect(short(1_000_000n)).toBe('1M');
    expect(short(1_500_000_000n)).toBe('1.5B');
    expect(short(2_000_000_000_000n)).toBe('2T');
    expect(short(1_234_000_000_000_000n)).toBe('1,234T');
    expect(short(123456700000000n, 11)).toBe('1.2K');
    expect(short(-1_500n)).toBe('-1.5K');
    expect(formatSignedAmount(20_000n, 0, { abbreviate: true })).toBe('+20K');
  });
  it('abbreviate leaves values below 1,000 unchanged', () => {
    expect(formatCompactAmount(1n, 11, { abbreviate: true })).toBe('<0.001');
    expect(formatCompactAmount(1_250_000_000_000n, 11, { abbreviate: true })).toBe('12.5');
    expect(formatCompactAmount(123456700000000n, 11)).toBe('1,234.567');
  });
});
