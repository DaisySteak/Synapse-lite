/**
 * Quick values of the dates of a ticket.
 *
 * - Start date: tomorrow, Monday of next week, first day of next month, from today.
 * - Planned end date ("Fin prévisionnelle"): end of the day, of the week
 *   (Friday) and of the month, computed from the start date of the ticket when
 *   it has one, from today otherwise, so that the planned end is never before
 *   the start.
 */
import { addDays, parseDate, toIsoDate, today } from './dates';

export interface DatePreset {
    key: string;
    label: string;
    title: string;
    compute: (from: Date) => Date;
}

/** Same day. */
export function endOfDay(from: Date): Date {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate());
}

/** Friday of the week; a Saturday or a Sunday gives the following Friday. */
export function endOfWeek(from: Date): Date {
    const weekday = from.getDay();
    const offset = weekday === 6 ? 6 : weekday === 0 ? 5 : 5 - weekday;

    return addDays(endOfDay(from), offset);
}

/** Last calendar day of the month. */
export function endOfMonth(from: Date): Date {
    return new Date(from.getFullYear(), from.getMonth() + 1, 0);
}

/** Next day. */
export function nextDay(from: Date): Date {
    return addDays(endOfDay(from), 1);
}

/** Monday of the following week. */
export function nextWeekStart(from: Date): Date {
    const weekday = from.getDay();

    return addDays(endOfDay(from), weekday === 0 ? 1 : 8 - weekday);
}

/** First day of the following month. */
export function nextMonthStart(from: Date): Date {
    return new Date(from.getFullYear(), from.getMonth() + 1, 1);
}

export const START_PRESETS: DatePreset[] = [
    { key: 'tomorrow', label: 'Demain', title: 'Demain', compute: nextDay },
    { key: 'next-week', label: 'Sem. prochaine', title: 'Lundi de la semaine prochaine', compute: nextWeekStart },
    { key: 'next-month', label: 'Mois prochain', title: 'Premier jour du mois prochain', compute: nextMonthStart },
];

export const DUE_PRESETS: DatePreset[] = [
    { key: 'day', label: 'Fin de journée', title: 'Le jour même', compute: endOfDay },
    { key: 'week', label: 'Fin de semaine', title: 'Le vendredi de la semaine', compute: endOfWeek },
    { key: 'month', label: 'Fin de mois', title: 'Le dernier jour du mois', compute: endOfMonth },
];

/** Date ("YYYY-MM-DD") of a preset, from a date ("" or null: today). */
export function presetDate(preset: DatePreset, from?: string | null, reference: Date = today()): string {
    return toIsoDate(preset.compute(from ? parseDate(from) : reference));
}
