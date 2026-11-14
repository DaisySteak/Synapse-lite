import { describe, expect, it } from 'vitest';
import { RecurrenceRule } from '@/backend/services/RecurrenceRule';
import type { Schedule } from '@/types/models';

function next(schedule: Partial<Schedule>, startsOn: string, count = 4, from?: string, endsOn: string | null = null) {
    return new RecurrenceRule(schedule as Schedule).occurrences(from ?? startsOn, startsOn, endsOn, count);
}

describe('RecurrenceRule (same cases as the Synapse PHP tests)', () => {
    it('supports daily rules with an interval and working days', () => {
        expect(next({ frequency: 'daily', interval: 2 }, '2027-01-01', 3)).toEqual([
            '2027-01-01',
            '2027-01-03',
            '2027-01-05',
        ]);
        // 2027-01-01 is a Friday.
        expect(next({ frequency: 'daily', interval: 1, weekdays: [1, 2, 3, 4, 5] }, '2027-01-01', 3)).toEqual([
            '2027-01-01',
            '2027-01-04',
            '2027-01-05',
        ]);
    });

    it('runs weekly rules on the chosen days every n weeks', () => {
        expect(next({ frequency: 'weekly', interval: 2, weekdays: [1, 4] }, '2027-01-01')).toEqual([
            '2027-01-11',
            '2027-01-14',
            '2027-01-25',
            '2027-01-28',
        ]);
    });

    it('handles days of month, the last day and the n-th weekday', () => {
        expect(next({ frequency: 'monthly', interval: 1, month_day: 1 }, '2027-01-01', 3)).toEqual([
            '2027-01-01',
            '2027-02-01',
            '2027-03-01',
        ]);
        expect(next({ frequency: 'monthly', interval: 1, month_day: 31 }, '2027-01-01', 3)).toEqual([
            '2027-01-31',
            '2027-02-28',
            '2027-03-31',
        ]);
        expect(next({ frequency: 'monthly', interval: 1, month_day: -1 }, '2027-01-01', 3)).toEqual([
            '2027-01-31',
            '2027-02-28',
            '2027-03-31',
        ]);
        expect(
            next(
                { frequency: 'monthly', interval: 3, monthly_mode: 'weekday', week_of_month: 1, weekday: 1 },
                '2027-01-01',
                2,
            ),
        ).toEqual(['2027-01-04', '2027-04-05']);
        expect(
            next(
                { frequency: 'monthly', interval: 1, monthly_mode: 'weekday', week_of_month: -1, weekday: 5 },
                '2027-01-01',
                2,
            ),
        ).toEqual(['2027-01-29', '2027-02-26']);
    });

    it('handles yearly rules and end dates', () => {
        expect(
            next(
                { frequency: 'yearly', interval: 1, month: 3, month_day: 15 },
                '2027-01-01',
                5,
                undefined,
                '2028-12-31',
            ),
        ).toEqual(['2027-03-15', '2028-03-15']);
        expect(
            next(
                { frequency: 'yearly', interval: 1, month: 1, monthly_mode: 'weekday', week_of_month: 1, weekday: 1 },
                '2027-01-01',
                2,
            ),
        ).toEqual(['2027-01-04', '2028-01-03']);
    });

    it('starts the occurrences from the given date', () => {
        expect(next({ frequency: 'monthly', interval: 1, month_day: 1 }, '2027-01-01', 1, '2027-02-02')).toEqual([
            '2027-03-01',
        ]);
    });

    it('describes the rules in French', () => {
        const describe = (schedule: Partial<Schedule>) =>
            new RecurrenceRule(schedule as Schedule).describe('2027-01-01');

        expect(describe({ frequency: 'monthly', month_day: 1 })).toBe('Tous les mois, le 1er');
        expect(describe({ frequency: 'weekly', interval: 2, weekdays: [4, 1] })).toBe(
            'Toutes les 2 semaines, le lundi et jeudi',
        );
        expect(describe({ frequency: 'daily', weekdays: [1, 2, 3, 4, 5] })).toBe(
            'Tous les jours ouvrés (du lundi au vendredi)',
        );
        expect(
            describe({ frequency: 'yearly', monthly_mode: 'weekday', week_of_month: -1, weekday: 5, month: 3 }),
        ).toBe('Tous les ans, le dernier vendredi de mars');
    });
});
