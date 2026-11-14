/**
 * Several users working on the same data folder (each one with his own
 * browser, i.e. his own Backend and memory cache).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setBackend } from '@/backend/Backend';
import { Actor } from '@/backend/permissions';
import type { Backend } from '@/backend/Backend';
import {
    ADMIN,
    LEAD,
    USER,
    createFolder,
    createRequester,
    openAs,
    restoreClock,
    freezeDate,
    type Files,
} from './helpers';

let files: Files;
let alice: Backend;
let bob: Backend;
let requesterId: number;

function actor(server: Backend, login: string): Actor {
    return new Actor(server.db.users.all().find((user) => user.login === login)!);
}

beforeEach(async () => {
    files = await createFolder();
    alice = await openAs(files, ADMIN);
    requesterId = await createRequester();
    bob = await openAs(files, LEAD);
    setBackend(alice);
});

afterEach(restoreClock);

describe('shared data folder', () => {
    it('shows the tickets created by the others after a synchronisation', async () => {
        const ticket = await alice.tickets.create(
            { title: 'Créé par Alice', epic_id: 1, requester_id: requesterId },
            actor(alice, ADMIN),
        );

        expect(bob.db.tickets.has(ticket.id)).toBe(false);
        expect((await bob.sync()).tickets).toBe(true);
        expect(bob.db.tickets.get(ticket.id)?.title).toBe('Créé par Alice');
        expect((await bob.sync()).tickets).toBe(false);
    });

    it('merges the changes of two users on different fields of the same ticket', async () => {
        const ticket = await alice.tickets.create(
            { title: 'Ticket', epic_id: 1, requester_id: requesterId },
            actor(alice, ADMIN),
        );
        await bob.sync();

        // Both screens show the same version; each one changes a field.
        await alice.tickets.update(ticket.id, { title: 'Titre modifié' }, actor(alice, ADMIN));
        await bob.tickets.update(ticket.id, { due_date: '2027-03-31' }, actor(bob, LEAD));

        const stored = await alice.db.tickets.fresh(ticket.id);
        expect(stored?.title).toBe('Titre modifié');
        expect(stored?.due_date).toBe('2027-03-31');
    });

    it('keeps the counters right when two users comment at the same time', async () => {
        const ticket = await alice.tickets.create(
            { title: 'Ticket', epic_id: 1, requester_id: requesterId },
            actor(alice, ADMIN),
        );
        await bob.sync();

        await Promise.all([
            alice.comments.add(ticket.id, 'Commentaire A', [], actor(alice, ADMIN)),
            bob.comments.add(ticket.id, 'Commentaire B', [], actor(bob, LEAD)),
        ]);

        expect((await bob.comments.list(ticket.id)).map((comment) => comment.body).sort()).toEqual([
            'Commentaire A',
            'Commentaire B',
        ]);
        expect((await alice.db.tickets.fresh(ticket.id))?.comments_count).toBe(2);
    });

    it('repairs a number given twice by two users working at the same time', async () => {
        // Neither user sees the ticket of the other one before creating his own.
        const first = await alice.tickets.create(
            { title: 'A', epic_id: 3, requester_id: requesterId },
            actor(alice, ADMIN),
        );
        bob.db.tickets.all(); // Bob's memory does not know the ticket of Alice.
        const second = await bob.tickets.create(
            { title: 'B', epic_id: 3, requester_id: requesterId },
            actor(bob, LEAD),
        );

        // Bob synchronised before numbering: no duplicate in this case.
        expect([first.number, second.number]).toEqual([1, 2]);

        // Simulate a real collision (OneDrive delivering the file late).
        await bob.db.tickets.mutate(second.id, (ticket) => (ticket.number = 1));
        await alice.sync();

        const numbers = alice.db.tickets
            .all()
            .map((ticket) => ticket.number)
            .sort();
        expect(numbers).toEqual([1, 2]);
        expect(alice.db.tickets.get(first.id)?.number).toBe(1);
    });

    it('creates a recurring ticket only once when two users open Synapse Lite the same day', async () => {
        freezeDate('2027-01-15');
        await alice.recurring.save(
            null,
            {
                title: 'Clôture {mois} {annee}',
                description: 'Contrôles du {date}',
                status_code: 'todo',
                epic_id: 1,
                project_id: null,
                requester_id: requesterId,
                owner_id: 1,
                supporter_ids: [2],
                data_processing_code: null,
                work_folder_url: null,
                custom_fields: {},
                time_spent: 0.5,
                start_offset_days: 3,
                due_offset_days: 10,
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
                starts_on: '2027-01-01',
                ends_on: null,
                is_active: true,
            },
            actor(alice, ADMIN),
            '2026-12-01',
        );

        // Both open the application at the same moment.
        const [createdByAlice, createdByBob] = await Promise.all([
            alice.recurring.generateDue('2027-01-15'),
            bob.recurring.generateDue('2027-01-15'),
        ]);
        await alice.sync();

        const tickets = alice.db.activeTickets();
        expect(tickets).toHaveLength(1);
        expect(createdByAlice + createdByBob).toBeGreaterThanOrEqual(1);
        expect(tickets[0].title).toBe('Clôture janvier 2027');
        expect(tickets[0].description).toBe('Contrôles du 01/01/2027');
        expect(tickets[0].start_date).toBe('2027-01-04');
        expect(tickets[0].due_date).toBe('2027-01-11');
        expect(tickets[0].time_spent).toBe(0.5);
        expect(alice.db.recurringTickets.all()[0].next_run_on).toBe('2027-02-01');

        // Next month, the missed occurrences are created at the next opening.
        await alice.recurring.generateDue('2027-03-02');
        await alice.sync();
        expect(
            alice.db
                .activeTickets()
                .map((ticket) => ticket.title)
                .sort(),
        ).toEqual(['Clôture février 2027', 'Clôture janvier 2027', 'Clôture mars 2027']);
    });

    it('ignores the conflict copies made by OneDrive and the unreadable files', async () => {
        const ticket = await alice.tickets.create(
            { title: 'Ticket', epic_id: 1, requester_id: requesterId },
            actor(alice, ADMIN),
        );
        files.set(`tickets/${ticket.id}-PC-DE-BOB.json`, { content: '{"id": 1}', lastModified: Date.now() });
        files.set('tickets/123.json', { content: "{ en cours d'écriture", lastModified: Date.now() });

        await bob.sync();
        expect(bob.db.tickets.all().map((record) => record.id)).toEqual([ticket.id]);
    });

    it('applies the deactivation of an account at once', async () => {
        const user = alice.db.users.all().find((candidate) => candidate.login === USER)!;
        await alice.db.users.mutate(user.id, (record) => (record.is_active = false));

        const carol = await openAs(files, USER);
        expect(() => carol.actor()).toThrowError();
    });
});
