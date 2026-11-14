/**
 * Date helpers. Business dates are exchanged as "YYYY-MM-DD" strings and
 * handled in local time (Europe/Paris) to avoid any UTC shift.
 */

const MS_PER_DAY = 86_400_000;

/** Parse "YYYY-MM-DD" (or an ISO date-time) as a local calendar date. */
export function parseDate(value: string): Date {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);

    return new Date(year, month - 1, day);
}

/** Format a Date as "YYYY-MM-DD" (local time). */
export function toIsoDate(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
}

export function today(): Date {
    const now = new Date();

    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);

    return result;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
    const utcFrom = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    const utcTo = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());

    return Math.round((utcTo - utcFrom) / MS_PER_DAY);
}

/** Days elapsed since the creation of a ticket. */
export function daysSince(value: string, reference: Date = today()): number {
    return daysBetween(parseDate(value), reference);
}

/** Days left before the planned end date (negative when late), or null. */
export function daysLeft(dueDate: string | null, reference: Date = today()): number | null {
    return dueDate ? daysBetween(reference, parseDate(dueDate)) : null;
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

/** "05/03/2026" */
export function formatDate(value: string | null | undefined): string {
    return value ? dateFormatter.format(parseDate(value)) : '—';
}

/** "05/03/2026 14:32" */
export function formatDateTime(value: string | null | undefined): string {
    return value ? dateTimeFormatter.format(new Date(value)) : '—';
}

/** "il y a 3 jours", "à l'instant"... */
export function formatRelative(value: string, now: Date = new Date()): string {
    const seconds = Math.round((now.getTime() - new Date(value).getTime()) / 1000);
    const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

    if (seconds < 60) return "à l'instant";
    if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
    if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
    if (seconds < 86_400 * 30) return rtf.format(-Math.floor(seconds / 86_400), 'day');

    return formatDateTime(value);
}
