import { describe, expect, it } from 'vitest';
import {
  allocateEvenly,
  applyBasisPoints,
  formatMoney,
  minorToDecimalString,
  multiplyByQuantity,
  parseMoney,
  percentOf,
  sumMinor,
} from '../src';

describe('parseMoney', () => {
  it('converts GH₵100.50 to 10050 pesewas', () => {
    expect(parseMoney('100.50', 'GHS')).toEqual({ ok: true, minor: 10050 });
    expect(parseMoney('GH₵100.50', 'GHS')).toEqual({ ok: true, minor: 10050 });
    expect(parseMoney('GHS 100.5', 'GHS')).toEqual({ ok: true, minor: 10050 });
  });
  it('accepts grouping separators', () => {
    expect(parseMoney('1,234,567.89', 'GHS')).toEqual({ ok: true, minor: 123456789 });
    expect(parseMoney('1 234.00', 'GHS')).toEqual({ ok: true, minor: 123400 });
    expect(parseMoney('.5', 'GHS')).toEqual({ ok: true, minor: 50 });
  });
  it('never rounds silently', () => {
    expect(parseMoney('1.005', 'GHS')).toEqual({ ok: false, error: 'too_many_decimals' });
    expect(parseMoney('10.5', 'XOF')).toEqual({ ok: false, error: 'too_many_decimals' });
  });
  it('rejects empty, malformed, negative and NaN-like input', () => {
    expect(parseMoney('', 'GHS')).toEqual({ ok: false, error: 'empty' });
    expect(parseMoney('   ', 'GHS')).toEqual({ ok: false, error: 'empty' });
    expect(parseMoney(null, 'GHS')).toEqual({ ok: false, error: 'empty' });
    expect(parseMoney('abc', 'GHS').ok).toBe(false);
    expect(parseMoney('1,23.00', 'GHS').ok).toBe(false);
    expect(parseMoney('1e5', 'GHS').ok).toBe(false);
    expect(parseMoney('NaN', 'GHS').ok).toBe(false);
    expect(parseMoney(Number.NaN, 'GHS').ok).toBe(false);
    expect(parseMoney('-5', 'GHS')).toEqual({ ok: false, error: 'negative' });
    expect(parseMoney('-5', 'GHS', { allowNegative: true })).toEqual({ ok: true, minor: -500 });
  });
  it('rejects absurd magnitudes', () => {
    expect(parseMoney('99999999999999999999', 'GHS')).toEqual({ ok: false, error: 'too_large' });
  });
  it('handles numbers without float artefacts', () => {
    // Numeric inputs are normalised at 10 decimals, so float noise from an <input type=number> is removed…
    expect(parseMoney(0.1 + 0.2, 'GHS')).toEqual({ ok: true, minor: 30 });
    // …but genuinely over-precise values are still rejected.
    expect(parseMoney(0.125, 'GHS').ok).toBe(false);
    expect(parseMoney(19.99, 'GHS')).toEqual({ ok: true, minor: 1999 });
  });
});

describe('formatting', () => {
  it('formats minor units exactly', () => {
    expect(formatMoney(10050, 'GHS')).toBe('GH₵100.50');
    expect(formatMoney(-123456789, 'GHS')).toBe('−GH₵1,234,567.89');
    expect(formatMoney(5, 'GHS')).toBe('GH₵0.05');
    expect(formatMoney(500, 'GHS', { signed: true })).toBe('+GH₵5.00');
    expect(formatMoney(1500, 'XOF')).toBe('CFA1,500');
    expect(minorToDecimalString(7, 'GHS')).toBe('0.07');
    expect(minorToDecimalString(-10050, 'GHS')).toBe('-100.50');
  });
  it('round-trips', () => {
    for (const v of [0, 1, 99, 100, 10050, 123456789]) {
      expect(parseMoney(minorToDecimalString(v, 'GHS'), 'GHS')).toEqual({ ok: true, minor: v });
    }
  });
});

describe('arithmetic', () => {
  it('sums exactly where floats drift', () => {
    const tenCents = Array.from({ length: 10 }, () => 10);
    expect(sumMinor(tenCents)).toBe(100);
    expect(Array.from({ length: 10 }, () => 0.1).reduce((a, b) => a + b, 0)).not.toBe(1); // the legacy bug
  });
  it('rejects non-integer amounts', () => {
    expect(() => sumMinor([1.5])).toThrow();
    expect(() => sumMinor([Number.NaN])).toThrow();
  });
  it('applies basis points with half-away-from-zero rounding', () => {
    expect(applyBasisPoints(10000, 1500)).toBe(1500); // 15% of 100.00
    expect(applyBasisPoints(333, 1500)).toBe(50); // 49.95 → 50
    expect(applyBasisPoints(-333, 1500)).toBe(-50);
    expect(applyBasisPoints(1, 5000)).toBe(1); // 0.5 → 1
  });
  it('multiplies by fractional quantities exactly', () => {
    expect(multiplyByQuantity(15000, 1500)).toBe(22500); // 1.5 × 150.00
    expect(multiplyByQuantity(333, 333)).toBe(111); // 0.333 × 3.33 = 1.10889
  });
  it('percentOf never returns NaN or Infinity', () => {
    expect(percentOf(0, 0)).toBeNull();
    expect(percentOf(50, 0)).toBeNull();
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(150, 100)).toBe(150);
  });
  it('allocates without losing a pesewa', () => {
    expect(allocateEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(allocateEvenly(-100, 3)).toEqual([-34, -33, -33]);
    expect(sumMinor(allocateEvenly(1001, 7))).toBe(1001);
  });
});
