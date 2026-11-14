/**
 * Statistics of the page "Statistiques" (administrators), computed from the
 * tickets that are not deleted.
 *
 * Two kinds of figures:
 * - "à ce jour": the current state (open tickets, load, stock, overdue and
 *   blocked tickets), whatever the period chosen;
 * - "sur la période": what happened during the period (tickets started and
 *   closed, lead time, time spent, compliance with the due dates).
 *
 * Definitions:
 * - open ticket: neither finished nor in the backlog;
 * - overdue: open, with a due date before today;
 * - closed in the period: finished, with an actual end date in the period;
 * - start of a ticket: its start date, or its creation date when it has none;
 * - lead time: calendar days from the start to the actual end date, both
 *   included (a ticket started and finished the same day lasts 1 day);
 * - time spent: the time spent of the tickets closed in the period;
 * - available days: working days (Monday to Friday) from the start of the
 *   period to its end, or to today for the current period.
 */
import { addDays, daysBetween, parseDate, toIsoDate } from '@/utils/dates';
import { bucketsOf, type Bucket, type Period } from '@/utils/periods';
import { workingDaysBetween } from '@/utils/workdays';
import { BACKLOG } from './permissions';
import type { TicketRecord } from './records';
import { isFinalStatus, STATUSES } from './reference';

export interface StatisticsOptions {
    /** Today ("YYYY-MM-DD"). */
    today: string;
    /** An open ticket without any change for more days than this is blocked. */
    staleDays: number;
    /** A person with more open tickets than this is overloaded. */
    overloadThreshold: number;
}

/** Names of the records the tickets point to. */
export interface StatisticsNames {
    reference: (ticket: TicketRecord) => string;
    user: (id: number) => string;
    epic: (id: number) => string;
    project: (id: number | null) => string;
    requester: (id: number) => string;
    status: (code: string) => string;
}

export interface TicketLine {
    id: number;
    reference: string;
    title: string;
    owner: string;
    requester: string;
    status: string;
    due_date: string | null;
    /** Days late (overdue tickets) or without change (blocked tickets). */
    days: number;
    /** Why a ticket is blocked. */
    reason?: string;
}

export interface PersonRow {
    id: number;
    name: string;
    open: number;
    in_progress: number;
    waiting: number;
    overdue: number;
    overloaded: boolean;
    closed: number;
    time_spent: number;
    /** Time spent / available working days, null when no day is available. */
    occupation: number | null;
    /** Tickets closed in each bucket. */
    velocity: (number | null)[];
}

export interface GroupRow {
    name: string;
    count: number;
    time_spent: number;
    /** Average lead time in days, null without closed ticket. */
    average_lead: number | null;
}

export interface RequesterRow {
    id: number;
    name: string;
    time_spent: number;
    started: number;
    closed: number;
    average_lead: number | null;
    open: number;
    overdue: number;
}

export interface Statistics {
    period: Period;
    buckets: Bucket[];
    /** Working days available from the start of the period to its end (or today). */
    available_days: number;
    tiles: {
        open: number;
        overdue: number;
        closed: number;
        average_lead: number | null;
        time_spent: number;
    };
    team: PersonRow[];
    stock: { code: string; label: string; color: string; count: number }[];
    /** Unfinished tickets at the end of each bucket (null: future bucket). */
    stock_evolution: (number | null)[];
    /** Tickets started and closed by the whole team in each bucket (null: future bucket). */
    started: (number | null)[];
    closed: (number | null)[];
    /** Tickets closed in the period, by type and by project. */
    by_type: GroupRow[];
    by_project: GroupRow[];
    due: { with_due_date: number; on_time: number; late: number; rate: number | null };
    overdue: TicketLine[];
    blocked: TicketLine[];
    requesters: RequesterRow[];
}

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const average = (values: number[]) =>
    values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const sum = (tickets: TicketRecord[]) =>
    round(
        tickets.reduce((total, ticket) => total + (ticket.time_spent ?? 0), 0),
        3,
    );

const isOpen = (ticket: TicketRecord) => !isFinalStatus(ticket.status_code) && ticket.status_code !== BACKLOG;
/** Start date, or creation date when the ticket has none. */
const startedOn = (ticket: TicketRecord) => ticket.start_date ?? ticket.created_at.slice(0, 10);
const closedOn = (ticket: TicketRecord) =>
    isFinalStatus(ticket.status_code) && ticket.actual_end_date ? ticket.actual_end_date : null;
const leadTime = (ticket: TicketRecord) =>
    Math.max(1, daysBetween(parseDate(startedOn(ticket)), parseDate(ticket.actual_end_date ?? startedOn(ticket))) + 1);

/** Ticket of the period: the day is in [start, end]. */
const within = (day: string | null, start: string, end: string) => day !== null && day >= start && day <= end;

function groupBy<K>(tickets: TicketRecord[], key: (ticket: TicketRecord) => K): Map<K, TicketRecord[]> {
    const groups = new Map<K, TicketRecord[]>();

    for (const ticket of tickets) {
        const value = key(ticket);
        groups.set(value, [...(groups.get(value) ?? []), ticket]);
    }

    return groups;
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

export function computeStatistics(
    tickets: TicketRecord[],
    period: Period,
    names: StatisticsNames,
    options: StatisticsOptions,
    team: { id: number; name: string }[],
): Statistics {
    const { today } = options;
    const active = tickets.filter((ticket) => ticket.deleted_at === null);
    const open = active.filter(isOpen);
    const overdue = open.filter((ticket) => ticket.due_date !== null && ticket.due_date < today);
    const closed = active.filter((ticket) => within(closedOn(ticket), period.start, period.end));
    const buckets = bucketsOf(period);

    const lastAvailable = period.end < today ? period.end : today;
    const availableDays =
        lastAvailable >= period.start ? workingDaysBetween(parseDate(period.start), parseDate(lastAvailable)) : 0;

    /** Count per bucket, null for the buckets starting after today. */
    const perBucket = (count: (bucket: Bucket) => number) =>
        buckets.map((bucket) => (bucket.start > today ? null : count(bucket)));
    const closedPerBucket = (list: TicketRecord[]) =>
        perBucket((bucket) => list.filter((ticket) => within(closedOn(ticket), bucket.start, bucket.end)).length);

    const line = (ticket: TicketRecord, days: number, reason?: string): TicketLine => ({
        id: ticket.id,
        reference: names.reference(ticket),
        title: ticket.title,
        owner: names.user(ticket.owner_id),
        requester: names.requester(ticket.requester_id),
        status: names.status(ticket.status_code),
        due_date: ticket.due_date,
        days,
        ...(reason ? { reason } : {}),
    });

    // --- Team ---------------------------------------------------------------

    const openByOwner = groupBy(open, (ticket) => ticket.owner_id);
    const closedByOwner = groupBy(closed, (ticket) => ticket.owner_id);
    const people = new Map(team.map((person) => [person.id, person.name]));
    for (const id of [...openByOwner.keys(), ...closedByOwner.keys()]) {
        if (!people.has(id)) people.set(id, names.user(id));
    }

    const teamRows: PersonRow[] = [...people].map(([id, name]) => {
        const own = openByOwner.get(id) ?? [];
        const done = closedByOwner.get(id) ?? [];
        const time = sum(done);

        return {
            id,
            name,
            open: own.length,
            in_progress: own.filter((ticket) => ticket.status_code === 'in_progress').length,
            waiting: own.filter((ticket) => ticket.status_code === 'waiting').length,
            overdue: own.filter((ticket) => overdue.includes(ticket)).length,
            overloaded: own.length > options.overloadThreshold,
            closed: done.length,
            time_spent: time,
            occupation: availableDays > 0 ? round(time / availableDays, 3) : null,
            velocity: closedPerBucket(done),
        };
    });
    teamRows.sort((a, b) => b.open - a.open || b.time_spent - a.time_spent || byName(a, b));

    // --- Tickets ------------------------------------------------------------

    const unfinished = STATUSES.filter((status) => !status.is_final);
    const stock = unfinished.map((status) => ({
        code: status.code,
        label: status.label,
        color: status.color,
        count: active.filter((ticket) => ticket.status_code === status.code).length,
    }));

    const stockEvolution = perBucket((bucket) => {
        const end = bucket.end < today ? bucket.end : today;

        return active.filter((ticket) => {
            const done = closedOn(ticket);

            return startedOn(ticket) <= end && (done === null || done > end);
        }).length;
    });

    const groups = (list: TicketRecord[], key: (ticket: TicketRecord) => string) =>
        [...groupBy(list, key)]
            .map(([name, members]) => ({
                name,
                count: members.length,
                time_spent: sum(members),
                average_lead: average(members.map(leadTime)),
            }))
            .sort((a, b) => b.time_spent - a.time_spent || b.count - a.count || byName(a, b));

    const withDueDate = closed.filter((ticket) => ticket.due_date !== null);
    const onTime = withDueDate.filter((ticket) => (ticket.actual_end_date ?? '') <= (ticket.due_date ?? '')).length;

    const staleLimit = toIsoDate(addDays(parseDate(today), -options.staleDays));
    const idle = (ticket: TicketRecord) => Math.max(0, daysBetween(parseDate(ticket.updated_at), parseDate(today)));
    const blocked = open
        .filter((ticket) => ticket.status_code === 'waiting' || ticket.updated_at.slice(0, 10) < staleLimit)
        .map((ticket) =>
            line(
                ticket,
                idle(ticket),
                ticket.status_code === 'waiting' ? 'En attente' : `Sans modification depuis ${idle(ticket)} jours`,
            ),
        )
        .sort((a, b) => b.days - a.days);

    // --- Requesters ---------------------------------------------------------

    const started = active.filter((ticket) => within(startedOn(ticket), period.start, period.end));
    const requesterIds = new Set([...started, ...closed, ...open].map((ticket) => ticket.requester_id));
    const requesters: RequesterRow[] = [...requesterIds]
        .map((id) => {
            const done = closed.filter((ticket) => ticket.requester_id === id);

            return {
                id,
                name: names.requester(id),
                time_spent: sum(done),
                started: started.filter((ticket) => ticket.requester_id === id).length,
                closed: done.length,
                average_lead: average(done.map(leadTime)),
                open: open.filter((ticket) => ticket.requester_id === id).length,
                overdue: overdue.filter((ticket) => ticket.requester_id === id).length,
            };
        })
        .sort((a, b) => b.time_spent - a.time_spent || b.started + b.closed - (a.started + a.closed) || byName(a, b));

    return {
        period,
        buckets,
        available_days: availableDays,
        tiles: {
            open: open.length,
            overdue: overdue.length,
            closed: closed.length,
            average_lead: average(closed.map(leadTime)),
            time_spent: sum(closed),
        },
        team: teamRows,
        stock,
        stock_evolution: stockEvolution,
        started: perBucket(
            (bucket) => started.filter((ticket) => within(startedOn(ticket), bucket.start, bucket.end)).length,
        ),
        closed: closedPerBucket(closed),
        by_type: groups(closed, (ticket) => names.epic(ticket.epic_id)),
        by_project: groups(closed, (ticket) => names.project(ticket.project_id)),
        due: {
            with_due_date: withDueDate.length,
            on_time: onTime,
            late: withDueDate.length - onTime,
            rate: withDueDate.length ? round(onTime / withDueDate.length, 3) : null,
        },
        overdue: overdue
            .map((ticket) => line(ticket, daysBetween(parseDate(ticket.due_date ?? today), parseDate(today))))
            .sort((a, b) => b.days - a.days),
        blocked,
        requesters,
    };
}
