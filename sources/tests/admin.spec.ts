import { beforeEach, describe, expect, it } from 'vitest';
import { adminApi } from '@/api/admin';
import { referenceApi, ticketsApi } from '@/api/tickets';
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
} from './helpers';

let server: Backend;

beforeEach(async () => {
    server = await openAs(await createFolder(), ADMIN);
});

describe('users', () => {
    it('lists the admin account and the test team', async () => {
        const users = await adminApi.users.list();

        expect(users.map((user) => `${user.login} ${user.full_name} ${user.role}`)).toEqual([
            'ADMIN admin admin admin',
            'LOGIN1 admin admin admin',
            'LOGIN2 lead-tech lead-tech lead_tech',
            'LOGIN3 user1 user1 user',
            'LOGIN4 user2 user2 user',
            'LOGIN5 user3 user3 user',
        ]);
        expect(users.find((user) => user.login === 'LOGIN4')?.initials).toBe('UU');
    });

    it('creates users identified by a unique login', async () => {
        const created = await adminApi.users.create({
            login: 'test-user',
            first_name: 'Test',
            last_name: null,
            email: null,
            role: 'user',
            is_active: true,
        });
        expect(created.login).toBe('TEST-USER');
        expect(created.initials).toBe('TE');

        const duplicate = {
            login: 'TEST-USER',
            first_name: 'X',
            last_name: null,
            email: null,
            role: 'user',
            is_active: true,
        };
        expect(await validationErrorsOf(adminApi.users.create(duplicate))).toEqual(['login']);
        expect(await validationErrorsOf(adminApi.users.create({ ...duplicate, login: 'test user!' }))).toEqual([
            'login',
        ]);
    });

    it('prevents an administrator from locking himself out', async () => {
        const me = (await adminApi.users.list()).find((user) => user.login === ADMIN)!;

        expect(await validationErrorsOf(adminApi.users.update(me.id, { ...me, is_active: false }))).toEqual(['role']);
        expect(await validationErrorsOf(adminApi.users.update(me.id, { ...me, role: 'user' }))).toEqual(['role']);
    });
});

describe('reference data', () => {
    it('validates and protects the ticket types in use', async () => {
        expect(await validationErrorsOf(adminApi.epics.create({ code: 'é-1', title: 'X', color: '#123456' }))).toEqual([
            'code',
        ]);

        const epic = await adminApi.epics.create({
            code: 'cloture',
            title: 'Clôture',
            color: '#123456',
            is_active: true,
        });
        expect(epic.code).toBe('CLOTURE');

        const requesterId = await createRequester();
        await ticketsApi.create(ticketPayload(requesterId, { epic_id: epic.id }));

        expect(await validationErrorsOf(adminApi.epics.remove(epic.id))).toEqual(['epic']);
        expect((await adminApi.epics.list()).find((item) => item.id === epic.id)?.tickets_count).toBe(1);
        expect(await validationErrorsOf(adminApi.requesters.remove(requesterId))).toEqual(['requester']);
    });

    it('lets leads manage projects, deactivated rather than deleted once used', async () => {
        signIn(USER);
        expect(await statusOf(adminApi.projects.list())).toBe(403);

        signIn(LEAD);
        const project = await adminApi.projects.create({
            name: "Travaux de début d'année",
            color: '#007A6E',
            is_active: true,
        });
        const requesterId = await createRequester();
        await ticketsApi.create(ticketPayload(requesterId, { project_id: project.id }));

        expect(await validationErrorsOf(adminApi.projects.remove(project.id))).toEqual(['project']);
        const updated = await adminApi.projects.update(project.id, {
            name: 'Travaux 2027',
            color: '#007A6E',
            is_active: false,
        });
        expect(updated.is_active).toBe(false);
        expect((await referenceApi.load()).projects[0].name).toBe('Travaux 2027');
    });

    it('lets leads manage the requesters, not the simple users', async () => {
        const requesterId = await createRequester('Support informatique');

        signIn(USER);
        expect(await statusOf(adminApi.requesters.list())).toBe(403);

        signIn(LEAD);
        const updated = await adminApi.requesters.update(requesterId, {
            name: 'Services généraux',
            color: '#2F6EBA',
            is_active: true,
        });
        expect(updated.name).toBe('Services généraux');
        expect((await adminApi.requesters.list()).map((requester) => requester.name)).toEqual(['Services généraux']);
    });

    it('computes the time spent per requester', async () => {
        const requesterId = await createRequester('Services généraux');
        const closed = await ticketsApi.create(ticketPayload(requesterId, { time_spent: 2.5 }));
        await ticketsApi.create(ticketPayload(requesterId, { time_spent: 1.25 }));
        await ticketsApi.create(ticketPayload(requesterId));
        await ticketsApi.move(closed.id, 'done', 0);

        const [requester] = await adminApi.requesters.list();
        expect(requester.tickets_count).toBe(3);
        expect(requester.statistics).toEqual({
            timed_tickets_count: 2,
            time_spent_total: 3.75,
            time_spent_closed: 2.5,
            time_spent_open: 1.25,
        });
    });
});

describe('custom fields', () => {
    it('validates the values against the fields of the ticket type', async () => {
        const requesterId = await createRequester();
        const global = await adminApi.customFields.create({
            code: 'Date_Comite',
            label: 'Date du comité',
            field_type: 'date',
            epic_id: null,
            is_required: true,
            is_active: true,
            position: 1,
        });
        const studyOnly = await adminApi.customFields.create({
            code: 'perimetre',
            label: 'Périmètre',
            field_type: 'short_text',
            epic_id: 3,
            is_required: false,
            is_active: true,
            position: 2,
        });
        expect(global.code).toBe('date_comite');

        expect(await validationErrorsOf(ticketsApi.create(ticketPayload(requesterId)))).toEqual([
            `custom_fields.${global.id}`,
        ]);
        expect(
            await validationErrorsOf(
                ticketsApi.create(
                    ticketPayload(requesterId, { custom_fields: { [global.id]: '2027-02-30', [studyOnly.id]: 'X' } }),
                ),
            ),
        ).toEqual([`custom_fields.${global.id}`, `custom_fields.${studyOnly.id}`]);

        const ticket = await ticketsApi.create(
            ticketPayload(requesterId, {
                epic_id: 3,
                custom_fields: { [global.id]: '2027-02-15', [studyOnly.id]: 'Groupe' },
            }),
        );
        expect(ticket.custom_fields).toEqual({ [global.id]: '2027-02-15', [studyOnly.id]: 'Groupe' });

        // A field holding values is only deactivated.
        expect(await validationErrorsOf(adminApi.customFields.remove(studyOnly.id))).toEqual(['custom_field']);
        expect(server.db.customFields.size).toBe(2);
    });
});
