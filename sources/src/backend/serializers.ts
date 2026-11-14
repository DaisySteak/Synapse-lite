/**
 * Objects returned to the screens (port of App\Http\Resources). They have
 * exactly the shape of the Synapse API, described in types/models.ts.
 */
import type {
    Attachment,
    Comment,
    CurrentUser,
    CustomField,
    Epic,
    Project,
    RecurringTicket,
    Requester,
    Ticket,
    TicketActivity,
    TicketCard,
    User,
    UserSummary,
} from '@/types/models';
import { attachmentPolicy, commentPolicy, ROLE_LABELS, ticketPolicy, type Actor } from './permissions';
import type {
    ActivityRecord,
    AttachmentRecord,
    CommentRecord,
    CustomFieldRecord,
    EpicRecord,
    ProjectRecord,
    RecurringTicketRecord,
    RequesterRecord,
    TicketRecord,
    UserRecord,
} from './records';
import { CUSTOM_FIELD_TYPE_LABELS } from './reference';
import { RecurringTicketService } from './services/RecurringTicketService';

export function fullName(user: Pick<UserRecord, 'first_name' | 'last_name'>): string {
    return `${user.first_name} ${user.last_name ?? ''}`.trim();
}

/**
 * Two letters for the avatar: first letters of the first and last names, or
 * of a compound first name ("Jean-François" gives "JF") without last name.
 */
export function initials(user: Pick<UserRecord, 'first_name' | 'last_name'>): string {
    if (user.last_name) return `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase();

    const parts = user.first_name
        .trim()
        .split(/[\s-]+/)
        .filter(Boolean);

    return (parts.length > 1 ? parts[0].charAt(0) + parts[1].charAt(0) : (parts[0] ?? '').slice(0, 2)).toUpperCase();
}

export function toUserSummary(user: UserRecord): UserSummary {
    return { id: user.id, full_name: fullName(user), initials: initials(user), is_active: user.is_active };
}

export function toUser(user: UserRecord): User {
    return {
        ...toUserSummary(user),
        login: user.login,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        role_label: ROLE_LABELS[user.role],
        last_login_at: user.last_login_at,
        created_at: user.created_at,
    };
}

export function toCurrentUser(actor: Actor): CurrentUser {
    const { user } = actor;

    return {
        id: user.id,
        login: user.login,
        full_name: fullName(user),
        initials: initials(user),
        role: user.role,
        role_label: ROLE_LABELS[user.role],
        permissions: actor.permissions,
    };
}

export function toEpic(epic: EpicRecord, ticketsCount?: number): Epic {
    return {
        id: epic.id,
        code: epic.code,
        title: epic.title,
        color: epic.color,
        is_active: epic.is_active,
        ...(ticketsCount !== undefined ? { tickets_count: ticketsCount } : {}),
    };
}

export function toProject(project: ProjectRecord, ticketsCount?: number): Project {
    return {
        id: project.id,
        name: project.name,
        description: project.description,
        color: project.color,
        is_active: project.is_active,
        ...(ticketsCount !== undefined ? { tickets_count: ticketsCount } : {}),
    };
}

/**
 * Requester; with its tickets, adds the time spent on them (man-days): in
 * total, on the closed tickets and on the open ones.
 */
export function toRequester(
    requester: RequesterRecord,
    tickets?: TicketRecord[],
    isClosed: (ticket: TicketRecord) => boolean = () => false,
): Requester {
    const base: Requester = {
        id: requester.id,
        name: requester.name,
        color: requester.color,
        is_active: requester.is_active,
    };

    if (!tickets) return base;

    const timed = tickets.filter((ticket) => ticket.time_spent !== null);
    const sum = (list: TicketRecord[]) => list.reduce((total, ticket) => total + (ticket.time_spent ?? 0), 0);
    const total = sum(timed);
    const closed = sum(timed.filter(isClosed));

    return {
        ...base,
        tickets_count: tickets.length,
        statistics: {
            timed_tickets_count: timed.length,
            time_spent_total: round3(total),
            time_spent_closed: round3(closed),
            time_spent_open: round3(total - closed),
        },
    };
}

export function toCustomField(field: CustomFieldRecord): CustomField {
    return {
        id: field.id,
        code: field.code,
        label: field.label,
        field_type: field.field_type,
        field_type_label: CUSTOM_FIELD_TYPE_LABELS[field.field_type],
        epic_id: field.epic_id,
        help_text: field.help_text,
        is_required: field.is_required,
        is_active: field.is_active,
        position: field.position,
    };
}

export function reference(ticket: TicketRecord, epics: Map<number, EpicRecord>): string {
    return `${epics.get(ticket.epic_id)?.code ?? '?'}-${ticket.number}`;
}

export function toTicketCard(
    ticket: TicketRecord,
    epics: Map<number, EpicRecord>,
    withDescription = false,
): TicketCard {
    return {
        id: ticket.id,
        reference: reference(ticket, epics),
        number: ticket.number,
        title: ticket.title,
        ...(withDescription ? { description: ticket.description } : {}),
        status_code: ticket.status_code,
        epic_id: ticket.epic_id,
        project_id: ticket.project_id,
        recurring_ticket_id: ticket.recurring_ticket_id,
        requester_id: ticket.requester_id,
        owner_id: ticket.owner_id,
        supporter_ids: [...ticket.supporter_ids],
        start_date: ticket.start_date,
        due_date: ticket.due_date,
        actual_end_date: ticket.actual_end_date,
        time_spent: ticket.time_spent,
        rank: ticket.rank,
        comments_count: ticket.comments_count,
        attachments_count: ticket.attachments_count,
        created_at: ticket.created_at,
        deleted_at: ticket.deleted_at,
    };
}

export function toTicket(
    ticket: TicketRecord,
    context: {
        actor: Actor;
        epics: Map<number, EpicRecord>;
        users: Map<number, UserRecord>;
        attachments: AttachmentRecord[];
    },
): Ticket {
    const { actor, epics, users } = context;
    const summary = (id: number | null) => {
        const user = id !== null ? users.get(id) : undefined;

        return user ? toUserSummary(user) : undefined;
    };

    return {
        id: ticket.id,
        reference: reference(ticket, epics),
        number: ticket.number,
        title: ticket.title,
        description: ticket.description,
        status_code: ticket.status_code,
        epic_id: ticket.epic_id,
        project_id: ticket.project_id,
        recurring_ticket_id: ticket.recurring_ticket_id,
        requester_id: ticket.requester_id,
        owner_id: ticket.owner_id,
        supporter_ids: [...ticket.supporter_ids],
        data_processing_code: ticket.data_processing_code,
        work_folder_url: ticket.work_folder_url,
        start_date: ticket.start_date,
        due_date: ticket.due_date,
        actual_end_date: ticket.actual_end_date,
        time_spent: ticket.time_spent,
        custom_fields: { ...ticket.custom_fields },
        attachments: context.attachments
            .filter((attachment) => attachment.comment_id === null)
            .map((attachment) => toAttachment(attachment, actor, users)),
        comments_count: ticket.comments_count,
        creator: summary(ticket.created_by),
        updater: summary(ticket.updated_by),
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        can: {
            update: ticketPolicy.update(actor, ticket),
            delete: ticketPolicy.delete(actor),
            attach: ticketPolicy.attach(actor, ticket),
        },
    };
}

export function toAttachment(attachment: AttachmentRecord, actor: Actor, users: Map<number, UserRecord>): Attachment {
    const uploader = users.get(attachment.uploaded_by);

    return {
        id: attachment.id,
        comment_id: attachment.comment_id,
        original_name: attachment.original_name,
        mime_type: attachment.mime_type,
        size_bytes: attachment.size_bytes,
        uploaded_by: uploader ? toUserSummary(uploader) : undefined,
        created_at: attachment.created_at,
        can_delete: attachmentPolicy.delete(actor, attachment),
    };
}

export function toComment(
    comment: CommentRecord,
    attachments: AttachmentRecord[],
    actor: Actor,
    users: Map<number, UserRecord>,
): Comment {
    const author = users.get(comment.author_id);

    return {
        id: comment.id,
        body: comment.body,
        author: author ? toUserSummary(author) : undefined,
        attachments: attachments
            .filter((attachment) => attachment.comment_id === comment.id)
            .map((attachment) => toAttachment(attachment, actor, users)),
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        is_edited: comment.updated_at > comment.created_at,
        can_update: commentPolicy.update(actor, comment),
        can_delete: commentPolicy.delete(actor, comment),
    };
}

export function toActivity(activity: ActivityRecord, users: Map<number, UserRecord>): TicketActivity {
    const user = activity.user_id !== null ? users.get(activity.user_id) : undefined;

    return {
        id: activity.id,
        event: activity.event,
        changes: activity.changes,
        user: user ? toUserSummary(user) : undefined,
        created_at: activity.created_at,
    };
}

export function toRecurringTicket(
    template: RecurringTicketRecord,
    service: RecurringTicketService,
    ticketsCount?: number,
): RecurringTicket {
    const rule = RecurringTicketService.rule(template);

    return {
        id: template.id,
        title: template.title,
        description: template.description,
        status_code: template.status_code,
        epic_id: template.epic_id,
        project_id: template.project_id,
        requester_id: template.requester_id,
        owner_id: template.owner_id,
        supporter_ids: [...template.supporter_ids],
        data_processing_code: template.data_processing_code,
        work_folder_url: template.work_folder_url,
        time_spent: template.time_spent ?? null,
        custom_fields: { ...template.custom_fields },
        start_offset_days: template.start_offset_days,
        due_offset_days: template.due_offset_days,
        schedule: rule.toSchedule(),
        schedule_label: rule.describe(template.starts_on),
        starts_on: template.starts_on,
        ends_on: template.ends_on,
        next_run_on: template.next_run_on,
        last_run_on: template.last_run_on,
        next_occurrences: service.nextOccurrences(template),
        is_active: template.is_active,
        ...(ticketsCount !== undefined ? { tickets_count: ticketsCount } : {}),
    };
}

function round3(value: number): number {
    return Math.round(value * 1000) / 1000;
}
