<script setup lang="ts">
/**
 * Data management (administrators): bulk changes of the tickets, backup and
 * restoration of the data folder, Excel export of every record, purge of the
 * tickets and, at the very bottom, reset of all the data.
 *
 * The irreversible operations ask for a typed sentence and offer to download
 * a backup of the current data first. After a restoration or a reset the
 * application is reloaded, so that every screen reads the new data.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { dataApi } from '@/api/data';
import { errorMessage, fieldErrors } from '@/api/errors';
import DangerConfirmModal from '@/components/admin/DangerConfirmModal.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import PurgeTicketsModal from '@/components/tickets/PurgeTicketsModal.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { BackupSummary, ReassignChoice, ReassignField } from '@/types/models';
import { formatDateTime } from '@/utils/dates';

const ui = useUiStore();
const reference = useReferenceStore();

/** Message shown after the reload that follows a restoration or a reset. */
const FLASH_KEY = 'synapse-lite.data.flash';

onMounted(() => {
    try {
        const flash = sessionStorage.getItem(FLASH_KEY);
        if (flash) {
            sessionStorage.removeItem(FLASH_KEY);
            ui.notify(flash, 'success', 6000);
        }
    } catch {
        // Storage unavailable: no message.
    }
});

/** Reload the application on the new data (after the backup download has started). */
function reloadWith(message: string, afterDownload: boolean): void {
    try {
        sessionStorage.setItem(FLASH_KEY, message);
    } catch {
        // Storage unavailable: no message.
    }
    window.setTimeout(() => window.location.reload(), afterDownload ? 1500 : 0);
}

// --- Bulk reassignment --------------------------------------------------------

const FIELDS: { value: ReassignField; label: string; noun: string }[] = [
    { value: 'owner', label: 'Propriétaire', noun: 'le propriétaire' },
    { value: 'epic', label: 'Type de ticket', noun: 'le type' },
    { value: 'requester', label: 'Demandeur', noun: 'le demandeur' },
];

const field = ref<ReassignField>('owner');
const choices = ref<ReassignChoice[]>([]);
const fromId = ref<number | null>(null);
const toId = ref<number | null>(null);
const preview = ref<{ tickets: number; recurring: number } | null>(null);
const reassigning = ref(false);
const reassignError = ref<string | null>(null);

const fieldInfo = computed(() => FIELDS.find((item) => item.value === field.value) ?? FIELDS[0]);
const sources = computed(() => choices.value.filter((choice) => choice.tickets_count > 0 || choice.is_active));
const targets = computed(() => choices.value.filter((choice) => choice.is_active && choice.id !== fromId.value));
const label = (id: number | null) => choices.value.find((choice) => choice.id === id)?.label ?? '';
const canReassign = computed(
    () =>
        fromId.value !== null &&
        toId.value !== null &&
        preview.value !== null &&
        preview.value.tickets + preview.value.recurring > 0 &&
        !reassigning.value,
);

async function loadChoices(): Promise<void> {
    try {
        choices.value = await dataApi.reassignChoices(field.value);
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    }
}

watch(
    field,
    () => {
        fromId.value = null;
        toId.value = null;
        reassignError.value = null;
        void loadChoices();
    },
    { immediate: true },
);

watch(fromId, async (id) => {
    preview.value = null;
    reassignError.value = null;
    if (toId.value === id) toId.value = null;
    if (id === null) return;

    try {
        preview.value = await dataApi.reassignCounts(field.value, id);
    } catch (error) {
        reassignError.value = errorMessage(error);
    }
});

async function reassign(): Promise<void> {
    if (!canReassign.value || fromId.value === null || toId.value === null || !preview.value) return;

    const { tickets, recurring } = preview.value;
    const renumbered =
        field.value === 'epic'
            ? ' Les tickets changent de référence : ils reçoivent un nouveau numéro dans le nouveau type.'
            : '';
    const confirmed = await ui.confirm({
        title: 'Modification de masse',
        message:
            `Remplacer ${fieldInfo.value.noun} « ${label(fromId.value)} » par « ${label(toId.value)} » sur ` +
            `${tickets} ticket(s) et ${recurring} ticket(s) récurrent(s) ?${renumbered}`,
        confirmLabel: 'Modifier',
        danger: true,
    });
    if (!confirmed) return;

    reassigning.value = true;
    reassignError.value = null;

    try {
        const result = await dataApi.reassign(field.value, fromId.value, toId.value);
        ui.notify(`${result.tickets} ticket(s) et ${result.recurring} ticket(s) récurrent(s) modifié(s).`);
        ui.ticketsChanged();
        await reference.load(true);
        fromId.value = null;
        toId.value = null;
        await loadChoices();
    } catch (error) {
        const errors = fieldErrors(error);
        reassignError.value = errors.to_id ?? errors.from_id ?? errorMessage(error);
    } finally {
        reassigning.value = false;
    }
}

// --- Backup, export, restoration ------------------------------------------------

const downloading = ref<'zip' | 'xlsx' | null>(null);

async function download(kind: 'zip' | 'xlsx'): Promise<void> {
    downloading.value = kind;

    try {
        await (kind === 'zip' ? dataApi.downloadBackup() : dataApi.downloadWorkbook());
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        downloading.value = null;
    }
}

const fileInput = ref<HTMLInputElement | null>(null);
const backupFile = ref<File | null>(null);
const summary = ref<BackupSummary | null>(null);
const restoreOpen = ref(false);
const restoring = ref(false);
const restoreError = ref<string | null>(null);

async function onBackupChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;

    try {
        summary.value = await dataApi.inspectBackup(file);
        backupFile.value = file;
        restoreError.value = null;
        restoreOpen.value = true;
    } catch (error) {
        ui.notify(fieldErrors(error).file ?? errorMessage(error), 'error', 8000);
    }
}

async function restore(confirmation: string, backupFirst: boolean): Promise<void> {
    if (!backupFile.value) return;

    restoring.value = true;
    restoreError.value = null;

    try {
        if (backupFirst) await dataApi.downloadBackup();
        await dataApi.restore(backupFile.value, confirmation);
        reloadWith(`Sauvegarde « ${backupFile.value.name} » restaurée.`, backupFirst);
    } catch (error) {
        restoreError.value = fieldErrors(error).confirmation ?? errorMessage(error);
        restoring.value = false;
    }
}

// --- Purge and reset ---------------------------------------------------------------

const purgeOpen = ref(false);

function onPurged(): void {
    purgeOpen.value = false;
    ui.ticketsChanged();
}

const resetOpen = ref(false);
const resetting = ref(false);
const resetError = ref<string | null>(null);

function openReset(): void {
    resetError.value = null;
    resetOpen.value = true;
}

async function reset(confirmation: string, backupFirst: boolean): Promise<void> {
    resetting.value = true;
    resetError.value = null;

    try {
        if (backupFirst) await dataApi.downloadBackup();
        await dataApi.reset(confirmation);
        reloadWith('Les données ont été remises à zéro.', backupFirst);
    } catch (error) {
        resetError.value = fieldErrors(error).confirmation ?? errorMessage(error);
        resetting.value = false;
    }
}
</script>

<template>
    <div class="page">
        <PageHeader title="Gestion des données" subtitle="Opérations sur l'ensemble des données de l'application" />

        <div class="page-content sections">
            <section class="card">
                <div class="card-body">
                    <h2 class="section-title">Modification de masse</h2>
                    <p class="muted intro">
                        Remplace une valeur par une autre sur tous les tickets non supprimés et sur les tickets
                        récurrents. Chaque ticket garde la trace du changement dans son historique.
                    </p>

                    <div class="reassign">
                        <div class="field">
                            <label class="field-label" for="reassign-field">Champ à modifier</label>
                            <select id="reassign-field" v-model="field" class="select">
                                <option v-for="item in FIELDS" :key="item.value" :value="item.value">
                                    {{ item.label }}
                                </option>
                            </select>
                        </div>
                        <div class="field">
                            <label class="field-label" for="reassign-from">Remplacer</label>
                            <select id="reassign-from" v-model="fromId" class="select">
                                <option :value="null" disabled>Choisir…</option>
                                <option v-for="choice in sources" :key="choice.id" :value="choice.id">
                                    {{ choice.label }} ({{ choice.tickets_count }} ticket(s)){{
                                        choice.is_active ? '' : ' · inactif'
                                    }}
                                </option>
                            </select>
                        </div>
                        <AppIcon class="arrow" name="arrow-right" :size="18" />
                        <div class="field">
                            <label class="field-label" for="reassign-to">Par</label>
                            <select
                                id="reassign-to"
                                v-model="toId"
                                class="select"
                                :disabled="fromId === null"
                                :class="{ 'has-error': reassignError }"
                            >
                                <option :value="null" disabled>Choisir…</option>
                                <option v-for="choice in targets" :key="choice.id" :value="choice.id">
                                    {{ choice.label }}
                                </option>
                            </select>
                        </div>
                        <button class="btn btn-primary" type="button" :disabled="!canReassign" @click="reassign">
                            {{ reassigning ? 'Modification…' : 'Appliquer' }}
                        </button>
                    </div>

                    <p v-if="reassignError" class="field-error">{{ reassignError }}</p>
                    <p v-else-if="preview" class="muted preview">
                        <template v-if="preview.tickets + preview.recurring > 0">
                            {{ preview.tickets }} ticket(s) et {{ preview.recurring }} ticket(s) récurrent(s) seront
                            modifiés.
                            <template v-if="field === 'epic'">
                                Les tickets recevront un nouveau numéro dans le nouveau type.
                            </template>
                        </template>
                        <template v-else>Aucun ticket n'utilise cette valeur.</template>
                    </p>
                </div>
            </section>

            <section class="card">
                <div class="card-body">
                    <h2 class="section-title">Sauvegarde et restauration</h2>
                    <p class="muted intro">
                        La sauvegarde est un fichier .zip qui contient tout le dossier data : tickets, commentaires,
                        historique, pièces jointes et paramétrage. Conservez-la hors du dossier partagé.
                    </p>
                    <div class="buttons">
                        <button
                            class="btn btn-primary"
                            type="button"
                            :disabled="downloading !== null"
                            @click="download('zip')"
                        >
                            <AppIcon name="download" :size="15" />
                            {{ downloading === 'zip' ? 'Préparation…' : 'Télécharger une sauvegarde (.zip)' }}
                        </button>
                        <button class="btn btn-secondary" type="button" @click="fileInput?.click()">
                            <AppIcon name="upload" :size="15" />
                            Restaurer une sauvegarde…
                        </button>
                        <input
                            ref="fileInput"
                            class="hidden"
                            type="file"
                            accept=".zip,application/zip"
                            @change="onBackupChosen"
                        />
                    </div>
                </div>
            </section>

            <section class="card">
                <div class="card-body">
                    <h2 class="section-title">Export Excel</h2>
                    <p class="muted intro">
                        Toutes les données dans un classeur Excel, une feuille par type de données : tickets,
                        commentaires, historique, pièces jointes, utilisateurs, demandeurs, projets, types de ticket,
                        champs personnalisés et tickets récurrents.
                    </p>
                    <div class="buttons">
                        <button
                            class="btn btn-secondary"
                            type="button"
                            :disabled="downloading !== null"
                            @click="download('xlsx')"
                        >
                            <AppIcon name="table" :size="15" />
                            {{ downloading === 'xlsx' ? 'Préparation…' : 'Exporter toutes les données (.xlsx)' }}
                        </button>
                    </div>
                </div>
            </section>

            <section class="card">
                <div class="card-body">
                    <h2 class="section-title">Purge des tickets</h2>
                    <p class="muted intro">
                        Supprime définitivement les tickets déjà supprimés, ou tous les tickets, avec leurs
                        commentaires, leur historique et leurs pièces jointes. Pour supprimer un seul ticket, utilisez «
                        Tous les tickets ».
                    </p>
                    <div class="buttons">
                        <button class="btn btn-secondary danger-text" type="button" @click="purgeOpen = true">
                            <AppIcon name="trash" :size="15" />
                            Purger les tickets…
                        </button>
                    </div>
                </div>
            </section>

            <section class="card danger-zone">
                <div class="card-body">
                    <h2 class="section-title">Remise à zéro</h2>
                    <p class="muted intro">
                        Efface toutes les données de l'application, utilisateurs et types de ticket compris. Il ne reste
                        qu'un compte administrateur, de matricule <strong>admin</strong>, avec lequel vous êtes
                        reconnecté : recréez ensuite les comptes de l'équipe et les types de ticket.
                    </p>
                    <div class="buttons">
                        <button class="btn btn-danger" type="button" @click="openReset">
                            <AppIcon name="alert" :size="15" />
                            Remettre à zéro toutes les données…
                        </button>
                    </div>
                </div>
            </section>
        </div>

        <PurgeTicketsModal :open="purgeOpen" @close="purgeOpen = false" @purged="onPurged" />

        <DangerConfirmModal
            :open="restoreOpen"
            title="Restaurer une sauvegarde"
            operation="restore"
            confirm-label="Restaurer la sauvegarde"
            :busy="restoring"
            :error="restoreError"
            @close="restoreOpen = false"
            @confirm="restore"
        >
            <template #warning>
                La restauration <strong>remplace toutes les données actuelles</strong> par celles de la sauvegarde.
                Demandez aux autres utilisateurs de fermer Synapse Lite pendant l'opération.
            </template>
            <dl v-if="summary" class="summary">
                <dt>Fichier</dt>
                <dd>{{ backupFile?.name }}</dd>
                <dt>Dossier créé le</dt>
                <dd>{{ formatDateTime(summary.created_at) }}</dd>
                <dt>Contenu</dt>
                <dd>
                    {{ summary.tickets }} ticket(s), {{ summary.users }} utilisateur(s),
                    {{ summary.requesters }} demandeur(s), {{ summary.projects }} projet(s),
                    {{ summary.attachments }} pièce(s) jointe(s) · {{ summary.files }} fichier(s)
                </dd>
            </dl>
        </DangerConfirmModal>

        <DangerConfirmModal
            :open="resetOpen"
            title="Remettre à zéro les données"
            operation="reset"
            confirm-label="Tout effacer et repartir à zéro"
            :busy="resetting"
            :error="resetError"
            @close="resetOpen = false"
            @confirm="reset"
        >
            <template #warning>
                La remise à zéro <strong>efface définitivement</strong> tous les tickets, commentaires, pièces jointes,
                utilisateurs (votre compte compris), types de ticket, demandeurs, projets, tickets récurrents, champs
                personnalisés et le thème. Seul reste le compte <strong>admin</strong>.
                <strong>Elle est irréversible</strong> sans sauvegarde.
            </template>
        </DangerConfirmModal>
    </div>
</template>

<style scoped>
.sections {
    display: grid;
    gap: var(--space-4);
}

.intro {
    margin: var(--space-2) 0 var(--space-4);
}

.buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
}

.reassign {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) minmax(180px, 1.5fr) auto minmax(180px, 1.5fr) auto;
    gap: var(--space-3);
    align-items: end;
}

.reassign .arrow {
    margin-bottom: 8px;
    color: var(--color-text-muted);
}

@media (max-width: 900px) {
    .reassign {
        grid-template-columns: 1fr;
    }

    .reassign .arrow {
        display: none;
    }
}

.preview {
    margin: var(--space-3) 0 0;
}

.hidden {
    display: none;
}

.danger-text {
    color: #a23b3b;
}

.danger-zone {
    border-color: #e3b4b4;
}

.danger-zone .section-title {
    color: #a23b3b;
}

.summary {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-1) var(--space-4);
    margin: 0;
}

.summary dt {
    font-weight: 600;
}

.summary dd {
    margin: 0;
}
</style>
