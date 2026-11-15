<script setup lang="ts">
/**
 * Recurring tickets: ticket templates created automatically according to a
 * schedule (every N days / weeks / months / years, on given days...).
 *
 * Every field of the template is copied into the created ticket. The start
 * and planned end dates are expressed as a number of days after the
 * creation date.
 */
import { computed, ref, watch } from 'vue';
import { adminApi } from '@/api/admin';
import { errorMessage } from '@/api/errors';
import PageHeader from '@/components/layout/PageHeader.vue';
import MarkdownEditor from '@/components/markdown/MarkdownEditor.vue';
import CustomFieldInput from '@/components/tickets/CustomFieldInput.vue';
import TimeSpentInput from '@/components/tickets/TimeSpentInput.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import ColorBadge from '@/components/ui/ColorBadge.vue';
import MultiSelect from '@/components/ui/MultiSelect.vue';
import { useAdminResource } from '@/composables/useAdminResource';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { Frequency, RecurrencePreview, RecurringTicket, RecurringTicketPayload, Schedule } from '@/types/models';
import { formatDate, toIsoDate, today } from '@/utils/dates';

const reference = useReferenceStore();
const auth = useAuthStore();
const ui = useUiStore();

const WEEKDAYS = [
    { value: 1, short: 'Lun', label: 'lundi' },
    { value: 2, short: 'Mar', label: 'mardi' },
    { value: 3, short: 'Mer', label: 'mercredi' },
    { value: 4, short: 'Jeu', label: 'jeudi' },
    { value: 5, short: 'Ven', label: 'vendredi' },
    { value: 6, short: 'Sam', label: 'samedi' },
    { value: 7, short: 'Dim', label: 'dimanche' },
];
const MONTHS = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
].map((label, index) => ({ value: index + 1, label }));
const FREQUENCIES: { value: Frequency; label: string; unit: string }[] = [
    { value: 'daily', label: 'Jour', unit: 'jour(s)' },
    { value: 'weekly', label: 'Semaine', unit: 'semaine(s)' },
    { value: 'monthly', label: 'Mois', unit: 'mois' },
    { value: 'yearly', label: 'Année', unit: 'an(s)' },
];
const MONTH_DAYS = [
    ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: i === 0 ? '1er' : String(i + 1) })),
    { value: -1, label: 'Dernier jour du mois' },
];
const ORDINALS = [
    { value: 1, label: 'Premier' },
    { value: 2, label: 'Deuxième' },
    { value: 3, label: 'Troisième' },
    { value: 4, label: 'Quatrième' },
    { value: -1, label: 'Dernier' },
];
const PLACEHOLDERS = ['{date}', '{jour}', '{mois}', '{mois_num}', '{annee}', '{semaine}', '{trimestre}'];

function defaultSchedule(): Schedule {
    return {
        frequency: 'monthly',
        interval: 1,
        weekdays: [1],
        monthly_mode: 'day',
        month_day: 1,
        week_of_month: 1,
        weekday: 1,
        month: 1,
    };
}

function empty(): RecurringTicketPayload {
    return {
        title: '',
        description: '',
        status_code: 'todo',
        epic_id: null,
        project_id: null,
        requester_id: null,
        owner_id: auth.user?.id ?? null,
        supporter_ids: [],
        data_processing_code: '',
        work_folder_url: '',
        custom_fields: {},
        time_spent: null,
        start_offset_days: 0,
        due_offset_days: 7,
        schedule: defaultSchedule(),
        starts_on: toIsoDate(today()),
        ends_on: null,
        is_active: true,
    };
}

const { items, loading, load, dialogOpen, editing, form, errors, saving, openCreate, openEdit, submit, remove } =
    useAdminResource<RecurringTicket, RecurringTicketPayload>(adminApi.recurringTickets, empty);

function edit(template: RecurringTicket): void {
    openEdit(template, (t) => ({
        title: t.title,
        description: t.description ?? '',
        status_code: t.status_code,
        epic_id: t.epic_id,
        project_id: t.project_id,
        requester_id: t.requester_id,
        owner_id: t.owner_id,
        supporter_ids: [...(t.supporter_ids ?? [])],
        data_processing_code: t.data_processing_code ?? '',
        work_folder_url: t.work_folder_url ?? '',
        custom_fields: { ...t.custom_fields },
        time_spent: t.time_spent,
        start_offset_days: t.start_offset_days,
        due_offset_days: t.due_offset_days,
        // Fields not used by the frequency are kept with a sensible value so
        // that switching frequency in the form stays pleasant.
        schedule: { ...defaultSchedule(), ...stripNulls(t.schedule) },
        starts_on: t.starts_on,
        ends_on: t.ends_on,
        is_active: t.is_active,
    }));
}

function stripNulls(schedule: Schedule): Partial<Schedule> {
    return Object.fromEntries(Object.entries(schedule).filter(([, value]) => value !== null)) as Partial<Schedule>;
}

// --- Options ------------------------------------------------------------

const epicOptions = computed(() =>
    reference.epics
        .filter((epic) => epic.is_active || epic.id === form.value.epic_id)
        .map((epic) => ({ value: epic.id, label: epic.title, color: epic.color, hint: epic.code })),
);
const projectOptions = computed(() =>
    reference.projects
        .filter((project) => project.is_active || project.id === form.value.project_id)
        .map((project) => ({ value: project.id, label: project.name, color: project.color })),
);
const requesterOptions = computed(() =>
    reference.requesters
        .filter((requester) => requester.is_active || requester.id === form.value.requester_id)
        .map((requester) => ({ value: requester.id, label: requester.name, color: requester.color })),
);
const userOptions = computed(() => reference.activeUsers.map((user) => ({ value: user.id, label: user.full_name })));
const statusOptions = computed(() =>
    reference.statuses
        .filter((status) => !status.is_final)
        .filter((status) => status.code !== 'backlog' || auth.can('backlog.manage'))
        .map((status) => ({ value: status.code, label: status.label })),
);
const frequencyOptions = FREQUENCIES.map(({ value, label }) => ({ value, label }));
const unit = computed(() => FREQUENCIES.find((f) => f.value === form.value.schedule.frequency)?.unit ?? '');

const customFields = computed(() => reference.fieldsForEpic(form.value.epic_id));

function toggleWeekday(day: number): void {
    const days = form.value.schedule.weekdays;
    form.value.schedule.weekdays = days.includes(day)
        ? days.filter((d) => d !== day)
        : [...days, day].sort((a, b) => a - b);
}

/** Offsets are kept as numbers; an empty input means "no date". */
function offsetModel(key: 'start_offset_days' | 'due_offset_days') {
    return computed({
        get: () => (form.value[key] === null ? '' : String(form.value[key])),
        set: (value: string) => {
            form.value[key] = value === '' ? null : Math.trunc(Number(value));
        },
    });
}
const startOffset = offsetModel('start_offset_days');
const dueOffset = offsetModel('due_offset_days');

// --- Payload ------------------------------------------------------------

/** Only the schedule fields that matter for the chosen frequency. */
function cleanSchedule(schedule: Schedule): Schedule {
    const base: Schedule = {
        frequency: schedule.frequency,
        interval: Math.max(1, Math.trunc(Number(schedule.interval) || 1)),
        weekdays: [],
        monthly_mode: 'day',
        month_day: null,
        week_of_month: null,
        weekday: null,
        month: null,
    };

    if (schedule.frequency === 'weekly') {
        base.weekdays = [...schedule.weekdays];
    } else if (schedule.frequency === 'monthly' || schedule.frequency === 'yearly') {
        base.monthly_mode = schedule.monthly_mode;
        if (schedule.monthly_mode === 'day') {
            base.month_day = schedule.month_day;
        } else {
            base.week_of_month = schedule.week_of_month;
            base.weekday = schedule.weekday;
        }
        if (schedule.frequency === 'yearly') base.month = schedule.month;
    }

    return base;
}

function payload(): RecurringTicketPayload {
    const f = form.value;

    return {
        ...f,
        title: f.title.trim(),
        description: f.description || null,
        data_processing_code: f.data_processing_code || null,
        work_folder_url: f.work_folder_url?.trim() || null,
        custom_fields: Object.fromEntries(
            customFields.value.map((field) => [field.id, f.custom_fields[field.id] || null]),
        ),
        schedule: cleanSchedule(f.schedule),
        ends_on: f.ends_on || null,
    };
}

function save(): void {
    void submit(payload());
}

// --- Live preview -------------------------------------------------------

const preview = ref<RecurrencePreview | null>(null);
const previewError = ref('');
let previewTimer: ReturnType<typeof setTimeout> | undefined;

watch(
    () => [
        dialogOpen.value,
        JSON.stringify(cleanSchedule(form.value.schedule)),
        form.value.starts_on,
        form.value.ends_on,
    ],
    () => {
        clearTimeout(previewTimer);
        if (!dialogOpen.value) return;

        previewTimer = setTimeout(async () => {
            if (!form.value.starts_on) return;

            try {
                preview.value = await adminApi.recurringTickets.preview(
                    cleanSchedule(form.value.schedule),
                    form.value.starts_on,
                    form.value.ends_on || null,
                );
                previewError.value = '';
            } catch {
                preview.value = null;
                previewError.value = 'Paramétrage incomplet.';
            }
        }, 300);
    },
);

/** Planned dates of the first ticket, to make the offsets concrete. */
const exampleDates = computed(() => {
    const first = preview.value?.next_occurrences[0];
    if (!first) return null;

    const shift = (days: number | null) => {
        if (days === null) return null;
        const date = new Date(`${first}T00:00:00`);
        date.setDate(date.getDate() + days);

        return toIsoDate(date);
    };

    return { created: first, start: shift(form.value.start_offset_days), due: shift(form.value.due_offset_days) };
});

const exampleText = computed(() => {
    const dates = exampleDates.value;
    if (!dates) return '';

    const parts = [`Exemple : ticket créé le ${formatDate(dates.created)}`];
    if (dates.start) parts.push(`début le ${formatDate(dates.start)}`);
    if (dates.due) parts.push(`fin prévue le ${formatDate(dates.due)}`);

    return `${parts.join(', ')}.`;
});

// --- Actions ------------------------------------------------------------

async function runNow(template: RecurringTicket): Promise<void> {
    const confirmed = await ui.confirm({
        title: 'Créer maintenant',
        message: `Créer dès maintenant un ticket à partir de « ${template.title} » ? Les créations planifiées ne changent pas.`,
        confirmLabel: 'Créer le ticket',
    });
    if (!confirmed) return;

    try {
        const ticket = await adminApi.recurringTickets.run(template.id);
        ui.notify(`Ticket ${ticket.reference} créé.`);
        ui.ticketsChanged();
        await load();
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    }
}

function epicOf(template: RecurringTicket) {
    return reference.epicMap.get(template.epic_id);
}
</script>

<template>
    <div class="page">
        <PageHeader title="Tickets récurrents" subtitle="Tickets créés automatiquement à intervalle régulier">
            <button class="btn btn-primary" type="button" @click="openCreate">
                <AppIcon name="plus" :size="16" />
                Nouveau ticket récurrent
            </button>
        </PageHeader>

        <div class="page-content">
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Ticket</th>
                            <th>Récurrence</th>
                            <th>Prochaine création</th>
                            <th>Créés</th>
                            <th>État</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="6" class="muted">Chargement…</td>
                        </tr>
                        <tr v-else-if="items.length === 0">
                            <td colspan="6" class="muted">
                                Aucun ticket récurrent. Créez-en un pour générer automatiquement les tickets réguliers
                                (clôtures mensuelles, rapports hebdomadaires…).
                            </td>
                        </tr>
                        <tr v-for="template in items" :key="template.id">
                            <td>
                                <div class="title-cell">
                                    <strong>{{ template.title }}</strong>
                                    <ColorBadge
                                        v-if="epicOf(template)"
                                        :color="epicOf(template)!.color"
                                        :label="epicOf(template)!.title"
                                    />
                                </div>
                            </td>
                            <td>{{ template.schedule_label }}</td>
                            <td>
                                <template v-if="template.is_active && template.next_run_on">
                                    {{ formatDate(template.next_run_on) }}
                                </template>
                                <span v-else class="muted">—</span>
                            </td>
                            <td>{{ template.tickets_count ?? 0 }}</td>
                            <td>
                                <span :class="['badge', template.is_active ? 'badge-success' : 'badge-muted']">
                                    {{ template.is_active ? 'Actif' : 'Suspendu' }}
                                </span>
                            </td>
                            <td class="actions">
                                <button class="btn btn-ghost btn-sm" type="button" @click="edit(template)">
                                    <AppIcon name="edit" :size="14" />
                                    Modifier
                                </button>
                                <button
                                    class="btn btn-ghost btn-sm"
                                    type="button"
                                    title="Créer un ticket maintenant"
                                    @click="runNow(template)"
                                >
                                    <AppIcon name="play" :size="14" />
                                </button>
                                <button
                                    class="btn btn-ghost btn-sm"
                                    type="button"
                                    title="Supprimer"
                                    @click="remove(template, template.title)"
                                >
                                    <AppIcon name="trash" :size="14" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="field-help page-help">
                Les tickets sont créés automatiquement par la tâche planifiée du serveur. Supprimer un ticket récurrent
                ne supprime pas les tickets déjà créés.
            </p>
        </div>

        <BaseModal
            :open="dialogOpen"
            :title="editing ? `Modifier « ${editing.title} »` : 'Nouveau ticket récurrent'"
            width="900px"
            @close="dialogOpen = false"
        >
            <form class="form-grid" novalidate @submit.prevent="save">
                <h3 class="section-title">
                    <AppIcon name="repeat" :size="16" />
                    Récurrence
                </h3>

                <div class="form-row">
                    <div class="field interval">
                        <label class="field-label" for="rt-interval">Tous les</label>
                        <div class="inline">
                            <input
                                id="rt-interval"
                                v-model.number="form.schedule.interval"
                                type="number"
                                min="1"
                                max="365"
                                class="input"
                                :class="{ 'has-error': errors['schedule.interval'] }"
                            />
                            <span class="muted">{{ unit }}</span>
                        </div>
                        <span v-if="errors['schedule.interval']" class="field-error">{{
                            errors['schedule.interval']
                        }}</span>
                    </div>
                    <div class="field">
                        <span class="field-label">Fréquence</span>
                        <div class="segmented">
                            <button
                                v-for="option in frequencyOptions"
                                :key="option.value"
                                type="button"
                                :class="{ active: form.schedule.frequency === option.value }"
                                @click="form.schedule.frequency = option.value"
                            >
                                {{ option.label }}
                            </button>
                        </div>
                    </div>
                </div>

                <div v-if="form.schedule.frequency === 'weekly'" class="field">
                    <span class="field-label">Les jours</span>
                    <div class="weekdays">
                        <button
                            v-for="day in WEEKDAYS"
                            :key="day.value"
                            type="button"
                            :class="{ active: form.schedule.weekdays.includes(day.value) }"
                            :title="day.label"
                            @click="toggleWeekday(day.value)"
                        >
                            {{ day.short }}
                        </button>
                    </div>
                    <span class="field-help">Aucun jour coché : le même jour de la semaine que la date de début.</span>
                    <span v-if="errors['schedule.weekdays']" class="field-error">{{
                        errors['schedule.weekdays']
                    }}</span>
                </div>

                <template v-if="form.schedule.frequency === 'monthly' || form.schedule.frequency === 'yearly'">
                    <div class="field">
                        <span class="field-label">Le</span>
                        <div class="monthly">
                            <label class="radio">
                                <input v-model="form.schedule.monthly_mode" type="radio" value="day" />
                                Jour
                            </label>
                            <div class="select-wrap">
                                <MultiSelect
                                    v-model="form.schedule.month_day"
                                    :options="MONTH_DAYS"
                                    :searchable="false"
                                    @update:model-value="form.schedule.monthly_mode = 'day'"
                                />
                            </div>
                        </div>
                        <div class="monthly">
                            <label class="radio">
                                <input v-model="form.schedule.monthly_mode" type="radio" value="weekday" />
                                Le
                            </label>
                            <div class="select-wrap">
                                <MultiSelect
                                    v-model="form.schedule.week_of_month"
                                    :options="ORDINALS"
                                    :searchable="false"
                                    @update:model-value="form.schedule.monthly_mode = 'weekday'"
                                />
                            </div>
                            <div class="select-wrap">
                                <MultiSelect
                                    v-model="form.schedule.weekday"
                                    :options="WEEKDAYS"
                                    :searchable="false"
                                    @update:model-value="form.schedule.monthly_mode = 'weekday'"
                                />
                            </div>
                            <span class="muted">du mois</span>
                        </div>
                        <span
                            v-if="
                                errors['schedule.month_day'] ||
                                errors['schedule.week_of_month'] ||
                                errors['schedule.weekday']
                            "
                            class="field-error"
                        >
                            {{
                                errors['schedule.month_day'] ||
                                errors['schedule.week_of_month'] ||
                                errors['schedule.weekday']
                            }}
                        </span>
                    </div>
                    <div v-if="form.schedule.frequency === 'yearly'" class="field month">
                        <span class="field-label">En</span>
                        <MultiSelect v-model="form.schedule.month" :options="MONTHS" :searchable="false" />
                    </div>
                </template>

                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="rt-starts">À partir du<span class="required">*</span></label>
                        <input
                            id="rt-starts"
                            v-model="form.starts_on"
                            type="date"
                            class="input"
                            :class="{ 'has-error': errors.starts_on }"
                        />
                        <span v-if="errors.starts_on" class="field-error">{{ errors.starts_on }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label" for="rt-ends">Jusqu'au</label>
                        <input
                            id="rt-ends"
                            v-model="form.ends_on"
                            type="date"
                            class="input"
                            :class="{ 'has-error': errors.ends_on }"
                        />
                        <span v-if="errors.ends_on" class="field-error">{{ errors.ends_on }}</span>
                        <span v-else class="field-help">Vide : sans fin.</span>
                    </div>
                </div>

                <div class="preview" aria-live="polite">
                    <template v-if="preview">
                        <strong>{{ preview.label }}</strong>
                        <span v-if="preview.next_occurrences.length" class="muted">
                            Prochaines créations :
                            {{ preview.next_occurrences.map((d) => formatDate(d)).join(' · ') }}
                        </span>
                        <span v-else class="muted">Aucune création à venir avec ce paramétrage.</span>
                    </template>
                    <span v-else-if="previewError" class="muted">{{ previewError }}</span>
                    <span v-else class="muted">Calcul de la récurrence…</span>
                </div>

                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="rt-start-offset">Date de début</label>
                        <div class="inline">
                            <input
                                id="rt-start-offset"
                                v-model="startOffset"
                                type="number"
                                min="-365"
                                max="3650"
                                class="input"
                                placeholder="—"
                                :class="{ 'has-error': errors.start_offset_days }"
                            />
                            <span class="muted">jour(s) après la création</span>
                        </div>
                        <span v-if="errors.start_offset_days" class="field-error">{{ errors.start_offset_days }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label" for="rt-due-offset">Fin prévisionnelle</label>
                        <div class="inline">
                            <input
                                id="rt-due-offset"
                                v-model="dueOffset"
                                type="number"
                                min="-365"
                                max="3650"
                                class="input"
                                placeholder="—"
                                :class="{ 'has-error': errors.due_offset_days }"
                            />
                            <span class="muted">jour(s) après la création</span>
                        </div>
                        <span v-if="errors.due_offset_days" class="field-error">{{ errors.due_offset_days }}</span>
                    </div>
                </div>
                <p class="field-help offsets-help">
                    0 = le jour de la création. Laissez vide pour ne pas renseigner la date.
                    {{ exampleText }}
                </p>

                <h3 class="section-title">
                    <AppIcon name="file" :size="16" />
                    Ticket à créer
                </h3>

                <div class="field">
                    <label class="field-label" for="rt-title">Titre<span class="required">*</span></label>
                    <input
                        id="rt-title"
                        v-model="form.title"
                        class="input"
                        maxlength="255"
                        placeholder="Ex. : Clôture mensuelle {mois} {annee}"
                        :class="{ 'has-error': errors.title }"
                    />
                    <span v-if="errors.title" class="field-error">{{ errors.title }}</span>
                    <span v-else class="field-help">
                        Variables remplacées à la création :
                        <code v-for="placeholder in PLACEHOLDERS" :key="placeholder">{{ placeholder }}</code>
                    </span>
                </div>

                <div class="form-row">
                    <div class="field">
                        <label class="field-label">Type<span class="required">*</span></label>
                        <MultiSelect
                            v-model="form.epic_id"
                            :options="epicOptions"
                            :invalid="!!errors.epic_id"
                            placeholder="Type de ticket"
                        />
                        <span v-if="errors.epic_id" class="field-error">{{ errors.epic_id }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label">Projet</label>
                        <MultiSelect
                            v-model="form.project_id"
                            :options="projectOptions"
                            :invalid="!!errors.project_id"
                            clearable
                            placeholder="Aucun"
                        />
                        <span v-if="errors.project_id" class="field-error">{{ errors.project_id }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label">Demandeur<span class="required">*</span></label>
                        <MultiSelect
                            v-model="form.requester_id"
                            :options="requesterOptions"
                            :invalid="!!errors.requester_id"
                            placeholder="Qui demande ?"
                        />
                        <span v-if="errors.requester_id" class="field-error">{{ errors.requester_id }}</span>
                    </div>
                </div>

                <div class="form-row">
                    <div class="field">
                        <label class="field-label">Responsable<span class="required">*</span></label>
                        <MultiSelect v-model="form.owner_id" :options="userOptions" :invalid="!!errors.owner_id" />
                        <span v-if="errors.owner_id" class="field-error">{{ errors.owner_id }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label">Contributeurs</label>
                        <MultiSelect
                            v-model="form.supporter_ids"
                            :options="userOptions.filter((u) => u.value !== form.owner_id)"
                            multiple
                            clearable
                            placeholder="Personne"
                        />
                        <span v-if="errors.supporter_ids" class="field-error">{{ errors.supporter_ids }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label">Statut à la création</label>
                        <MultiSelect
                            v-model="form.status_code"
                            :options="statusOptions"
                            :searchable="false"
                            :invalid="!!errors.status_code"
                        />
                        <span v-if="errors.status_code" class="field-error">{{ errors.status_code }}</span>
                    </div>
                </div>

                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="rt-dpc">Traitement de données</label>
                        <input
                            id="rt-dpc"
                            v-model="form.data_processing_code"
                            type="text"
                            maxlength="5"
                            class="input mono"
                            placeholder="5 caractères"
                            :class="{ 'has-error': errors.data_processing_code }"
                        />
                        <span v-if="errors.data_processing_code" class="field-error">{{
                            errors.data_processing_code
                        }}</span>
                    </div>
                    <div class="field wide">
                        <label class="field-label" for="rt-folder">Dossier de travail (SharePoint)</label>
                        <input
                            id="rt-folder"
                            v-model="form.work_folder_url"
                            type="url"
                            class="input"
                            placeholder="https://…"
                            :class="{ 'has-error': errors.work_folder_url }"
                        />
                        <span v-if="errors.work_folder_url" class="field-error">{{ errors.work_folder_url }}</span>
                    </div>
                </div>

                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="rt-time">Temps consommé de chaque ticket</label>
                        <TimeSpentInput id="rt-time" v-model="form.time_spent" :error="errors.time_spent" />
                        <span class="field-help"
                            >Repris sur chaque ticket créé ; modifiable ensuite sur le ticket.</span
                        >
                        <span v-if="errors.time_spent" class="field-error">{{ errors.time_spent }}</span>
                    </div>
                </div>

                <div class="field">
                    <label class="field-label">Description</label>
                    <MarkdownEditor
                        :model-value="form.description ?? ''"
                        :min-height="120"
                        @update:model-value="form.description = $event"
                    />
                </div>

                <CustomFieldInput
                    v-for="field in customFields"
                    :key="field.id"
                    v-model="form.custom_fields[field.id]"
                    :field="field"
                    :error="errors[`custom_fields.${field.id}`]"
                />

                <label class="checkbox">
                    <input v-model="form.is_active" type="checkbox" />
                    Actif (décochez pour suspendre les créations)
                </label>
            </form>
            <template #footer>
                <button class="btn btn-secondary" type="button" @click="dialogOpen = false">Annuler</button>
                <button class="btn btn-primary" type="button" :disabled="saving" @click="save">Enregistrer</button>
            </template>
        </BaseModal>
    </div>
</template>

<style scoped>
.title-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
}

.page-help {
    margin-top: var(--space-3);
}

.section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    font-size: var(--font-size-md);
    color: var(--color-brand-700);
}

.inline {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.inline .input {
    width: 96px;
}

.interval {
    flex: 0 0 auto;
}

.segmented,
.weekdays {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    overflow: hidden;
    align-self: flex-start;
}

.segmented button,
.weekdays button {
    padding: 7px 14px;
    border: 0;
    border-right: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
}

.segmented button:last-child,
.weekdays button:last-child {
    border-right: 0;
}

.segmented button.active,
.weekdays button.active {
    background: var(--color-brand-600);
    color: #fff;
    font-weight: 600;
}

.monthly {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
}

.radio {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 56px;
}

.select-wrap {
    width: 190px;
}

.month {
    max-width: 240px;
}

.preview {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--color-brand-50);
    border: 1px solid var(--color-brand-100);
}

.offsets-help {
    margin-top: calc(-1 * var(--space-2));
}

.field-help code {
    margin-left: 4px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--color-surface-alt);
    font-size: var(--font-size-xs);
}

.wide {
    flex: 2;
}
</style>
