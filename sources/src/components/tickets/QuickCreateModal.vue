<script setup lang="ts">
/**
 * Quick ticket creation, available everywhere (button or "C" key).
 *
 * Only the title, the type (epic) and the requester are required; everything
 * else has a sensible default (owner = me, status = À faire, start = today
 * except in the backlog, no planned end). The
 * backlog only accepts tickets from lead techs and administrators.
 * Ctrl+Entrée creates the ticket; "Créer un autre" keeps the dialog open.
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { errorMessage, fieldErrors } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import MarkdownEditor from '@/components/markdown/MarkdownEditor.vue';
import CustomFieldInput from '@/components/tickets/CustomFieldInput.vue';
import DatePresets from '@/components/tickets/DatePresets.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import MultiSelect from '@/components/ui/MultiSelect.vue';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { TicketPayload } from '@/types/models';
import { toIsoDate, today } from '@/utils/dates';

const ui = useUiStore();
const auth = useAuthStore();
const reference = useReferenceStore();
const router = useRouter();

const LAST_EPIC_KEY = 'synapse.quick-create.epic';
const LAST_REQUESTER_KEY = 'synapse.quick-create.requester';

interface Form {
    title: string;
    epic_id: number | null;
    project_id: number | null;
    requester_id: number | null;
    owner_id: number | null;
    status_code: string;
    due_date: string;
    start_date: string;
    description: string;
    data_processing_code: string;
    work_folder_url: string;
    custom_fields: Record<number, string | null>;
}

const form = reactive<Form>(emptyForm());
const errors = ref<Record<string, string>>({});
const saving = ref(false);
const createAnother = ref(false);
const showMore = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);

function storedId(key: string): number | null {
    const value = Number(localStorage.getItem(key));

    return Number.isInteger(value) && value > 0 ? value : null;
}

function emptyForm(): Form {
    const statusCode = ui.quickCreateDefaults.status_code ?? 'todo';

    return {
        title: '',
        // The last epic / requester used are proposed again (fast input).
        epic_id: reference.activeEpics.some((e) => e.id === storedId(LAST_EPIC_KEY)) ? storedId(LAST_EPIC_KEY) : null,
        requester_id: reference.activeRequesters.some((r) => r.id === storedId(LAST_REQUESTER_KEY))
            ? storedId(LAST_REQUESTER_KEY)
            : null,
        project_id: ui.quickCreateDefaults.project_id ?? null,
        owner_id: auth.user?.id ?? null,
        status_code: statusCode,
        due_date: '',
        // Work starts today, except for a ticket put aside in the backlog.
        start_date: statusCode === 'backlog' ? '' : toIsoDate(today()),
        description: '',
        data_processing_code: '',
        work_folder_url: '',
        custom_fields: {},
    };
}

const epicOptions = computed(() =>
    reference.activeEpics.map((epic) => ({ value: epic.id, label: epic.title, color: epic.color, hint: epic.code })),
);
const requesterOptions = computed(() =>
    reference.activeRequesters.map((requester) => ({
        value: requester.id,
        label: requester.name,
        color: requester.color,
    })),
);
const userOptions = computed(() => reference.activeUsers.map((user) => ({ value: user.id, label: user.full_name })));
const projectOptions = computed(() =>
    reference.activeProjects.map((project) => ({ value: project.id, label: project.name, color: project.color })),
);
const statusOptions = computed(() =>
    reference.statuses
        .filter((status) => status.code !== 'backlog' || auth.can('backlog.manage'))
        .map((status) => ({ value: status.code, label: status.label })),
);

const customFields = computed(() => reference.fieldsForEpic(form.epic_id));
const requiredCustomFields = computed(() => customFields.value.filter((field) => field.is_required));
const optionalCustomFields = computed(() => customFields.value.filter((field) => !field.is_required));

watch(
    () => ui.quickCreateOpen,
    (open) => {
        if (open) {
            Object.assign(form, emptyForm());
            errors.value = {};
            showMore.value = false;
        }
    },
);

function close(): void {
    ui.quickCreateOpen = false;
}

function payload(): TicketPayload {
    const customValues = Object.fromEntries(
        customFields.value.map((field) => [field.id, form.custom_fields[field.id] || null]),
    );

    return {
        title: form.title.trim(),
        epic_id: form.epic_id,
        project_id: form.project_id,
        requester_id: form.requester_id,
        owner_id: form.owner_id,
        status_code: form.status_code,
        due_date: form.due_date || null,
        start_date: form.start_date || null,
        description: form.description || null,
        data_processing_code: form.data_processing_code || null,
        work_folder_url: form.work_folder_url.trim() || null,
        custom_fields: customValues,
    };
}

async function submit(open = false): Promise<void> {
    if (saving.value) return;

    saving.value = true;
    errors.value = {};

    try {
        const ticket = await ticketsApi.create(payload());
        localStorage.setItem(LAST_EPIC_KEY, String(form.epic_id ?? ''));
        localStorage.setItem(LAST_REQUESTER_KEY, String(form.requester_id ?? ''));
        ui.ticketsChanged();
        ui.notify(`Ticket ${ticket.reference} créé.`);

        if (open) {
            close();
            await router.push({ name: 'ticket', params: { id: ticket.id } });
        } else if (createAnother.value) {
            const keep = {
                epic_id: form.epic_id,
                project_id: form.project_id,
                requester_id: form.requester_id,
                owner_id: form.owner_id,
                status_code: form.status_code,
            };
            Object.assign(form, emptyForm(), keep);
            titleInput.value?.focus();
        } else {
            close();
        }
    } catch (error) {
        errors.value = fieldErrors(error);

        if (Object.keys(errors.value).length === 0) {
            ui.notify(errorMessage(error), 'error');
        }
    } finally {
        saving.value = false;
    }
}

function onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit(event.shiftKey);
    }
}
</script>

<template>
    <BaseModal :open="ui.quickCreateOpen" title="Nouveau ticket" width="720px" @close="close">
        <form class="form-grid" novalidate @submit.prevent="submit()" @keydown="onKeydown">
            <div class="field">
                <label class="sr-only" for="qc-title">Titre</label>
                <input
                    id="qc-title"
                    ref="titleInput"
                    v-model="form.title"
                    class="input input-lg"
                    :class="{ 'has-error': errors.title }"
                    type="text"
                    maxlength="255"
                    placeholder="Que faut-il faire ?"
                    autocomplete="off"
                />
                <span v-if="errors.title" class="field-error">{{ errors.title }}</span>
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
                    <label class="field-label">Responsable</label>
                    <MultiSelect v-model="form.owner_id" :options="userOptions" :invalid="!!errors.owner_id" />
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
                    <label class="field-label">Statut</label>
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
                    <label class="field-label" for="qc-start">Date de début</label>
                    <input id="qc-start" v-model="form.start_date" type="date" class="input" />
                    <DatePresets kind="start" :model-value="form.start_date" @choose="form.start_date = $event" />
                </div>
                <div class="field">
                    <label class="field-label" for="qc-due">Fin prévisionnelle</label>
                    <input
                        id="qc-due"
                        v-model="form.due_date"
                        type="date"
                        class="input"
                        :class="{ 'has-error': errors.due_date }"
                    />
                    <DatePresets
                        kind="due"
                        :start-date="form.start_date"
                        :model-value="form.due_date"
                        @choose="form.due_date = $event"
                    />
                    <span v-if="errors.due_date" class="field-error">{{ errors.due_date }}</span>
                </div>
            </div>
            <p class="field-help dates-help">
                Dates facultatives. Sans date de début, le ticket n'apparaît pas dans le planning.
            </p>

            <CustomFieldInput
                v-for="field in requiredCustomFields"
                :key="field.id"
                v-model="form.custom_fields[field.id]"
                :field="field"
                :error="errors[`custom_fields.${field.id}`]"
            />

            <button type="button" class="more" @click="showMore = !showMore">
                <AppIcon :name="showMore ? 'chevron-down' : 'chevron-right'" :size="14" />
                Plus d'options (description, dossier de travail, traitement de données…)
            </button>

            <template v-if="showMore">
                <div class="field">
                    <label class="field-label">Description</label>
                    <MarkdownEditor v-model="form.description" :min-height="120" @submit="submit()" />
                </div>
                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="qc-dpc">Traitement de données</label>
                        <input
                            id="qc-dpc"
                            v-model="form.data_processing_code"
                            type="text"
                            maxlength="5"
                            class="input mono"
                            :class="{ 'has-error': errors.data_processing_code }"
                            placeholder="5 caractères"
                        />
                        <span v-if="errors.data_processing_code" class="field-error">{{
                            errors.data_processing_code
                        }}</span>
                    </div>
                </div>
                <div class="field">
                    <label class="field-label" for="qc-folder">Dossier de travail (SharePoint)</label>
                    <input
                        id="qc-folder"
                        v-model="form.work_folder_url"
                        type="url"
                        class="input"
                        :class="{ 'has-error': errors.work_folder_url }"
                        placeholder="https://…"
                    />
                    <span v-if="errors.work_folder_url" class="field-error">{{ errors.work_folder_url }}</span>
                </div>
                <CustomFieldInput
                    v-for="field in optionalCustomFields"
                    :key="field.id"
                    v-model="form.custom_fields[field.id]"
                    :field="field"
                    :error="errors[`custom_fields.${field.id}`]"
                />
            </template>
        </form>

        <template #footer>
            <label class="checkbox another">
                <input v-model="createAnother" type="checkbox" />
                Créer un autre
            </label>
            <button
                class="btn btn-secondary"
                type="button"
                :disabled="saving"
                title="Ctrl+Maj+Entrée"
                @click="submit(true)"
            >
                Créer et ouvrir
            </button>
            <button class="btn btn-primary" type="button" :disabled="saving" title="Ctrl+Entrée" @click="submit()">
                <AppIcon name="plus" :size="16" />
                Créer
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.dates-help {
    margin-top: calc(-1 * var(--space-2));
}

.more {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-brand-600);
    font-weight: 600;
    cursor: pointer;
}

.another {
    margin-right: auto;
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
}
</style>
