import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CONFIRMATIONS, dataApi } from '@/api/data';
import { ticketsApi } from '@/api/tickets';
import type { Backend } from '@/backend/Backend';
import {
    ADMIN,
    LEAD,
    USER,
    createFolder,
    createRequester,
    openAs,
    signIn,
    statusOf,
    ticketPayload,
    validationErrorsOf,
    type Files,
} from './helpers';

let files: Files;
let server: Backend;
let requesterId: number;

beforeEach(async () => {
    files = await createFolder();
    server = await openAs(files, ADMIN);
    requesterId = await createRequester();
});

afterEach(() => signIn(USER));

/** Paths of the data folder that belong to a ticket. */
function pathsOf(ticketId: number): string[] {
    return [...files.keys()].filter(
        (path) =>
            path === `tickets/${ticketId}.json` || path.includes(`/${ticketId}/`) || path.endsWith(`/${ticketId}`),
    );
}

async function ticketWithEverything(title = 'Ticket complet'): Promise<number> {
    const ticket = await ticketsApi.create(ticketPayload(requesterId, { title }));
    await ticketsApi.addComment(ticket.id, 'Un commentaire', []);
    await ticketsApi.uploadAttachments(ticket.id, [new File(['abc'], 'note.txt', { type: 'text/plain' })]);

    return ticket.id;
}

describe('deleted tickets', () => {
    it('are listed for the administrators only, with the "Supprimé" status', async () => {
        const kept = await ticketsApi.create(ticketPayload(requesterId, { title: 'Gardé' }));
        const deleted = await ticketsApi.create(ticketPayload(requesterId, { title: 'Supprimé' }));
        await ticketsApi.remove(deleted.id);

        expect((await ticketsApi.list()).map((t) => t.id)).toEqual([kept.id]);
        expect((await ticketsApi.list({ status_codes: ['deleted'] })).map((t) => t.id)).toEqual([deleted.id]);
        expect((await ticketsApi.list({ status_codes: ['todo', 'deleted'] })).map((t) => t.id).sort()).toEqual(
            [kept.id, deleted.id].sort(),
        );
        expect((await ticketsApi.list({ status_codes: ['deleted'] }))[0].deleted_at).not.toBeNull();

        signIn(LEAD);
        expect(await ticketsApi.list({ status_codes: ['deleted'] })).toEqual([]);
    });

    it('can be restored by an administrator', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId));
        await ticketsApi.remove(ticket.id);
        await ticketsApi.restore(ticket.id);

        const restored = await ticketsApi.get(ticket.id);
        expect(restored.reference).toBe(ticket.reference);
        expect((await ticketsApi.activities(ticket.id))[0].event).toBe('restored');

        signIn(LEAD);
        expect(await statusOf(ticketsApi.restore(ticket.id))).toBe(403);
    });
});

describe('permanent deletion', () => {
    it('removes the ticket with its comments, history and attachments', async () => {
        const id = await ticketWithEverything();
        const other = await ticketWithEverything('Autre');
        expect(pathsOf(id).length).toBeGreaterThan(4);

        await ticketsApi.destroy(id);

        expect(pathsOf(id)).toEqual([]);
        expect(pathsOf(other).length).toBeGreaterThan(4);
        expect(await statusOf(ticketsApi.get(id))).toBe(404);
    });

    it('is reserved to the administrators', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId));

        signIn(LEAD);
        expect(await statusOf(ticketsApi.destroy(ticket.id))).toBe(403);
        expect(await statusOf(dataApi.purge('all', CONFIRMATIONS.purge))).toBe(403);
    });

    it('never gives a number again', async () => {
        const first = await ticketsApi.create(ticketPayload(requesterId));
        const epicId = server.db.tickets.get(first.id)!.epic_id;
        await ticketsApi.destroy(first.id);

        // Another computer, opening the folder afterwards, never saw the ticket.
        const other = await openAs(files, ADMIN);
        expect(other.tickets.nextNumber(epicId)).toBe(first.number + 1);

        const next = await ticketsApi.create(ticketPayload(requesterId));
        expect(next.number).toBe(first.number + 1);
    });
});

describe('purge', () => {
    it('requires the confirmation sentence', async () => {
        await ticketsApi.create(ticketPayload(requesterId));

        expect(await validationErrorsOf(dataApi.purge('all', 'oui'))).toEqual(['confirmation']);
        expect(await ticketsApi.list()).toHaveLength(1);
    });

    it('accepts the sentence whatever the case and the spaces', async () => {
        await ticketsApi.create(ticketPayload(requesterId));

        expect(await dataApi.purge('all', '  je confirme   la purge des TICKETS ')).toBe(1);
    });

    it('removes the deleted tickets only', async () => {
        const kept = await ticketWithEverything('Gardé');
        const deleted = await ticketWithEverything('Supprimé');
        await ticketsApi.remove(deleted);

        expect(await dataApi.purgeCounts()).toEqual({ deleted: 1, all: 2 });
        expect(await dataApi.purge('deleted', CONFIRMATIONS.purge)).toBe(1);

        expect(pathsOf(deleted)).toEqual([]);
        expect((await ticketsApi.list()).map((t) => t.id)).toEqual([kept]);
        expect(await dataApi.purgeCounts()).toEqual({ deleted: 0, all: 1 });
    });

    it('removes every ticket and leaves the rest of the data untouched', async () => {
        await ticketWithEverything('Un');
        const deleted = await ticketWithEverything('Deux');
        await ticketsApi.remove(deleted);

        expect(await dataApi.purge('all', CONFIRMATIONS.purge)).toBe(2);

        const left = [...files.keys()];
        expect(left.filter((path) => /^(tickets|comments|activities|attachments)\//.test(path))).toEqual([]);
        expect(left.filter((path) => path.startsWith('users/'))).toHaveLength(6);
        expect(left).toContain('synapse-lite.json');
    });
});
