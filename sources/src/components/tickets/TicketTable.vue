<script setup lang="ts">
/**
 * Sortable table of tickets (list of all tickets, backlog). A click on a row
 * opens the ticket; the "actions" slot adds a last column.
 */
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import DayCounters from '@/components/tickets/DayCounters.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import ColorBadge from '@/components/ui/ColorBadge.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useTicketPresentation } from '@/composables/useTicketPresentation';
import { DELETED_STATUS } from '@/api/tickets';
import type { TicketCard } from '@/types/models';
import { formatDate } from '@/utils/dates';

type SortKey =
    | 'reference'
    | 'title'
    | 'status'
    | 'epic'
    | 'project'
    | 'requester'
    | 'owner'
    | 'start'
    | 'due'
    | 'created'
    | 'rank';

const props = withDefaults(
    defineProps<{
        tickets: TicketCard[];
        showStatus?: boolean;
        defaultSort?: SortKey;
        defaultDirection?: 'asc' | 'desc';
        loading?: boolean;
        emptyText?: string;
    }>(),
    { showStatus: true, defaultSort: 'created', defaultDirection: 'desc', loading: false, emptyText: 'Aucun ticket.' },
);

defineSlots<{ actions?(props: { ticket: TicketCard }): unknown }>();

const PAGE_SIZE = 100;

const router = useRouter();
const presentation = useTicketPresentation();

const sortKey = ref<SortKey>(props.defaultSort);
const direction = ref<'asc' | 'desc'>(props.defaultDirection);
const limit = ref(PAGE_SIZE);

watch(
    () => props.tickets,
    () => {
        limit.value = PAGE_SIZE;
    },
);

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

/** Value used to sort a ticket on a column (missing values always last). */
function sortValue(ticket: TicketCard, key: SortKey): string | number | null {
    switch (key) {
        case 'reference':
            return ticket.reference;
        case 'title':
            return ticket.title;
        case 'status':
            return presentation.status(ticket)?.position ?? null;
        case 'epic':
            return presentation.epic(ticket)?.title ?? null;
        case 'project':
            return presentation.project(ticket)?.name ?? null;
        case 'requester':
            return presentation.requester(ticket)?.name ?? null;
        case 'owner':
            return presentation.owner(ticket)?.full_name ?? null;
        case 'start':
            return ticket.start_date;
        case 'due':
            return ticket.due_date;
        case 'created':
            return ticket.created_at;
        case 'rank':
            return ticket.rank;
    }
}

const sorted = computed(() => {
    const factor = direction.value === 'asc' ? 1 : -1;

    return [...props.tickets].sort((a, b) => {
        const left = sortValue(a, sortKey.value);
        const right = sortValue(b, sortKey.value);

        if (left === right) return a.id - b.id;
        if (left === null) return 1;
        if (right === null) return -1;

        const result =
            typeof left === 'number' && typeof right === 'number'
                ? left - right
                : collator.compare(String(left), String(right));

        return result * factor;
    });
});

const visible = computed(() => sorted.value.slice(0, limit.value));

function sortBy(key: SortKey): void {
    if (sortKey.value === key) {
        direction.value = direction.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        direction.value = key === 'created' ? 'desc' : 'asc';
    }
}

function open(ticket: TicketCard, event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (target.closest('a, button, select, input, .row-actions')) return;
    // A deleted ticket has no page any more (administrators: restore it first).
    if (ticket.deleted_at) return;

    void router.push({ name: 'ticket', params: { id: ticket.id } });
}

const columns = computed(() =>
    [
        { key: 'reference', label: 'Identifiant' },
        { key: 'title', label: 'Titre' },
        props.showStatus ? { key: 'status', label: 'Statut' } : null,
        { key: 'epic', label: 'Type' },
        { key: 'project', label: 'Projet' },
        { key: 'requester', label: 'Demandeur' },
        { key: 'owner', label: 'Propriétaire' },
        { key: 'start', label: 'Début' },
        { key: 'due', label: 'Fin prév.' },
        { key: 'created', label: 'Créé le' },
    ].filter((column): column is { key: SortKey; label: string } => column !== null),
);
</script>

<template>
    <div class="table-wrapper card">
        <table class="table ticket-table">
            <thead>
                <tr>
                    <th v-for="column in columns" :key="column.key">
                        <button type="button" class="sort" @click="sortBy(column.key)">
                            {{ column.label }}
                            <AppIcon
                                v-if="sortKey === column.key"
                                :name="direction === 'asc' ? 'chevron-down' : 'chevron-right'"
                                :size="12"
                                :class="{ up: direction === 'desc' }"
                            />
                        </button>
                    </th>
                    <th v-if="$slots.actions" class="actions-head" />
                </tr>
            </thead>
            <tbody>
                <tr v-if="loading && tickets.length === 0">
                    <td :colspan="columns.length + 1" class="muted">Chargement…</td>
                </tr>
                <tr v-else-if="tickets.length === 0">
                    <td :colspan="columns.length + 1" class="muted">{{ emptyText }}</td>
                </tr>
                <tr
                    v-for="ticket in visible"
                    :key="ticket.id"
                    class="row"
                    :class="{ deleted: ticket.deleted_at }"
                    @click="open(ticket, $event)"
                >
                    <td class="reference">
                        <span
                            class="dot"
                            :style="{ background: presentation.epic(ticket)?.color ?? '#6B7A80' }"
                            aria-hidden="true"
                        />
                        <span v-if="ticket.deleted_at" class="deleted-reference">{{ ticket.reference }}</span>
                        <RouterLink v-else :to="{ name: 'ticket', params: { id: ticket.id } }">{{
                            ticket.reference
                        }}</RouterLink>
                        <AppIcon
                            v-if="ticket.recurring_ticket_id"
                            name="repeat"
                            :size="12"
                            class="recurring"
                            title="Créé par un ticket récurrent"
                        />
                    </td>
                    <td class="title">
                        {{ ticket.title }}
                        <DayCounters :ticket="ticket" class="counters" />
                    </td>
                    <td v-if="showStatus">
                        <span
                            v-if="ticket.deleted_at"
                            class="status"
                            :style="{ '--status-color': DELETED_STATUS.color }"
                            :title="`Supprimé le ${formatDate(ticket.deleted_at)}`"
                        >
                            {{ DELETED_STATUS.label }}
                        </span>
                        <span
                            v-else
                            class="status"
                            :style="{ '--status-color': presentation.status(ticket)?.color ?? '#6B7A80' }"
                        >
                            {{ presentation.status(ticket)?.label ?? ticket.status_code }}
                        </span>
                    </td>
                    <td>{{ presentation.epic(ticket)?.title }}</td>
                    <td>
                        <ColorBadge
                            v-if="presentation.project(ticket)"
                            :color="presentation.project(ticket)!.color"
                            :label="presentation.project(ticket)!.name"
                        />
                    </td>
                    <td>
                        <ColorBadge
                            v-if="presentation.requester(ticket)"
                            :color="presentation.requester(ticket)!.color"
                            :label="presentation.requester(ticket)!.name"
                        />
                    </td>
                    <td>
                        <span class="owner">
                            <UserAvatar :user="presentation.owner(ticket)" :size="22" />
                            {{ presentation.owner(ticket)?.full_name }}
                        </span>
                    </td>
                    <td class="date">{{ formatDate(ticket.start_date) }}</td>
                    <td class="date">{{ formatDate(ticket.due_date) }}</td>
                    <td class="date">{{ formatDate(ticket.created_at) }}</td>
                    <td v-if="$slots.actions" class="row-actions">
                        <slot name="actions" :ticket="ticket" />
                    </td>
                </tr>
            </tbody>
        </table>
        <div v-if="sorted.length > limit" class="more">
            <button class="btn btn-secondary btn-sm" type="button" @click="limit += PAGE_SIZE">
                Afficher plus ({{ sorted.length - limit }} restant(s))
            </button>
        </div>
    </div>
</template>

<style scoped>
.table-wrapper {
    overflow: auto;
}

.ticket-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--color-surface-alt);
    white-space: nowrap;
}

.sort {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    cursor: pointer;
}

.sort .up {
    transform: rotate(-90deg);
}

.row {
    cursor: pointer;
}

.reference {
    white-space: nowrap;
    font-weight: 700;
}

.reference a {
    color: var(--color-text);
}

.dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 6px;
    border-radius: 2px;
}

.recurring {
    margin-left: 4px;
    color: var(--color-text-subtle);
    vertical-align: -1px;
}

.title {
    min-width: 240px;
    font-weight: 600;
}

.counters {
    display: flex;
    margin-top: 2px;
}

.status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
}

.status::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--status-color);
}

.owner {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
}

.date {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}

/* The actions stay visible when the table scrolls horizontally. */
.row.deleted {
    cursor: default;
}

.row.deleted .title {
    color: var(--color-text-muted);
}

.deleted-reference {
    font-weight: 600;
    color: var(--color-text-muted);
    text-decoration: line-through;
}

.row-actions,
.actions-head {
    position: sticky;
    right: 0;
    white-space: nowrap;
    text-align: right;
    box-shadow: -10px 0 10px -10px rgb(0 0 0 / 18%);
}

.row-actions {
    background: var(--color-surface);
}

.actions-head {
    z-index: 2;
}

.more {
    display: flex;
    justify-content: center;
    padding: var(--space-3);
}
</style>
