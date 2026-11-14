import { describe, expect, it } from 'vitest';
import type { TicketCard } from '@/types/models';
import {
    buildBar,
    buildRange,
    clampResize,
    groupBars,
    isPlanned,
    isoWeek,
    monthCells,
    resizePatch,
    unitCells,
    type PlannedTicket,
} from './gantt';

function ticket(overrides: Partial<TicketCard> = {}): PlannedTicket {
    return {
        id: 1,
        reference: 'ETUDE-1',
        number: 1,
        project_id: null,
        recurring_ticket_id: null,
        title: 'Ticket',
        status_code: 'todo',
        epic_id: 1,
        requester_id: 1,
        owner_id: 1,
        supporter_ids: [],
        start_date: '2026-03-02',
        due_date: '2026-03-06',
        actual_end_date: null,
        rank: 1,
        comments_count: 0,
        attachments_count: 0,
        created_at: '2026-03-01T10:00:00+01:00',
        ...overrides,
    } as PlannedTicket;
}

describe('gantt', () => {
    const range = buildRange(new Date(2026, 2, 1), 31);

    it('positions a bar from its start to its planned end (inclusive)', () => {
        const bar = buildBar(ticket({}), range, 10, false, new Date(2026, 2, 3));

        expect(bar.left).toBe(10);
        expect(bar.width).toBe(50);
        expect(bar.lateWidth).toBe(0);
    });

    it('gives a bar without end date a fixed length ending with a point', () => {
        const bar = buildBar(ticket({ due_date: null }), range, 10, false, new Date(2026, 2, 3), 14);

        expect(bar.openEnded).toBe(true);
        expect(bar.width).toBe(140);
        expect(bar.lateWidth).toBe(0);
    });

    it('only plans the tickets with a start date', () => {
        expect(isPlanned(ticket())).toBe(true);
        expect(isPlanned({ ...ticket(), start_date: null } as TicketCard)).toBe(false);
    });

    it('cuts a bar starting before the visible period', () => {
        const bar = buildBar(ticket({ start_date: '2026-02-26' }), range, 10, false, new Date(2026, 2, 3));

        expect(bar.left).toBe(0);
        expect(bar.width).toBe(60);
        expect(bar.clippedStart).toBe(true);
    });

    it('extends an open late ticket up to today', () => {
        const bar = buildBar(ticket({}), range, 10, false, new Date(2026, 2, 10));

        expect(bar.lateWidth).toBe(40);
    });

    it('uses the actual end date of a closed ticket', () => {
        const bar = buildBar(ticket({ actual_end_date: '2026-03-04' }), range, 10, true, new Date(2026, 2, 10));

        expect(bar.width).toBe(30);
        expect(bar.lateWidth).toBe(0);
    });

    it('groups the bars by owner following the given order', () => {
        const bars = [
            buildBar(ticket({ id: 1, owner_id: 7 }), range, 10, false),
            buildBar(ticket({ id: 2, owner_id: 3 }), range, 10, false),
        ];

        expect(groupBars(bars, true, [3, 7]).map((group) => group.ownerId)).toEqual([3, 7]);
        expect(groupBars(bars, false)).toHaveLength(1);
    });

    it('builds the month and week headers', () => {
        const months = monthCells(buildRange(new Date(2026, 2, 25), 14), 10);

        expect(months).toHaveLength(2);
        expect(months[0].label).toBe('Mars 2026');
        expect(months[0].width).toBe(70);
        expect(unitCells(range, 'week')).toHaveLength(31);
        expect(isoWeek(new Date(2026, 0, 1))).toBe(1);
    });
});

describe('resizing a bar', () => {
    const day = (iso: string) => new Date(`${iso}T00:00:00`);

    it('moves the start date or the due date, never past the other end', () => {
        const start = day('2026-03-02');
        const end = day('2026-03-06');

        expect(clampResize('start', 10, start, end)).toBe(4);
        expect(clampResize('end', -10, start, end)).toBe(-4);
        expect(clampResize('end', 3, start, end)).toBe(3);
        expect(resizePatch(ticket(), false, 'start', -2, start, end)).toEqual({ start_date: '2026-02-28' });
        expect(resizePatch(ticket(), false, 'end', 3, start, end)).toEqual({ due_date: '2026-03-09' });
    });

    it('moves the actual end date of a closed ticket', () => {
        const closed = ticket({ status_code: 'done', actual_end_date: '2026-03-05' });

        expect(resizePatch(closed, true, 'end', 1, day('2026-03-02'), day('2026-03-05'))).toEqual({
            actual_end_date: '2026-03-06',
        });
    });
});
