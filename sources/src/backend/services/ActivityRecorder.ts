import type { TicketEvent } from '@/types/models';
import { nowIso } from '../clock';
import type { Database } from '../database';
import { uniqueId } from '../ids';
import type { ActivityRecord } from '../records';

/**
 * Writes the functional history of the tickets, one file per event, so that
 * two users never write the same file.
 */
export class ActivityRecorder {
    constructor(private readonly db: Database) {}

    async record(
        ticketId: number,
        event: TicketEvent,
        actorId: number | null,
        changes: Record<string, unknown> = {},
        id: number = uniqueId(),
    ): Promise<ActivityRecord> {
        const activity: ActivityRecord = {
            id,
            ticket_id: ticketId,
            user_id: actorId,
            event,
            changes: Object.keys(changes).length === 0 ? null : changes,
            created_at: nowIso(),
        };

        return this.db.activities(ticketId).save(activity);
    }

    /** History of a ticket, most recent first (200 entries at most). */
    async list(ticketId: number): Promise<ActivityRecord[]> {
        const collection = this.db.activities(ticketId);
        await collection.sync();

        return collection
            .all()
            .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
            .slice(0, 200);
    }
}
