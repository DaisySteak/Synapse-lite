import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminApi } from '@/api/admin';
import { authApi } from '@/api/auth';
import { referenceApi, ticketsApi } from '@/api/tickets';
import type { Backend } from '@/backend/Backend';
import { todayIso } from '@/backend/clock';
import { addDays, toIsoDate, today } from '@/utils/dates';
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
    userId,
    validationErrorsOf,
    type Files,
} from './helpers';

let files: Files;
let server: Backend;
let requesterId: number;

beforeEach(async () => {
    files = await createFolder();
    server = await openAs(files, USER);
    requesterId = await createRequester();
});

afterEach(() => signIn(USER));

describe('sign-in', () => {
    it('accepts the login only, in any case', async () => {
        const user = await authApi.login(' login1 ', false);

        expect(user.login).toBe(ADMIN);
        expect(user.full_name).toBe('admin admin');
        expect(user.permissions).toContain('admin.users');
        expect(server.db.users.get(user.id)?.last_login_at).not.toBeNull();
    });

    it('rejects a malformed or unknown login', async () => {
        expect(await validationErrorsOf(authApi.login('invalid login!', false))).toEqual(['login']);
        expect(await validationErrorsOf(authApi.login('unknown_user', false))).toEqual(['login']);
    });

    it('accepts a Windows account name as login', async () => {
        signIn(ADMIN);
        const admin = (await adminApi.users.list()).find((candidate) => candidate.login === ADMIN)!;
        await adminApi.users.update(admin.id, { ...admin, login: 'windows_user' });

        const user = await authApi.login('windows_user', true);
        expect(user.login).toBe('WINDOWS_USER');
        expect(user.permissions).toContain('admin.users');
        expect(await validationErrorsOf(authApi.login('windows user!', false))).toEqual(['login']);
    });

    it('rejects a deactivated account', async () => {
        signIn(ADMIN);
        const user = (await adminApi.users.list()).find((candidate) => candidate.login === USER)!;
        await adminApi.users.update(user.id, { ...user, is_active: false });

        expect(await validationErrorsOf(authApi.login(USER, false))).toEqual(['login']);
    });
});

describe('tickets', () => {
    it('creates a ticket with sensible defaults and its history', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId));

        expect(ticket.status_code).toBe('todo');
        expect(ticket.owner_id).toBe(userId(server, USER));
        expect(ticket.reference).toBe('CREATION-1');
        expect(ticket.start_date).toBeNull();
        expect((await ticketsApi.activities(ticket.id))[0].event).toBe('created');
    });

    it('stores every field, without the owner among the contributors', async () => {
        signIn(LEAD);
        const owner = userId(server, USER);
        const supporter = userId(server, ADMIN);

        const ticket = await ticketsApi.create(
            ticketPayload(requesterId, {
                description: '# Titre',
                owner_id: owner,
                supporter_ids: [supporter, owner],
                data_processing_code: 'ab12c',
                work_folder_url: 'https://sharepoint.example.com/sites/data/Documents/Projet%20A',
                start_date: '2026-03-01',
                due_date: '2026-03-31',
                time_spent: 1.5,
            }),
        );

        expect(ticket.supporter_ids).toEqual([supporter]);
        expect(ticket.data_processing_code).toBe('AB12C');
        expect(ticket.time_spent).toBe(1.5);
        expect(ticket.due_date).toBe('2026-03-31');
    });

    it('rejects invalid values', async () => {
        const fields = await validationErrorsOf(
            ticketsApi.create(
                ticketPayload(requesterId, {
                    title: '',
                    data_processing_code: 'ABC',
                    work_folder_url: 'javascript:alert(1)',
                    start_date: '2026-03-10',
                    due_date: '2026-03-01',
                }),
            ),
        );

        expect(fields).toEqual(['data_processing_code', 'due_date', 'title', 'work_folder_url']);
    });

    it('fills the actual end date when closing and clears it when reopening', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId));

        expect((await ticketsApi.move(ticket.id, 'done', 0)).actual_end_date).toBe(todayIso());
        expect((await ticketsApi.update(ticket.id, { status_code: 'in_progress' })).actual_end_date).toBeNull();

        const statusChanges = (await ticketsApi.activities(ticket.id)).filter((a) => a.event === 'status_changed');
        expect(statusChanges).toHaveLength(2);
    });

    it('reorders a column with a single write', async () => {
        signIn(LEAD);
        const [first, second, third] = [
            await ticketsApi.create(ticketPayload(requesterId, { title: 'A' })),
            await ticketsApi.create(ticketPayload(requesterId, { title: 'B' })),
            await ticketsApi.create(ticketPayload(requesterId, { title: 'C' })),
        ];

        await ticketsApi.move(third.id, 'todo', 0);
        await ticketsApi.move(first.id, 'todo', 2);

        const order = (await ticketsApi.list({ status_codes: ['todo'] })).map((ticket) => ticket.id);
        expect(order).toEqual([third.id, second.id, first.id]);
    });

    it('hides the tickets closed for too long', async () => {
        const recent = await ticketsApi.create(ticketPayload(requesterId));
        const old = await ticketsApi.create(ticketPayload(requesterId));
        const open = await ticketsApi.create(ticketPayload(requesterId));
        await ticketsApi.update(recent.id, { status_code: 'done', actual_end_date: toIsoDate(addDays(today(), -5)) });
        await ticketsApi.update(old.id, { status_code: 'done', actual_end_date: toIsoDate(addDays(today(), -30)) });

        const ids = (await ticketsApi.list({ closed_within_days: 20 })).map((ticket) => ticket.id);
        expect(ids.sort()).toEqual([recent.id, open.id].sort());
    });

    it('filters, searches and counts comments', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId, { title: 'Refonte du cube finance' }));
        await ticketsApi.create(ticketPayload(requesterId, { title: 'Autre sujet', epic_id: 2 }));
        await ticketsApi.addComment(ticket.id, 'Un commentaire', []);

        const [card] = await ticketsApi.list({ search: 'CUBE' });
        expect(card.id).toBe(ticket.id);
        expect(card.comments_count).toBe(1);
        expect(await ticketsApi.list({ search: 'creation-1' })).toHaveLength(1);
        expect(await ticketsApi.list({ epic_ids: [2] })).toHaveLength(1);
        expect(card.description).toBeUndefined();
        expect((await ticketsApi.list({ with_description: 1 }))[0]).toHaveProperty('description');
    });

    it('returns the tickets of a planning period', async () => {
        const inside = await ticketsApi.create(
            ticketPayload(requesterId, { start_date: '2026-05-10', due_date: '2026-05-20' }),
        );
        await ticketsApi.create(ticketPayload(requesterId, { start_date: '2026-01-01', due_date: '2026-01-10' }));

        const ids = (await ticketsApi.list({ from: '2026-05-01', to: '2026-05-31' })).map((ticket) => ticket.id);
        expect(ids).toEqual([inside.id]);
    });

    it('records the changed fields in the history', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId));
        await ticketsApi.update(ticket.id, { title: 'Nouveau titre' });

        const [last] = await ticketsApi.activities(ticket.id);
        expect(last.event).toBe('updated');
        expect(last.changes).toMatchObject({ title: { to: 'Nouveau titre' } });
    });
});

describe('numbering and backlog', () => {
    it('numbers per type and never gives a number twice', async () => {
        signIn(LEAD);
        const first = await ticketsApi.create(ticketPayload(requesterId, { epic_id: 3 }));
        expect((await ticketsApi.create(ticketPayload(requesterId, { epic_id: 3 }))).reference).toBe('ETUDE-2');
        expect((await ticketsApi.create(ticketPayload(requesterId, { epic_id: 2 }))).reference).toBe('EVOLUTION-1');
        expect(first.reference).toBe('ETUDE-1');

        expect((await ticketsApi.update(first.id, { epic_id: 2 })).reference).toBe('EVOLUTION-2');
        expect(await ticketsApi.list({ search: 'evolution-2' })).toHaveLength(1);

        // ETUDE-1 is not given again, even though no ticket holds it any more.
        await ticketsApi.remove((await ticketsApi.list({ search: 'etude-2' }))[0].id);
        expect((await ticketsApi.create(ticketPayload(requesterId, { epic_id: 3 }))).reference).toBe('ETUDE-3');
    });

    it('lets only leads and admins put tickets in the backlog', async () => {
        expect(
            await validationErrorsOf(ticketsApi.create(ticketPayload(requesterId, { status_code: 'backlog' }))),
        ).toEqual(['status_code']);

        signIn(LEAD);
        const backlog = await ticketsApi.create(ticketPayload(requesterId, { status_code: 'backlog' }));
        const own = await ticketsApi.create(ticketPayload(requesterId, { owner_id: userId(server, USER) }));

        signIn(USER);
        expect((await ticketsApi.move(backlog.id, 'todo', 0)).status_code).toBe('todo');
        expect(await statusOf(ticketsApi.move(own.id, 'backlog', 0))).toBe(403);
        expect(await statusOf(ticketsApi.update(own.id, { status_code: 'backlog' }))).toBe(403);

        signIn(LEAD);
        expect((await ticketsApi.move(own.id, 'backlog', 0)).status_code).toBe('backlog');
    });
});

describe('permissions', () => {
    it('lets a user edit only the tickets he owns or contributes to, and never delete', async () => {
        signIn(LEAD);
        const foreign = await ticketsApi.create(ticketPayload(requesterId));
        const supported = await ticketsApi.create(
            ticketPayload(requesterId, { supporter_ids: [userId(server, USER)] }),
        );

        signIn(USER);
        expect((await ticketsApi.get(foreign.id)).can.update).toBe(false);
        expect(await statusOf(ticketsApi.update(foreign.id, { title: 'X' }))).toBe(403);
        expect((await ticketsApi.update(supported.id, { title: 'Y' })).title).toBe('Y');
        expect(await statusOf(ticketsApi.remove(supported.id))).toBe(403);

        // Everyone comments every ticket.
        expect((await ticketsApi.addComment(foreign.id, 'Avis', [])).can_update).toBe(true);
    });

    it('keeps the administration for the right profiles', async () => {
        expect(await statusOf(adminApi.projects.list())).toBe(403);
        expect(await statusOf(adminApi.users.list())).toBe(403);

        signIn(LEAD);
        expect(await statusOf(adminApi.projects.list())).toBe(200);
        expect(await statusOf(adminApi.recurringTickets.list())).toBe(200);
        expect(await statusOf(adminApi.epics.list())).toBe(200);
        expect(await statusOf(adminApi.customFields.list())).toBe(200);
        expect(await statusOf(adminApi.users.list())).toBe(403);
    });

    it('exposes the reference data', async () => {
        const reference = await referenceApi.load();

        expect(reference.statuses.map((status) => status.code)).toEqual([
            'backlog',
            'todo',
            'in_progress',
            'waiting',
            'done',
        ]);
        expect(reference.users).toHaveLength(6);
        expect(reference.epics.map((epic) => epic.code)).toContain('ETUDE');
        expect(reference.requesters).toHaveLength(1);
    });
});
