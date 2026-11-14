/**
 * Administration (port of the controllers of App\Http\Controllers\Api\V1\Admin).
 */
import { backend, type Backend } from '@/backend/Backend';
import type { Collection } from '@/backend/collection';
import { nowIso, todayIso } from '@/backend/clock';
import { fieldError, forbidden, notFound } from '@/backend/errors';
import { nextSequentialId } from '@/backend/ids';
import { BACKLOG, type Actor } from '@/backend/permissions';
import type {
    CustomFieldRecord,
    EpicRecord,
    ProjectRecord,
    RequesterRecord,
    TicketRecord,
    UserRecord,
} from '@/backend/records';
import {
    CUSTOM_FIELD_TYPE_LABELS,
    isFinalStatus,
    LOGIN_FORMAT_MESSAGE,
    LOGIN_PATTERN,
    ROLE_OPTIONS,
    statusExists,
} from '@/backend/reference';
import {
    toCustomField,
    toEpic,
    toProject,
    toRecurringTicket,
    toRequester,
    toTicketCard,
    toUser,
} from '@/backend/serializers';
import { FREQUENCIES, LAST, RecurrenceRule } from '@/backend/services/RecurrenceRule';
import type { RecurringTicketData } from '@/backend/services/RecurringTicketService';
import {
    afterOrEqual,
    assertValid,
    between,
    boolean,
    dateFormat,
    email,
    exists,
    hexColor,
    integer,
    isEmpty,
    list,
    oneOf,
    regex,
    required,
    string,
    unique,
    validate,
    type Schema,
} from '@/backend/validation';
import type {
    CustomField,
    Epic,
    Permission,
    Project,
    RecurrencePreview,
    RecurringTicket,
    RecurringTicketPayload,
    Requester,
    RoleCode,
    Schedule,
    TicketCard,
    User,
} from '@/types/models';
import { normalizeLogin } from './auth';
import { call } from './call';
import {
    MESSAGES,
    normalizeTicketInput,
    ticketFieldRules,
    TICKET_ATTRIBUTES,
    validateCustomFields,
} from './ticketRules';

const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' });

/** Signed-in user holding the permission, or a 403 error. */
function authorize(permission: Permission): { server: Backend; actor: Actor } {
    const server = backend();
    const actor = server.actor();
    if (!actor.can(permission)) throw forbidden();

    return { server, actor };
}

function isTaken<T extends { id: number }>(collection: Collection<T>, key: (item: T) => string, ignoreId?: number) {
    return (value: string) =>
        collection.all().some((item) => item.id !== ignoreId && key(item).toLowerCase() === value.toLowerCase());
}

function bool(value: unknown, fallback = true): boolean {
    return value === undefined ? fallback : Boolean(value);
}

/** Tickets (deleted ones included) using a record: such a record is only deactivated. */
/**
 * Why a ticket type, a project or a requester cannot be deleted, null when
 * nothing uses it. The deleted tickets count too (they can be restored), so
 * the message says how many and how to get rid of them.
 *
 * @param subject "Ce type", "Ce projet"...
 */
function usageMessage(
    server: Backend,
    subject: string,
    uses: (record: Pick<TicketRecord, 'epic_id' | 'project_id' | 'requester_id'>) => boolean,
    others: [count: number, singular: string, plural: string][] = [],
): string | null {
    const tickets = server.db.tickets.all().filter(uses);
    const deleted = tickets.filter((ticket) => ticket.deleted_at !== null).length;
    const active = tickets.length - deleted;
    const parts = (
        [
            [active, 'ticket', 'tickets'],
            [deleted, 'ticket supprimé', 'tickets supprimés'],
            [server.db.recurringTickets.all().filter(uses).length, 'ticket récurrent', 'tickets récurrents'],
            ...others,
        ] as [number, string, string][]
    )
        .filter(([count]) => count > 0)
        .map(([count, singular, plural]) => `${count} ${count > 1 ? plural : singular}`);

    if (parts.length === 0) return null;

    const advice =
        active === 0 && deleted > 0
            ? 'purgez les tickets supprimés (Gestion des données) ou désactivez-le plutôt que de le supprimer.'
            : 'désactivez-le plutôt que de le supprimer.';

    return `${subject} est encore utilisé par ${parts.join(', ')} : ${advice}`;
}

function countTickets(server: Backend, predicate: (ticket: TicketRecord) => boolean): number {
    return server.db.activeTickets().filter(predicate).length;
}

async function saveRecord<T extends { id: number; created_at: string; updated_at: string }>(
    collection: Collection<T>,
    id: number | null,
    values: Omit<T, 'id' | 'created_at' | 'updated_at'>,
): Promise<T> {
    await collection.sync();
    const timestamp = nowIso();

    if (id === null) {
        return collection.save({
            ...values,
            id: nextSequentialId(collection.all()),
            created_at: timestamp,
            updated_at: timestamp,
        } as T);
    }

    const updated = await collection.mutate(id, (record) => Object.assign(record, values, { updated_at: timestamp }));
    if (!updated) throw notFound();

    return updated;
}

// Users -------------------------------------------------------------------------

export interface UserPayload {
    login: string;
    first_name: string;
    last_name: string | null;
    email: string | null;
    role: string;
    is_active: boolean;
}

async function saveUser(id: number | null, payload: UserPayload): Promise<User> {
    const { server, actor } = authorize('admin.users');
    const input = {
        ...payload,
        login: normalizeLogin(String(payload.login ?? '')),
    };

    assertValid(
        validate(
            input as unknown as Record<string, unknown>,
            {
                login: [
                    required,
                    string(32),
                    regex(LOGIN_PATTERN, LOGIN_FORMAT_MESSAGE),
                    unique(isTaken(server.db.users, (user) => user.login, id ?? undefined)),
                ],
                first_name: [required, string(100)],
                last_name: [string(100)],
                email: [email, string(255)],
                role: [required, oneOf(ROLE_OPTIONS.map((option) => option.value))],
                is_active: [boolean],
            },
            { login: 'matricule', first_name: 'prénom', last_name: 'nom', role: 'profil' },
        ),
    );

    // An administrator cannot deactivate himself nor remove his own profile,
    // otherwise the application could end up without any administrator.
    if (id === actor.id && (!bool(input.is_active) || input.role !== actor.user.role)) {
        throw fieldError('role', 'Vous ne pouvez pas modifier votre propre profil ni vous désactiver.');
    }

    const user = await saveRecord<UserRecord>(server.db.users, id, {
        login: input.login,
        first_name: input.first_name.trim(),
        last_name: isEmpty(input.last_name) ? null : String(input.last_name).trim(),
        email: isEmpty(input.email) ? null : String(input.email).trim(),
        role: input.role as RoleCode,
        is_active: bool(input.is_active),
        last_login_at: id !== null ? (server.db.users.get(id)?.last_login_at ?? null) : null,
    });

    return toUser(user);
}

// Ticket types ------------------------------------------------------------------

async function saveEpic(id: number | null, payload: Partial<Epic>): Promise<Epic> {
    const { server } = authorize('admin.epics');
    const input = {
        ...payload,
        code: String(payload.code ?? '')
            .trim()
            .toUpperCase(),
    };

    assertValid(
        validate(
            input,
            {
                code: [
                    required,
                    string(20),
                    regex(
                        /^[A-Z0-9_]+$/,
                        "L'identifiant ne peut contenir que des lettres majuscules sans accent, des chiffres et _ (il sert à numéroter les tickets : ETUDE-12).",
                    ),
                    unique(isTaken(server.db.epics, (epic) => epic.code, id ?? undefined)),
                ],
                title: [required, string(150)],
                color: [required, hexColor],
                is_active: [boolean],
            },
            { code: 'identifiant', title: 'titre', color: 'couleur' },
        ),
    );

    const epic = await saveRecord<EpicRecord>(server.db.epics, id, {
        code: input.code,
        title: String(input.title).trim(),
        color: String(input.color),
        is_active: bool(input.is_active),
    });

    return toEpic(
        epic,
        countTickets(server, (ticket) => ticket.epic_id === epic.id),
    );
}

// Projects ----------------------------------------------------------------------

async function saveProject(id: number | null, payload: Partial<Project>): Promise<Project> {
    const { server } = authorize('admin.projects');

    assertValid(
        validate(
            payload,
            {
                name: [
                    required,
                    string(150),
                    unique(isTaken(server.db.projects, (project) => project.name, id ?? undefined)),
                ],
                description: [string(500)],
                color: [required, hexColor],
                is_active: [boolean],
            },
            { name: 'nom', description: 'description', color: 'couleur' },
        ),
    );

    const project = await saveRecord<ProjectRecord>(server.db.projects, id, {
        name: String(payload.name).trim(),
        description: isEmpty(payload.description) ? null : String(payload.description),
        color: String(payload.color),
        is_active: bool(payload.is_active),
    });

    return toProject(
        project,
        countTickets(server, (ticket) => ticket.project_id === project.id),
    );
}

// Requesters --------------------------------------------------------------------

function requesterWithStatistics(server: Backend, requester: RequesterRecord): Requester {
    const tickets = server.db.activeTickets().filter((ticket) => ticket.requester_id === requester.id);

    return toRequester(requester, tickets, (ticket) => isFinalStatus(ticket.status_code));
}

async function saveRequester(id: number | null, payload: Partial<Requester>): Promise<Requester> {
    const { server } = authorize('admin.requesters');

    assertValid(
        validate(
            payload,
            {
                name: [
                    required,
                    string(150),
                    unique(isTaken(server.db.requesters, (item) => item.name, id ?? undefined)),
                ],
                color: [required, hexColor],
                is_active: [boolean],
            },
            { name: 'nom', color: 'couleur' },
        ),
    );

    const requester = await saveRecord<RequesterRecord>(server.db.requesters, id, {
        name: String(payload.name).trim(),
        color: String(payload.color),
        is_active: bool(payload.is_active),
    });

    return requesterWithStatistics(server, requester);
}

// Custom fields -----------------------------------------------------------------

async function saveCustomField(id: number | null, payload: Partial<CustomField>): Promise<CustomField> {
    const { server } = authorize('admin.custom_fields');
    const input = {
        ...payload,
        code: String(payload.code ?? '')
            .trim()
            .toLowerCase(),
    };
    const schema: Schema = {
        code: [
            required,
            string(50),
            regex(/^[a-z][a-z0-9_]*$/),
            unique(isTaken(server.db.customFields, (field) => field.code, id ?? undefined)),
        ],
        label: [required, string(150)],
        epic_id: [integer, exists((epicId) => server.db.epics.has(epicId))],
        help_text: [string(255)],
        is_required: [boolean],
        is_active: [boolean],
        position: [integer, between(0, 9999)],
    };

    // The type cannot change once values may have been entered.
    if (id === null) schema.field_type = [required, oneOf(Object.keys(CUSTOM_FIELD_TYPE_LABELS))];

    assertValid(
        validate(input, schema, {
            code: 'identifiant',
            label: 'libellé',
            field_type: 'type',
            epic_id: 'epic',
            help_text: 'aide',
        }),
    );

    const existing = id !== null ? server.db.customFields.get(id) : undefined;
    const field = await saveRecord<CustomFieldRecord>(server.db.customFields, id, {
        code: input.code,
        label: String(input.label).trim(),
        field_type: existing?.field_type ?? (input.field_type as CustomFieldRecord['field_type']),
        epic_id: isEmpty(input.epic_id) ? null : Number(input.epic_id),
        help_text: isEmpty(input.help_text) ? null : String(input.help_text),
        is_required: bool(input.is_required, false),
        is_active: bool(input.is_active),
        position: isEmpty(input.position) ? 0 : Number(input.position),
    });

    return toCustomField(field);
}

// Recurring tickets -------------------------------------------------------------

const RECURRENCE_ATTRIBUTES: Record<string, string> = {
    'schedule.frequency': 'fréquence',
    'schedule.interval': 'intervalle',
    'schedule.weekdays': 'jours de la semaine',
    'schedule.month_day': 'jour du mois',
    'schedule.week_of_month': 'semaine du mois',
    'schedule.weekday': 'jour de la semaine',
    'schedule.month': 'mois',
    starts_on: 'date de début de la récurrence',
    ends_on: 'date de fin de la récurrence',
};

/** Validation of a recurrence rule (port of RecurrenceRules). */
function validateRecurrence(schedule: Partial<Schedule> | undefined, startsOn: unknown, endsOn: unknown) {
    const values = schedule ?? {};
    const flat: Record<string, unknown> = { starts_on: startsOn, ends_on: endsOn };
    Object.entries(values).forEach(([key, value]) => (flat[`schedule.${key}`] = value));

    const days = Array.from({ length: 31 }, (_, index) => index + 1);
    const errors = validate(
        flat,
        {
            'schedule.frequency': [required, oneOf(FREQUENCIES)],
            'schedule.interval': [required, integer, between(1, 365)],
            'schedule.weekdays': [list(7, [integer, between(1, 7)])],
            'schedule.monthly_mode': [oneOf(['day', 'weekday'])],
            'schedule.month_day': [integer, oneOf([LAST, ...days])],
            'schedule.week_of_month': [integer, oneOf([LAST, 1, 2, 3, 4])],
            'schedule.weekday': [integer, between(1, 7)],
            'schedule.month': [integer, between(1, 12)],
            starts_on: [required, dateFormat],
            ends_on: [dateFormat, afterOrEqual((input) => input.starts_on as string)],
        },
        RECURRENCE_ATTRIBUTES,
    );

    const frequency = values.frequency;
    const byDayOfMonth = frequency === 'monthly' || frequency === 'yearly';
    const mode = values.monthly_mode ?? 'day';

    if (frequency === 'weekly' && !values.weekdays?.length) {
        errors['schedule.weekdays'] = ['Choisissez au moins un jour de la semaine.'];
    }
    if (byDayOfMonth && mode === 'day' && isEmpty(values.month_day)) {
        errors['schedule.month_day'] = ['Choisissez le jour du mois.'];
    }
    if (byDayOfMonth && mode === 'weekday' && (isEmpty(values.week_of_month) || isEmpty(values.weekday))) {
        errors['schedule.weekday'] = ['Choisissez la semaine et le jour (ex. : premier lundi).'];
    }
    if (frequency === 'yearly' && isEmpty(values.month)) errors['schedule.month'] = ['Choisissez le mois.'];

    return errors;
}

async function saveRecurringTicket(id: number | null, payload: RecurringTicketPayload): Promise<RecurringTicket> {
    const { server, actor } = authorize('admin.recurring_tickets');
    const input = normalizeTicketInput(payload);
    const rules = ticketFieldRules(server.db);

    const errors = validate(
        input as unknown as Record<string, unknown>,
        {
            title: [required, ...rules.title],
            description: rules.description,
            // A recurring ticket never starts closed.
            status_code: [
                required,
                ({ value, attribute }) =>
                    statusExists(value) && !isFinalStatus(String(value))
                        ? null
                        : `La valeur du champ ${attribute} est invalide ou inactive.`,
            ],
            epic_id: [required, ...rules.epic_id],
            project_id: rules.project_id,
            requester_id: [required, ...rules.requester_id],
            owner_id: [required, ...rules.owner_id],
            supporter_ids: rules.supporter_ids,
            data_processing_code: rules.data_processing_code,
            work_folder_url: rules.work_folder_url,
            custom_fields: rules.custom_fields,
            time_spent: rules.time_spent,
            start_offset_days: [integer, between(-365, 3650)],
            due_offset_days: [integer, between(-365, 3650)],
            is_active: [boolean],
        },
        {
            ...TICKET_ATTRIBUTES,
            status_code: 'statut à la création',
            start_offset_days: 'début (jours après la création)',
            due_offset_days: 'fin prévisionnelle (jours après la création)',
        },
    );

    Object.assign(errors, validateRecurrence(input.schedule, input.starts_on, input.ends_on));

    const start = input.start_offset_days;
    const due = input.due_offset_days;
    if (!isEmpty(start) && !isEmpty(due) && Number(due) < Number(start)) {
        errors.due_offset_days = ['La fin prévisionnelle doit tomber le même jour ou après le début.'];
    }

    if (input.status_code === BACKLOG && !actor.can('backlog.manage')) errors.status_code = [MESSAGES.backlog];

    if (Object.keys(errors).length === 0) {
        Object.assign(errors, validateCustomFields(server.db, input.custom_fields ?? {}, Number(input.epic_id), true));
    }

    assertValid(errors);

    const number = (value: unknown) => (isEmpty(value) ? null : Number(value));
    const data: RecurringTicketData = {
        title: input.title.trim(),
        description: isEmpty(input.description) ? null : input.description,
        status_code: input.status_code,
        epic_id: Number(input.epic_id),
        project_id: number(input.project_id),
        requester_id: Number(input.requester_id),
        owner_id: Number(input.owner_id),
        supporter_ids: (input.supporter_ids ?? []).map(Number),
        data_processing_code: isEmpty(input.data_processing_code) ? null : input.data_processing_code,
        work_folder_url: isEmpty(input.work_folder_url) ? null : input.work_folder_url,
        custom_fields: input.custom_fields ?? {},
        time_spent: number(input.time_spent),
        start_offset_days: number(input.start_offset_days),
        due_offset_days: number(input.due_offset_days),
        schedule: input.schedule,
        starts_on: input.starts_on,
        ends_on: isEmpty(input.ends_on) ? null : input.ends_on,
        is_active: bool(input.is_active),
    };

    const template = await server.recurring.save(id, data, actor);

    return toRecurringTicket(
        template,
        server.recurring,
        countTickets(server, (ticket) => ticket.recurring_ticket_id === template.id),
    );
}

// API -----------------------------------------------------------------------------

/** Remove a reference record that no ticket uses. */
async function removeUnused<T extends { id: number }>(
    collection: Collection<T>,
    id: number,
    field: string,
    message: string | null,
): Promise<void> {
    if (!collection.has(id)) throw notFound();
    if (message) throw fieldError(field, message);

    await collection.remove(id);
}

export const adminApi = {
    users: {
        list: (): Promise<User[]> =>
            call(async () => {
                const { server } = authorize('admin.users');
                await server.db.users.sync();

                return server.db.users
                    .all()
                    .sort((a, b) => byName(a.first_name, b.first_name) || byName(a.last_name ?? '', b.last_name ?? ''))
                    .map(toUser);
            }),
        create: (payload: UserPayload) => call(() => saveUser(null, payload)),
        update: (id: number, payload: UserPayload) => call(() => saveUser(id, payload)),
        /** Users own tickets and history: they are deactivated, never deleted. */
        remove: (): Promise<void> => call(() => Promise.reject(forbidden())),
    },

    epics: {
        list: (): Promise<Epic[]> =>
            call(() => {
                const { server } = authorize('admin.epics');

                return server.db.epics
                    .all()
                    .sort((a, b) => byName(a.title, b.title))
                    .map((epic) =>
                        toEpic(
                            epic,
                            countTickets(server, (ticket) => ticket.epic_id === epic.id),
                        ),
                    );
            }),
        create: (payload: Partial<Epic>) => call(() => saveEpic(null, payload)),
        update: (id: number, payload: Partial<Epic>) => call(() => saveEpic(id, payload)),
        remove: (id: number): Promise<void> =>
            call(() => {
                const { server } = authorize('admin.epics');

                // A ticket that left this type long ago (previous number) does not
                // prevent the deletion: its history then shows "type supprimé".
                const fields = server.db.customFields.all().filter((field) => field.epic_id === id).length;

                return removeUnused(
                    server.db.epics,
                    id,
                    'epic',
                    usageMessage(server, 'Ce type', (record) => record.epic_id === id, [
                        [fields, 'champ personnalisé', 'champs personnalisés'],
                    ]),
                );
            }),
    },

    requesters: {
        list: (): Promise<Requester[]> =>
            call(() => {
                const { server } = authorize('admin.requesters');

                return server.db.requesters
                    .all()
                    .sort((a, b) => byName(a.name, b.name))
                    .map((requester) => requesterWithStatistics(server, requester));
            }),
        create: (payload: Partial<Requester>) => call(() => saveRequester(null, payload)),
        update: (id: number, payload: Partial<Requester>) => call(() => saveRequester(id, payload)),
        remove: (id: number): Promise<void> =>
            call(() => {
                const { server } = authorize('admin.requesters');

                return removeUnused(
                    server.db.requesters,
                    id,
                    'requester',
                    usageMessage(server, 'Ce demandeur', (record) => record.requester_id === id),
                );
            }),
    },

    customFields: {
        list: (): Promise<CustomField[]> =>
            call(() => {
                const { server } = authorize('admin.custom_fields');

                return server.db.customFields
                    .all()
                    .sort((a, b) => a.position - b.position || byName(a.label, b.label))
                    .map(toCustomField);
            }),
        create: (payload: Partial<CustomField>) => call(() => saveCustomField(null, payload)),
        update: (id: number, payload: Partial<CustomField>) => call(() => saveCustomField(id, payload)),
        remove: (id: number): Promise<void> =>
            call(() => {
                const { server } = authorize('admin.custom_fields');

                return removeUnused(
                    server.db.customFields,
                    id,
                    'custom_field',
                    server.db.tickets.all().some((ticket) => String(id) in ticket.custom_fields)
                        ? 'Ce champ contient des valeurs : désactivez-le plutôt que de le supprimer.'
                        : null,
                );
            }),
    },

    projects: {
        list: (): Promise<Project[]> =>
            call(() => {
                const { server } = authorize('admin.projects');

                return server.db.projects
                    .all()
                    .sort((a, b) => byName(a.name, b.name))
                    .map((project) =>
                        toProject(
                            project,
                            countTickets(server, (ticket) => ticket.project_id === project.id),
                        ),
                    );
            }),
        create: (payload: Partial<Project>) => call(() => saveProject(null, payload)),
        update: (id: number, payload: Partial<Project>) => call(() => saveProject(id, payload)),
        remove: (id: number): Promise<void> =>
            call(() => {
                const { server } = authorize('admin.projects');

                return removeUnused(
                    server.db.projects,
                    id,
                    'project',
                    usageMessage(server, 'Ce projet', (record) => record.project_id === id),
                );
            }),
    },

    recurringTickets: {
        list: (): Promise<RecurringTicket[]> =>
            call(async () => {
                const { server } = authorize('admin.recurring_tickets');
                await server.db.recurringTickets.sync();

                return server.db.recurringTickets
                    .all()
                    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || byName(a.title, b.title))
                    .map((template) =>
                        toRecurringTicket(
                            template,
                            server.recurring,
                            countTickets(server, (ticket) => ticket.recurring_ticket_id === template.id),
                        ),
                    );
            }),
        create: (payload: RecurringTicketPayload) => call(() => saveRecurringTicket(null, payload)),
        update: (id: number, payload: RecurringTicketPayload) => call(() => saveRecurringTicket(id, payload)),
        /** Delete a template. The tickets already created are kept. */
        remove: (id: number): Promise<void> =>
            call(() => authorize('admin.recurring_tickets').server.recurring.remove(id)),

        /** Human readable rule and next creation dates. */
        preview: (schedule: Schedule, startsOn: string, endsOn: string | null): Promise<RecurrencePreview> =>
            call(() => {
                const { server } = authorize('admin.recurring_tickets');
                assertValid(validateRecurrence(schedule, startsOn, endsOn));

                const rule = new RecurrenceRule(schedule);

                return {
                    label: rule.describe(startsOn),
                    next_occurrences: server.recurring.preview(rule, startsOn, endsOn),
                };
            }),

        /** Create a ticket from the template right now, without changing the planned creations. */
        run: (id: number): Promise<TicketCard> =>
            call(async () => {
                const { server, actor } = authorize('admin.recurring_tickets');
                const template = await server.db.recurringTickets.fresh(id);
                if (!template) throw notFound();

                const ticket = await server.recurring.createTicket(template, todayIso(), actor);

                return toTicketCard(ticket, new Map(server.db.epics.all().map((epic) => [epic.id, epic])));
            }),
    },
};
