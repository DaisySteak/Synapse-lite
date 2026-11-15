<script setup lang="ts">
/**
 * List of all the tickets (backlog included), sortable and filterable, with
 * exports of the displayed tickets (CSV, Excel, JSON), description included.
 *
 * Administrators also find here the tickets deleted logically (status filter
 * "Supprimé"), which they can restore or delete permanently one by one. The
 * purge of many tickets is on the page "Gestion des données".
 *
 * By default the list shows every status except "Terminé" (and "Supprimé"):
 * the work still to do.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { errorMessage } from '@/api/errors';
import { DELETED_STATUS, ticketsApi } from '@/api/tickets';
import PageHeader from '@/components/layout/PageHeader.vue';
import TicketTable from '@/components/tickets/TicketTable.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import MultiSelect from '@/components/ui/MultiSelect.vue';
import { usePersistentRef } from '@/composables/usePersistentRef';
import { useTicketPresentation } from '@/composables/useTicketPresentation';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { TicketCard, TicketFilters } from '@/types/models';
import { toIsoDate, today } from '@/utils/dates';
import { downloadTickets, type ExportFormat, type ExportedTicket } from '@/utils/ticketExport';

const reference = useReferenceStore();
const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const presentation = useTicketPresentation();

const tickets = ref<TicketCard[]>([]);
const loading = ref(false);

/** Every status except the finished ones: the default filter. */
const defaultStatusCodes = () => reference.statuses.filter((s) => !s.is_final).map((s) => s.code);

// New key: the filters saved before this default are not reused.
const statusCodes = usePersistentRef<string[]>('synapse.list.statuses.v2', defaultStatusCodes());
const epicIds = usePersistentRef<number[]>('synapse.list.epics', []);
const projectIds = usePersistentRef<number[]>('synapse.list.projects', []);
const ownerIds = usePersistentRef<number[]>('synapse.list.owners', []);
const requesterIds = usePersistentRef<number[]>('synapse.list.requesters', []);
const search = ref('');

// Link from the projects administration: /tickets?projet=3
if (route.query.projet) {
    projectIds.value = [Number(route.query.projet)];
}

/** Deleted tickets: administrators only. */
const canPurge = computed(() => auth.can('tickets.purge'));

const statusOptions = computed(() => [
    ...reference.statuses.map((s) => ({ value: s.code, label: s.label, color: s.color })),
    ...(canPurge.value
        ? [{ value: DELETED_STATUS.code, label: DELETED_STATUS.label, color: DELETED_STATUS.color }]
        : []),
]);
const epicOptions = computed(() => reference.epics.map((e) => ({ value: e.id, label: e.title, color: e.color })));
const projectOptions = computed(() => reference.projects.map((p) => ({ value: p.id, label: p.name, color: p.color })));
const userOptions = computed(() => reference.users.map((u) => ({ value: u.id, label: u.full_name })));
const requesterOptions = computed(() =>
    reference.requesters.map((r) => ({ value: r.id, label: r.name, color: r.color })),
);

const hasFilters = computed(
    () =>
        Number(!sameCodes(statusCodes.value, defaultStatusCodes())) +
            epicIds.value.length +
            projectIds.value.length +
            ownerIds.value.length +
            requesterIds.value.length >
            0 || search.value.trim() !== '',
);

function sameCodes(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((code) => b.includes(code));
}

function resetFilters(): void {
    statusCodes.value = defaultStatusCodes();
    epicIds.value = [];
    projectIds.value = [];
    ownerIds.value = [];
    requesterIds.value = [];
    search.value = '';
}

const searchTerm = computed(() => search.value.trim().toLowerCase());
const displayed = computed(() =>
    searchTerm.value
        ? tickets.value.filter(
              (t) =>
                  t.title.toLowerCase().includes(searchTerm.value) ||
                  t.reference.toLowerCase().includes(searchTerm.value),
          )
        : tickets.value,
);

/** Server side filters (the search is applied in the browser). */
function filters(): TicketFilters {
    return {
        // A filter saved by an administrator on this computer is meaningless for the others.
        status_codes: canPurge.value
            ? statusCodes.value
            : statusCodes.value.filter((code) => code !== DELETED_STATUS.code),
        epic_ids: epicIds.value,
        project_ids: projectIds.value,
        owner_ids: ownerIds.value,
        requester_ids: requesterIds.value,
    };
}

async function load(): Promise<void> {
    loading.value = true;

    try {
        tickets.value = await ticketsApi.list(filters());
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        loading.value = false;
    }
}

watch([statusCodes, epicIds, projectIds, ownerIds, requesterIds], load, { deep: true });
watch(() => ui.ticketsVersion, load);
onMounted(load);

const busy = ref<number | null>(null);

async function restore(ticket: TicketCard): Promise<void> {
    busy.value = ticket.id;

    try {
        await ticketsApi.restore(ticket.id);
        ui.notify(`Ticket ${ticket.reference} restauré.`);
        ui.ticketsChanged();
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        busy.value = null;
    }
}

async function destroy(ticket: TicketCard): Promise<void> {
    const confirmed = await ui.confirm({
        title: 'Supprimer définitivement',
        message:
            `Le ticket ${ticket.reference} « ${ticket.title} » sera effacé du dossier de données avec ses ` +
            'commentaires, son historique et ses pièces jointes. Cette action est irréversible.',
        confirmLabel: 'Supprimer définitivement',
        danger: true,
    });
    if (!confirmed) return;

    busy.value = ticket.id;

    try {
        await ticketsApi.destroy(ticket.id);
        ui.notify(`Ticket ${ticket.reference} supprimé définitivement.`);
        ui.ticketsChanged();
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        busy.value = null;
    }
}

const EXPORTS: { format: ExportFormat; label: string; title: string }[] = [
    { format: 'xlsx', label: 'Excel', title: 'au format Excel (.xlsx)' },
    { format: 'csv', label: 'CSV', title: 'au format CSV (séparateur « ; »)' },
    { format: 'json', label: 'JSON', title: 'au format JSON' },
];

/** Export in progress (the descriptions are fetched first). */
const exporting = ref<ExportFormat | null>(null);

/**
 * Export of the displayed tickets (current filters and search), description
 * included: the list is fetched again with the descriptions, which the
 * screen does not load.
 */
async function exportTickets(format: ExportFormat): Promise<void> {
    if (exporting.value) return;

    exporting.value = format;
    try {
        const withDescription = new Map(
            (await ticketsApi.list({ ...filters(), with_description: 1 })).map((t) => [t.id, t.description ?? null]),
        );
        const names = (ids: number[]) =>
            ids.map((id) => reference.userMap.get(id)?.full_name ?? '').filter((name) => name !== '');
        const rows: ExportedTicket[] = displayed.value.map((t) => ({
            reference: t.reference,
            title: t.title,
            status: presentation.status(t)?.label ?? t.status_code,
            type: presentation.epic(t)?.title ?? '',
            project: presentation.project(t)?.name ?? null,
            requester: presentation.requester(t)?.name ?? null,
            owner: presentation.owner(t)?.full_name ?? null,
            contributors: names(t.supporter_ids),
            time_spent: t.time_spent,
            start_date: t.start_date,
            due_date: t.due_date,
            actual_end_date: t.actual_end_date,
            created_at: t.created_at.slice(0, 10),
            comments_count: t.comments_count,
            attachments_count: t.attachments_count,
            description: withDescription.get(t.id) ?? null,
        }));

        downloadTickets(rows, format, `tickets-${toIsoDate(today())}`);
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        exporting.value = null;
    }
}
</script>

<template>
    <div class="page">
        <PageHeader title="Tous les tickets" :subtitle="`${displayed.length} ticket(s)`">
            <div class="search-box">
                <AppIcon name="search" :size="15" />
                <input v-model="search" type="search" placeholder="Titre ou identifiant…" aria-label="Rechercher" />
            </div>
            <MultiSelect
                v-model="statusCodes"
                class="toolbar-filter"
                :options="statusOptions"
                multiple
                clearable
                compact
                :searchable="false"
                placeholder="Statut"
            />
            <MultiSelect
                v-model="epicIds"
                class="toolbar-filter"
                :options="epicOptions"
                multiple
                clearable
                compact
                placeholder="Type"
            />
            <MultiSelect
                v-model="projectIds"
                class="toolbar-filter"
                :options="projectOptions"
                multiple
                clearable
                compact
                placeholder="Projet"
            />
            <MultiSelect
                v-model="ownerIds"
                class="toolbar-filter"
                :options="userOptions"
                multiple
                clearable
                compact
                placeholder="Responsable"
            />
            <MultiSelect
                v-model="requesterIds"
                class="toolbar-filter"
                :options="requesterOptions"
                multiple
                clearable
                compact
                placeholder="Demandeur"
            />
            <button v-if="hasFilters" class="btn btn-ghost btn-sm" type="button" @click="resetFilters">Effacer</button>
            <div class="export" role="group" aria-label="Télécharger les tickets affichés">
                <AppIcon name="download" :size="14" />
                <button
                    v-for="option in EXPORTS"
                    :key="option.format"
                    class="btn btn-secondary btn-sm"
                    type="button"
                    :title="`Télécharger les ${displayed.length} ticket(s) affiché(s), description comprise, ${option.title}`"
                    :disabled="displayed.length === 0 || exporting !== null"
                    @click="exportTickets(option.format)"
                >
                    {{ exporting === option.format ? '…' : option.label }}
                </button>
            </div>
        </PageHeader>

        <div class="page-content">
            <TicketTable :tickets="displayed" :loading="loading" empty-text="Aucun ticket ne correspond aux filtres.">
                <template v-if="canPurge" #actions="{ ticket }">
                    <button
                        v-if="ticket.deleted_at"
                        class="btn btn-ghost btn-icon btn-sm"
                        type="button"
                        :title="`Restaurer ${ticket.reference}`"
                        :aria-label="`Restaurer ${ticket.reference}`"
                        :disabled="busy !== null"
                        @click="restore(ticket)"
                    >
                        <AppIcon name="restore" :size="15" />
                    </button>
                    <button
                        class="btn btn-ghost btn-icon btn-sm destroy"
                        type="button"
                        :title="`Supprimer définitivement ${ticket.reference}`"
                        :aria-label="`Supprimer définitivement ${ticket.reference}`"
                        :disabled="busy !== null"
                        @click="destroy(ticket)"
                    >
                        <AppIcon name="trash" :size="15" />
                    </button>
                </template>
            </TicketTable>
        </div>
    </div>
</template>

<style scoped>
.export {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-text-muted);
}

.destroy:hover:not(:disabled) {
    color: #a23b3b;
}

.include-closed {
    font-size: var(--font-size-sm);
    white-space: nowrap;
}
</style>
