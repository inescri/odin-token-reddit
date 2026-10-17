/**
 * Format a raw base-unit amount (bigint) into a human string using the token's
 * display exponent — for Odin tokens that is `divisibility + decimals` — without
 * going through float (which would lose precision on large balances).
 */
export function formatTokenAmount(raw: bigint, exponent: number): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  if (exponent <= 0) return `${negative ? '-' : ''}${abs.toString()}`;
  const base = 10n ** BigInt(exponent);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac === 0n ? '' : frac.toString().padStart(exponent, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fracStr ? `.${fracStr}` : ''}`;
}

/** Odin's display exponent for a token. */
export function displayExponent(token: { divisibility: number; decimals: number }): number {
  return token.divisibility + token.decimals;
}

export interface CompactOptions {
  /** Fraction digits to keep for small values (default 3). */
  maxFractionDigits?: number;
}

/**
 * Compact display for scores and balances: at most `maxFractionDigits`
 * fraction digits, thousands separators, and a visible floor so a non-zero
 * amount never renders as `0` (spec FR-022).
 */
export function formatCompactAmount(raw: bigint, exponent: number, opts: CompactOptions = {}): string {
  const digits = opts.maxFractionDigits ?? 3;
  if (raw === 0n) return '0';
  const full = formatTokenAmount(raw, exponent);
  const negative = full.startsWith('-');
  const [wholeStr, fracStr = ''] = (negative ? full.slice(1) : full).split('.');
  const wholeGrouped = wholeStr!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = fracStr.slice(0, digits).replace(/0+$/, '');
  if (wholeStr === '0' && frac === '') {
    // Non-zero but below the visible precision.
    return `${negative ? '-' : ''}<0.${'0'.repeat(Math.max(0, digits - 1))}1`;
  }
  return `${negative ? '-' : ''}${wholeGrouped}${frac ? `.${frac}` : ''}`;
}

/** Signed compact amount with an explicit `+` for positives. */
export function formatSignedAmount(raw: bigint, exponent: number, opts?: CompactOptions): string {
  const s = formatCompactAmount(raw, exponent, opts);
  return raw > 0n ? `+${s}` : s;
}
