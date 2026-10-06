import { forwardRef, type InputHTMLAttributes } from 'react';
import clsx from 'clsx';
import { CURRENCIES, formatMoney, parseMoney, type CurrencyCode } from '@profjero/shared';

/** Displays an amount in minor units. Never formats floats. */
export function Money({ minor, currency, signed, className, tone }: { minor: number; currency: CurrencyCode; signed?: boolean; className?: string; tone?: 'auto' }) {
  return (
    <span
      className={clsx('tabular whitespace-nowrap', tone === 'auto' && (minor < 0 ? 'text-critical-ink' : minor > 0 ? 'text-good-ink' : ''), className)}
    >
      {formatMoney(minor, currency, { signed })}
    </span>
  );
}

/**
 * Text input for money. Keeps the user's text as typed (no float coercion);
 * convert with parseMoney at the form boundary.
 */
export const MoneyInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { currency: CurrencyCode; invalid?: boolean }>(function MoneyInput(
  { currency, invalid, className, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{CURRENCIES[currency].symbol}</span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={clsx(
          'tabular h-10 w-full rounded-lg border border-line bg-surface pr-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 aria-[invalid=true]:border-critical',
          CURRENCIES[currency].symbol.length > 2 ? 'pl-12' : 'pl-8',
          className,
        )}
        placeholder="0.00"
        {...rest}
      />
    </div>
  );
});

const MONEY_ERRORS = {
  empty: 'Enter an amount.',
  invalid: 'Enter a number like 1,250.50.',
  too_many_decimals: 'Too many decimal places.',
  too_large: 'That amount is too large.',
  negative: 'Enter a positive amount.',
} as const;

/** Zod-friendly refinement: validates text and returns a message, or null. */
export function moneyError(text: string, currency: CurrencyCode, opts: { allowZero?: boolean; allowNegative?: boolean } = {}): string | null {
  const r = parseMoney(text, currency, { allowNegative: opts.allowNegative });
  if (!r.ok) return MONEY_ERRORS[r.error];
  if (!opts.allowZero && r.minor === 0) return 'Enter an amount greater than zero.';
  return null;
}

export function toMinor(text: string, currency: CurrencyCode, allowNegative = false): number {
  const r = parseMoney(text, currency, { allowNegative });
  if (!r.ok) throw new Error('toMinor called with invalid input; validate with moneyError first');
  return r.minor;
}
