import { describe, expect, it } from 'vitest';
import {
    DUE_PRESETS,
    endOfMonth,
    endOfWeek,
    nextMonthStart,
    nextWeekStart,
    presetDate,
    START_PRESETS,
} from './datePresets';
import { parseDate, toIsoDate } from './dates';

const day = (value: string): Date => parseDate(value);
const preset = (key: string) => [...DUE_PRESETS, ...START_PRESETS].find((p) => p.key === key)!;

describe('date presets', () => {
    it('ends the week on Friday', () => {
        expect(toIsoDate(endOfWeek(day('2026-11-16')))).toBe('2026-11-20'); // Monday
        expect(toIsoDate(endOfWeek(day('2026-11-20')))).toBe('2026-11-20'); // Friday
        expect(toIsoDate(endOfWeek(day('2026-11-21')))).toBe('2026-11-27'); // Saturday
        expect(toIsoDate(endOfWeek(day('2026-11-22')))).toBe('2026-11-27'); // Sunday
    });

    it('ends the month on its last day', () => {
        expect(toIsoDate(endOfMonth(day('2026-11-15')))).toBe('2026-11-30');
        expect(toIsoDate(endOfMonth(day('2028-02-03')))).toBe('2028-02-29');
        expect(toIsoDate(endOfMonth(day('2026-12-31')))).toBe('2026-12-31');
    });

    it('starts from the start date, or from today without one', () => {
        const now = day('2026-11-17');
        expect(presetDate(preset('day'), '', now)).toBe('2026-11-17');
        expect(presetDate(preset('day'), '2026-12-02', now)).toBe('2026-12-02');
        expect(presetDate(preset('week'), null, now)).toBe('2026-11-20');
        expect(presetDate(preset('month'), '2027-01-10', now)).toBe('2027-01-31');
    });

    it('starts tomorrow, next Monday or on the first of next month, from today', () => {
        const now = day('2026-11-15'); // Sunday
        expect(presetDate(preset('tomorrow'), null, now)).toBe('2026-11-16');
        expect(presetDate(preset('next-week'), null, now)).toBe('2026-11-16');
        expect(toIsoDate(nextWeekStart(day('2026-11-16')))).toBe('2026-11-23'); // Monday
        expect(toIsoDate(nextWeekStart(day('2026-11-21')))).toBe('2026-11-23'); // Saturday
        expect(toIsoDate(nextMonthStart(day('2026-12-31')))).toBe('2027-01-01');
    });
});
