/**
 * Business operations on tickets (port of App\Services\Tickets\TicketService):
 * creation, update, workflow moves and deletion.
 *
 * Business rules:
 * - a new ticket starts in "À faire" unless another status is given;
 * - the owner defaults to the creator; start and due dates are optional;
 * - a ticket is numbered inside its type (ETUDE-12) and gets a new number if
 *   its type changes; a number is never given twice;
 * - entering a final status ("Terminé") fills the actual end date with the
 *   current date, leaving it clears that date; a time spent not given yet is
 *   filled with the working days (Monday to Friday) from the start date (or
 *   the creation date) to the end date;
 * - the owner is never stored as a contributor of his own ticket;
 * - every meaningful change is written in the ticket history.
 *
 * Shared folder specifics: every change re-reads the ticket file before
 * writing it (see Collection.mutate), and the kanban order uses decimal ranks
 * so that a drag and drop writes a single file.
 */
import { estimateTimeSpent } from '@/utils/workdays';
import { isFinalStatus } from '../reference';
import { nowIso, todayIso } from '../clock';
import type { Database } from '../database';
import { notFound } from '../errors';
import { uniqueId } from '../ids';
import { TODO, type Actor } from '../permissions';
import type { CustomValues, TicketRecord } from '../records';
import type { ActivityRecorder } from './ActivityRecorder';

/** Validated data of a ticket creation or update (see api/tickets.ts). */
export interface TicketData {
    title?: string;
    description?: string | null;
    status_code?: string | null;
    epic_id?: number;
    project_id?: number | null;
    requester_id?: number;
    owner_id?: number | null;
    supporter_ids?: number[] | null;
    data_processing_code?: string | null;
    work_folder_url?: string | null;
    start_date?: string | null;
    due_date?: string | null;
    actual_end_date?: string | null;
    time_spent?: number | null;
    custom_fields?: Record<string, string | null> | null;
}

/** Fields whose old/new values are written in the history. */
const TRACKED_FIELDS = [
    'title',
    'epic_id',
    'project_id',
    'requester_id',
    'data_processing_code',
    'work_folder_url',
    'start_date',
    'due_date',
    'actual_end_date',
    'time_spent',
] as const;

/** Fields copied as is from the validated data. */
const FILLABLE = [
    'title',
    'description',
    'epic_id',
    'project_id',
    'requester_id',
    'owner_id',
    'data_processing_code',
    'work_folder_url',
    'start_date',
    'due_date',
    'actual_end_date',
    'time_spent',
] as const;

/** Smallest gap between two ranks before the column is renumbered. */
const MIN_RANK_GAP = 1e-6;

export class TicketService {
    constructor(
        private readonly db: Database,
        private readonly activities: ActivityRecorder,
    ) {}

    /**
     * @param source  recurring ticket that creates the ticket, if any
     * @param id      identifier to use (recurring tickets: deterministic)
     */
    async create(
        data: TicketData,
        actor: Actor | { id: number },
        source: { id: number } | null = null,
        id: number = uniqueId(),
    ): Promise<TicketRecord> {
        // Latest state of the folder: numbers and ranks of the other users.
        await this.db.tickets.sync();

        const timestamp = nowIso();
        const statusCode = data.status_code ?? TODO;
        const ownerId = data.owner_id ?? actor.id;
        const epicId = data.epic_id as number;

        const ticket: TicketRecord = {
            id,
            number: this.nextNumber(epicId),
            previous_numbers: [],
            title: data.title ?? '',
            description: data.description ?? null,
            status_code: statusCode,
            epic_id: epicId,
            project_id: data.project_id ?? null,
            recurring_ticket_id: source?.id ?? null,
            requester_id: data.requester_id as number,
            owner_id: ownerId,
            supporter_ids: cleanSupporters(data.supporter_ids ?? [], ownerId),
            data_processing_code: data.data_processing_code ?? null,
            work_folder_url: data.work_folder_url ?? null,
            start_date: data.start_date ?? null,
            due_date: data.due_date ?? null,
            actual_end_date: data.actual_end_date ?? null,
            time_spent: data.time_spent ?? null,
            rank: this.nextRank(statusCode),
            custom_fields: this.applyCustomValues({}, data.custom_fields ?? {}),
            comments_count: 0,
            attachments_count: 0,
            created_by: actor.id,
            updated_by: actor.id,
            created_at: timestamp,
            updated_at: timestamp,
            deleted_at: null,
        };

        if (isFinalStatus(statusCode)) ticket.actual_end_date ??= todayIso();

        await this.db.tickets.save(ticket);
        await this.activities.record(
            ticket.id,
            'created',
            actor.id,
            source !== null ? { recurring_ticket_id: source.id } : {},
            // Recurring tickets: same history entry whoever creates the ticket.
            source !== null ? id : uniqueId(),
        );

        return ticket;
    }

    async update(id: number, data: TicketData, actor: Actor): Promise<TicketRecord> {
        await this.db.tickets.sync();

        const ticket = await this.db.tickets.fresh(id);
        if (!ticket || ticket.deleted_at) throw notFound();

        const before = structuredClone(ticket);

        for (const field of FILLABLE) {
            if (field in data) (ticket as unknown as Record<string, unknown>)[field] = data[field] ?? null;
        }

        if (ticket.epic_id !== before.epic_id) {
            ticket.previous_numbers.push({ epic_id: before.epic_id, number: before.number });
            ticket.number = this.nextNumber(ticket.epic_id);
        }

        if (data.status_code && data.status_code !== before.status_code) {
            this.applyStatus(ticket, data.status_code, 'actual_end_date' in data);
            ticket.rank = this.nextRank(ticket.status_code);
        } else if (!isFinalStatus(ticket.status_code)) {
            ticket.actual_end_date = null;
        }

        const changes: Record<string, unknown> = trackedChanges(before, ticket);

        if ('supporter_ids' in data) {
            ticket.supporter_ids = cleanSupporters(data.supporter_ids ?? [], ticket.owner_id);
            const added = ticket.supporter_ids.filter((userId) => !before.supporter_ids.includes(userId));
            const removed = before.supporter_ids.filter((userId) => !ticket.supporter_ids.includes(userId));
            const supporters = { ...(added.length ? { added } : {}), ...(removed.length ? { removed } : {}) };

            if (Object.keys(supporters).length > 0) changes.supporters = supporters;
        } else if (ticket.owner_id !== before.owner_id) {
            ticket.supporter_ids = cleanSupporters(ticket.supporter_ids, ticket.owner_id);
        }

        if ('custom_fields' in data) {
            ticket.custom_fields = this.applyCustomValues(ticket.custom_fields, data.custom_fields ?? {});
        }

        ticket.updated_by = actor.id;
        ticket.updated_at = nowIso();
        await this.db.tickets.save(ticket);

        await this.recordUpdate(ticket, before, actor, changes);

        return ticket;
    }

    /**
     * Move a ticket in the kanban: change its status and/or its position.
     *
     * @param position zero based index in the target column
     */
    async move(id: number, statusCode: string, position: number, actor: Actor): Promise<TicketRecord> {
        await this.db.tickets.sync();

        const ticket = await this.db.tickets.fresh(id);
        if (!ticket || ticket.deleted_at) throw notFound();

        const previousStatus = ticket.status_code;
        const previousTime = ticket.time_spent;

        if (statusCode !== previousStatus) {
            this.applyStatus(ticket, statusCode, false);
            ticket.updated_by = actor.id;
            ticket.updated_at = nowIso();
        }

        await this.placeInColumn(ticket, position);

        if (statusCode !== previousStatus) {
            await this.activities.record(ticket.id, 'status_changed', actor.id, {
                from: previousStatus,
                to: statusCode,
            });
        }

        if (ticket.time_spent !== previousTime) {
            await this.activities.record(ticket.id, 'updated', actor.id, {
                time_spent: { from: previousTime, to: ticket.time_spent },
            });
        }

        return ticket;
    }

    /** Logical deletion: the ticket disappears from the screens, its file is kept. */
    async delete(id: number, actor: Actor): Promise<void> {
        const ticket = await this.db.tickets.mutate(id, (record) => {
            record.updated_by = actor.id;
            record.deleted_at = nowIso();
        });
        if (!ticket) throw notFound();

        await this.activities.record(id, 'deleted', actor.id);
    }

    /** Cancel a logical deletion: the ticket comes back where it was. */
    async restore(id: number, actor: Actor): Promise<TicketRecord> {
        const ticket = await this.db.tickets.mutate(id, (record) => {
            record.updated_by = actor.id;
            record.updated_at = nowIso();
            record.deleted_at = null;
        });
        if (!ticket) throw notFound();

        await this.activities.record(id, 'restored', actor.id);

        return ticket;
    }

    /**
     * Permanent deletion: the ticket file, its comments, its history and its
     * attachments (metadata and content) are removed from the folder.
     *
     * The numbers of the removed tickets are kept on their type first, so
     * they are never given again. The ticket file is removed last: when the
     * operation is interrupted (network, OneDrive), the ticket is still listed
     * and the deletion can simply be started again.
     *
     * @return number of tickets removed
     */
    async destroy(ids: number[]): Promise<number> {
        const tickets = ids
            .map((id) => this.db.tickets.get(id))
            .filter((ticket): ticket is TicketRecord => ticket !== undefined);

        await this.keepNumbers(tickets);

        let removed = 0;

        for (const ticket of tickets) {
            await this.db.removeTicketFolders(ticket.id);
            await this.db.tickets.remove(ticket.id);
            removed++;
        }

        return removed;
    }

    /** Store on each type the highest number of the tickets about to disappear. */
    private async keepNumbers(tickets: TicketRecord[]): Promise<void> {
        const highest = new Map<number, number>();
        const note = (epicId: number, number: number) =>
            highest.set(epicId, Math.max(highest.get(epicId) ?? 0, number));

        for (const ticket of tickets) {
            note(ticket.epic_id, ticket.number);
            for (const previous of ticket.previous_numbers ?? []) note(previous.epic_id, previous.number);
        }

        for (const [epicId, number] of highest) {
            const epic = this.db.epics.get(epicId);
            if (!epic || (epic.last_number ?? 0) >= number) continue;

            await this.db.epics.mutate(epicId, (record) => {
                record.last_number = Math.max(record.last_number ?? 0, number);
            });
        }
    }

    /**
     * Keep the comment and attachment counters of the cards up to date.
     *
     * The counters are recounted from the folder rather than incremented, so
     * that two people commenting the same ticket at the same time (or a
     * synchronisation delay) can never leave a wrong figure behind: the last
     * writer always stores the real number of files.
     */
    async refreshCounters(id: number): Promise<void> {
        const comments = this.db.comments(id);
        const attachments = this.db.attachments(id);
        await Promise.all([comments.sync(), attachments.sync()]);
        await this.db.tickets.mutate(id, (ticket) => {
            ticket.comments_count = comments.size;
            ticket.attachments_count = attachments.size;
        });
    }

    /**
     * Next number of a type: highest number ever given in this type (deleted
     * tickets, tickets deleted permanently and previous numbers included)
     * plus one.
     */
    nextNumber(epicId: number): number {
        let max = this.db.epics.get(epicId)?.last_number ?? 0;

        for (const ticket of this.db.tickets.all()) {
            if (ticket.epic_id === epicId) max = Math.max(max, ticket.number);
            for (const previous of ticket.previous_numbers ?? []) {
                if (previous.epic_id === epicId) max = Math.max(max, previous.number);
            }
        }

        return max + 1;
    }

    /**
     * Two users may create a ticket of the same type at the same time and get
     * the same number. The ticket created last gets a new number; everyone
     * applies the same rule, so the result is the same whoever repairs it.
     *
     * @return number of tickets renumbered
     */
    async repairDuplicateNumbers(): Promise<number> {
        const groups = new Map<string, TicketRecord[]>();

        for (const ticket of this.db.tickets.all()) {
            const key = `${ticket.epic_id}-${ticket.number}`;
            groups.set(key, [...(groups.get(key) ?? []), ticket]);
        }

        let repaired = 0;

        for (const group of groups.values()) {
            if (group.length < 2) continue;

            const [, ...duplicates] = group.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);

            for (const duplicate of duplicates) {
                const number = this.nextNumber(duplicate.epic_id);
                await this.db.tickets.mutate(duplicate.id, (ticket) => {
                    if (ticket.number === duplicate.number && ticket.epic_id === duplicate.epic_id)
                        ticket.number = number;
                });
                repaired++;
            }
        }

        return repaired;
    }

    /** Change the status and maintain the actual end date accordingly. */
    private applyStatus(ticket: TicketRecord, statusCode: string, endDateProvided: boolean): void {
        ticket.status_code = statusCode;

        if (!isFinalStatus(statusCode)) {
            ticket.actual_end_date = null;

            return;
        }

        if (!endDateProvided || ticket.actual_end_date === null) ticket.actual_end_date = todayIso();

        // Time spent not given yet: working days from the start to the end,
        // proposed again to the user who closes the ticket (TimeSpentModal).
        if (ticket.time_spent === null) {
            const days = estimateTimeSpent(ticket).workingDays;
            if (days > 0) ticket.time_spent = days;
        }
    }

    /** Rank placing a ticket at the bottom of the given column. */
    private nextRank(statusCode: string): number {
        const ranks = this.column(statusCode).map((ticket) => ticket.rank);

        return Math.floor(Math.max(0, ...ranks)) + 1;
    }

    /**
     * Give the ticket a rank between its new neighbours, then save it. Only
     * when two neighbours are too close is the whole column renumbered.
     */
    private async placeInColumn(ticket: TicketRecord, position: number): Promise<void> {
        const others = this.column(ticket.status_code).filter((item) => item.id !== ticket.id);
        const index = Math.max(0, Math.min(position, others.length));
        const before = others[index - 1]?.rank;
        const after = others[index]?.rank;

        if (before !== undefined && after !== undefined && after - before < MIN_RANK_GAP) {
            others.splice(index, 0, ticket);

            for (const [order, item] of others.entries()) {
                if (item.id === ticket.id) continue;
                if (item.rank !== order + 1)
                    await this.db.tickets.mutate(item.id, (record) => (record.rank = order + 1));
            }

            ticket.rank = index + 1;
        } else if (before === undefined && after === undefined) {
            ticket.rank = 1;
        } else if (before === undefined) {
            ticket.rank = (after as number) - 1;
        } else if (after === undefined) {
            ticket.rank = Math.floor(before) + 1;
        } else {
            ticket.rank = (before + after) / 2;
        }

        await this.db.tickets.save(ticket);
    }

    /** Tickets of a kanban column, in display order. */
    private column(statusCode: string): TicketRecord[] {
        return this.db
            .activeTickets()
            .filter((ticket) => ticket.status_code === statusCode)
            .sort((a, b) => a.rank - b.rank || a.id - b.id);
    }

    /**
     * Apply custom field values (id => value): empty values remove the value,
     * unknown fields are ignored.
     */
    private applyCustomValues(current: CustomValues, values: Record<string, string | null>): CustomValues {
        const result: CustomValues = { ...current };

        for (const [fieldId, value] of Object.entries(values)) {
            if (!this.db.customFields.has(Number(fieldId))) continue;

            if (value === null || value === '') delete result[fieldId];
            else result[fieldId] = String(value);
        }

        return result;
    }

    private async recordUpdate(
        ticket: TicketRecord,
        before: TicketRecord,
        actor: Actor,
        changes: Record<string, unknown>,
    ): Promise<void> {
        if (ticket.status_code !== before.status_code) {
            await this.activities.record(ticket.id, 'status_changed', actor.id, {
                from: before.status_code,
                to: ticket.status_code,
            });
        }

        if (ticket.owner_id !== before.owner_id) {
            await this.activities.record(ticket.id, 'owner_changed', actor.id, {
                from: before.owner_id,
                to: ticket.owner_id,
            });
        }

        delete changes.actual_end_date;

        if (ticket.description !== before.description) changes.description = { from: null, to: null };

        if (Object.keys(changes).length > 0) await this.activities.record(ticket.id, 'updated', actor.id, changes);
    }
}

/** Contributors: distinct, never the owner. */
function cleanSupporters(userIds: number[], ownerId: number): number[] {
    return [...new Set(userIds.map(Number))].filter((userId) => userId !== ownerId);
}

function trackedChanges(before: TicketRecord, after: TicketRecord): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    for (const field of TRACKED_FIELDS) {
        if (before[field] !== after[field]) changes[field] = { from: before[field], to: after[field] };
    }

    return changes;
}
