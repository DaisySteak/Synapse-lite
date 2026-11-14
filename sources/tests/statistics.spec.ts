import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { statisticsApi } from '@/api/statistics';
import { ticketsApi } from '@/api/tickets';
import type { TicketRecord } from '@/backend/records';
import { computeStatistics, type StatisticsNames } from '@/backend/statistics';
import { bucketsOf, periodOf, shiftPeriod } from '@/utils/periods';
import {
    ADMIN,
    LEAD,
    USER,
    createFolder,
    createRequester,
    freezeDate,
    openAs,
    restoreClock,
    signIn,
    statusOf,
    ticketPayload,
} from './helpers';

describe('periods', () => {
    it('gives the month, the quarter and the year of a day', () => {
        expect(periodOf('month', '2026-11-14')).toMatchObject({
            start: '2026-11-01',
            end: '2026-11-30',
            label: 'novembre 2026',
        });
        expect(periodOf('quarter', '2026-11-14')).toMatchObject({
            start: '2026-10-01',
            end: '2026-12-31',
            label: 'T4 2026',
        });
        expect(periodOf('year', '2026-11-14')).toMatchObject({ start: '2026-01-01', end: '2026-12-31', label: '2026' });
        expect(shiftPeriod(periodOf('quarter', '2026-01-10'), -1).label).toBe('T4 2025');
    });

    it('cuts a month into weeks from Monday to Sunday, and a year into months', () => {
        const weeks = bucketsOf(periodOf('month', '2026-11-14'));

        expect(weeks.map((week) => [week.start, week.end])).toEqual([
            ['2026-11-01', '2026-11-01'],
            ['2026-11-02', '2026-11-08'],
            ['2026-11-09', '2026-11-15'],
            ['2026-11-16', '2026-11-22'],
            ['2026-11-23', '2026-11-29'],
            ['2026-11-30', '2026-11-30'],
        ]);
        expect(bucketsOf(periodOf('year', '2026-11-14'))).toHaveLength(12);
    });
});

describe('statistics', () => {
    let next = 1;
    const ticket = (overrides: Partial<TicketRecord>): TicketRecord =>
        ({
            id: next++,
            title: 'Ticket',
            status_code: 'todo',
            epic_id: 1,
            project_id: null,
            requester_id: 1,
            owner_id: 1,
            due_date: null,
            start_date: null,
            actual_end_date: null,
            time_spent: null,
            deleted_at: null,
            created_at: '2026-11-02T09:00:00+01:00',
            updated_at: '2026-11-12T09:00:00+01:00',
            ...overrides,
        }) as TicketRecord;
    const names: StatisticsNames = {
        reference: (record) => `ETUDE-${record.id}`,
        user: (id) => (id === 1 ? 'Alice' : 'Bruno'),
        epic: (id) => (id === 1 ? 'Étude' : 'Question'),
        project: (id) => (id === null ? 'Sans projet' : 'Migration'),
        requester: (id) => (id === 1 ? 'Finance' : 'RH'),
        status: (code) => code,
    };
    const team = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bruno' },
    ];
    const compute = (tickets: TicketRecord[], overloadThreshold = 8) =>
        computeStatistics(
            tickets,
            periodOf('month', '2026-11-14'),
            names,
            {
                today: '2026-11-14',
                staleDays: 14,
                overloadThreshold,
            },
            team,
        );

    it('counts the open and overdue tickets, the backlog and the finished ones apart', () => {
        const stats = compute([
            ticket({ status_code: 'in_progress', due_date: '2026-11-10' }),
            ticket({ status_code: 'todo', due_date: '2026-11-20' }),
            ticket({ status_code: 'backlog', due_date: '2026-11-01' }),
            ticket({ status_code: 'done', actual_end_date: '2026-11-05', due_date: '2026-11-01' }),
            ticket({ status_code: 'todo', deleted_at: '2026-11-03T10:00:00+01:00' }),
        ]);

        expect(stats.tiles).toMatchObject({ open: 2, overdue: 1, closed: 1 });
        expect(stats.overdue).toEqual([expect.objectContaining({ reference: 'ETUDE-1', days: 4 })]);
        expect(stats.due).toEqual({ with_due_date: 1, on_time: 0, late: 1, rate: 0 });
    });

    it('computes the lead time, the time spent and the occupation of the period', () => {
        const stats = compute([
            // 4 days of lead time (both ends included), 2 man-days.
            ticket({ owner_id: 1, status_code: 'done', actual_end_date: '2026-11-05', time_spent: 2 }),
            // 10 days of lead time, 4 man-days, another type and project.
            ticket({
                owner_id: 1,
                epic_id: 2,
                project_id: 3,
                status_code: 'done',
                actual_end_date: '2026-11-11',
                time_spent: 4,
            }),
            // Finished in October: outside the period.
            ticket({ owner_id: 2, status_code: 'done', actual_end_date: '2026-10-30', time_spent: 9 }),
        ]);

        // Monday 2 to Friday 13 November: 10 working days.
        expect(stats.available_days).toBe(10);
        expect(stats.tiles).toMatchObject({ closed: 2, average_lead: 7, time_spent: 6 });
        expect(stats.team.find((row) => row.name === 'Alice')).toMatchObject({
            closed: 2,
            time_spent: 6,
            occupation: 0.6,
        });
        expect(stats.team.find((row) => row.name === 'Bruno')).toMatchObject({ closed: 0, time_spent: 0 });
        expect(stats.by_type.map((row) => [row.name, row.time_spent, row.average_lead])).toEqual([
            ['Question', 4, 10],
            ['Étude', 2, 4],
        ]);
        expect(stats.by_project.map((row) => row.name)).toEqual(['Migration', 'Sans projet']);
    });

    it('follows the weeks: created, closed, velocity and stock, nothing for the weeks to come', () => {
        const stats = compute([
            ticket({ created_at: '2026-10-20T09:00:00+01:00', status_code: 'done', actual_end_date: '2026-11-03' }),
            ticket({ created_at: '2026-11-04T09:00:00+01:00', status_code: 'done', actual_end_date: '2026-11-10' }),
            ticket({ created_at: '2026-11-10T09:00:00+01:00' }),
        ]);

        // Weeks: 1 Nov, 2-8, 9-15, 16-22, 23-29, 30 Nov.
        expect(stats.started).toEqual([0, 1, 1, null, null, null]);
        expect(stats.closed).toEqual([0, 1, 1, null, null, null]);
        expect(stats.stock_evolution).toEqual([1, 1, 1, null, null, null]);
        expect(stats.team[0].velocity).toEqual([0, 1, 1, null, null, null]);
    });

    it('starts from the start date of the ticket, or from its creation date', () => {
        const stats = compute([
            ticket({
                created_at: '2026-10-01T09:00:00+02:00',
                start_date: '2026-11-09',
                status_code: 'done',
                actual_end_date: '2026-11-10',
            }),
            ticket({ created_at: '2026-10-01T09:00:00+02:00', start_date: '2026-11-20' }),
        ]);

        expect(stats.tiles.average_lead).toBe(2);
        expect(stats.started).toEqual([0, 0, 1, null, null, null]);
        // The second ticket only starts on 20 November.
        expect(stats.stock_evolution).toEqual([0, 0, 0, null, null, null]);
    });

    it('raises the overload alert and lists the blocked tickets', () => {
        const stats = compute(
            [
                ticket({ owner_id: 2, status_code: 'waiting' }),
                ticket({ owner_id: 2, updated_at: '2026-10-20T09:00:00+02:00' }),
                ticket({ owner_id: 2 }),
                ticket({ owner_id: 1 }),
            ],
            2,
        );

        expect(stats.team[0]).toMatchObject({ name: 'Bruno', open: 3, waiting: 1, overloaded: true });
        expect(stats.team[1]).toMatchObject({ name: 'Alice', open: 1, overloaded: false });
        expect(stats.blocked.map((line) => [line.days, line.reason])).toEqual([
            [25, 'Sans modification depuis 25 jours'],
            [2, 'En attente'],
        ]);
    });

    it('sums the requesters', () => {
        const stats = compute([
            ticket({ requester_id: 2, status_code: 'done', actual_end_date: '2026-11-05', time_spent: 1.5 }),
            ticket({ requester_id: 2, due_date: '2026-11-12' }),
            ticket({ requester_id: 1 }),
        ]);

        expect(stats.requesters[0]).toEqual({
            id: 2,
            name: 'RH',
            time_spent: 1.5,
            started: 2,
            closed: 1,
            average_lead: 4,
            open: 1,
            overdue: 1,
        });
    });
});

describe('statistics api', () => {
    beforeEach(() => freezeDate('2026-11-13'));
    afterEach(() => {
        restoreClock();
        signIn(USER);
    });

    it('is kept for the administrators', async () => {
        const files = await createFolder();
        await openAs(files, ADMIN);
        const requesterId = await createRequester();
        const created = await ticketsApi.create(ticketPayload(requesterId, { start_date: '2026-11-11' }));
        await ticketsApi.move(created.id, 'done', 0);

        const stats = await statisticsApi.compute({
            kind: 'month',
            day: '2026-11-13',
            staleDays: 14,
            overloadThreshold: 8,
        });
        expect(stats.tiles).toMatchObject({ closed: 1, time_spent: 3 });
        expect(stats.requesters[0]).toMatchObject({ name: 'Support informatique', time_spent: 3 });

        await openAs(files, LEAD);
        expect(
            await statusOf(
                statisticsApi.compute({ kind: 'year', day: '2026-11-13', staleDays: 14, overloadThreshold: 8 }),
            ),
        ).toBe(403);
    });
});
