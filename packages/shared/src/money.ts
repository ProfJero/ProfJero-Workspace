/**
 * Money is represented everywhere as an integer number of MINOR units
 * (e.g. pesewas for GHS: GH₵100.50 === 10050).
 *
 * Conversion boundaries:
 *   user text  --parseMoney-->  minor units  --formatMoney-->  display text
 * Nothing else in the system converts between representations.
 */

export const CURRENCIES = {
  GHS: { code: 'GHS', symbol: 'GH₵', decimals: 2, name: 'Ghana Cedi' },
  USD: { code: 'USD', symbol: '$', decimals: 2, name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', decimals: 2, name: 'Euro' },
  GBP: { code: 'GBP', symbol: '£', decimals: 2, name: 'Pound Sterling' },
  NGN: { code: 'NGN', symbol: '₦', decimals: 2, name: 'Nigerian Naira' },
  KES: { code: 'KES', symbol: 'KSh', decimals: 2, name: 'Kenyan Shilling' },
  ZAR: { code: 'ZAR', symbol: 'R', decimals: 2, name: 'South African Rand' },
  XOF: { code: 'XOF', symbol: 'CFA', decimals: 0, name: 'West African CFA Franc' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** Largest amount accepted for a single record: 1 trillion major units in a 2-decimal currency. */
export const MAX_MINOR = 100_000_000_000_000;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && value in CURRENCIES;
}

export function currencyDecimals(currency: CurrencyCode): number {
  return CURRENCIES[currency].decimals;
}

export function isMinor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_MINOR;
}

export function assertMinor(value: number, label = 'amount'): number {
  if (!isMinor(value)) throw new RangeError(`${label} must be a safe integer number of minor units`);
  return value;
}

export type ParseMoneyResult =
  | { ok: true; minor: number }
  | { ok: false; error: 'empty' | 'invalid' | 'too_many_decimals' | 'too_large' | 'negative' };

/**
 * Parse user-entered text into minor units.
 * Accepts "1234", "1,234.5", "1 234.56", "GH₵ 100.50". Rejects anything ambiguous
 * and never rounds: "1.005" in a 2-decimal currency is an error, not 1.01.
 */
export function parseMoney(
  input: string | number | null | undefined,
  currency: CurrencyCode,
  opts: { allowNegative?: boolean } = {},
): ParseMoneyResult {
  if (input === null || input === undefined) return { ok: false, error: 'empty' };
  let text = typeof input === 'number' ? numberToPlainString(input) : input;
  text = text.trim();
  if (text === '') return { ok: false, error: 'empty' };

  const symbol = CURRENCIES[currency].symbol;
  text = text.split(symbol).join('').replace(new RegExp(`^${currency}`, 'i'), '').trim();

  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1).trim();
  }
  // Thousands separators: commas or spaces between digit groups only.
  if (!/^(\d{1,3}([, ]\d{3})+|\d+)(\.\d*)?$/.test(text) && !/^\.\d+$/.test(text)) {
    return { ok: false, error: 'invalid' };
  }
  text = text.replace(/[, ]/g, '');
  const [whole = '0', frac = ''] = text.split('.');
  const decimals = currencyDecimals(currency);
  if (frac.length > decimals) return { ok: false, error: 'too_many_decimals' };

  const digits = (whole === '' ? '0' : whole) + frac.padEnd(decimals, '0');
  if (digits.replace(/^0+/, '').length > 16) return { ok: false, error: 'too_large' };
  const minor = Number(digits);
  if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) return { ok: false, error: 'too_large' };
  if (negative && minor !== 0) {
    if (!opts.allowNegative) return { ok: false, error: 'negative' };
    return { ok: true, minor: -minor };
  }
  return { ok: true, minor };
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) return 'NaN';
  // toFixed avoids exponent notation; 10 decimals is more than any currency uses
  // and lets the decimals check reject genuinely over-precise input.
  return n.toFixed(10).replace(/\.?0+$/, '');
}

/** Minor units -> plain decimal string ("10050" -> "100.50"), suitable for inputs. */
export function minorToDecimalString(minor: number, currency: CurrencyCode): string {
  assertMinor(minor);
  const decimals = currencyDecimals(currency);
  const negative = minor < 0;
  const abs = Math.abs(minor).toString().padStart(decimals + 1, '0');
  const whole = decimals === 0 ? abs : abs.slice(0, -decimals);
  const frac = decimals === 0 ? '' : '.' + abs.slice(-decimals);
  return (negative ? '-' : '') + whole + frac;
}

/** Display formatting. Uses Intl for grouping, but the digits come from integer math. */
export function formatMoney(
  minor: number,
  currency: CurrencyCode,
  opts: { signed?: boolean; compact?: boolean } = {},
): string {
  assertMinor(minor);
  const { symbol, decimals } = CURRENCIES[currency];
  const negative = minor < 0;
  const plain = minorToDecimalString(Math.abs(minor), currency);
  const [whole = '0', frac] = plain.split('.');
  let body: string;
  if (opts.compact && Math.abs(minor) >= 1_000_000 * 10 ** decimals) {
    const major = Math.abs(minor) / 10 ** decimals;
    body = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(major);
  } else {
    body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
  }
  const sign = negative ? '−' : opts.signed && minor > 0 ? '+' : '';
  return `${sign}${symbol}${body}`;
}

export function sumMinor(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) {
    assertMinor(v);
    total += v;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError('sum exceeds safe integer range');
  return total;
}

/** Round half away from zero for a BigInt division. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (2n * d);
  return negative ? -q : q;
}

/** minor × (basisPoints / 10000), rounded half away from zero. 1 bp = 0.01%. */
export function applyBasisPoints(minor: number, basisPoints: number): number {
  assertMinor(minor);
  if (!Number.isSafeInteger(basisPoints)) throw new RangeError('basis points must be an integer');
  return Number(divRound(BigInt(minor) * BigInt(basisPoints), 10000n));
}

/** unitPriceMinor × (quantityMilli / 1000), rounded half away from zero. */
export function multiplyByQuantity(unitPriceMinor: number, quantityMilli: number): number {
  assertMinor(unitPriceMinor);
  if (!Number.isSafeInteger(quantityMilli)) throw new RangeError('quantity must be an integer number of thousandths');
  return Number(divRound(BigInt(unitPriceMinor) * BigInt(quantityMilli), 1000n));
}

/**
 * Ratio expressed as a percentage with one decimal place, computed with integer
 * math. Returns null when the denominator is zero (the caller must decide how
 * to present "no baseline"); never NaN or Infinity.
 */
export function percentOf(part: number, whole: number): number | null {
  if (!Number.isSafeInteger(part) || !Number.isSafeInteger(whole)) throw new RangeError('integers required');
  if (whole === 0) return null;
  return Number(divRound(BigInt(part) * 1000n, BigInt(whole))) / 10;
}

/** Split an amount into n parts that sum exactly to the original (remainder to the first parts). */
export function allocateEvenly(minor: number, parts: number): number[] {
  assertMinor(minor);
  if (!Number.isInteger(parts) || parts <= 0) throw new RangeError('parts must be a positive integer');
  const base = Math.trunc(minor / parts);
  let remainder = minor - base * parts;
  const step = remainder >= 0 ? 1 : -1;
  return Array.from({ length: parts }, () => {
    if (remainder !== 0) {
      remainder -= step;
      return base + step;
    }
    return base;
  });
}
