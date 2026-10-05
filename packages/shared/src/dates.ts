/**
 * Calendar dates are ISO strings "YYYY-MM-DD" with no time and no timezone.
 * They are interpreted in the TENANT's timezone (tenant.timezone). Because they
 * compare lexicographically, period filtering never depends on the browser's
 * local clock or UTC offsets.
 *
 * Instants (event start/end, createdAt) are stored as Firestore Timestamps.
 */

export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month1: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month1 - 1] ?? 0;
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return y >= 1900 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  if (!isIsoDate(date)) throw new RangeError(`Invalid ISO date: ${String(date)}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { year: y, month: m, day: d };
}

export function toIsoDate(year: number, month1: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days since 1970-01-01 for a calendar date (proleptic Gregorian, timezone-free). */
export function toDayNumber(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function fromDayNumber(dayNumber: number): IsoDate {
  const d = new Date(dayNumber * 86_400_000);
  return toIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Adds calendar months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const index = year * 12 + (month - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  return toIsoDate(ty, tm, Math.min(day, daysInMonth(ty, tm)));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return toIsoDate(year, month, 1);
}

export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return toIsoDate(year, month, daysInMonth(year, month));
}

export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

/** Monday-based ISO week start. */
export function startOfWeek(date: IsoDate, weekStartsOn: 0 | 1 = 1): IsoDate {
  const dow = (toDayNumber(date) + 4) % 7; // 1970-01-01 was a Thursday (4); 0 = Sunday
  const offset = (dow - weekStartsOn + 7) % 7;
  return addDays(date, -offset);
}

export function dayOfWeek(date: IsoDate): number {
  return (toDayNumber(date) + 4) % 7;
}

/** Current calendar date in an IANA timezone. */
export function todayInZone(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** An inclusive date range. Both ends are included. */
export interface DateRange {
  start: IsoDate;
  end: IsoDate;
}

export function inRange(date: IsoDate, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function assertRange(range: DateRange): DateRange {
  if (!isIsoDate(range.start) || !isIsoDate(range.end) || range.start > range.end) {
    throw new RangeError('Invalid date range');
  }
  return range;
}

export type PeriodPreset =
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'last_30_days'
  | 'last_90_days'
  | 'last_12_months';

export function presetRange(preset: PeriodPreset, today: IsoDate): DateRange {
  const { year, month } = parseIsoDate(today);
  switch (preset) {
    case 'this_week':
      return { start: startOfWeek(today), end: addDays(startOfWeek(today), 6) };
    case 'this_month':
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case 'last_month': {
      const prev = addMonths(startOfMonth(today), -1);
      return { start: prev, end: endOfMonth(prev) };
    }
    case 'this_quarter': {
      const qStart = toIsoDate(year, Math.floor((month - 1) / 3) * 3 + 1, 1);
      return { start: qStart, end: endOfMonth(addMonths(qStart, 2)) };
    }
    case 'this_year':
      return { start: toIsoDate(year, 1, 1), end: toIsoDate(year, 12, 31) };
    case 'last_30_days':
      return { start: addDays(today, -29), end: today };
    case 'last_90_days':
      return { start: addDays(today, -89), end: today };
    case 'last_12_months':
      return { start: addMonths(startOfMonth(today), -11), end: endOfMonth(today) };
  }
}

/** The month ranges (inclusive) covering a range, in order. */
export function monthsInRange(range: DateRange): DateRange[] {
  assertRange(range);
  const out: DateRange[] = [];
  let cursor = startOfMonth(range.start);
  while (cursor <= range.end) {
    const end = endOfMonth(cursor);
    out.push({ start: cursor < range.start ? range.start : cursor, end: end > range.end ? range.end : end });
    cursor = addMonths(cursor, 1);
  }
  return out;
}

/** The range of equal length immediately before `range` (for period-over-period comparison). */
export function previousRange(range: DateRange): DateRange {
  const length = daysBetween(range.start, range.end);
  // Whole calendar months compare against the previous whole month(s).
  if (range.start === startOfMonth(range.start) && range.end === endOfMonth(range.end)) {
    const months =
      (parseIsoDate(range.end).year - parseIsoDate(range.start).year) * 12 +
      parseIsoDate(range.end).month -
      parseIsoDate(range.start).month +
      1;
    const start = addMonths(range.start, -months);
    return { start, end: endOfMonth(addMonths(start, months - 1)) };
  }
  const end = addDays(range.start, -1);
  return { start: addDays(end, -length), end };
}

export function formatIsoDate(date: IsoDate, style: 'short' | 'long' | 'month' = 'short'): string {
  const { year, month, day } = parseIsoDate(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  const opts: Intl.DateTimeFormatOptions =
    style === 'month'
      ? { month: 'short', year: 'numeric', timeZone: 'UTC' }
      : style === 'long'
        ? { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
        : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat('en-GB', opts).format(d);
}
