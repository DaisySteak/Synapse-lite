/**
 * Tickets, comments, attachments and reference data (same functions as the
 * Synapse API client, served by the data folder instead of the server).
 */
import { backend } from '@/backend/Backend';
import { forbidden, notFound } from '@/backend/errors';
import { ticketPolicy, commentPolicy, attachmentPolicy } from '@/backend/permissions';
import type { EpicRecord, TicketRecord, UserRecord } from '@/backend/records';
import {
    CUSTOM_FIELD_TYPE_OPTIONS,
    DELETED_STATUS,
    isFinalStatus,
    ROLE_OPTIONS,
    SETTINGS,
    STATUSES,
    statusExists,
} from '@/backend/reference';
import {
    toActivity,
    toAttachment,
    toComment,
    toCustomField,
    toEpic,
    toProject,
    toRequester,
    toTicket,
    toTicketCard,
    toUserSummary,
} from '@/backend/serializers';
import { assertValid, integer, required, string, validate } from '@/backend/validation';
import type {
    Attachment,
    Comment,
    ReferenceData,
    Ticket,
    TicketActivity,
    TicketCard,
    TicketFilters,
    TicketPayload,
} from '@/types/models';
import { addDays, toIsoDate, today } from '@/utils/dates';
import { saveFile } from '@/utils/download';
import { themeOf } from '@/utils/themes';
import { call } from './call';
import { normalizeTicketInput, toTicketData, validateNewTicket, validateTicketUpdate } from './ticketRules';

export { DELETED_STATUS } from '@/backend/reference';

const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' });

function epicMap(): Map<number, EpicRecord> {
    return new Map(
        backend()
            .db.epics.all()
            .map((epic) => [epic.id, epic]),
    );
}

function userMap(): Map<number, UserRecord> {
    return new Map(
        backend()
            .db.users.all()
            .map((user) => [user.id, user]),
    );
}

/** Ticket not deleted, read from the disk (latest version). */
async function findTicket(id: number): Promise<TicketRecord> {
    const ticket = await backend().db.tickets.fresh(id);
    if (!ticket || ticket.deleted_at) throw notFound();

    return ticket;
}

async function ticketDetail(ticket: TicketRecord): Promise<Ticket> {
    const server = backend();

    return toTicket(ticket, {
        actor: server.actor(),
        epics: epicMap(),
        users: userMap(),
        attachments: await server.attachments.list(ticket.id),
    });
}

/** Search on the title and the identifier ("ETUDE-12", or just "12"). */
function matchesSearch(ticket: TicketRecord, term: string, epics: Map<number, EpicRecord>): boolean {
    const search = term.trim();
    if (ticket.title.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr'))) return true;

    const reference = /^([A-Za-z0-9_]+)-(\d+)$/.exec(search);
    if (reference) {
        return ticket.number === Number(reference[2]) && epics.get(ticket.epic_id)?.code === reference[1].toUpperCase();
    }

    return /^\d+$/.test(search) && ticket.number === Number(search);
}

function filterTickets(tickets: TicketRecord[], filters: TicketFilters): TicketRecord[] {
    const epics = epicMap();
    const has = (values?: unknown[]) => Array.isArray(values) && values.length > 0;
    const closedLimit =
        filters.closed_within_days !== undefined && filters.closed_within_days !== null
            ? toIsoDate(addDays(today(), -Number(filters.closed_within_days)))
            : null;

    return tickets.filter((ticket) => {
        if (has(filters.owner_ids) && !filters.owner_ids!.includes(ticket.owner_id)) return false;
        if (has(filters.epic_ids) && !filters.epic_ids!.includes(ticket.epic_id)) return false;
        if (
            has(filters.project_ids) &&
            (ticket.project_id === null || !filters.project_ids!.includes(ticket.project_id))
        ) {
            return false;
        }
        if (has(filters.requester_ids) && !filters.requester_ids!.includes(ticket.requester_id)) return false;
        if (ticket.deleted_at !== null) {
            // Only listed when the "Supprimé" status is asked for (see ticketsApi.list).
            if (!filters.status_codes?.includes(DELETED_STATUS.code)) return false;
        } else {
            if (has(filters.status_codes) && !filters.status_codes!.includes(ticket.status_code)) return false;
            if (has(filters.exclude_status_codes) && filters.exclude_status_codes!.includes(ticket.status_code))
                return false;
        }
        if (filters.search && !matchesSearch(ticket, filters.search, epics)) return false;

        // Closed tickets older than N days are hidden ("Terminé" column).
        if (closedLimit !== null && isFinalStatus(ticket.status_code)) {
            if (ticket.actual_end_date === null || ticket.actual_end_date < closedLimit) return false;
        }

        // Planning: only the tickets overlapping the period.
        if (filters.from) {
            const from = filters.from;
            const overlaps =
                (ticket.due_date !== null && ticket.due_date >= from) ||
                (ticket.actual_end_date !== null && ticket.actual_end_date >= from) ||
                (ticket.due_date === null && ticket.actual_end_date === null);
            if (!overlaps) return false;
        }
        if (filters.to && (ticket.start_date === null || ticket.start_date > filters.to)) return false;

        return true;
    });
}

export const referenceApi = {
    load: (): Promise<ReferenceData> =>
        call(() => {
            const { db } = backend();
            backend().actor();

            return {
                statuses: STATUSES.map((status) => ({ ...status })),
                epics: db.epics
                    .all()
                    .sort((a, b) => byName(a.title, b.title))
                    .map((epic) => toEpic(epic)),
                projects: db.projects
                    .all()
                    .sort((a, b) => byName(a.name, b.name))
                    .map((project) => toProject(project)),
                requesters: db.requesters
                    .all()
                    .sort((a, b) => byName(a.name, b.name))
                    .map((requester) => toRequester(requester)),
                users: db.users
                    .all()
                    .sort((a, b) => byName(a.first_name, b.first_name) || byName(a.last_name ?? '', b.last_name ?? ''))
                    .map(toUserSummary),
                custom_fields: db.customFields
                    .all()
                    .filter((field) => field.is_active)
                    .sort((a, b) => a.position - b.position || byName(a.label, b.label))
                    .map(toCustomField),
                roles: ROLE_OPTIONS,
                custom_field_types: CUSTOM_FIELD_TYPE_OPTIONS,
                settings: { ...SETTINGS, theme: themeOf(db.settings.get(1)?.theme).code },
            };
        }),
};

export const ticketsApi = {
    list: (filters: TicketFilters = {}): Promise<TicketCard[]> =>
        call(() => {
            const server = backend();
            const actor = server.actor();
            const epics = epicMap();
            // The deleted tickets are only shown to the administrators, on request.
            const withDeleted =
                actor.can('tickets.purge') && (filters.status_codes ?? []).includes(DELETED_STATUS.code);
            const tickets = withDeleted ? server.db.tickets.all() : server.db.activeTickets();

            return filterTickets(tickets, filters)
                .sort((a, b) => a.rank - b.rank || a.id - b.id)
                .map((ticket) => toTicketCard(ticket, epics, Number(filters.with_description) === 1));
        }),

    get: (id: number): Promise<Ticket> =>
        call(async () => {
            backend().actor();

            return ticketDetail(await findTicket(id));
        }),

    create: (payload: TicketPayload): Promise<Ticket> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            if (!ticketPolicy.create(actor)) throw forbidden();

            const input = normalizeTicketInput(payload);
            assertValid(validateNewTicket(server.db, input, actor));

            return ticketDetail(await server.tickets.create(toTicketData(input), actor));
        }),

    update: (id: number, payload: TicketPayload): Promise<Ticket> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            const ticket = await findTicket(id);

            if (!ticketPolicy.update(actor, ticket)) throw forbidden();
            if (payload.status_code && !ticketPolicy.changeStatus(actor, ticket, payload.status_code))
                throw forbidden();

            const input = normalizeTicketInput(payload);
            assertValid(validateTicketUpdate(server.db, input, ticket));

            return ticketDetail(await server.tickets.update(id, toTicketData(input), actor));
        }),

    /** Drag and drop in the kanban, or move out of the backlog. */
    move: (id: number, statusCode: string, position: number): Promise<TicketCard> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            const ticket = await findTicket(id);

            if (!ticketPolicy.changeStatus(actor, ticket, statusCode)) throw forbidden();
            assertValid(
                validate(
                    { status_code: statusCode, position },
                    {
                        status_code: [
                            required,
                            ({ value }) => (statusExists(value) ? null : 'La valeur du champ statut est invalide.'),
                        ],
                        position: [required, integer],
                    },
                ),
            );

            return toTicketCard(await server.tickets.move(id, statusCode, Math.max(0, position), actor), epicMap());
        }),

    remove: (id: number): Promise<void> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            await findTicket(id);
            if (!ticketPolicy.delete(actor)) throw forbidden();

            await server.tickets.delete(id, actor);
        }),

    /** Bring back a ticket deleted logically (administrators). */
    restore: (id: number): Promise<void> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            if (!actor.can('tickets.purge')) throw forbidden();

            const ticket = await server.db.tickets.fresh(id);
            if (!ticket) throw notFound();

            await server.tickets.restore(id, actor);
        }),

    /**
     * Permanent deletion of a ticket, deleted or not, with its comments,
     * history and attachments (administrators).
     */
    destroy: (id: number): Promise<void> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            if (!actor.can('tickets.purge')) throw forbidden();

            const ticket = await server.db.tickets.fresh(id);
            if (!ticket) throw notFound();

            await server.tickets.destroy([id]);
        }),

    activities: (id: number): Promise<TicketActivity[]> =>
        call(async () => {
            const server = backend();
            server.actor();
            await findTicket(id);
            const users = userMap();

            return (await server.activities.list(id)).map((activity) => toActivity(activity, users));
        }),

    comments: (id: number): Promise<Comment[]> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            await findTicket(id);

            const [comments, attachments] = await Promise.all([server.comments.list(id), server.attachments.list(id)]);
            const users = userMap();

            return comments.map((comment) => toComment(comment, attachments, actor, users));
        }),

    addComment: (id: number, body: string, files: File[]): Promise<Comment> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            await findTicket(id);
            assertValid(validate({ body }, { body: [required, string(1_000_000)] }, { body: 'commentaire' }));

            const comment = await server.comments.add(id, body, files, actor);

            return toComment(comment, await server.attachments.list(id), actor, userMap());
        }),

    updateComment: (commentId: number, body: string, files: File[]): Promise<Comment> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            const comment = server.comments.find(commentId);

            if (!commentPolicy.update(actor, comment)) throw forbidden();
            assertValid(validate({ body }, { body: [required, string(1_000_000)] }, { body: 'commentaire' }));

            const updated = await server.comments.update(comment, body, files, actor);

            return toComment(updated, await server.attachments.list(comment.ticket_id), actor, userMap());
        }),

    removeComment: (commentId: number): Promise<void> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            const comment = server.comments.find(commentId);
            if (!commentPolicy.delete(actor, comment)) throw forbidden();

            await server.comments.remove(comment, actor);
        }),

    uploadAttachments: (id: number, files: File[]): Promise<Attachment[]> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            const ticket = await findTicket(id);
            if (!ticketPolicy.attach(actor, ticket)) throw forbidden();

            if (files.length === 0) assertValid({ files: ['Le champ fichiers est obligatoire.'] });
            server.attachments.validate(files);

            const users = userMap();
            const created = [];
            for (const file of files) created.push(await server.attachments.attach(id, file, actor));

            return created.map((attachment) => toAttachment(attachment, actor, users));
        }),

    removeAttachment: (attachmentId: number): Promise<void> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            const attachment = server.attachments.find(attachmentId);
            if (!attachmentPolicy.delete(actor, attachment)) throw forbidden();

            await server.attachments.remove(attachment, actor);
        }),

    /** Offer the attachment as a download. */
    downloadAttachment: (attachment: Pick<Attachment, 'id' | 'original_name'>): Promise<void> =>
        call(async () => {
            const server = backend();
            server.actor();

            saveFile(
                await server.attachments.content(server.attachments.find(attachment.id)),
                attachment.original_name,
            );
        }),
};
