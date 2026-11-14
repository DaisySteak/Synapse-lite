/**
 * Validation of the tickets (port of TicketRules, StoreTicketRequest,
 * UpdateTicketRequest and ValidatesCustomFields).
 */
import type { Database } from '@/backend/database';
import type { FieldErrors } from '@/backend/errors';
import { BACKLOG, type Actor } from '@/backend/permissions';
import { statusExists } from '@/backend/reference';
import type { TicketData } from '@/backend/services/TicketService';
import {
    afterOrEqual,
    dateFormat,
    decimal,
    exists,
    integer,
    isEmpty,
    isIsoDate,
    list,
    object,
    regex,
    required,
    string,
    url,
    validate,
    type Rule,
    type Schema,
} from '@/backend/validation';
import type { TicketPayload } from '@/types/models';

export const TICKET_ATTRIBUTES: Record<string, string> = {
    title: 'titre',
    description: 'description',
    status_code: 'statut',
    epic_id: 'type',
    project_id: 'projet',
    requester_id: 'demandeur',
    owner_id: 'propriétaire',
    supporter_ids: 'contributeurs',
    data_processing_code: 'traitement de données',
    work_folder_url: 'dossier de travail',
    start_date: 'date de début',
    due_date: 'date de fin prévisionnelle',
    actual_end_date: 'date de fin réelle',
    time_spent: 'temps consommé',
};

export const MESSAGES = {
    backlog: 'Seuls les administrateurs et les lead techs peuvent placer un ticket dans le backlog.',
    dataProcessingCode: 'Le traitement de données doit contenir exactement 5 caractères alphanumériques.',
    dueAfterStart: 'La date de fin prévisionnelle doit être postérieure ou égale à la date de début.',
};

/** Rules of every ticket field (without required / sometimes). */
export function ticketFieldRules(db: Database): Record<string, Rule[]> {
    const activeUser = (id: number) => db.users.get(id)?.is_active === true;

    return {
        title: [string(255)],
        description: [string(1_000_000)],
        status_code: [
            string(),
            ({ value, attribute }) =>
                statusExists(value) ? null : `La valeur du champ ${attribute} est invalide ou inactive.`,
        ],
        epic_id: [integer, exists((id) => db.epics.get(id)?.is_active === true)],
        project_id: [integer, exists((id) => db.projects.get(id)?.is_active === true)],
        requester_id: [integer, exists((id) => db.requesters.get(id)?.is_active === true)],
        owner_id: [integer, exists(activeUser)],
        supporter_ids: [list(50, [integer, exists(activeUser)])],
        data_processing_code: [string(), regex(/^[A-Za-z0-9]{5}$/, MESSAGES.dataProcessingCode)],
        work_folder_url: [string(2048), url],
        start_date: [dateFormat],
        due_date: [dateFormat],
        actual_end_date: [dateFormat],
        time_spent: [decimal(3, 0, 9999.999)],
        custom_fields: [object],
    };
}

/** Upper-case and trim the data processing code (prepareForValidation). */
export function normalizeTicketInput<T extends { data_processing_code?: string | null }>(payload: T): T {
    if (!isEmpty(payload.data_processing_code)) {
        return { ...payload, data_processing_code: String(payload.data_processing_code).trim().toUpperCase() };
    }

    return payload;
}

/**
 * Check the custom field values against the fields applicable to the type.
 *
 * @param requireMissing  a required field absent from the input is an error
 */
export function validateCustomFields(
    db: Database,
    values: Record<string, unknown>,
    epicId: number | null,
    requireMissing: boolean,
): FieldErrors {
    const errors: FieldErrors = {};
    const fields = db.customFields
        .all()
        .filter((field) => field.is_active && (field.epic_id === null || field.epic_id === epicId));

    for (const fieldId of Object.keys(values)) {
        if (!fields.some((field) => field.id === Number(fieldId))) {
            errors[`custom_fields.${fieldId}`] = ["Ce champ personnalisé ne s'applique pas à ce type de ticket."];
        }
    }

    for (const field of fields) {
        const key = `custom_fields.${field.id}`;
        const value = values[field.id];

        if (isEmpty(value)) {
            if (field.is_required && (requireMissing || String(field.id) in values)) {
                errors[key] = [`Le champ « ${field.label} » est obligatoire.`];
            }
            continue;
        }

        let message: string | null = null;
        if (field.field_type === 'date' && !isIsoDate(value)) message = 'doit respecter le format Y-m-d.';
        if (field.field_type === 'short_text' && (typeof value !== 'string' || value.length > 255)) {
            message = 'ne peut dépasser 255 caractères.';
        }
        if (field.field_type === 'long_text' && (typeof value !== 'string' || value.length > 1_000_000)) {
            message = 'ne peut dépasser 1000000 caractères.';
        }

        if (message) errors[key] = [`${field.label} : le champ ${message}`];
    }

    return errors;
}

/** Validation of a creation (StoreTicketRequest). */
export function validateNewTicket(db: Database, input: TicketPayload, actor: Actor): FieldErrors {
    const rules = ticketFieldRules(db);
    const schema: Schema = { ...rules };

    for (const field of ['title', 'epic_id', 'requester_id']) schema[field] = [required, ...rules[field]];
    schema.due_date = [
        ...rules.due_date,
        afterOrEqual((data) => data.start_date as string | null, MESSAGES.dueAfterStart),
    ];

    const errors = validate(input as Record<string, unknown>, schema, TICKET_ATTRIBUTES);

    if (Object.keys(errors).length === 0) {
        Object.assign(errors, validateCustomFields(db, input.custom_fields ?? {}, input.epic_id ?? null, true));
    }

    if (input.status_code === BACKLOG && !actor.can('backlog.manage')) errors.status_code = [MESSAGES.backlog];

    return errors;
}

/** Validation of a partial update (UpdateTicketRequest). */
export function validateTicketUpdate(
    db: Database,
    input: TicketPayload,
    current: { start_date: string | null; epic_id: number },
): FieldErrors {
    const rules = ticketFieldRules(db);
    const schema: Schema = {};

    for (const [field, fieldRules] of Object.entries(rules)) {
        const isRequired = ['title', 'epic_id', 'requester_id', 'owner_id', 'status_code'].includes(field);
        schema[field] = { rules: isRequired ? [required, ...fieldRules] : fieldRules, sometimes: true };
    }

    const startDate = 'start_date' in input ? input.start_date : current.start_date;
    schema.due_date = {
        rules: [...rules.due_date, afterOrEqual(() => startDate, MESSAGES.dueAfterStart)],
        sometimes: true,
    };

    const errors = validate(input as Record<string, unknown>, schema, TICKET_ATTRIBUTES);

    if (Object.keys(errors).length === 0 && 'custom_fields' in input) {
        const epicId = 'epic_id' in input ? (input.epic_id ?? null) : current.epic_id;
        Object.assign(errors, validateCustomFields(db, input.custom_fields ?? {}, epicId, false));
    }

    return errors;
}

/** Validated payload, typed for the TicketService. */
export function toTicketData(input: TicketPayload): TicketData {
    const data: TicketData = {};
    const numeric = (value: unknown) => (isEmpty(value) ? null : Number(value));

    for (const [key, value] of Object.entries(input)) {
        if (value === undefined) continue;

        switch (key) {
            case 'epic_id':
            case 'requester_id':
                data[key] = Number(value);
                break;
            case 'project_id':
            case 'owner_id':
            case 'time_spent':
                data[key] = numeric(value);
                break;
            case 'supporter_ids':
                data.supporter_ids = ((value as unknown[] | null) ?? []).map(Number);
                break;
            case 'custom_fields':
                data.custom_fields = (value as Record<string, string | null> | null) ?? {};
                break;
            default:
                (data as Record<string, unknown>)[key] = isEmpty(value) ? null : value;
        }
    }

    return data;
}
