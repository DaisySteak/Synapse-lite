<script setup lang="ts">
/**
 * Ticket detail. Side panel fields are saved as soon as they change (like
 * Jira); title, description and custom fields have an explicit edit mode.
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { errorMessage, fieldErrors } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import MarkdownEditor from '@/components/markdown/MarkdownEditor.vue';
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue';
import AttachmentList from '@/components/tickets/AttachmentList.vue';
import CustomFieldInput from '@/components/tickets/CustomFieldInput.vue';
import DayCounters from '@/components/tickets/DayCounters.vue';
import FileDropzone from '@/components/tickets/FileDropzone.vue';
import TicketActivity from '@/components/tickets/TicketActivity.vue';
import TicketComments from '@/components/tickets/TicketComments.vue';
import TimeSpentInput from '@/components/tickets/TimeSpentInput.vue';
import DatePresets from '@/components/tickets/DatePresets.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import ColorBadge from '@/components/ui/ColorBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import MultiSelect from '@/components/ui/MultiSelect.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { BACKLOG, useTicketPermissions } from '@/composables/useTicketPermissions';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { Attachment, Ticket, TicketPayload } from '@/types/models';
import { formatDate, formatDateTime } from '@/utils/dates';

const props = defineProps<{ id: number }>();

const reference = useReferenceStore();
const auth = useAuthStore();
const ui = useUiStore();
const permissions = useTicketPermissions();
const router = useRouter();

const ticket = ref<Ticket | null>(null);
const notFound = ref(false);
const historyVersion = ref(0);
const tab = ref<'comments' | 'history'>('comments');
const errors = ref<Record<string, string>>({});

// Edition states
const editingTitle = ref(false);
const titleDraft = ref('');
const editingDescription = ref(false);
const descriptionDraft = ref('');
const editingFields = ref(false);
const fieldsDraft = reactive<Record<number, string | null>>({});
const pendingFiles = ref<File[]>([]);
const uploading = ref(false);

const canEdit = computed(() => ticket.value?.can.update ?? false);
const status = computed(() => (ticket.value ? reference.statusMap.get(ticket.value.status_code) : undefined));
const requester = computed(() => (ticket.value ? reference.requesterMap.get(ticket.value.requester_id) : undefined));
const customFields = computed(() => reference.fieldsForEpic(ticket.value?.epic_id));
const isClosed = computed(() => (ticket.value ? reference.isClosed(ticket.value.status_code) : false));

const inBacklog = computed(() => ticket.value?.status_code === BACKLOG);
/** Users who cannot edit the ticket can still take it out of the backlog. */
const canMove = computed(
    () =>
        canEdit.value ||
        (inBacklog.value && ticket.value !== null && permissions.canChangeStatus(ticket.value, 'todo')),
);
const statusOptions = computed(() =>
    reference.statuses
        .filter((s) => s.code !== BACKLOG || inBacklog.value || auth.can('backlog.manage'))
        .map((s) => ({ value: s.code, label: s.label, color: s.color })),
);
const project = computed(() =>
    ticket.value?.project_id ? reference.projectMap.get(ticket.value.project_id) : undefined,
);
const projectOptions = computed(() =>
    reference.projects
        .filter((p) => p.is_active || p.id === ticket.value?.project_id)
        .map((p) => ({ value: p.id, label: p.name, color: p.color })),
);
const userOptions = computed(() =>
    reference.users
        .filter((u) => u.is_active || u.id === ticket.value?.owner_id || ticket.value?.supporter_ids.includes(u.id))
        .map((u) => ({ value: u.id, label: u.full_name })),
);
const supporterOptions = computed(() => userOptions.value.filter((option) => option.value !== ticket.value?.owner_id));
const epicOptions = computed(() =>
    reference.epics
        .filter((e) => e.is_active || e.id === ticket.value?.epic_id)
        .map((e) => ({ value: e.id, label: e.title, color: e.color, hint: e.code })),
);
const requesterOptions = computed(() =>
    reference.requesters
        .filter((r) => r.is_active || r.id === ticket.value?.requester_id)
        .map((r) => ({ value: r.id, label: r.name, color: r.color })),
);

async function load(): Promise<void> {
    try {
        ticket.value = await ticketsApi.get(props.id);
        notFound.value = false;
        document.title = `${ticket.value.reference} · ${ticket.value.title} · Synapse Lite`;
    } catch {
        notFound.value = true;
    }
}

/** Save one or several fields immediately. */
async function save(payload: TicketPayload): Promise<boolean> {
    if (!ticket.value) return false;

    errors.value = {};

    try {
        ticket.value = await ticketsApi.update(ticket.value.id, payload);
        historyVersion.value++;
        ui.ticketsChanged();

        return true;
    } catch (error) {
        errors.value = fieldErrors(error);
        ui.notify(Object.values(errors.value)[0] ?? errorMessage(error), 'error');

        return false;
    }
}

function startTitle(): void {
    if (!canEdit.value || !ticket.value) return;
    titleDraft.value = ticket.value.title;
    editingTitle.value = true;
}

/** Time spent, in man-days (field or quick button). */
function saveTimeSpent(value: number | null): void {
    void save({ time_spent: value });
}

async function saveTitle(): Promise<void> {
    if (!ticket.value || titleDraft.value.trim() === ticket.value.title) {
        editingTitle.value = false;

        return;
    }

    if (await save({ title: titleDraft.value.trim() })) editingTitle.value = false;
}

function startDescription(): void {
    descriptionDraft.value = ticket.value?.description ?? '';
    editingDescription.value = true;
}

async function saveDescription(): Promise<void> {
    if (await save({ description: descriptionDraft.value || null })) editingDescription.value = false;
}

/** A checkbox was clicked in a Markdown text: save the updated text at once. */
const togglingTask = ref(false);

async function toggleTask(payload: TicketPayload): Promise<void> {
    if (togglingTask.value) return;

    togglingTask.value = true;
    try {
        await save(payload);
    } finally {
        togglingTask.value = false;
    }
}

function toggleFieldTask(fieldId: number, source: string): void {
    const values = Object.fromEntries(
        customFields.value.map((field) => [field.id, ticket.value?.custom_fields[field.id] ?? null]),
    );

    void toggleTask({ custom_fields: { ...values, [fieldId]: source } });
}

function startFields(): void {
    customFields.value.forEach((field) => {
        fieldsDraft[field.id] = ticket.value?.custom_fields[field.id] ?? null;
    });
    editingFields.value = true;
}

async function saveFields(): Promise<void> {
    const values = Object.fromEntries(customFields.value.map((field) => [field.id, fieldsDraft[field.id] || null]));

    if (await save({ custom_fields: values })) editingFields.value = false;
}

async function upload(): Promise<void> {
    if (!ticket.value || pendingFiles.value.length === 0) return;

    uploading.value = true;

    try {
        const created = await ticketsApi.uploadAttachments(ticket.value.id, pendingFiles.value);
        ticket.value.attachments.push(...created);
        pendingFiles.value = [];
        historyVersion.value++;
        ui.ticketsChanged();
        ui.notify(`${created.length} fichier(s) ajouté(s).`);
    } catch (error) {
        ui.notify(Object.values(fieldErrors(error))[0] ?? errorMessage(error), 'error');
    } finally {
        uploading.value = false;
    }
}

/** Status change: through the update when allowed, else through a move (backlog exit). */
async function changeStatus(code: string): Promise<void> {
    if (!ticket.value || code === ticket.value.status_code) return;

    const wasClosed = reference.isClosed(ticket.value.status_code);

    if (canEdit.value) {
        if (!(await save({ status_code: code }))) return;
    } else {
        try {
            await ticketsApi.move(ticket.value.id, code, 0);
            ui.ticketsChanged();
            historyVersion.value++;
            await load();
        } catch (error) {
            ui.notify(errorMessage(error), 'error');

            return;
        }
    }

    // Just closed: confirm the time spent proposed.
    if (ticket.value && !wasClosed && reference.isClosed(ticket.value.status_code)) ui.confirmTimeSpent(ticket.value);
}

async function changeEpic(epicId: number): Promise<void> {
    if (!ticket.value || epicId === ticket.value.epic_id) return;

    const confirmed = await ui.confirm({
        title: 'Changer le type',
        message: `Le ticket ${ticket.value.reference} recevra un nouveau numéro dans le type choisi. Continuer ?`,
        confirmLabel: 'Changer le type',
    });
    if (!confirmed) return;

    const previous = ticket.value.reference;
    if (await save({ epic_id: epicId })) {
        ui.notify(`${previous} devient ${ticket.value.reference}.`);
        document.title = `${ticket.value.reference} · ${ticket.value.title} · Synapse Lite`;
    }
}

async function removeAttachment(attachment: Attachment): Promise<void> {
    if (!ticket.value) return;

    const confirmed = await ui.confirm({
        title: 'Supprimer la pièce jointe',
        message: `« ${attachment.original_name} » sera définitivement supprimé.`,
        confirmLabel: 'Supprimer',
        danger: true,
    });
    if (!confirmed) return;

    try {
        await ticketsApi.removeAttachment(attachment.id);
        ticket.value.attachments = ticket.value.attachments.filter((item) => item.id !== attachment.id);
        historyVersion.value++;
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    }
}

async function remove(): Promise<void> {
    if (!ticket.value) return;

    const confirmed = await ui.confirm({
        title: `Supprimer ${ticket.value.reference}`,
        message: 'Le ticket sera retiré du tableau et du planning. Cette action est réservée aux lead techs.',
        confirmLabel: 'Supprimer le ticket',
        danger: true,
    });
    if (!confirmed) return;

    try {
        const { id, reference } = ticket.value;
        await ticketsApi.remove(id);
        // Leave first: the panels of this page must not reload a ticket that is gone.
        await router.push({ name: 'board' });
        ui.ticketsChanged();
        ui.notify(`Ticket ${reference} supprimé.`);
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    }
}

/**
 * The address of the page is a local file path, different on every computer:
 * the reference and the title are copied instead, enough to find the ticket.
 */
async function copyLink(): Promise<void> {
    if (!ticket.value) return;

    try {
        await navigator.clipboard.writeText(`${ticket.value.reference} · ${ticket.value.title}`);
        ui.notify('Référence du ticket copiée.', 'info');
    } catch {
        ui.notify('Impossible de copier la référence dans le presse-papiers.', 'error');
    }
}

watch(
    () => props.id,
    () => {
        ticket.value = null;
        editingTitle.value = editingDescription.value = editingFields.value = false;
        void load();
    },
    { immediate: true },
);

// Changes made by the other users (or from another screen): the ticket is
// re-read silently; the drafts being edited are kept.
watch(
    () => ui.ticketsVersion,
    () => {
        if (!ticket.value) return;

        void load();
        historyVersion.value++;
    },
);
</script>

<template>
    <div class="page">
        <EmptyState
            v-if="notFound"
            icon="alert"
            title="Ticket introuvable"
            text="Ce ticket n'existe pas ou a été supprimé."
        >
            <RouterLink :to="{ name: 'board' }" class="btn btn-primary">Retour au tableau</RouterLink>
        </EmptyState>

        <div v-else-if="!ticket" class="page-content muted">Chargement…</div>

        <template v-else>
            <header class="ticket-header">
                <nav class="breadcrumb">
                    <RouterLink v-if="inBacklog" :to="{ name: 'backlog' }">Backlog</RouterLink>
                    <RouterLink v-else :to="{ name: 'board' }">Tableau</RouterLink>
                    <AppIcon name="chevron-right" :size="14" />
                    <span>{{ ticket.reference }}</span>
                </nav>
                <div class="title-row">
                    <input
                        v-if="editingTitle"
                        v-model="titleDraft"
                        class="input input-lg title-input"
                        maxlength="255"
                        autofocus
                        @keydown.enter="saveTitle"
                        @keydown.esc="editingTitle = false"
                        @blur="saveTitle"
                    />
                    <h1
                        v-else
                        :class="{ editable: canEdit }"
                        :title="canEdit ? 'Cliquer pour modifier' : ''"
                        @click="startTitle"
                    >
                        {{ ticket.title }}
                    </h1>
                    <div class="header-actions">
                        <button
                            class="btn btn-ghost btn-sm"
                            type="button"
                            title="Copier la référence"
                            @click="copyLink"
                        >
                            <AppIcon name="link" :size="15" />
                        </button>
                        <button
                            v-if="ticket.can.delete"
                            class="btn btn-ghost btn-sm danger"
                            type="button"
                            @click="remove"
                        >
                            <AppIcon name="trash" :size="15" />
                            Supprimer
                        </button>
                    </div>
                </div>
            </header>

            <div class="layout">
                <!-- Main column ------------------------------------------------------ -->
                <div class="main">
                    <section class="card section">
                        <div class="section-header">
                            <h2 class="section-title">Description</h2>
                            <button
                                v-if="canEdit && !editingDescription"
                                class="btn btn-ghost btn-sm"
                                type="button"
                                @click="startDescription"
                            >
                                <AppIcon name="edit" :size="14" />
                                Modifier
                            </button>
                        </div>
                        <template v-if="editingDescription">
                            <MarkdownEditor
                                v-model="descriptionDraft"
                                :min-height="220"
                                autofocus
                                @submit="saveDescription"
                            />
                            <div class="form-actions">
                                <button
                                    class="btn btn-secondary btn-sm"
                                    type="button"
                                    @click="editingDescription = false"
                                >
                                    Annuler
                                </button>
                                <button class="btn btn-primary btn-sm" type="button" @click="saveDescription">
                                    Enregistrer
                                </button>
                            </div>
                        </template>
                        <MarkdownViewer
                            v-else
                            :source="ticket.description"
                            :interactive="canEdit"
                            :busy="togglingTask"
                            placeholder="Aucune description. Cliquez sur « Modifier » pour en ajouter une."
                            @toggle="toggleTask({ description: $event })"
                        />
                    </section>

                    <section v-if="customFields.length" class="card section">
                        <div class="section-header">
                            <h2 class="section-title">Informations complémentaires</h2>
                            <button
                                v-if="canEdit && !editingFields"
                                class="btn btn-ghost btn-sm"
                                type="button"
                                @click="startFields"
                            >
                                <AppIcon name="edit" :size="14" />
                                Modifier
                            </button>
                        </div>
                        <div v-if="editingFields" class="form-grid">
                            <CustomFieldInput
                                v-for="field in customFields"
                                :key="field.id"
                                v-model="fieldsDraft[field.id]"
                                :field="field"
                                :error="errors[`custom_fields.${field.id}`]"
                            />
                            <div class="form-actions">
                                <button class="btn btn-secondary btn-sm" type="button" @click="editingFields = false">
                                    Annuler
                                </button>
                                <button class="btn btn-primary btn-sm" type="button" @click="saveFields">
                                    Enregistrer
                                </button>
                            </div>
                        </div>
                        <dl v-else class="custom-values">
                            <template v-for="field in customFields" :key="field.id">
                                <dt>{{ field.label }}</dt>
                                <dd>
                                    <template v-if="!ticket.custom_fields[field.id]"
                                        ><span class="muted">—</span></template
                                    >
                                    <template v-else-if="field.field_type === 'date'">{{
                                        formatDate(ticket.custom_fields[field.id])
                                    }}</template>
                                    <MarkdownViewer
                                        v-else-if="field.field_type === 'long_text'"
                                        :source="ticket.custom_fields[field.id]"
                                        :interactive="canEdit && !editingFields"
                                        :busy="togglingTask"
                                        @toggle="toggleFieldTask(field.id, $event)"
                                    />
                                    <template v-else>{{ ticket.custom_fields[field.id] }}</template>
                                </dd>
                            </template>
                        </dl>
                    </section>

                    <section class="card section">
                        <div class="section-header">
                            <h2 class="section-title">Pièces jointes ({{ ticket.attachments.length }})</h2>
                        </div>
                        <AttachmentList
                            v-if="ticket.attachments.length"
                            :attachments="ticket.attachments"
                            @remove="removeAttachment"
                        />
                        <template v-if="ticket.can.attach">
                            <FileDropzone v-model="pendingFiles" />
                            <div v-if="pendingFiles.length" class="form-actions">
                                <button
                                    class="btn btn-primary btn-sm"
                                    type="button"
                                    :disabled="uploading"
                                    @click="upload"
                                >
                                    <AppIcon name="upload" :size="14" />
                                    Envoyer {{ pendingFiles.length }} fichier(s)
                                </button>
                            </div>
                        </template>
                        <p v-else-if="ticket.attachments.length === 0" class="muted">Aucune pièce jointe.</p>
                    </section>

                    <section class="card section">
                        <div class="tabs" role="tablist">
                            <button type="button" :class="{ active: tab === 'comments' }" @click="tab = 'comments'">
                                <AppIcon name="message" :size="15" />
                                Commentaires
                            </button>
                            <button type="button" :class="{ active: tab === 'history' }" @click="tab = 'history'">
                                <AppIcon name="history" :size="15" />
                                Historique
                            </button>
                        </div>
                        <TicketComments
                            v-show="tab === 'comments'"
                            :ticket-id="ticket.id"
                            @changed="historyVersion++"
                        />
                        <TicketActivity v-if="tab === 'history'" :ticket-id="ticket.id" :version="historyVersion" />
                    </section>
                </div>

                <!-- Side panel ------------------------------------------------------- -->
                <aside class="side">
                    <div class="card side-card">
                        <div class="field">
                            <span class="field-label">Statut</span>
                            <MultiSelect
                                v-if="canMove"
                                :model-value="ticket.status_code"
                                :options="statusOptions"
                                :searchable="false"
                                @update:model-value="changeStatus(String($event))"
                            />
                            <span v-else class="status-pill" :style="{ background: status?.color }">{{
                                status?.label
                            }}</span>
                        </div>

                        <div class="field">
                            <span class="field-label">Responsable</span>
                            <MultiSelect
                                v-if="canEdit"
                                :model-value="ticket.owner_id"
                                :options="userOptions"
                                @update:model-value="save({ owner_id: Number($event) })"
                            />
                            <span v-else class="person">
                                <UserAvatar :user="reference.userMap.get(ticket.owner_id)" :size="22" />
                                {{ reference.userMap.get(ticket.owner_id)?.full_name }}
                            </span>
                        </div>

                        <div class="field">
                            <span class="field-label">Contributeurs</span>
                            <MultiSelect
                                v-if="canEdit"
                                :model-value="ticket.supporter_ids"
                                :options="supporterOptions"
                                multiple
                                clearable
                                placeholder="Aucun"
                                @update:model-value="save({ supporter_ids: $event as number[] })"
                            />
                            <div v-else class="people">
                                <span v-for="supporterId in ticket.supporter_ids" :key="supporterId" class="person">
                                    <UserAvatar :user="reference.userMap.get(supporterId)" :size="22" />
                                    {{ reference.userMap.get(supporterId)?.full_name }}
                                </span>
                                <span v-if="!ticket.supporter_ids.length" class="muted">Aucun</span>
                            </div>
                        </div>

                        <div class="field">
                            <span class="field-label">Type</span>
                            <MultiSelect
                                v-if="canEdit"
                                :model-value="ticket.epic_id"
                                :options="epicOptions"
                                @update:model-value="changeEpic(Number($event))"
                            />
                            <span v-else>{{ reference.epicMap.get(ticket.epic_id)?.title }}</span>
                        </div>

                        <div class="field">
                            <span class="field-label">Projet</span>
                            <MultiSelect
                                v-if="canEdit"
                                :model-value="ticket.project_id"
                                :options="projectOptions"
                                clearable
                                placeholder="Aucun"
                                @update:model-value="save({ project_id: $event === null ? null : Number($event) })"
                            />
                            <ColorBadge v-else-if="project" :color="project.color" :label="project.name" />
                            <span v-else class="muted">Aucun</span>
                        </div>

                        <div class="field">
                            <span class="field-label">Demandeur</span>
                            <MultiSelect
                                v-if="canEdit"
                                :model-value="ticket.requester_id"
                                :options="requesterOptions"
                                @update:model-value="save({ requester_id: Number($event) })"
                            />
                            <ColorBadge v-else-if="requester" :color="requester.color" :label="requester.name" />
                        </div>
                    </div>

                    <div class="card side-card">
                        <div class="dates">
                            <div class="field">
                                <label class="field-label" for="start-date">Début</label>
                                <input
                                    id="start-date"
                                    type="date"
                                    class="input"
                                    :value="ticket.start_date ?? ''"
                                    :disabled="!canEdit"
                                    @change="save({ start_date: ($event.target as HTMLInputElement).value || null })"
                                />
                                <DatePresets
                                    v-if="canEdit"
                                    kind="start"
                                    :model-value="ticket.start_date"
                                    @choose="save({ start_date: $event })"
                                />
                            </div>
                            <div class="field">
                                <label class="field-label" for="due-date">Fin prévisionnelle</label>
                                <input
                                    id="due-date"
                                    type="date"
                                    class="input"
                                    :class="{ 'has-error': errors.due_date }"
                                    :value="ticket.due_date ?? ''"
                                    :disabled="!canEdit"
                                    @change="save({ due_date: ($event.target as HTMLInputElement).value || null })"
                                />
                                <DatePresets
                                    v-if="canEdit"
                                    kind="due"
                                    :start-date="ticket.start_date"
                                    :model-value="ticket.due_date"
                                    @choose="save({ due_date: $event })"
                                />
                            </div>
                            <div class="field">
                                <label class="field-label" for="end-date">Fin réelle</label>
                                <input
                                    id="end-date"
                                    type="date"
                                    class="input"
                                    :value="ticket.actual_end_date ?? ''"
                                    :disabled="!canEdit || !isClosed"
                                    :title="isClosed ? '' : 'Renseignée automatiquement au passage en « Terminé »'"
                                    @change="
                                        save({ actual_end_date: ($event.target as HTMLInputElement).value || null })
                                    "
                                />
                            </div>
                        </div>
                        <DayCounters :ticket="ticket" />
                        <p v-if="!ticket.start_date" class="field-help">
                            Sans date de début, le ticket n'apparaît pas dans le planning.
                        </p>
                        <p v-if="ticket.recurring_ticket_id" class="field-help recurring">
                            <AppIcon name="repeat" :size="13" />
                            Créé automatiquement
                            <RouterLink
                                v-if="auth.can('admin.recurring_tickets')"
                                :to="{ name: 'admin-recurring-tickets' }"
                            >
                                (ticket récurrent)
                            </RouterLink>
                            <template v-else>par un ticket récurrent</template>
                        </p>
                    </div>

                    <div class="card side-card">
                        <div class="field">
                            <label class="field-label" for="time-spent">Temps consommé (j/h)</label>
                            <TimeSpentInput
                                id="time-spent"
                                v-model="ticket.time_spent"
                                :error="errors.time_spent"
                                :disabled="!canEdit"
                                @change="saveTimeSpent"
                            />
                            <span v-if="errors.time_spent" class="field-error">{{ errors.time_spent }}</span>
                        </div>
                        <div class="field">
                            <label class="field-label" for="dpc">Traitement de données</label>
                            <input
                                id="dpc"
                                type="text"
                                maxlength="5"
                                class="input mono"
                                :class="{ 'has-error': errors.data_processing_code }"
                                :value="ticket.data_processing_code ?? ''"
                                :disabled="!canEdit"
                                placeholder="—"
                                @change="
                                    save({
                                        data_processing_code: ($event.target as HTMLInputElement).value.trim() || null,
                                    })
                                "
                            />
                        </div>
                        <div class="field">
                            <label class="field-label" for="folder">Dossier de travail</label>
                            <a
                                v-if="ticket.work_folder_url"
                                :href="ticket.work_folder_url"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="folder-link"
                            >
                                <AppIcon name="folder" :size="15" />
                                Ouvrir le dossier SharePoint
                                <AppIcon name="external" :size="13" />
                            </a>
                            <input
                                v-if="canEdit"
                                id="folder"
                                type="url"
                                class="input"
                                :class="{ 'has-error': errors.work_folder_url }"
                                :value="ticket.work_folder_url ?? ''"
                                placeholder="https://…sharepoint…"
                                @change="
                                    save({ work_folder_url: ($event.target as HTMLInputElement).value.trim() || null })
                                "
                            />
                            <span v-else-if="!ticket.work_folder_url" class="muted">—</span>
                        </div>
                    </div>

                    <p class="audit">
                        Créé par {{ ticket.creator?.full_name ?? '—' }} le {{ formatDateTime(ticket.created_at) }}<br />
                        Modifié le {{ formatDateTime(ticket.updated_at) }}
                        <template v-if="ticket.updater"> par {{ ticket.updater.full_name }}</template>
                    </p>
                </aside>
            </div>
        </template>
    </div>
</template>

<style scoped>
.page {
    overflow: auto;
}

.ticket-header {
    padding: var(--space-4) var(--space-6) var(--space-3);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
}

.breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
}

.title-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-top: var(--space-1);
}

h1 {
    flex: 1;
    font-size: var(--font-size-2xl);
    color: var(--color-brand-900);
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: var(--radius-sm);
}

h1.editable {
    cursor: text;
}

h1.editable:hover {
    background: var(--color-surface-alt);
}

.title-input {
    flex: 1;
    font-size: var(--font-size-xl);
    font-weight: 600;
}

.header-actions {
    display: flex;
    gap: var(--space-1);
}

.danger:hover {
    color: var(--color-danger);
}

.layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--space-5);
    align-items: start;
    padding: var(--space-5) var(--space-6);
}

.main,
.side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
}

.section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
}

.custom-values {
    display: grid;
    grid-template-columns: minmax(140px, max-content) 1fr;
    gap: var(--space-2) var(--space-4);
    margin: 0;
}

.custom-values dt {
    font-weight: 600;
    color: var(--color-text-muted);
}

.custom-values dd {
    margin: 0;
    min-width: 0;
}

.tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--color-border);
}

.tabs button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    margin-bottom: -1px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    font-weight: 600;
    color: var(--color-text-muted);
    cursor: pointer;
}

.tabs button.active {
    border-bottom-color: var(--color-brand-600);
    color: var(--color-brand-700);
}

.side-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
}

.dates {
    display: grid;
    gap: var(--space-3);
}

.status-pill {
    align-self: flex-start;
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    color: #fff;
    font-weight: 700;
    font-size: var(--font-size-sm);
}

.person {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
}

.people {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.folder-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
}

.audit {
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
    line-height: 1.6;
}

@media (max-width: 1100px) {
    .layout {
        grid-template-columns: 1fr;
    }
}

.recurring {
    display: flex;
    align-items: center;
    gap: 4px;
}
</style>
