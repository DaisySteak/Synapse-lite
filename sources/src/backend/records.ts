/**
 * Records stored in the data folder, one JSON file per record.
 *
 *   data/
 *   ├── synapse-lite.json                 marker and format version
 *   ├── users/<id>.json                   users (login = employee number)
 *   ├── epics/<id>.json                   ticket types
 *   ├── projects/<id>.json
 *   ├── requesters/<id>.json
 *   ├── custom-fields/<id>.json
 *   ├── settings/1.json                   team settings (color theme)
 *   ├── recurring-tickets/<id>.json       templates and recurrence rules
 *   ├── tickets/<id>.json                 tickets (soft deleted: deleted_at)
 *   ├── comments/<ticket id>/<id>.json
 *   ├── activities/<ticket id>/<id>.json  history, one file per event
 *   └── attachments/<ticket id>/<id>.json + <id>/<original file name>
 *
 * Field names are those of the Synapse database (snake_case), dates are
 * "YYYY-MM-DD" strings and timestamps ISO 8601 strings.
 */
import type { CustomFieldType, RoleCode, Schedule, TicketEvent } from '@/types/models';

/** Version of the file format, written in synapse-lite.json. */
export const SCHEMA_VERSION = 1;

export interface MarkerRecord {
    application: 'Synapse Lite';
    schema_version: number;
    created_at: string;
}

interface Timestamps {
    created_at: string;
    updated_at: string;
}

export interface UserRecord extends Timestamps {
    id: number;
    /** Employee number (matricule), e.g. LOGIN1. */
    login: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    role: RoleCode;
    is_active: boolean;
    last_login_at: string | null;
}

export interface EpicRecord extends Timestamps {
    id: number;
    code: string;
    title: string;
    color: string;
    is_active: boolean;
    /**
     * Highest ticket number given in this type by tickets deleted permanently
     * (absent until the first permanent deletion): numbers are never reused.
     */
    last_number?: number;
}

/** Settings of the whole team, in settings/1.json (absent until first changed). */
export interface SettingsRecord extends Timestamps {
    id: 1;
    /** Color theme (utils/themes.ts). */
    theme: string;
    updated_by: number;
}

export interface ProjectRecord extends Timestamps {
    id: number;
    name: string;
    description: string | null;
    color: string;
    is_active: boolean;
}

export interface RequesterRecord extends Timestamps {
    id: number;
    name: string;
    color: string;
    is_active: boolean;
}

export interface CustomFieldRecord extends Timestamps {
    id: number;
    code: string;
    label: string;
    field_type: CustomFieldType;
    epic_id: number | null;
    help_text: string | null;
    is_required: boolean;
    is_active: boolean;
    position: number;
}

/** Values of the custom fields, by custom field id. */
export type CustomValues = Record<string, string>;

export interface TicketRecord extends Timestamps {
    id: number;
    /** Number inside the type: ETUDE-12 has number 12. */
    number: number;
    /** Numbers held before a change of type, never given again. */
    previous_numbers: { epic_id: number; number: number }[];
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
    /** Man-days. */
    time_spent: number | null;
    /** Order in the kanban column (decimal, see TicketService.move). */
    rank: number;
    custom_fields: CustomValues;
    comments_count: number;
    attachments_count: number;
    created_by: number;
    updated_by: number | null;
    deleted_at: string | null;
}

export interface CommentRecord extends Timestamps {
    id: number;
    ticket_id: number;
    author_id: number;
    body: string;
}

export interface ActivityRecord {
    id: number;
    ticket_id: number;
    user_id: number | null;
    event: TicketEvent;
    changes: Record<string, unknown> | null;
    created_at: string;
}

export interface AttachmentRecord {
    id: number;
    ticket_id: number;
    comment_id: number | null;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    /** Path of the content, relative to the data folder. */
    path: string;
    uploaded_by: number;
    created_at: string;
}

export interface RecurringTicketRecord extends Timestamps {
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
    custom_fields: CustomValues;
    /** Time spent given to each ticket created (man-days); absent in older files. */
    time_spent?: number | null;
    start_offset_days: number | null;
    due_offset_days: number | null;
    schedule: Schedule;
    starts_on: string;
    ends_on: string | null;
    next_run_on: string | null;
    last_run_on: string | null;
    is_active: boolean;
    created_by: number;
    updated_by: number | null;
}
