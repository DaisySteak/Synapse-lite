<script setup lang="ts">
/**
 * Requesters: name and color (shown as a pill on the kanban cards), and the
 * time spent on their tickets, in man-days (j/h).
 */
import { computed } from 'vue';
import { adminApi } from '@/api/admin';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import ColorBadge from '@/components/ui/ColorBadge.vue';
import ColorInput from '@/components/ui/ColorInput.vue';
import { useAdminResource } from '@/composables/useAdminResource';
import { usePersistentRef } from '@/composables/usePersistentRef';
import type { Requester } from '@/types/models';
import { formatManDays, plural } from '@/utils/format';

type RequesterForm = Pick<Requester, 'name' | 'color' | 'is_active'>;

const empty = (): RequesterForm => ({ name: '', color: '#2F6EBA', is_active: true });

const { items, loading, dialogOpen, editing, form, errors, saving, openCreate, openEdit, submit, remove } =
    useAdminResource<Requester, RequesterForm>(adminApi.requesters, empty);

const totals = computed(() =>
    items.value.reduce(
        (sum, r) => ({
            time: sum.time + (r.statistics?.time_spent_total ?? 0),
            timed: sum.timed + (r.statistics?.timed_tickets_count ?? 0),
            tickets: sum.tickets + (r.tickets_count ?? 0),
        }),
        { time: 0, timed: 0, tickets: 0 },
    ),
);

/** Largest total, to draw the bars. */
const maxTime = computed(() => Math.max(0, ...items.value.map((r) => r.statistics?.time_spent_total ?? 0)));

function share(requester: Requester): number {
    const time = requester.statistics?.time_spent_total ?? 0;

    return maxTime.value > 0 ? (time / maxTime.value) * 100 : 0;
}

function average(requester: Requester): string {
    const stats = requester.statistics;
    if (!stats?.timed_tickets_count) return '—';

    return formatManDays(Math.round((stats.time_spent_total / stats.timed_tickets_count) * 100) / 100);
}

// --- Sorting (click on a column header) ----------------------------------------

type SortKey = 'name' | 'tickets' | 'time' | 'closed' | 'open' | 'average' | 'state';

const COLUMNS: { key: SortKey; label: string; class?: string }[] = [
    { key: 'name', label: 'Demandeur' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'time', label: 'Temps consommé', class: 'time-head' },
    { key: 'closed', label: 'Tickets terminés', class: 'num' },
    { key: 'open', label: 'Tickets ouverts', class: 'num' },
    { key: 'average', label: 'Moyenne / ticket', class: 'num' },
    { key: 'state', label: 'État' },
];

const sortKey = usePersistentRef<SortKey>('synapse.requesters.sort', 'name');
const direction = usePersistentRef<'asc' | 'desc'>('synapse.requesters.direction', 'asc');

function sortValue(requester: Requester, key: SortKey): string | number {
    const stats = requester.statistics;

    switch (key) {
        case 'name':
            return requester.name;
        case 'tickets':
            return requester.tickets_count ?? 0;
        case 'time':
            return stats?.time_spent_total ?? 0;
        case 'closed':
            return stats?.time_spent_closed ?? 0;
        case 'open':
            return stats?.time_spent_open ?? 0;
        case 'average':
            return stats?.timed_tickets_count ? stats.time_spent_total / stats.timed_tickets_count : -1;
        case 'state':
            return requester.is_active ? 0 : 1;
    }
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

const sorted = computed(() => {
    const factor = direction.value === 'asc' ? 1 : -1;

    return [...items.value].sort((a, b) => {
        const left = sortValue(a, sortKey.value);
        const right = sortValue(b, sortKey.value);
        const result =
            typeof left === 'number' && typeof right === 'number'
                ? left - right
                : collator.compare(String(left), String(right));

        // Equal values: alphabetical order.
        return result * factor || collator.compare(a.name, b.name);
    });
});

/** Same column: reverse the order. New column: largest first for figures, A to Z for texts. */
function sortBy(key: SortKey): void {
    if (sortKey.value === key) {
        direction.value = direction.value === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey.value = key;
        direction.value = key === 'name' || key === 'state' ? 'asc' : 'desc';
    }
}

function edit(requester: Requester): void {
    openEdit(requester, (r) => ({ name: r.name, color: r.color, is_active: r.is_active }));
}
</script>

<template>
    <div class="page">
        <PageHeader title="Demandeurs" subtitle="Personnes ou directions à l'origine des demandes">
            <button class="btn btn-primary" type="button" @click="openCreate">
                <AppIcon name="plus" :size="16" />
                Nouveau demandeur
            </button>
        </PageHeader>

        <div class="page-content">
            <div v-if="!loading && items.length" class="stats">
                <div class="stat card">
                    <span class="stat-value">{{ formatManDays(totals.time) }}</span>
                    <span class="stat-label">Temps consommé, tous demandeurs</span>
                </div>
                <div class="stat card">
                    <span class="stat-value">{{ totals.timed }} / {{ totals.tickets }}</span>
                    <span class="stat-label">Tickets dont le temps est renseigné</span>
                </div>
                <div class="stat card">
                    <span class="stat-value">{{
                        totals.timed ? formatManDays(Math.round((totals.time / totals.timed) * 100) / 100) : '—'
                    }}</span>
                    <span class="stat-label">Moyenne par ticket renseigné</span>
                </div>
            </div>

            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th
                                v-for="column in COLUMNS"
                                :key="column.key"
                                :class="column.class"
                                :aria-sort="
                                    sortKey === column.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                                "
                            >
                                <button
                                    type="button"
                                    class="sort"
                                    :class="{ active: sortKey === column.key }"
                                    :title="`Trier par ${column.label.toLowerCase()}`"
                                    @click="sortBy(column.key)"
                                >
                                    {{ column.label }}
                                    <AppIcon
                                        v-if="sortKey === column.key"
                                        name="chevron-down"
                                        :size="12"
                                        :class="{ up: direction === 'asc' }"
                                    />
                                </button>
                            </th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="8" class="muted">Chargement…</td>
                        </tr>
                        <tr v-for="requester in sorted" :key="requester.id">
                            <td><ColorBadge :color="requester.color" :label="requester.name" /></td>
                            <td>{{ requester.tickets_count ?? 0 }}</td>
                            <td
                                class="time"
                                :title="
                                    requester.statistics
                                        ? `${plural(requester.statistics.timed_tickets_count, 'ticket')} renseigné(s) sur ${requester.tickets_count ?? 0}`
                                        : ''
                                "
                            >
                                <div class="time-cell">
                                    <span class="time-value">{{
                                        formatManDays(requester.statistics?.time_spent_total ?? 0)
                                    }}</span>
                                    <span class="bar"><span :style="{ width: `${share(requester)}%` }" /></span>
                                </div>
                            </td>
                            <td class="num">
                                {{ formatManDays(requester.statistics?.time_spent_closed ?? 0) }}
                            </td>
                            <td class="num">{{ formatManDays(requester.statistics?.time_spent_open ?? 0) }}</td>
                            <td class="num">{{ average(requester) }}</td>
                            <td>
                                <span :class="['badge', requester.is_active ? 'badge-success' : 'badge-muted']">
                                    {{ requester.is_active ? 'Actif' : 'Inactif' }}
                                </span>
                            </td>
                            <td class="actions">
                                <button class="btn btn-ghost btn-sm" type="button" @click="edit(requester)">
                                    <AppIcon name="edit" :size="14" />
                                    Modifier
                                </button>
                                <button
                                    v-if="!requester.tickets_count"
                                    class="btn btn-ghost btn-sm"
                                    type="button"
                                    title="Supprimer"
                                    @click="remove(requester, requester.name)"
                                >
                                    <AppIcon name="trash" :size="14" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <BaseModal
            :open="dialogOpen"
            :title="editing ? `Modifier ${editing.name}` : 'Nouveau demandeur'"
            width="480px"
            @close="dialogOpen = false"
        >
            <form class="form-grid" novalidate @submit.prevent="submit()">
                <div class="field">
                    <label class="field-label" for="r-name">Nom<span class="required">*</span></label>
                    <input
                        id="r-name"
                        v-model="form.name"
                        class="input"
                        maxlength="150"
                        :class="{ 'has-error': errors.name }"
                    />
                    <span v-if="errors.name" class="field-error">{{ errors.name }}</span>
                </div>
                <div class="field">
                    <span class="field-label">Couleur</span>
                    <ColorInput v-model="form.color" />
                    <span v-if="errors.color" class="field-error">{{ errors.color }}</span>
                </div>
                <div class="field">
                    <span class="field-label">Aperçu</span>
                    <ColorBadge :color="form.color" :label="form.name || 'Demandeur'" />
                </div>
                <label class="checkbox">
                    <input v-model="form.is_active" type="checkbox" />
                    Proposé à la création de tickets
                </label>
            </form>
            <template #footer>
                <button class="btn btn-secondary" type="button" @click="dialogOpen = false">Annuler</button>
                <button class="btn btn-primary" type="button" :disabled="saving" @click="submit()">Enregistrer</button>
            </template>
        </BaseModal>
    </div>
</template>

<style scoped>
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

.sort.active {
    color: var(--color-text);
}

.sort .up {
    transform: rotate(180deg);
}

.num .sort {
    justify-content: flex-end;
}

.stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
}

.stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
}

.stat-value {
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--color-brand-600);
    font-variant-numeric: tabular-nums;
}

.stat-label {
    font-size: 0.82rem;
    color: var(--color-text-muted);
}

.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.time-head {
    min-width: 180px;
}

.time-cell {
    display: flex;
    align-items: center;
    gap: 10px;
}

.time-value {
    min-width: 64px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.bar {
    flex: 1;
    height: 6px;
    min-width: 60px;
    border-radius: 3px;
    background: var(--color-brand-100);
    overflow: hidden;
}

.bar > span {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--color-brand-600);
}
</style>
