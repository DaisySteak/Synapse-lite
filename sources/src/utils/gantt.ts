import type { TicketCard } from '@/types/models';
import { addDays, daysBetween, parseDate, toIsoDate, today } from './dates';

/**
 * Pure computations of the planning (Gantt) view: time scale, bar geometry
 * and grouping. Kept free of any Vue code so that it is unit tested.
 */

export type GanttZoom = 'week' | 'month' | 'quarter';

/** Width of a day, in pixels, for each zoom level. */
export const DAY_WIDTH: Record<GanttZoom, number> = {
    week: 44,
    month: 20,
    quarter: 7,
};

export interface GanttRange {
    start: Date;
    end: Date;
    days: number;
}

export interface GanttBar {
    ticket: TicketCard;
    start: Date;
    end: Date;
    left: number;
    width: number;
    /** True when the ticket starts before the visible period. */
    clippedStart: boolean;
    /** Part of the bar after the planned end date (late, still open). */
    lateLeft: number;
    lateWidth: number;
    hasDueDate: boolean;
    /** No end date at all: fixed length bar drawn with a pointed end. */
    openEnded: boolean;
    isClosed: boolean;
}

/** Ticket that can be drawn: it has a start date. */
export type PlannedTicket = TicketCard & { start_date: string };

/** Default length, in days, of a bar without end date. */
export const DEFAULT_OPEN_ENDED_DAYS = 14;

/** Only the tickets with a start date appear in the planning. */
export function isPlanned(ticket: TicketCard): ticket is PlannedTicket {
    return ticket.start_date !== null;
}

export interface GanttGroup {
    key: string;
    ownerId: number | null;
    bars: GanttBar[];
}

export interface GanttHeaderCell {
    label: string;
    left: number;
    width: number;
}

/** Visible period: from `start` for the given number of days. */
export function buildRange(start: Date, days: number): GanttRange {
    return { start, end: addDays(start, days - 1), days };
}

/**
 * Start and end of the bar of a ticket. Without any end date, the bar lasts
 * `openEndedDays` days (it is then drawn with a pointed end).
 */
export function ticketPeriod(
    ticket: PlannedTicket,
    isClosed: boolean,
    openEndedDays: number = DEFAULT_OPEN_ENDED_DAYS,
): { start: Date; end: Date; openEnded: boolean } {
    const start = parseDate(ticket.start_date);
    const endValue = isClosed ? (ticket.actual_end_date ?? ticket.due_date) : ticket.due_date;

    if (!endValue) {
        return { start, end: addDays(start, Math.max(1, openEndedDays) - 1), openEnded: true };
    }

    const end = parseDate(endValue);

    return { start, end: end < start ? start : end, openEnded: false };
}

export function buildBar(
    ticket: PlannedTicket,
    range: GanttRange,
    dayWidth: number,
    isClosed: boolean,
    reference: Date = today(),
    openEndedDays: number = DEFAULT_OPEN_ENDED_DAYS,
): GanttBar {
    const { start, end, openEnded } = ticketPeriod(ticket, isClosed, openEndedDays);
    const rawLeft = daysBetween(range.start, start) * dayWidth;
    const rawWidth = (daysBetween(start, end) + 1) * dayWidth;
    // A bar starting before the visible period is cut at the left edge.
    const left = Math.max(0, rawLeft);
    const width = Math.max(0, rawWidth - (left - rawLeft));

    // Late segment: from the day after the planned end up to today.
    let lateLeft = left + width;
    let lateWidth = 0;

    if (!isClosed && ticket.due_date && parseDate(ticket.due_date) < reference) {
        const rawLateLeft = rawLeft + rawWidth;
        const rawLateWidth = daysBetween(parseDate(ticket.due_date), reference) * dayWidth;
        lateLeft = Math.max(0, rawLateLeft);
        lateWidth = Math.max(0, rawLateWidth - (lateLeft - rawLateLeft));
    }

    return {
        ticket,
        start,
        end,
        left,
        width,
        clippedStart: rawLeft < 0,
        lateLeft,
        lateWidth,
        hasDueDate: ticket.due_date !== null,
        openEnded,
        isClosed,
    };
}

/** True when the bar intersects the visible period. */
export function isVisible(bar: GanttBar, range: GanttRange): boolean {
    const visualEnd = bar.lateWidth > 0 ? today() : bar.end;

    return bar.start <= range.end && visualEnd >= range.start;
}

/**
 * Group the bars: a single group for the whole team, or one group per owner
 * (ordered as the `ownerOrder` list, typically sorted by name).
 */
export function groupBars(bars: GanttBar[], byOwner: boolean, ownerOrder: number[] = []): GanttGroup[] {
    const sorted = [...bars].sort((a, b) => a.start.getTime() - b.start.getTime() || a.ticket.id - b.ticket.id);

    if (!byOwner) {
        return [{ key: 'all', ownerId: null, bars: sorted }];
    }

    const groups = new Map<number, GanttBar[]>();
    sorted.forEach((bar) => {
        const list = groups.get(bar.ticket.owner_id) ?? [];
        list.push(bar);
        groups.set(bar.ticket.owner_id, list);
    });

    const rank = (id: number) => {
        const index = ownerOrder.indexOf(id);

        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    return [...groups.entries()]
        .sort(([a], [b]) => rank(a) - rank(b))
        .map(([ownerId, groupBars]) => ({ key: `owner-${ownerId}`, ownerId, bars: groupBars }));
}

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** Month cells of the header. */
export function monthCells(range: GanttRange, dayWidth: number): GanttHeaderCell[] {
    const cells: GanttHeaderCell[] = [];
    let cursor = range.start;

    while (cursor <= range.end) {
        const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
        const end = monthEnd > range.end ? range.end : monthEnd;

        const label = monthFormatter.format(cursor);

        cells.push({
            label: label.charAt(0).toUpperCase() + label.slice(1),
            left: daysBetween(range.start, cursor) * dayWidth,
            width: (daysBetween(cursor, end) + 1) * dayWidth,
        });
        cursor = addDays(end, 1);
    }

    return cells;
}

/**
 * Lower header cells: days (week zoom), ISO weeks (month zoom) or weeks
 * labelled by their Monday (quarter zoom).
 */
export function unitCells(range: GanttRange, zoom: GanttZoom): GanttHeaderCell[] {
    const dayWidth = DAY_WIDTH[zoom];
    const cells: GanttHeaderCell[] = [];

    if (zoom === 'week') {
        for (let index = 0; index < range.days; index++) {
            const day = addDays(range.start, index);
            cells.push({
                label: `${['D', 'L', 'M', 'M', 'J', 'V', 'S'][day.getDay()]} ${day.getDate()}`,
                left: index * dayWidth,
                width: dayWidth,
            });
        }

        return cells;
    }

    let cursor = range.start;

    while (cursor <= range.end) {
        // Next Monday (or end of range).
        const offset = (8 - cursor.getDay()) % 7 || 7;
        const next = addDays(cursor, offset);
        const end = next > range.end ? addDays(range.end, 1) : next;

        cells.push({
            label: zoom === 'month' ? `S${isoWeek(cursor)}` : String(cursor.getDate()),
            left: daysBetween(range.start, cursor) * dayWidth,
            width: daysBetween(cursor, end) * dayWidth,
        });
        cursor = end;
    }

    return cells;
}

/** ISO 8601 week number. */
export function isoWeek(date: Date): number {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));

    return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Saturdays and Sundays of the range, as x offsets (week/month zoom). */
export function weekendOffsets(range: GanttRange, dayWidth: number): number[] {
    const offsets: number[] = [];

    for (let index = 0; index < range.days; index++) {
        const day = addDays(range.start, index).getDay();

        if (day === 0 || day === 6) {
            offsets.push(index * dayWidth);
        }
    }

    return offsets;
}

// --- Resizing a bar with the mouse ---------------------------------------------

/** Edge of a bar grabbed with the mouse. */
export type GanttEdge = 'start' | 'end';

/** Field changed by the end of a bar: the actual end date of a closed ticket, else the due date. */
export function endField(ticket: TicketCard, isClosed: boolean): 'due_date' | 'actual_end_date' {
    return isClosed && ticket.actual_end_date ? 'actual_end_date' : 'due_date';
}

/**
 * Days an edge may move: the start never goes past the end, nor the end
 * before the start (a bar lasts one day at least).
 */
export function clampResize(edge: GanttEdge, days: number, start: Date, end: Date): number {
    const span = daysBetween(start, end);

    return edge === 'start' ? Math.min(days, span) : Math.max(days, -span);
}

/** Change of the ticket when an edge of its bar moves by `days`. */
export function resizePatch(
    ticket: TicketCard,
    isClosed: boolean,
    edge: GanttEdge,
    days: number,
    start: Date,
    end: Date,
): Partial<Pick<TicketCard, 'start_date' | 'due_date' | 'actual_end_date'>> {
    return edge === 'start'
        ? { start_date: toIsoDate(addDays(start, days)) }
        : { [endField(ticket, isClosed)]: toIsoDate(addDays(end, days)) };
}
