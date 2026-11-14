import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminApi } from '@/api/admin';
import { CONFIRMATIONS, dataApi } from '@/api/data';
import { ticketsApi } from '@/api/tickets';
import type { Backend } from '@/backend/Backend';
import { estimateTimeSpent, workingDaysBetween } from '@/utils/workdays';
import {
    ADMIN,
    USER,
    createFolder,
    createRequester,
    freezeDate,
    openAs,
    restoreClock,
    signIn,
    ticketPayload,
    validationErrorsOf,
} from './helpers';

let server: Backend;
let requesterId: number;

beforeEach(async () => {
    freezeDate('2026-11-13'); // a Friday
    server = await openAs(await createFolder(), ADMIN);
    requesterId = await createRequester();
});

afterEach(() => {
    restoreClock();
    signIn(USER);
});

describe('working days', () => {
    const day = (iso: string) => new Date(`${iso}T00:00:00`);

    it('counts Monday to Friday, both ends included', () => {
        expect(workingDaysBetween(day('2026-11-09'), day('2026-11-13'))).toBe(5);
        expect(workingDaysBetween(day('2026-11-13'), day('2026-11-16'))).toBe(2);
        expect(workingDaysBetween(day('2026-11-14'), day('2026-11-15'))).toBe(0);
        expect(workingDaysBetween(day('2026-11-13'), day('2026-11-12'))).toBe(0);
        // Across the change to winter time.
        expect(workingDaysBetween(day('2026-10-19'), day('2026-10-30'))).toBe(10);
    });

    it('starts from the creation date when the ticket has no start date', () => {
        const estimate = estimateTimeSpent({
            start_date: null,
            created_at: '2026-11-02T08:30:00.000Z',
            actual_end_date: '2026-11-13',
        });

        expect(estimate).toEqual({
            from: '2026-11-02',
            to: '2026-11-13',
            fromCreation: true,
            calendarDays: 12,
            workingDays: 10,
        });
    });
});

describe('time spent on closing', () => {
    it('is computed when the ticket is moved to "Terminé", and written in its history', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId, { start_date: '2026-11-04' }));

        const closed = await ticketsApi.move(ticket.id, 'done', 0);

        expect(closed.actual_end_date).toBe('2026-11-13');
        expect(closed.time_spent).toBe(8);
        const history = await ticketsApi.activities(ticket.id);
        expect(history.some((entry) => JSON.stringify(entry).includes('time_spent'))).toBe(true);
    });

    it('is computed by an update to "Terminé" too, and never replaces a value given', async () => {
        const computed = await ticketsApi.create(ticketPayload(requesterId, { start_date: '2026-11-12' }));
        const given = await ticketsApi.create(
            ticketPayload(requesterId, { start_date: '2026-11-02', time_spent: 1.5 }),
        );

        expect((await ticketsApi.update(computed.id, { status_code: 'done' })).time_spent).toBe(2);
        expect((await ticketsApi.update(given.id, { status_code: 'done' })).time_spent).toBe(1.5);
    });

    it('accepts the quick values, one hour being 0.125 man-day', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId));

        expect((await ticketsApi.update(ticket.id, { time_spent: 0.125 })).time_spent).toBe(0.125);
        expect(await validationErrorsOf(ticketsApi.update(ticket.id, { time_spent: 0.1234 }))).toEqual(['time_spent']);
    });
});

describe('deletion of a ticket type', () => {
    it('is allowed when tickets only held a number in it before changing type', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId, { epic_id: 5 }));
        await dataApi.reassign('epic', 5, 4);

        expect(server.db.tickets.get(ticket.id)?.previous_numbers).toEqual([{ epic_id: 5, number: 1 }]);
        await adminApi.epics.remove(5);
        expect(server.db.epics.has(5)).toBe(false);
    });

    it('explains which tickets still use it', async () => {
        const ticket = await ticketsApi.create(ticketPayload(requesterId, { epic_id: 5 }));
        await ticketsApi.remove(ticket.id);

        await expect(adminApi.epics.remove(5)).rejects.toMatchObject({
            errors: { epic: [expect.stringMatching(/1 ticket supprimé : purgez/)] },
        });

        await dataApi.purge('deleted', CONFIRMATIONS.purge);
        await adminApi.epics.remove(5);
        expect(server.db.epics.has(5)).toBe(false);
    });
});
