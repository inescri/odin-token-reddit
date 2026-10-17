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
});
