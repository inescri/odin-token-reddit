import { Prisma } from '@prisma/client';

export const WEIGHT_MAX_DIGITS = 40;

const DIGITS_ONLY = /^[0-9]+$/;

/**
 * Parse a client-submitted raw-unit amount. Accepts only a non-negative
 * integer written in decimal digits, at most `WEIGHT_MAX_DIGITS` long (the
 * column is `DECIMAL(40,0)`). Returns `null` when the shape is invalid; the
 * caller decides the error to raise.
 */
export function parseWeight(input: unknown): bigint | null {
  if (typeof input !== 'string') return null;
  if (input.length === 0 || input.length > WEIGHT_MAX_DIGITS) return null;
  if (!DIGITS_ONLY.test(input)) return null;
  return BigInt(input);
}

/** Prisma `Decimal(40,0)` → `bigint`. Throws if the value is not integral. */
export function decimalToBigint(value: Prisma.Decimal | string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  // Decimal.js `toString()` switches to exponent notation above 1e21; `toFixed()`
  // with no digits always yields the plain integer text.
  const text = value instanceof Prisma.Decimal ? value.toFixed() : typeof value === 'number' ? value.toFixed(0) : value;
  if (!/^-?[0-9]+$/.test(text)) {
    throw new Error(`Non-integral decimal in amount column: ${text}`);
  }
  return BigInt(text);
}

/** `bigint` → Prisma `Decimal` for writes. */
export function bigintToDecimal(value: bigint): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

/** Wire form: decimal string (signed allowed for scores). */
export function bigintToString(value: bigint): string {
  return value.toString();
}
