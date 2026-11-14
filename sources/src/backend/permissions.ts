/**
 * Profiles, permissions and access rules (port of App\Authorization and
 * App\Policies of Synapse).
 *
 * The screens only know the list of permissions of the connected user, never
 * the profiles, exactly as in Synapse.
 */
import type { Permission, RoleCode } from '@/types/models';
import { DEFAULT_ACCESS, type AccessMatrix } from './access';
import type { AttachmentRecord, CommentRecord, TicketRecord, UserRecord } from './records';

/** Code of the backlog step. */
export const BACKLOG = 'backlog';
/** Default step of a new ticket. */
export const TODO = 'todo';

export const ROLE_LABELS: Record<RoleCode, string> = {
    admin: 'Administrateur',
    lead_tech: 'Lead tech',
    user: 'Utilisateur',
};

/**
 * Actions on the tickets, fixed by profile. The pages (menu) are chosen by an
 * administrator in "Gestion des accès" (access.ts).
 */
const LEAD_TECH: Permission[] = [
    'tickets.create',
    'tickets.update_any',
    'tickets.update_own',
    'tickets.delete',
    'backlog.manage',
    'comments.moderate',
];

const ACTIONS: Record<RoleCode, Permission[]> = {
    admin: [...LEAD_TECH, 'tickets.purge'],
    lead_tech: LEAD_TECH,
    user: ['tickets.create', 'tickets.update_own'],
};

/**
 * Permissions of a user: the actions of the profile and the pages the
 * administrators opened to it (the default access when nothing was chosen).
 */
export function permissionsFor(
    user: Pick<UserRecord, 'role' | 'is_active'>,
    access: AccessMatrix = DEFAULT_ACCESS,
): Permission[] {
    return user.is_active ? [...ACTIONS[user.role], ...access[user.role]] : [];
}

/** Connected user, with the resolved permissions. */
export class Actor {
    private readonly granted: Set<Permission>;

    constructor(
        readonly user: UserRecord,
        access?: AccessMatrix,
    ) {
        this.granted = new Set(permissionsFor(user, access));
    }

    get id(): number {
        return this.user.id;
    }

    get permissions(): Permission[] {
        return [...this.granted];
    }

    can(permission: Permission): boolean {
        return this.granted.has(permission);
    }
}

type TicketAccess = Pick<TicketRecord, 'owner_id' | 'supporter_ids' | 'status_code'>;

/** Rules on tickets (App\Policies\TicketPolicy). */
export const ticketPolicy = {
    create: (actor: Actor) => actor.can('tickets.create'),

    update(actor: Actor, ticket: TicketAccess): boolean {
        if (actor.can('tickets.update_any')) return true;

        return (
            actor.can('tickets.update_own') && (ticket.owner_id === actor.id || ticket.supporter_ids.includes(actor.id))
        );
    },

    /** Move to another workflow step (kanban, backlog). */
    changeStatus(actor: Actor, ticket: TicketAccess, statusCode: string): boolean {
        if (statusCode === BACKLOG && ticket.status_code !== BACKLOG) {
            return actor.can('backlog.manage') && ticketPolicy.update(actor, ticket);
        }

        if (ticket.status_code === BACKLOG && statusCode !== BACKLOG) {
            return ticketPolicy.update(actor, ticket) || actor.can('tickets.update_own');
        }

        return ticketPolicy.update(actor, ticket);
    },

    delete: (actor: Actor) => actor.can('tickets.delete'),

    /** Attach files to the ticket itself. */
    attach: (actor: Actor, ticket: TicketAccess) => ticketPolicy.update(actor, ticket),
};

/** Comments: edited by their author, deleted by their author or a moderator. */
export const commentPolicy = {
    update: (actor: Actor, comment: CommentRecord) => comment.author_id === actor.id,
    delete: (actor: Actor, comment: CommentRecord) => comment.author_id === actor.id || actor.can('comments.moderate'),
};

/** Attachments: deleted by their uploader or a moderator. */
export const attachmentPolicy = {
    delete: (actor: Actor, attachment: AttachmentRecord) =>
        attachment.uploaded_by === actor.id || actor.can('comments.moderate'),
};
