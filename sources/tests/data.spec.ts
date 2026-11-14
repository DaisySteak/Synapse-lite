import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIRMATIONS, dataApi } from '@/api/data';
import { ticketsApi } from '@/api/tickets';
import type { Backend } from '@/backend/Backend';
import { Actor } from '@/backend/permissions';
import { initializeFolder } from '@/backend/seed';
import { DataService } from '@/backend/services/DataService';
import { MemoryStore } from '@/storage/MemoryStore';
import { saveFile } from '@/utils/download';
import { unzip, zip } from '@/utils/zip';
import {
    ADMIN,
    LEAD,
    OTHER_USER,
    USER,
    createFolder,
    createRequester,
    openAs,
    signIn,
    statusOf,
    ticketPayload,
    userId,
    validationErrorsOf,
    type Files,
} from './helpers';

vi.mock('@/utils/download', () => ({ saveFile: vi.fn() }));

let files: Files;
let server: Backend;
let requesterId: number;

beforeEach(async () => {
    vi.mocked(saveFile).mockClear();
    files = await createFolder();
    server = await openAs(files, ADMIN);
    requesterId = await createRequester();
});

afterEach(() => signIn(USER));

/** The file given to the last download. */
function lastDownload(): { blob: Blob; name: string } {
    const [blob, name] = vi.mocked(saveFile).mock.lastCall ?? [];
    if (!(blob instanceof Blob) || typeof name !== 'string') throw new Error('No download.');

    return { blob, name };
}

async function bytes(blob: Blob): Promise<Uint8Array> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.readAsArrayBuffer(blob);
    });
}

async function recurringTemplate(ownerId: number): Promise<number> {
    const template = await server.recurring.save(
        null,
        {
            title: 'Clôture {mois}',
            description: null,
            status_code: 'todo',
            epic_id: 1,
            project_id: null,
            requester_id: requesterId,
            owner_id: ownerId,
            supporter_ids: [userId(server, LEAD)],
            data_processing_code: null,
            work_folder_url: null,
            custom_fields: {},
            time_spent: null,
            start_offset_days: null,
            due_offset_days: null,
            schedule: {
                frequency: 'monthly',
                interval: 1,
                weekdays: [],
                monthly_mode: 'day',
                month_day: 1,
                week_of_month: null,
                weekday: null,
                month: null,
            },
            starts_on: '2030-01-01',
            ends_on: null,
            is_active: true,
        },
        new Actor(server.db.users.get(userId(server, ADMIN))!),
    );

    return template.id;
}

describe('access', () => {
    it('is reserved to the administrators', async () => {
        signIn(LEAD);

        expect(await statusOf(dataApi.purgeCounts())).toBe(403);
        expect(await statusOf(dataApi.reassignChoices('owner'))).toBe(403);
        expect(await statusOf(dataApi.downloadBackup())).toBe(403);
        expect(await statusOf(dataApi.downloadWorkbook())).toBe(403);
        expect(await statusOf(dataApi.reset(CONFIRMATIONS.reset))).toBe(403);
        expect(saveFile).not.toHaveBeenCalled();
    });
});

describe('bulk reassignment', () => {
    it('gives another owner to the tickets and recurring tickets, with their history', async () => {
        const user = userId(server, USER);
        const lead = userId(server, LEAD);
        const mine = await ticketsApi.create(ticketPayload(requesterId, { owner_id: user }));
        const other = await ticketsApi.create(ticketPayload(requesterId));
        const deleted = await ticketsApi.create(ticketPayload(requesterId, { owner_id: user }));
        await ticketsApi.remove(deleted.id);
        const template = await recurringTemplate(user);

        expect(await dataApi.reassignCounts('owner', user)).toEqual({ tickets: 1, recurring: 1 });
        expect((await dataApi.reassignChoices('owner')).find((choice) => choice.id === user)?.tickets_count).toBe(1);

        expect(await dataApi.reassign('owner', user, lead)).toEqual({ tickets: 1, recurring: 1 });

        expect(server.db.tickets.get(mine.id)?.owner_id).toBe(lead);
        expect(server.db.tickets.get(other.id)?.owner_id).toBe(userId(server, ADMIN));
        expect(server.db.tickets.get(deleted.id)?.owner_id).toBe(user);
        expect(server.db.recurringTickets.get(template)?.owner_id).toBe(lead);
        // The new owner is no longer a contributor of the template.
        expect(server.db.recurringTickets.get(template)?.supporter_ids).toEqual([]);
        expect((await ticketsApi.activities(mine.id)).length).toBeGreaterThan(1);
    });

    it('gives a new number to the tickets moved to another type', async () => {
        await ticketsApi.create(ticketPayload(requesterId, { epic_id: 2 }));
        const moved = await ticketsApi.create(ticketPayload(requesterId, { epic_id: 1 }));

        await dataApi.reassign('epic', 1, 2);

        const ticket = server.db.tickets.get(moved.id);
        expect(ticket?.epic_id).toBe(2);
        expect(ticket?.number).toBe(2);
        expect(ticket?.previous_numbers).toEqual([{ epic_id: 1, number: 1 }]);
    });

    it('moves the tickets to another requester', async () => {
        const other = await createRequester('Direction Juridique');
        const ticket = await ticketsApi.create(ticketPayload(requesterId));

        expect(await dataApi.reassign('requester', requesterId, other)).toEqual({ tickets: 1, recurring: 0 });
        expect(server.db.tickets.get(ticket.id)?.requester_id).toBe(other);
    });

    it('refuses the same value, an unknown value or an inactive one', async () => {
        const user = userId(server, USER);
        await server.db.users.mutate(userId(server, OTHER_USER), (record) => {
            record.is_active = false;
        });

        expect(await validationErrorsOf(dataApi.reassign('owner', user, user))).toEqual(['to_id']);
        expect(await validationErrorsOf(dataApi.reassign('owner', 999, user))).toEqual(['from_id']);
        expect(await validationErrorsOf(dataApi.reassign('owner', user, userId(server, OTHER_USER)))).toEqual([
            'to_id',
        ]);
    });
});

describe('backup and restoration', () => {
    it('saves every file of the folder and restores it identically', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId, { title: 'Sauvegardé' }));
        await ticketsApi.addComment(ticket.id, 'Un commentaire', []);
        await ticketsApi.uploadAttachments(ticket.id, [new File([new Uint8Array([0, 1, 2, 255])], 'binaire.bin')]);

        await dataApi.downloadBackup();
        const backup = lastDownload();
        expect(backup.name).toMatch(/^synapse-lite-sauvegarde-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);

        const entries = await unzip(await bytes(backup.blob));
        expect(entries.map((entry) => entry.name)).toContain('data/synapse-lite.json');
        expect(entries.length).toBe(files.size);

        const saved = new Map(
            await Promise.all(
                [...files.entries()].map(
                    async ([path, file]) =>
                        [
                            path,
                            typeof file.content === 'string'
                                ? new TextEncoder().encode(file.content)
                                : await bytes(file.content),
                        ] as const,
                ),
            ),
        );

        // Changes after the backup disappear with the restoration.
        await ticketsApi.create(ticketPayload(requesterId, { title: 'Après la sauvegarde' }));
        const summary = await dataApi.inspectBackup(backup.blob);
        expect(summary).toMatchObject({ tickets: 1, users: 6, requesters: 1, attachments: 1 });

        await dataApi.restore(backup.blob, CONFIRMATIONS.restore);

        expect([...files.keys()].sort()).toEqual([...saved.keys()].sort());
        for (const [path, content] of saved) {
            const file = files.get(path)!;
            const restored =
                typeof file.content === 'string' ? new TextEncoder().encode(file.content) : await bytes(file.content);
            expect(Array.from(restored), path).toEqual(Array.from(content));
        }

        expect((await ticketsApi.list()).map((t) => t.title)).toEqual(['Sauvegardé']);
    });

    it('accepts a backup zipped again without its "data" folder', async () => {
        await ticketsApi.create(ticketPayload(requesterId));
        const entries = (await server.data.backup()).map((entry) => ({
            name: entry.name.replace(/^data\//, ''),
            data: entry.data,
        }));
        entries.push({ name: '__MACOSX/._synapse-lite.json', data: new Uint8Array([1]) });

        const content = DataService.readBackup(await unzip(zip(entries)));

        expect(content.files.some((file) => file.path.startsWith('__MACOSX'))).toBe(false);
        expect(content.files.some((file) => /^tickets\/\d+\.json$/.test(file.path))).toBe(true);
    });

    it('refuses an archive that is not a backup, and a wrong sentence', async () => {
        const other = new Blob([zip([{ name: 'notes.txt', data: new TextEncoder().encode('bonjour') }])]);
        const notZip = new Blob(['pas une archive']);

        expect(await statusOf(dataApi.inspectBackup(other))).toBe(422);
        expect(await validationErrorsOf(dataApi.inspectBackup(notZip))).toEqual(['file']);

        await dataApi.downloadBackup();
        const before = files.size;
        expect(await validationErrorsOf(dataApi.restore(lastDownload().blob, 'oui'))).toEqual(['confirmation']);
        expect(files.size).toBe(before);
    });

    it('refuses a backup made by a newer version', () => {
        const marker = { application: 'Synapse Lite', schema_version: 99, created_at: '2030-01-01T00:00:00Z' };
        const entries = [{ name: 'data/synapse-lite.json', data: new TextEncoder().encode(JSON.stringify(marker)) }];

        expect(() => DataService.readBackup(entries)).toThrow(/plus récente/);
    });
});

describe('Excel export', () => {
    it('writes one sheet per kind of record', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId, { title: 'Exporté' }));
        await ticketsApi.addComment(ticket.id, 'Commentaire exporté', []);

        await dataApi.downloadWorkbook();
        const download = lastDownload();
        expect(download.name).toMatch(/^synapse-lite-donnees-.*\.xlsx$/);

        const parts = new Map(
            (await unzip(await bytes(download.blob))).map((entry) => [
                entry.name,
                new TextDecoder().decode(entry.data),
            ]),
        );
        const workbook = parts.get('xl/workbook.xml') ?? '';
        const sheets = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((match) => match[1]);

        expect(sheets).toEqual([
            'Tickets',
            'Commentaires',
            'Historique',
            'Pièces jointes',
            'Utilisateurs',
            'Demandeurs',
            'Projets',
            'Types de ticket',
            'Champs personnalisés',
            'Tickets récurrents',
        ]);
        expect(parts.get('xl/worksheets/sheet1.xml')).toContain('CREATION-1');
        // Identifiers longer than 15 digits are written as text, not rounded by Excel.
        expect(parts.get('xl/worksheets/sheet1.xml')).toContain(`<t xml:space="preserve">${ticket.id}</t>`);
        expect(parts.get('xl/worksheets/sheet2.xml')).toContain('Commentaire exporté');
    });
});

describe('reset', () => {
    it('removes everything, users and ticket types included, and leaves the admin account only', async () => {
        await ticketsApi.create(ticketPayload(requesterId));
        expect(await validationErrorsOf(dataApi.reset('oui'))).toEqual(['confirmation']);

        await dataApi.reset(CONFIRMATIONS.reset);

        expect(server.db.tickets.size).toBe(0);
        expect(server.db.requesters.size).toBe(0);
        expect(server.db.epics.size).toBe(0);
        expect(server.db.users.all()).toEqual([
            expect.objectContaining({ id: 1, login: 'ADMIN', first_name: 'admin', last_name: 'admin', role: 'admin' }),
        ]);
        expect([...files.keys()].sort()).toEqual(['synapse-lite.json', 'users/1.json']);
    });

    it('signs the administrator who runs it in with the admin account', async () => {
        await server.db.users.mutate(userId(server, ADMIN), (record) => {
            record.login = 'ADMIN';
        });
        signIn('ADMIN');

        await dataApi.reset(CONFIRMATIONS.reset);

        expect(server.actor().user.login).toBe('ADMIN');
        expect(await statusOf(dataApi.purgeCounts())).toBe(200);
    });
});

describe('new data folder', () => {
    it('holds the admin account only, without ticket types', async () => {
        const store = new MemoryStore();
        await initializeFolder(store);

        expect([...store.files.keys()].sort()).toEqual(['synapse-lite.json', 'users/1.json']);
        const fresh = await openAs(store.files, 'ADMIN');
        expect(fresh.actor().can('admin.data')).toBe(true);
        expect(fresh.db.epics.size).toBe(0);
    });
});
