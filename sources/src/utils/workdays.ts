/**
 * Time spent proposed when a ticket is closed: the working days (Monday to
 * Friday) from the start of the work to the closing day, both included.
 * Public holidays are not known by the application: the user corrects the
 * proposal when needed.
 */
import { addDays, parseDate, toIsoDate } from './dates';

/** Quick values of the time spent, in man-days. */
export const TIME_PRESETS = [
    { label: '1 h', value: 0.125, title: '1 heure = 0,125 j/h' },
    { label: '½ j', value: 0.5, title: '1/2 journée = 0,5 j/h' },
    { label: '1 j', value: 1, title: '1 journée = 1 j/h' },
    { label: '1 sem.', value: 5, title: '1 semaine = 5 j/h' },
] as const;

export interface TimeEstimate {
    /** First day counted ("YYYY-MM-DD"). */
    from: string;
    /** Last day counted ("YYYY-MM-DD"). */
    to: string;
    /** The ticket has no start date: its creation date is used. */
    fromCreation: boolean;
    /** Calendar days from `from` to `to`, both included. */
    calendarDays: number;
    /** Working days (Monday to Friday) among them: the proposed time spent. */
    workingDays: number;
}

/** Monday to Friday days from `from` to `to`, both included (0 when `to` is earlier). */
export function workingDaysBetween(from: Date, to: Date): number {
    let count = 0;

    for (let day = new Date(from); day <= to; day = addDays(day, 1)) {
        const weekday = day.getDay();
        if (weekday !== 0 && weekday !== 6) count++;
    }

    return count;
}

/**
 * Working days of a ticket, from its start date (or creation date) to its
 * actual end date (or the given day).
 */
export function estimateTimeSpent(
    ticket: { start_date: string | null; created_at: string; actual_end_date: string | null },
    closedOn: Date = new Date(),
): TimeEstimate {
    const fromCreation = ticket.start_date === null;
    const from = parseDate(ticket.start_date ?? toIsoDate(new Date(ticket.created_at)));
    const to = ticket.actual_end_date ? parseDate(ticket.actual_end_date) : parseDate(toIsoDate(closedOn));
    const calendarDays = to >= from ? Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1 : 0;

    return {
        from: toIsoDate(from),
        to: toIsoDate(to),
        fromCreation,
        calendarDays,
        workingDays: workingDaysBetween(from, to),
    };
}
