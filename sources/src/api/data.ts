/**
 * Bulk management of the data (administrators, page "Gestion des données"):
 * purge of the tickets, bulk reassignment, backup and restoration of the data
 * folder, Excel export of every record and reset.
 *
 * The irreversible operations (purge, restoration, reset) check the typed
 * confirmation sentence here too, so that no screen can run them by mistake.
 */
import { backend } from '@/backend/Backend';
import { fieldError, forbidden } from '@/backend/errors';
import type { Actor } from '@/backend/permissions';
import type { EpicRecord } from '@/backend/records';
import { CONFIRMATIONS, DELETED_STATUS, isConfirmed, STATUSES, type ConfirmedOperation } from '@/backend/reference';
import { fullName, reference } from '@/backend/serializers';
import { DEFAULT_ADMIN } from '@/backend/seed';
import { DataService } from '@/backend/services/DataService';
import { session } from '@/backend/session';
import { assertValid, exists, integer, required, validate } from '@/backend/validation';
import type { BackupSummary, PurgeScope, ReassignChoice, ReassignField } from '@/types/models';
import { blobBytes } from '@/utils/blob';
import { saveFile } from '@/utils/download';
import { buildWorkbook, type XlsxCell, type XlsxSheet } from '@/utils/xlsx';
import { InvalidZipError, unzip, zip } from '@/utils/zip';
import { call } from './call';

export { CONFIRMATIONS, isConfirmed, type ConfirmedOperation } from '@/backend/reference';

/** The signed-in administrator allowed to manage the data. */
function administrator(): Actor {
    const actor = backend().actor();
    if (!actor.can('admin.data')) throw forbidden();

    return actor;
}

function checkConfirmation(operation: ConfirmedOperation, confirmation: string): void {
    if (!isConfirmed(operation, confirmation)) {
        throw fieldError('confirmation', `Saisissez exactement « ${CONFIRMATIONS[operation]} ».`);
    }
}

/** "2026-11-14-1903": date and time of a file name. */
function stamp(date = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

const byLabel = (a: ReassignChoice, b: ReassignChoice) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });

async function readArchive(file: Blob) {
    try {
        return DataService.readBackup(await unzip(await blobBytes(file)));
    } catch (error) {
        if (error instanceof InvalidZipError) throw fieldError('file', `Archive illisible : ${error.message}`);
        throw error;
    }
}

export const dataApi = {
    // --- Purge ---------------------------------------------------------------

    /** Number of tickets concerned by each kind of purge. */
    purgeCounts: (): Promise<Record<PurgeScope, number>> =>
        call(async () => {
            administrator();
            const all = await backend().data.allTickets();

            return { deleted: all.filter((ticket) => ticket.deleted_at !== null).length, all: all.length };
        }),

    /**
     * Permanent deletion of the deleted tickets, or of every ticket.
     *
     * @return number of tickets removed
     */
    purge: (scope: PurgeScope, confirmation: string): Promise<number> =>
        call(async () => {
            administrator();
            checkConfirmation('purge', confirmation);

            const server = backend();
            const all = await server.data.allTickets();
            const tickets = scope === 'all' ? all : all.filter((ticket) => ticket.deleted_at !== null);

            return server.tickets.destroy(tickets.map((ticket) => ticket.id));
        }),

    // --- Bulk reassignment -----------------------------------------------------

    /** Users, ticket types or requesters, with their number of tickets. */
    reassignChoices: (field: ReassignField): Promise<ReassignChoice[]> =>
        call(async () => {
            administrator();
            const server = backend();
            await server.db.tickets.sync();

            const column = { owner: 'owner_id', epic: 'epic_id', requester: 'requester_id' } as const;
            const counts = new Map<number, number>();
            for (const ticket of server.db.activeTickets()) {
                const id = ticket[column[field]];
                counts.set(id, (counts.get(id) ?? 0) + 1);
            }

            const records =
                field === 'owner'
                    ? server.db.users
                          .all()
                          .map((user) => ({ id: user.id, label: fullName(user), is_active: user.is_active }))
                    : field === 'epic'
                      ? server.db.epics.all().map((epic) => ({
                            id: epic.id,
                            label: `${epic.code} · ${epic.title}`,
                            is_active: epic.is_active,
                        }))
                      : server.db.requesters.all().map((requester) => ({
                            id: requester.id,
                            label: requester.name,
                            is_active: requester.is_active,
                        }));

            return records.map((record) => ({ ...record, tickets_count: counts.get(record.id) ?? 0 })).sort(byLabel);
        }),

    /** Tickets (not deleted) and recurring tickets that a reassignment would change. */
    reassignCounts: (field: ReassignField, fromId: number): Promise<{ tickets: number; recurring: number }> =>
        call(async () => {
            administrator();

            return backend().data.reassignCounts(field, fromId);
        }),

    /**
     * Give another owner, type or requester to every ticket (not deleted)
     * and recurring ticket having the first one.
     */
    reassign: (field: ReassignField, fromId: number, toId: number): Promise<{ tickets: number; recurring: number }> =>
        call(async () => {
            const actor = administrator();
            const server = backend();
            const collection =
                field === 'owner' ? server.db.users : field === 'epic' ? server.db.epics : server.db.requesters;

            assertValid(
                validate(
                    { from_id: fromId, to_id: toId },
                    {
                        from_id: [required, integer, exists((id) => collection.has(id))],
                        to_id: [
                            required,
                            integer,
                            exists((id) => collection.get(id)?.is_active === true),
                            ({ value }) =>
                                value === fromId ? 'Choisissez une autre valeur que celle à remplacer.' : null,
                        ],
                    },
                    { from_id: 'à remplacer', to_id: 'nouvelle valeur' },
                ),
            );

            return server.data.reassign(field, fromId, toId, actor);
        }),

    // --- Backup and restoration --------------------------------------------------

    /** Download every file of the data folder as a ZIP archive. */
    downloadBackup: (): Promise<void> =>
        call(async () => {
            administrator();
            const now = new Date();
            const archive = zip(await backend().data.backup(), now);

            saveFile(new Blob([archive], { type: 'application/zip' }), `synapse-lite-sauvegarde-${stamp(now)}.zip`);
        }),

    /** What a backup archive holds (checked before any restoration). */
    inspectBackup: (file: Blob): Promise<BackupSummary> =>
        call(async () => {
            administrator();
            const content = await readArchive(file);
            const count = (pattern: RegExp) => content.files.filter((entry) => pattern.test(entry.path)).length;

            return {
                created_at: content.marker.created_at ?? null,
                files: content.files.length + 1,
                tickets: count(/^tickets\/\d+\.json$/),
                users: count(/^users\/\d+\.json$/),
                requesters: count(/^requesters\/\d+\.json$/),
                projects: count(/^projects\/\d+\.json$/),
                attachments: count(/^attachments\/\d+\/\d+\.json$/),
            };
        }),

    /** Replace the whole data folder by the content of a backup archive. */
    restore: (file: Blob, confirmation: string): Promise<void> =>
        call(async () => {
            administrator();
            checkConfirmation('restore', confirmation);
            const content = await readArchive(file);

            await backend().data.restore(content);
        }),

    // --- Excel export -------------------------------------------------------------

    /** Download every record of the data folder in an Excel workbook, one sheet per kind of record. */
    downloadWorkbook: (): Promise<void> =>
        call(async () => {
            administrator();
            const data = buildWorkbook(await workbookSheets());

            saveFile(
                new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
                `synapse-lite-donnees-${stamp()}.xlsx`,
            );
        }),

    // --- Reset ----------------------------------------------------------------------

    /**
     * Remove every record, users and ticket types included, and start again
     * with the "admin" account only. The administrator who runs the reset is
     * signed in with this account (his own account no longer exists).
     */
    reset: (confirmation: string): Promise<void> =>
        call(async () => {
            administrator();
            checkConfirmation('reset', confirmation);

            const remember = session.isRemembered();
            await backend().data.reset();
            session.open(DEFAULT_ADMIN.login, remember);
        }),
};

// --- Excel workbook ----------------------------------------------------------------

/**
 * Cell of a raw value: identifiers and large numbers as text (Excel keeps 15
 * significant digits only), lists and objects as JSON.
 */
function rawCell(value: unknown): XlsxCell {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') return Math.abs(value) >= 1e15 ? String(value) : value;
    if (typeof value === 'string') return value;

    return JSON.stringify(value);
}

/**
 * Sheet of records: one column per field (fields of every record, in the
 * order met), after the readable columns given.
 */
function recordSheet<T extends object>(
    name: string,
    records: T[],
    readable: { header: string; value: (record: T) => XlsxCell }[] = [],
): XlsxSheet {
    const fields: string[] = [];
    for (const record of records) {
        for (const key of Object.keys(record)) if (!fields.includes(key)) fields.push(key);
    }

    const sorted = [...records].sort(
        (a, b) => Number((a as { id?: number }).id ?? 0) - Number((b as { id?: number }).id ?? 0),
    );

    return {
        name,
        columns: [
            ...readable.map((column) => ({ header: column.header, width: 22 })),
            ...fields.map((field) => ({ header: field, width: field === 'id' || field.endsWith('_id') ? 20 : 18 })),
        ],
        rows: sorted.map((record) => [
            ...readable.map((column) => column.value(record)),
            ...fields.map((field) => rawCell((record as Record<string, unknown>)[field])),
        ]),
    };
}

async function workbookSheets(): Promise<XlsxSheet[]> {
    const server = backend();
    const { db } = server;
    await db.sync();

    const tickets = await server.data.allTickets();
    const children = await server.data.ticketChildren();
    const epics = new Map<number, EpicRecord>(db.epics.all().map((epic) => [epic.id, epic]));
    const users = new Map(db.users.all().map((user) => [user.id, fullName(user)]));
    const requesters = new Map(db.requesters.all().map((requester) => [requester.id, requester.name]));
    const projects = new Map(db.projects.all().map((project) => [project.id, project.name]));
    const statuses = new Map<string, string>(STATUSES.map((status) => [status.code, status.label]));
    const ticketRefs = new Map(tickets.map((ticket) => [ticket.id, reference(ticket, epics)]));
    const ticketOf = {
        header: 'Ticket',
        value: (record: { ticket_id: number }) => ticketRefs.get(record.ticket_id) ?? null,
    };
    const userName = (id: number | null) => (id === null ? null : (users.get(id) ?? null));

    return [
        recordSheet('Tickets', tickets, [
            { header: 'Référence', value: (t) => ticketRefs.get(t.id) ?? null },
            {
                header: 'Statut',
                value: (t) => (t.deleted_at ? DELETED_STATUS.label : (statuses.get(t.status_code) ?? t.status_code)),
            },
            { header: 'Type', value: (t) => epics.get(t.epic_id)?.title ?? null },
            { header: 'Responsable', value: (t) => userName(t.owner_id) },
            { header: 'Demandeur', value: (t) => requesters.get(t.requester_id) ?? null },
            { header: 'Projet', value: (t) => (t.project_id ? (projects.get(t.project_id) ?? null) : null) },
        ]),
        recordSheet('Commentaires', children.comments, [
            ticketOf,
            { header: 'Auteur', value: (comment) => userName(comment.author_id) },
        ]),
        recordSheet('Historique', children.activities, [
            ticketOf,
            { header: 'Utilisateur', value: (activity) => userName(activity.user_id) },
        ]),
        recordSheet('Pièces jointes', children.attachments, [
            ticketOf,
            { header: 'Déposée par', value: (attachment) => userName(attachment.uploaded_by) },
        ]),
        recordSheet('Utilisateurs', db.users.all()),
        recordSheet('Demandeurs', db.requesters.all()),
        recordSheet('Projets', db.projects.all()),
        recordSheet('Types de ticket', db.epics.all()),
        recordSheet('Champs personnalisés', db.customFields.all()),
        recordSheet('Tickets récurrents', db.recurringTickets.all(), [
            { header: 'Type', value: (t) => epics.get(t.epic_id)?.title ?? null },
            { header: 'Responsable', value: (t) => userName(t.owner_id) },
            { header: 'Demandeur', value: (t) => requesters.get(t.requester_id) ?? null },
        ]),
    ];
}
