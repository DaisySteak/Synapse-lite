import { describe, expect, it } from 'vitest';
import { daysBetween, daysLeft, daysSince, parseDate, toIsoDate } from './dates';

describe('dates', () => {
    const reference = new Date(2026, 2, 15); // 15 mars 2026

    it('parses ISO dates in local time', () => {
        expect(toIsoDate(parseDate('2026-03-01'))).toBe('2026-03-01');
        expect(toIsoDate(parseDate('2026-03-01T22:30:00+01:00'))).toBe('2026-03-01');
    });

    it('counts calendar days across a daylight saving change', () => {
        expect(daysBetween(new Date(2026, 2, 28), new Date(2026, 2, 30))).toBe(2);
    });

    it('computes the days since creation', () => {
        expect(daysSince('2026-03-10T09:00:00+01:00', reference)).toBe(5);
    });

    it('computes the days left, negative when late', () => {
        expect(daysLeft('2026-03-20', reference)).toBe(5);
        expect(daysLeft('2026-03-12', reference)).toBe(-3);
        expect(daysLeft(null, reference)).toBeNull();
    });
});
