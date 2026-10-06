import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  endOfMonth,
  inRange,
  isIsoDate,
  monthsInRange,
  presetRange,
  previousRange,
  startOfWeek,
  todayInZone,
} from '../src';

describe('calendar dates', () => {
  it('validates real dates including leap years', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2023-02-29')).toBe(false);
    expect(isIsoDate('1900-02-29')).toBe(false);
    expect(isIsoDate('2000-02-29')).toBe(true);
    expect(isIsoDate('2026-04-31')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
  });
  it('month ends are inclusive of the last day (legacy bug F6)', () => {
    const feb = presetRange('this_month', '2024-02-10');
    expect(feb).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(inRange('2024-02-29', feb)).toBe(true);
    expect(inRange('2024-03-01', feb)).toBe(false);
    expect(endOfMonth('2026-12-05')).toBe('2026-12-31');
  });
  it('crosses year boundaries', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(presetRange('last_month', '2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(addMonths('2025-11-30', 3)).toBe('2026-02-28');
  });
  it('clamps month arithmetic to the end of month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });
  it('computes quarters and weeks', () => {
    expect(presetRange('this_quarter', '2026-05-20')).toEqual({ start: '2026-04-01', end: '2026-06-30' });
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05'); // Monday
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05'); // Sunday
    expect(startOfWeek('2026-10-11', 0)).toBe('2026-10-11');
  });
  it('splits ranges into months', () => {
    expect(monthsInRange({ start: '2026-01-15', end: '2026-03-10' })).toEqual([
      { start: '2026-01-15', end: '2026-01-31' },
      { start: '2026-02-01', end: '2026-02-28' },
      { start: '2026-03-01', end: '2026-03-10' },
    ]);
  });
  it('compares whole months against previous whole months', () => {
    expect(previousRange({ start: '2026-03-01', end: '2026-03-31' })).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(previousRange({ start: '2026-03-10', end: '2026-03-19' })).toEqual({ start: '2026-02-28', end: '2026-03-09' });
  });
  it('derives "today" from the tenant timezone, not the browser', () => {
    const instant = new Date('2026-01-01T02:30:00Z');
    expect(todayInZone('Africa/Accra', instant)).toBe('2026-01-01');
    expect(todayInZone('America/New_York', instant)).toBe('2025-12-31');
  });
});
