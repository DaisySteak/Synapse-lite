/**
 * Current date and time, replaceable in the tests.
 */
import { toIsoDate } from '@/utils/dates';

let current: () => Date = () => new Date();

/** Replace the clock (tests). Call without argument to restore the real one. */
export function setClock(clock?: () => Date): void {
    current = clock ?? (() => new Date());
}

export function now(): Date {
    return current();
}

/** Today, as "YYYY-MM-DD" (local time). */
export function todayIso(): string {
    return toIsoDate(current());
}

/**
 * Current time as a local ISO 8601 string with the offset, as returned by
 * Laravel ("2026-11-14T17:32:05+01:00"): the date part is the local date.
 */
export function nowIso(date: Date = current()): string {
    const pad = (value: number) => String(Math.trunc(Math.abs(value))).padStart(2, '0');
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';

    return (
        `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
        `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
    );
}
