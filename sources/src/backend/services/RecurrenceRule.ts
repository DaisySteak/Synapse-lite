/**
 * Recurrence rule of a recurring ticket (port of
 * App\Services\Recurring\RecurrenceRule), in the spirit of a task scheduler.
 *
 * Supported rules (each one "every N" periods, N = interval):
 * - daily:   every N days, optionally restricted to some days of the week
 *            (e.g. working days only);
 * - weekly:  every N weeks, on one or several days of the week;
 * - monthly: every N months, on a day of the month (1-31, or the last day)
 *            or on the n-th day of the week (first Monday, last Friday...);
 * - yearly:  every N years, in a given month, with the same day options.
 *
 * Periods are counted from the start date of the recurrence. A day of month
 * that does not exist in a month (31 in April) falls on the last day.
 * Dates are local calendar dates ("YYYY-MM-DD").
 */
import type { Frequency, Schedule } from '@/types/models';
import { addDays, daysBetween, parseDate, toIsoDate } from '@/utils/dates';

export const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
export const MODE_DAY = 'day';
export const MODE_WEEKDAY = 'weekday';
/** Value of month_day / week_of_month meaning "the last one". */
export const LAST = -1;

/** Search horizon when looking for the next occurrence. */
const MAX_SEARCH_DAYS = 3700;

const DAY_NAMES = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const MONTH_NAMES = [
    '',
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
];
const ORDINALS: Record<number, string> = {
    1: 'premier',
    2: 'deuxième',
    3: 'troisième',
    4: 'quatrième',
    [LAST]: 'dernier',
};

/** ISO day of the week: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: Date): number {
    return date.getDay() === 0 ? 7 : date.getDay();
}

function daysInMonth(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function startOfWeek(date: Date): Date {
    return addDays(date, 1 - isoWeekday(date));
}

export class RecurrenceRule {
    readonly frequency: Frequency;
    readonly interval: number;
    readonly weekdays: number[];
    readonly monthlyMode: 'day' | 'weekday';
    readonly monthDay: number | null;
    readonly weekOfMonth: number | null;
    readonly weekday: number | null;
    readonly month: number | null;

    constructor(schedule: Partial<Schedule> & { frequency: Frequency }) {
        if (!FREQUENCIES.includes(schedule.frequency)) {
            throw new Error(`Fréquence inconnue : ${String(schedule.frequency)}`);
        }

        const int = (value: unknown): number | null =>
            value === undefined || value === null || value === '' ? null : Number(value);

        this.frequency = schedule.frequency;
        this.interval = Math.max(1, Math.trunc(Number(schedule.interval ?? 1)) || 1);
        this.weekdays = [...new Set((schedule.weekdays ?? []).map(Number))].sort((a, b) => a - b);
        this.monthlyMode = schedule.monthly_mode === MODE_WEEKDAY ? MODE_WEEKDAY : MODE_DAY;
        this.monthDay = int(schedule.month_day);
        this.weekOfMonth = int(schedule.week_of_month);
        this.weekday = int(schedule.weekday);
        this.month = int(schedule.month);
    }

    toSchedule(): Schedule {
        return {
            frequency: this.frequency,
            interval: this.interval,
            weekdays: this.weekdays,
            monthly_mode: this.monthlyMode,
            month_day: this.monthDay,
            week_of_month: this.weekOfMonth,
            weekday: this.weekday,
            month: this.month,
        };
    }

    /** Whether the rule produces an occurrence on the given date. */
    matches(dateValue: string, startsOnValue: string): boolean {
        const date = parseDate(dateValue);
        const startsOn = parseDate(startsOnValue);

        if (date < startsOn) return false;

        switch (this.frequency) {
            case 'daily':
                return (
                    this.everyNth(daysBetween(startsOn, date)) &&
                    (this.weekdays.length === 0 || this.weekdays.includes(isoWeekday(date)))
                );
            case 'weekly':
                return (
                    this.everyNth(Math.trunc(daysBetween(startOfWeek(startsOn), startOfWeek(date)) / 7)) &&
                    (this.weekdays.length > 0 ? this.weekdays : [isoWeekday(startsOn)]).includes(isoWeekday(date))
                );
            case 'monthly':
                return (
                    this.everyNth(
                        (date.getFullYear() - startsOn.getFullYear()) * 12 + date.getMonth() - startsOn.getMonth(),
                    ) && this.dayOfMonthMatches(date, startsOn)
                );
            case 'yearly':
                return (
                    this.everyNth(date.getFullYear() - startsOn.getFullYear()) &&
                    date.getMonth() + 1 === (this.month ?? startsOn.getMonth() + 1) &&
                    this.dayOfMonthMatches(date, startsOn)
                );
        }
    }

    /** First occurrence on or after `from`, null when there is none before `endsOn`. */
    nextOccurrence(from: string, startsOn: string, endsOn: string | null = null): string | null {
        let date = parseDate(from > startsOn ? from : startsOn);

        for (let i = 0; i < MAX_SEARCH_DAYS; i++, date = addDays(date, 1)) {
            const iso = toIsoDate(date);
            if (endsOn !== null && iso > endsOn) return null;
            if (this.matches(iso, startsOn)) return iso;
        }

        return null;
    }

    /** The next `count` occurrences on or after `from`. */
    occurrences(from: string, startsOn: string, endsOn: string | null, count: number): string[] {
        const result: string[] = [];
        let cursor = from;

        while (result.length < count) {
            const next = this.nextOccurrence(cursor, startsOn, endsOn);
            if (next === null) break;

            result.push(next);
            cursor = toIsoDate(addDays(parseDate(next), 1));
        }

        return result;
    }

    /** Description in French, e.g. "Tous les mois, le 1er". */
    describe(startsOnValue: string): string {
        const startsOn = parseDate(startsOnValue);
        const n = this.interval;

        switch (this.frequency) {
            case 'daily':
                return (n === 1 ? 'Tous les jours' : `Tous les ${n} jours`) + this.weekdaysSuffix();
            case 'weekly':
                return (
                    (n === 1 ? 'Toutes les semaines' : `Toutes les ${n} semaines`) +
                    ', le ' +
                    dayList(this.weekdays.length > 0 ? this.weekdays : [isoWeekday(startsOn)])
                );
            case 'monthly':
                return (n === 1 ? 'Tous les mois' : `Tous les ${n} mois`) + ', ' + this.dayOfMonthLabel(startsOn);
            case 'yearly':
                return (
                    (n === 1 ? 'Tous les ans' : `Tous les ${n} ans`) +
                    ', ' +
                    this.dayOfMonthLabel(startsOn) +
                    (this.monthlyMode === MODE_WEEKDAY ? ' de ' : ' ') +
                    MONTH_NAMES[this.month ?? startsOn.getMonth() + 1]
                );
        }
    }

    private everyNth(periods: number): boolean {
        return periods >= 0 && periods % this.interval === 0;
    }

    private dayOfMonthMatches(date: Date, startsOn: Date): boolean {
        if (this.monthlyMode === MODE_WEEKDAY) {
            if (isoWeekday(date) !== (this.weekday ?? isoWeekday(startsOn))) return false;

            const week = this.weekOfMonth ?? 1;

            return week === LAST
                ? date.getDate() + 7 > daysInMonth(date)
                : Math.trunc((date.getDate() - 1) / 7) + 1 === week;
        }

        const day = this.monthDay ?? startsOn.getDate();

        return date.getDate() === (day === LAST ? daysInMonth(date) : Math.min(day, daysInMonth(date)));
    }

    private dayOfMonthLabel(startsOn: Date): string {
        if (this.monthlyMode === MODE_WEEKDAY) {
            return `le ${ORDINALS[this.weekOfMonth ?? 1]} ${DAY_NAMES[this.weekday ?? isoWeekday(startsOn)]}`;
        }

        const day = this.monthDay ?? startsOn.getDate();
        if (day === LAST) return 'le dernier jour';

        return day === 1 ? 'le 1er' : `le ${day}`;
    }

    private weekdaysSuffix(): string {
        const days = this.weekdays.join(',');
        if (days === '' || days === '1,2,3,4,5,6,7') return '';
        if (days === '1,2,3,4,5') return ' ouvrés (du lundi au vendredi)';

        return `, uniquement le ${dayList(this.weekdays)}`;
    }
}

function dayList(days: number[]): string {
    const names = days.map((day) => DAY_NAMES[day] ?? '?');
    const last = names.pop() ?? '';

    return names.length === 0 ? last : `${names.join(', ')} et ${last}`;
}
