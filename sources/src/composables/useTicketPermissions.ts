import { useAuthStore } from '@/stores/auth';
import type { TicketCard } from '@/types/models';

/** Code of the backlog status (App\Models\TicketStatus::BACKLOG). */
export const BACKLOG = 'backlog';

/**
 * Client side mirror of App\Policies\TicketPolicy (update, changeStatus),
 * used to enable drag and drop and the backlog actions. The server remains
 * the authority.
 */
export function useTicketPermissions() {
    const auth = useAuthStore();

    function canUpdate(ticket: Pick<TicketCard, 'owner_id' | 'supporter_ids'>): boolean {
        if (auth.can('tickets.update_any')) return true;

        const userId = auth.user?.id;

        return (
            auth.can('tickets.update_own') &&
            userId !== undefined &&
            (ticket.owner_id === userId || ticket.supporter_ids.includes(userId))
        );
    }

    /** Move the ticket to another workflow step (mirror of changeStatus). */
    function canChangeStatus(
        ticket: Pick<TicketCard, 'owner_id' | 'supporter_ids' | 'status_code'>,
        to: string,
    ): boolean {
        if (to === BACKLOG && ticket.status_code !== BACKLOG) return auth.can('backlog.manage') && canUpdate(ticket);
        if (ticket.status_code === BACKLOG && to !== BACKLOG)
            return canUpdate(ticket) || auth.can('tickets.update_own');

        return canUpdate(ticket);
    }

    return { canUpdate, canChangeStatus };
}
