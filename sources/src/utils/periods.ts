/**
 * Periods of the statistics: a calendar month, quarter or year, cut into
 * weeks (month, quarter) or months (year) for the charts.
 */
import { addDays, parseDate, toIsoDate } from './dates';

export type PeriodKind = 'month' | 'quarter' | 'year';

export interface Bucket {
    /** First day ("YYYY-MM-DD"). */
    start: string;
    /** Last day ("YYYY-MM-DD"), included. */
    end: string;
    /** "10 nov." (week starting that Monday) or "nov." (month). */
    label: string;
}

export interface Period {
    kind: PeriodKind;
    start: string;
    end: string;
    /** "novembre 2026", "T4 2026", "2026". */
    label: string;
}

const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long' });
const shortMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const shortDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** The period of the given kind containing the given day. */
export function periodOf(kind: PeriodKind, day: string): Period {
    const date = parseDate(day);
    const year = date.getFullYear();

    if (kind === 'year') {
        return { kind, start: `${year}-01-01`, end: `${year}-12-31`, label: String(year) };
    }

    const firstMonth = kind === 'quarter' ? Math.floor(date.getMonth() / 3) * 3 : date.getMonth();
    const months = kind === 'quarter' ? 3 : 1;
    const start = new Date(year, firstMonth, 1);
    const end = new Date(year, firstMonth + months, 0);
    const label = kind === 'quarter' ? `T${firstMonth / 3 + 1} ${year}` : `${monthName.format(start)} ${year}`;

    return { kind, start: toIsoDate(start), end: toIsoDate(end), label };
}

/** The period before (-1) or after (+1). */
export function shiftPeriod(period: Period, delta: number): Period {
    const start = parseDate(period.start);
    const months = period.kind === 'year' ? 12 : period.kind === 'quarter' ? 3 : 1;

    return periodOf(period.kind, toIsoDate(new Date(start.getFullYear(), start.getMonth() + months * delta, 1)));
}

/**
 * Chart buckets: the weeks (Monday to Sunday) overlapping a month or a
 * quarter, cut to the period, or the twelve months of a year.
 */
export function bucketsOf(period: Period): Bucket[] {
    const buckets: Bucket[] = [];
    const end = parseDate(period.end);

    if (period.kind === 'year') {
        for (let month = 0; month < 12; month++) {
            const first = new Date(end.getFullYear(), month, 1);
            buckets.push({
                start: toIsoDate(first),
                end: toIsoDate(new Date(end.getFullYear(), month + 1, 0)),
                label: shortMonth.format(first),
            });
        }

        return buckets;
    }

    let day = parseDate(period.start);
    while (day <= end) {
        // Next Sunday, or the end of the period.
        const sunday = addDays(day, (7 - day.getDay()) % 7);
        const last = sunday < end ? sunday : end;
        buckets.push({ start: toIsoDate(day), end: toIsoDate(last), label: shortDay.format(day) });
        day = addDays(last, 1);
    }

    return buckets;
}
