<script setup lang="ts">
/**
 * Kanban board: one column per workflow step except the backlog (prepared
 * apart, see BacklogView), drag and drop between and inside columns, filters
 * (owner, type, project, requester, text; "Mes tickets" by default). The "Terminé" column only shows
 * the tickets closed for less than N days (N editable in the column header,
 * 20 by default).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { errorMessage } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import PageHeader from '@/components/layout/PageHeader.vue';
import TicketCard from '@/components/tickets/TicketCard.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import MultiSelect from '@/components/ui/MultiSelect.vue';
import { usePersistentRef } from '@/composables/usePersistentRef';
import { BACKLOG, useTicketPermissions } from '@/composables/useTicketPermissions';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { TicketCard as Card, TicketStatus } from '@/types/models';

const REFRESH_INTERVAL_MS = 60_000;

const reference = useReferenceStore();
const auth = useAuthStore();
const ui = useUiStore();
const { canUpdate } = useTicketPermissions();

const tickets = ref<Card[]>([]);
const loading = ref(false);

// Filters (kept per browser). The owner filter is kept per user and starts
// on "Mes tickets": everyone first sees their own tickets, and can uncheck it.
const ownerIds = usePersistentRef<number[]>(
    `synapse.board.owners.user-${auth.user?.id ?? 0}`,
    auth.user ? [auth.user.id] : [],
);
const epicIds = usePersistentRef<number[]>('synapse.board.epics', []);
const projectIds = usePersistentRef<number[]>('synapse.board.projects', []);
const requesterIds = usePersistentRef<number[]>('synapse.board.requesters', []);
const closedDays = usePersistentRef<number>('synapse.board.closed-days', reference.settings.closed_visible_days);
const search = ref('');

const userOptions = computed(() => reference.users.map((u) => ({ value: u.id, label: u.full_name })));
const epicOptions = computed(() => reference.epics.map((e) => ({ value: e.id, label: e.title, color: e.color })));
const projectOptions = computed(() => reference.projects.map((p) => ({ value: p.id, label: p.name, color: p.color })));
const requesterOptions = computed(() =>
    reference.requesters.map((r) => ({ value: r.id, label: r.name, color: r.color })),
);

const onlyMine = computed(
    () => auth.user !== null && ownerIds.value.length === 1 && ownerIds.value[0] === auth.user.id,
);
const hasFilters = computed(
    () =>
        ownerIds.value.length + epicIds.value.length + projectIds.value.length + requesterIds.value.length > 0 ||
        search.value.trim() !== '',
);

function toggleMine(): void {
    ownerIds.value = onlyMine.value || !auth.user ? [] : [auth.user.id];
}

function resetFilters(): void {
    ownerIds.value = [];
    epicIds.value = [];
    projectIds.value = [];
    requesterIds.value = [];
    search.value = '';
}

/** Workflow steps shown as columns: everything but the backlog. */
const boardStatuses = computed(() => reference.statuses.filter((status) => status.code !== BACKLOG));

const searchTerm = computed(() => search.value.trim().toLowerCase());

function matchesSearch(ticket: Card): boolean {
    return (
        !searchTerm.value ||
        ticket.title.toLowerCase().includes(searchTerm.value) ||
        ticket.reference.toLowerCase().includes(searchTerm.value)
    );
}

const columns = computed(() =>
    boardStatuses.value.map((status) => ({
        status,
        tickets: tickets.value
            .filter((ticket) => ticket.status_code === status.code && matchesSearch(ticket))
            .sort((a, b) => a.rank - b.rank || a.id - b.id),
    })),
);

async function load(): Promise<void> {
    loading.value = true;

    try {
        tickets.value = await ticketsApi.list({
            owner_ids: ownerIds.value,
            epic_ids: epicIds.value,
            project_ids: projectIds.value,
            requester_ids: requesterIds.value,
            exclude_status_codes: [BACKLOG],
            closed_within_days: Math.max(0, Number(closedDays.value) || 0),
        });
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        loading.value = false;
    }
}

watch([ownerIds, epicIds, projectIds, requesterIds], load, { deep: true });
watch(() => ui.ticketsVersion, load);

let closedDaysTimer: number | undefined;
watch(closedDays, () => {
    window.clearTimeout(closedDaysTimer);
    closedDaysTimer = window.setTimeout(load, 400);
});

// Drag and drop ----------------------------------------------------------------
const draggedId = ref<number | null>(null);
const dropTarget = ref<{ status: string; index: number } | null>(null);

function onDragStart(event: DragEvent, ticket: Card): void {
    if (!canUpdate(ticket)) {
        event.preventDefault();

        return;
    }

    draggedId.value = ticket.id;
    event.dataTransfer?.setData('text/plain', String(ticket.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(): void {
    draggedId.value = null;
    dropTarget.value = null;
}

/** Insertion index computed from the mouse position over the cards. */
function onDragOver(event: DragEvent, status: TicketStatus): void {
    if (draggedId.value === null) return;

    event.preventDefault();
    const list = event.currentTarget as HTMLElement;
    const cards = Array.from(list.querySelectorAll<HTMLElement>('[data-ticket-id]')).filter(
        (card) => Number(card.dataset.ticketId) !== draggedId.value,
    );
    const index = cards.findIndex((card) => {
        const box = card.getBoundingClientRect();

        return event.clientY < box.top + box.height / 2;
    });

    dropTarget.value = { status: status.code, index: index === -1 ? cards.length : index };
}

async function onDrop(status: TicketStatus): Promise<void> {
    const ticket = tickets.value.find((item) => item.id === draggedId.value);
    const target = dropTarget.value;
    onDragEnd();

    if (!ticket || !target || target.status !== status.code) return;

    // Optimistic update: renumber the target column locally.
    const snapshot = tickets.value.map((item) => ({ ...item }));
    const column = columns.value
        .find((c) => c.status.code === status.code)!
        .tickets.filter((item) => item.id !== ticket.id);
    column.splice(target.index, 0, ticket);
    column.forEach((item, index) => {
        item.rank = index + 1;
    });
    const wasClosed = reference.isClosed(ticket.status_code);
    ticket.status_code = status.code;

    try {
        const updated = await ticketsApi.move(ticket.id, status.code, target.index);
        // The stored rank is a decimal between the neighbours: the local order
        // computed above stays valid until the next refresh.
        Object.assign(ticket, { ...updated, rank: ticket.rank });
        if (!wasClosed && reference.isClosed(updated.status_code)) ui.confirmTimeSpent(updated);
    } catch (error) {
        tickets.value = snapshot;
        ui.notify(errorMessage(error), 'error');
    }
}

// Periodic refresh so that the board reflects the team's changes.
let refreshTimer: number | undefined;

function refreshIfVisible(): void {
    if (document.visibilityState === 'visible' && draggedId.value === null) void load();
}

onMounted(() => {
    void load();
    refreshTimer = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
});

onBeforeUnmount(() => {
    window.clearInterval(refreshTimer);
    window.clearTimeout(closedDaysTimer);
});
</script>

<template>
    <div class="page">
        <PageHeader title="Tableau" stacked :subtitle="`${tickets.length} ticket(s) affiché(s)`">
            <div class="search">
                <AppIcon name="search" :size="15" />
                <input v-model="search" type="search" placeholder="Rechercher un ticket…" aria-label="Rechercher" />
            </div>
            <button
                class="btn btn-sm"
                :class="onlyMine ? 'btn-primary' : 'btn-secondary'"
                type="button"
                @click="toggleMine"
            >
                <AppIcon name="user" :size="14" />
                Mes tickets
            </button>
            <MultiSelect
                v-model="ownerIds"
                class="filter"
                :options="userOptions"
                multiple
                clearable
                compact
                placeholder="Propriétaire"
            />
            <MultiSelect
                v-model="epicIds"
                class="filter"
                :options="epicOptions"
                multiple
                clearable
                compact
                placeholder="Type"
            />
            <MultiSelect
                v-model="projectIds"
                class="filter"
                :options="projectOptions"
                multiple
                clearable
                compact
                placeholder="Projet"
            />
            <MultiSelect
                v-model="requesterIds"
                class="filter"
                :options="requesterOptions"
                multiple
                clearable
                compact
                placeholder="Demandeur"
            />
            <button v-if="hasFilters" class="btn btn-ghost btn-sm" type="button" @click="resetFilters">Effacer</button>
        </PageHeader>

        <div class="board" :class="{ loading }">
            <section
                v-for="column in columns"
                :key="column.status.code"
                class="column"
                :style="{ '--status-color': column.status.color }"
            >
                <header class="column-header">
                    <span class="column-title">{{ column.status.label }}</span>
                    <span class="count">{{ column.tickets.length }}</span>
                    <label
                        v-if="column.status.is_final"
                        class="closed-days"
                        title="Afficher les tickets terminés depuis moins de N jours"
                    >
                        &lt;
                        <input
                            v-model.number="closedDays"
                            type="number"
                            min="0"
                            max="3650"
                            aria-label="Nombre de jours"
                        />
                        j
                    </label>
                    <button
                        v-else-if="auth.can('tickets.create')"
                        class="add"
                        type="button"
                        :title="`Créer un ticket dans « ${column.status.label} »`"
                        @click="ui.openQuickCreate({ status_code: column.status.code })"
                    >
                        <AppIcon name="plus" :size="15" />
                    </button>
                </header>

                <div
                    class="cards"
                    :class="{ 'drop-active': dropTarget?.status === column.status.code }"
                    @dragover="onDragOver($event, column.status)"
                    @drop.prevent="onDrop(column.status)"
                >
                    <template v-for="(ticket, index) in column.tickets" :key="ticket.id">
                        <div
                            v-if="
                                dropTarget?.status === column.status.code &&
                                dropTarget.index === index &&
                                draggedId !== ticket.id
                            "
                            class="placeholder"
                        />
                        <TicketCard
                            :data-ticket-id="ticket.id"
                            :ticket="ticket"
                            :draggable="canUpdate(ticket)"
                            :dragging="draggedId === ticket.id"
                            @dragstart="onDragStart($event, ticket)"
                            @dragend="onDragEnd"
                        />
                    </template>
                    <div
                        v-if="
                            dropTarget?.status === column.status.code &&
                            dropTarget.index >= column.tickets.filter((t) => t.id !== draggedId).length
                        "
                        class="placeholder"
                    />
                    <p v-if="column.tickets.length === 0 && dropTarget?.status !== column.status.code" class="empty">
                        Aucun ticket
                    </p>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
.search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 30px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-subtle);
}

.search:focus-within {
    border-color: var(--color-brand-500);
    box-shadow: var(--focus-ring);
}

.search input {
    width: 180px;
    border: 0;
    outline: none;
    background: transparent;
}

.filter {
    width: 150px;
}

.board {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(220px, 1fr);
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    overflow-x: auto;
    transition: opacity var(--transition);
}

.board.loading {
    opacity: 0.85;
}

.column {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-radius: var(--radius-lg);
    background: var(--color-surface-sunken);
    border-top: 3px solid var(--status-color);
}

.column-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3) var(--space-2);
}

.column-title {
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
}

.count {
    min-width: 22px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: rgb(255 255 255 / 70%);
    font-size: var(--font-size-xs);
    font-weight: 700;
    line-height: 20px;
    text-align: center;
    color: var(--color-text-muted);
}

.add {
    display: inline-flex;
    margin-left: auto;
    padding: 4px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
}

.add:hover {
    background: rgb(255 255 255 / 70%);
    color: var(--color-brand-700);
}

.closed-days {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-muted);
}

.closed-days input {
    width: 46px;
    height: 22px;
    padding: 0 4px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    text-align: right;
    font-size: var(--font-size-xs);
}

.cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 80px;
    padding: var(--space-1) var(--space-2) var(--space-3);
    overflow-y: auto;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    transition: background var(--transition-fast);
}

.cards.drop-active {
    background: color-mix(in srgb, var(--color-brand-500) 8%, transparent);
}

.placeholder {
    height: 56px;
    flex-shrink: 0;
    border: 2px dashed var(--color-brand-300);
    border-radius: var(--radius-md);
    background: rgb(255 255 255 / 50%);
}

.empty {
    padding: var(--space-4);
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-subtle);
}
</style>
