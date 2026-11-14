import { useReferenceStore } from '@/stores/reference';
import type { TicketCard } from '@/types/models';
import { daysLeft, daysSince } from '@/utils/dates';

/**
 * Display helpers shared by the kanban cards, the planning and the detail
 * screen: related entities and day counters of a ticket.
 */
export function useTicketPresentation() {
    const reference = useReferenceStore();

    function requester(ticket: Pick<TicketCard, 'requester_id'>) {
        return reference.requesterMap.get(ticket.requester_id);
    }

    function epic(ticket: Pick<TicketCard, 'epic_id'>) {
        return reference.epicMap.get(ticket.epic_id);
    }

    function project(ticket: Pick<TicketCard, 'project_id'>) {
        return ticket.project_id !== null ? reference.projectMap.get(ticket.project_id) : undefined;
    }

    function owner(ticket: Pick<TicketCard, 'owner_id'>) {
        return reference.userMap.get(ticket.owner_id);
    }

    function status(ticket: Pick<TicketCard, 'status_code'>) {
        return reference.statusMap.get(ticket.status_code);
    }

    /**
     * Counters: days since creation, and days left before the planned end
     * (null when no planned end date or when the ticket is closed).
     */
    function counters(ticket: Pick<TicketCard, 'created_at' | 'due_date' | 'status_code'>) {
        const closed = reference.isClosed(ticket.status_code);

        return {
            age: daysSince(ticket.created_at),
            remaining: closed ? null : daysLeft(ticket.due_date),
            closed,
        };
    }

    return { requester, epic, project, owner, status, counters };
}
