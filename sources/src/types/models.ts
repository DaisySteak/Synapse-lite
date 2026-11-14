/**
 * Types of the objects exchanged between the screens and the data layer
 * (src/api). They are those of the Synapse API (/api/v1), so that the screens
 * are shared by both applications; the records stored in the data folder are
 * described in backend/records.ts.
 */

export type Permission =
    | 'tickets.create'
    | 'tickets.update_any'
    | 'tickets.update_own'
    | 'tickets.delete'
    | 'tickets.purge'
    | 'backlog.manage'
    | 'comments.moderate'
    | 'admin.users'
    | 'admin.epics'
    | 'admin.requesters'
    | 'admin.custom_fields'
    | 'admin.projects'
    | 'admin.recurring_tickets'
    | 'admin.data'
    | 'admin.statistics'
    | 'admin.theme'
    | 'admin.access'
    | 'pages.board'
    | 'pages.backlog'
    | 'pages.planning'
    | 'pages.tickets';

export type RoleCode = 'admin' | 'lead_tech' | 'user';

export type CustomFieldType = 'date' | 'short_text' | 'long_text';

export interface CurrentUser {
    id: number;
    login: string;
    full_name: string;
    initials: string;
    role: RoleCode;
    role_label: string;
    permissions: Permission[];
}

export interface UserSummary {
    id: number;
    full_name: string;
    initials: string;
    is_active: boolean;
}

export interface User extends UserSummary {
    login: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    role: RoleCode;
    role_label: string;
    last_login_at: string | null;
    created_at: string | null;
}

export interface TicketStatus {
    code: string;
    label: string;
    position: number;
    color: string;
    is_final: boolean;
}

export interface Epic {
    id: number;
    code: string;
    title: string;
    color: string;
    is_active: boolean;
    tickets_count?: number;
}

export interface RequesterStatistics {
    /** Tickets whose time spent is filled in. */
    timed_tickets_count: number;
    time_spent_total: number;
    time_spent_closed: number;
    time_spent_open: number;
}

export interface Project {
    id: number;
    name: string;
    description: string | null;
    color: string;
    is_active: boolean;
    tickets_count?: number;
}

export interface Requester {
    id: number;
    name: string;
    color: string;
    is_active: boolean;
    tickets_count?: number;
    /** Time spent on the tickets of the requester, in man-days (admin list only). */
    statistics?: RequesterStatistics;
}

export interface CustomField {
    id: number;
    code: string;
    label: string;
    field_type: CustomFieldType;
    field_type_label: string;
    epic_id: number | null;
    help_text: string | null;
    is_required: boolean;
    is_active: boolean;
    position: number;
}

export interface Option<T = string> {
    value: T;
    label: string;
}

export interface AppSettings {
    closed_visible_days: number;
    /** Planning: length of the bar of a ticket without due date. */
    open_ended_days: number;
    attachment_max_size_kb: number;
    /** Color theme chosen by an administrator (utils/themes.ts). */
    theme: string;
}

export interface ReferenceData {
    statuses: TicketStatus[];
    epics: Epic[];
    projects: Project[];
    requesters: Requester[];
    users: UserSummary[];
    custom_fields: CustomField[];
    roles: Option<RoleCode>[];
    custom_field_types: Option<CustomFieldType>[];
    settings: AppSettings;
}

/** Compact ticket (kanban, backlog, list, planning). */
export interface TicketCard {
    id: number;
    /** Only present when requested with `with_description` (exports). */
    description?: string | null;
    /** Displayed identifier: <epic code>-<number>, e.g. ETUDE-12. */
    reference: string;
    number: number;
    title: string;
    status_code: string;
    epic_id: number;
    project_id: number | null;
    recurring_ticket_id: number | null;
    requester_id: number;
    owner_id: number;
    supporter_ids: number[];
    start_date: string | null;
    due_date: string | null;
    actual_end_date: string | null;
    /** Time spent, in man-days. */
    time_spent: number | null;
    rank: number;
    comments_count: number;
    attachments_count: number;
    created_at: string;
    /** Date of the logical deletion (only listed for the administrators). */
    deleted_at: string | null;
}

export interface Attachment {
    id: number;
    comment_id: number | null;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_by?: UserSummary;
    created_at: string;
    can_delete: boolean;
}

/** Full ticket (detail screen). */
export interface Ticket {
    id: number;
    reference: string;
    number: number;
    title: string;
    description: string | null;
    status_code: string;
    epic_id: number;
    project_id: number | null;
    recurring_ticket_id: number | null;
    requester_id: number;
    owner_id: number;
    supporter_ids: number[];
    data_processing_code: string | null;
    work_folder_url: string | null;
    start_date: string | null;
    due_date: string | null;
    actual_end_date: string | null;
    /** Time spent, in man-days. */
    time_spent: number | null;
    custom_fields: Record<string, string | null>;
    attachments: Attachment[];
    comments_count: number;
    creator?: UserSummary;
    updater?: UserSummary;
    created_at: string;
    updated_at: string;
    can: { update: boolean; delete: boolean; attach: boolean };
}

export interface TicketPayload {
    title?: string;
    description?: string | null;
    status_code?: string;
    epic_id?: number | null;
    project_id?: number | null;
    requester_id?: number | null;
    owner_id?: number | null;
    supporter_ids?: number[];
    data_processing_code?: string | null;
    work_folder_url?: string | null;
    start_date?: string | null;
    due_date?: string | null;
    actual_end_date?: string | null;
    time_spent?: number | null;
    custom_fields?: Record<number, string | null>;
}

export interface Comment {
    id: number;
    body: string;
    author?: UserSummary;
    attachments: Attachment[];
    created_at: string;
    updated_at: string;
    is_edited: boolean;
    can_update: boolean;
    can_delete: boolean;
}

export type TicketEvent =
    | 'created'
    | 'updated'
    | 'status_changed'
    | 'owner_changed'
    | 'comment_added'
    | 'attachment_added'
    | 'attachment_removed'
    | 'deleted'
    | 'restored';

export interface TicketActivity {
    id: number;
    event: TicketEvent;
    changes: Record<string, unknown> | null;
    user?: UserSummary;
    created_at: string;
}

export interface TicketFilters {
    owner_ids?: number[];
    epic_ids?: number[];
    project_ids?: number[];
    requester_ids?: number[];
    status_codes?: string[];
    exclude_status_codes?: string[];
    search?: string;
    closed_within_days?: number | null;
    from?: string;
    to?: string;
    /** 1: include the description (exports). */
    with_description?: 0 | 1;
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Recurrence rule (App\\Services\\Recurring\\RecurrenceRule). */
export interface Schedule {
    frequency: Frequency;
    interval: number;
    /** ISO days: 1 = Monday ... 7 = Sunday. */
    weekdays: number[];
    monthly_mode: 'day' | 'weekday';
    /** 1-31, or -1 for the last day of the month. */
    month_day: number | null;
    /** 1-4, or -1 for the last one. */
    week_of_month: number | null;
    weekday: number | null;
    month: number | null;
}

export interface RecurringTicket {
    id: number;
    title: string;
    description: string | null;
    status_code: string;
    epic_id: number;
    project_id: number | null;
    requester_id: number;
    owner_id: number;
    supporter_ids: number[];
    data_processing_code: string | null;
    work_folder_url: string | null;
    custom_fields: Record<string, string | null>;
    /** Time spent given to each ticket created, in man-days. */
    time_spent: number | null;
    start_offset_days: number | null;
    due_offset_days: number | null;
    schedule: Schedule;
    schedule_label: string;
    starts_on: string;
    ends_on: string | null;
    next_run_on: string | null;
    last_run_on: string | null;
    next_occurrences: string[];
    is_active: boolean;
    tickets_count?: number;
}

export interface RecurringTicketPayload extends Omit<
    RecurringTicket,
    | 'id'
    | 'schedule_label'
    | 'next_run_on'
    | 'last_run_on'
    | 'next_occurrences'
    | 'tickets_count'
    | 'epic_id'
    | 'requester_id'
    | 'owner_id'
> {
    epic_id: number | null;
    requester_id: number | null;
    owner_id: number | null;
}

export interface RecurrencePreview {
    label: string;
    next_occurrences: string[];
}

/** Tickets concerned by a purge. */
export type PurgeScope = 'deleted' | 'all';

/** Ticket field changed by a bulk reassignment. */
export type ReassignField = 'owner' | 'epic' | 'requester';

/** Value proposed in a bulk reassignment (user, ticket type or requester). */
export interface ReassignChoice {
    id: number;
    label: string;
    is_active: boolean;
    /** Tickets (not deleted) having this value. */
    tickets_count: number;
}

/** What a backup archive holds, shown before restoring it. */
export interface BackupSummary {
    /** Creation date of the data folder saved. */
    created_at: string | null;
    files: number;
    tickets: number;
    users: number;
    requesters: number;
    projects: number;
    attachments: number;
}
