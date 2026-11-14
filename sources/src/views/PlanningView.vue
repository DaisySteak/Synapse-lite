<script setup lang="ts">
/**
 * Team planning (Gantt): whole team or grouped by owner, three zoom levels,
 * navigation in time, filters.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { errorMessage, fieldErrors } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import GanttChart from '@/components/gantt/GanttChart.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import MultiSelect from '@/components/ui/MultiSelect.vue';
import { usePersistentRef } from '@/composables/usePersistentRef';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { TicketCard } from '@/types/models';
import { addDays, formatDate, toIsoDate, today } from '@/utils/dates';
import { buildRange, type GanttZoom } from '@/utils/gantt';

/** Visible period per zoom: days shown, and days kept before the anchor. */
const PERIODS: Record<GanttZoom, { days: number; before: number; step: number; label: string }> = {
    week: { days: 28, before: 7, step: 7, label: 'Semaines' },
    month: { days: 91, before: 14, step: 30, label: 'Mois' },
    quarter: { days: 365, before: 30, step: 91, label: 'Trimestres' },
};

const reference = useReferenceStore();
const ui = useUiStore();
const router = useRouter();

const zoom = usePersistentRef<GanttZoom>('synapse.planning.zoom', 'month');
const byOwner = usePersistentRef<boolean>('synapse.planning.by-owner', true);
const includeClosed = usePersistentRef<boolean>('synapse.planning.include-closed', true);
const ownerIds = usePersistentRef<number[]>('synapse.planning.owners', []);
const epicIds = usePersistentRef<number[]>('synapse.planning.epics', []);
const projectIds = usePersistentRef<number[]>('synapse.planning.projects', []);
const anchor = ref(today());

const tickets = ref<TicketCard[]>([]);
const loading = ref(false);

const range = computed(() => {
    const period = PERIODS[zoom.value];
    // Start on a Monday for readable week columns.
    const start = addDays(anchor.value, -period.before);
    const monday = addDays(start, -((start.getDay() + 6) % 7));

    return buildRange(monday, period.days);
});

const userOptions = computed(() => reference.users.map((u) => ({ value: u.id, label: u.full_name })));
const epicOptions = computed(() => reference.epics.map((e) => ({ value: e.id, label: e.title, color: e.color })));
const projectOptions = computed(() => reference.projects.map((p) => ({ value: p.id, label: p.name, color: p.color })));

// Only the tickets with a start date appear in the planning.
const visibleTickets = computed(() =>
    tickets.value.filter((t) => t.start_date !== null && (includeClosed.value || !reference.isClosed(t.status_code))),
);

async function load(): Promise<void> {
    loading.value = true;

    try {
        tickets.value = await ticketsApi.list({
            owner_ids: ownerIds.value,
            epic_ids: epicIds.value,
            project_ids: projectIds.value,
            from: toIsoDate(range.value.start),
            to: toIsoDate(range.value.end),
        });
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        loading.value = false;
    }
}

function move(direction: -1 | 1): void {
    anchor.value = addDays(anchor.value, direction * PERIODS[zoom.value].step);
}

function open(ticket: TicketCard): void {
    void router.push({ name: 'ticket', params: { id: ticket.id } });
}

const FIELD_LABELS = {
    start_date: 'date de début',
    due_date: 'date de fin prévisionnelle',
    actual_end_date: 'date de fin réelle',
} as const;

/** Edge of a bar dragged: the bar keeps its new dates while they are saved. */
async function resize(
    ticket: TicketCard,
    patch: Partial<Record<keyof typeof FIELD_LABELS, string | null>>,
): Promise<void> {
    const index = tickets.value.findIndex((item) => item.id === ticket.id);
    if (index === -1) return;
    const before = tickets.value[index];
    tickets.value[index] = { ...before, ...patch };

    const [field, value] = Object.entries(patch)[0] as [keyof typeof FIELD_LABELS, string];

    try {
        await ticketsApi.update(ticket.id, patch);
        ui.notify(`${ticket.reference} : ${FIELD_LABELS[field]} au ${formatDate(value)}.`);
        ui.ticketsChanged();
    } catch (error) {
        const current = tickets.value.findIndex((item) => item.id === ticket.id);
        if (current !== -1) tickets.value[current] = before;
        ui.notify(Object.values(fieldErrors(error))[0] ?? errorMessage(error), 'error');
    }
}

watch([range, ownerIds, epicIds, projectIds], load, { deep: true });
watch(() => ui.ticketsVersion, load);
onMounted(load);
</script>

<template>
    <div class="page">
        <PageHeader title="Planning" subtitle="Rétro-planning de l'équipe">
            <div class="segmented" role="group" aria-label="Regroupement">
                <button type="button" :class="{ active: !byOwner }" @click="byOwner = false">Équipe</button>
                <button type="button" :class="{ active: byOwner }" @click="byOwner = true">Par utilisateur</button>
            </div>
            <div class="segmented" role="group" aria-label="Échelle">
                <button
                    v-for="(period, key) in PERIODS"
                    :key="key"
                    type="button"
                    :class="{ active: zoom === key }"
                    @click="zoom = key"
                >
                    {{ period.label }}
                </button>
            </div>
            <div class="navigation">
                <button
                    class="btn btn-secondary btn-sm btn-icon"
                    type="button"
                    title="Période précédente"
                    @click="move(-1)"
                >
                    <AppIcon name="chevron-left" :size="16" />
                </button>
                <button class="btn btn-secondary btn-sm" type="button" @click="anchor = today()">Aujourd'hui</button>
                <button
                    class="btn btn-secondary btn-sm btn-icon"
                    type="button"
                    title="Période suivante"
                    @click="move(1)"
                >
                    <AppIcon name="chevron-right" :size="16" />
                </button>
            </div>
            <MultiSelect
                v-model="ownerIds"
                class="filter"
                :options="userOptions"
                multiple
                clearable
                compact
                placeholder="Utilisateurs"
            />
            <MultiSelect
                v-model="epicIds"
                class="filter"
                :options="epicOptions"
                multiple
                clearable
                compact
                placeholder="Types"
            />
            <MultiSelect
                v-model="projectIds"
                class="filter"
                :options="projectOptions"
                multiple
                clearable
                compact
                placeholder="Projets"
            />
            <label class="checkbox include-closed">
                <input v-model="includeClosed" type="checkbox" />
                Terminés
            </label>
        </PageHeader>

        <div class="legend">
            <span v-for="status in reference.statuses" :key="status.code" class="legend-item">
                <span class="swatch" :style="{ background: status.color }" />{{ status.label }}
            </span>
            <span class="legend-item"><span class="swatch late" />Retard</span>
            <span class="legend-item" :title="`Durée indicative de ${reference.settings.open_ended_days} jours`">
                <span class="swatch open-ended" />Sans date de fin
            </span>
        </div>

        <div class="chart" :class="{ loading }">
            <GanttChart
                v-if="visibleTickets.length"
                :tickets="visibleTickets"
                :range="range"
                :zoom="zoom"
                :by-owner="byOwner"
                @open="open"
                @resize="resize"
            />
            <EmptyState
                v-else-if="!loading"
                icon="planning"
                title="Aucun ticket sur cette période"
                text="Seuls les tickets ayant une date de début apparaissent. Changez de période ou de filtres."
            />
        </div>
    </div>
</template>

<style scoped>
.segmented {
    display: inline-flex;
    padding: 2px;
    border-radius: var(--radius-md);
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
}

.segmented button {
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-muted);
    cursor: pointer;
}

.segmented button.active {
    background: var(--color-brand-600);
    color: #fff;
}

.navigation {
    display: inline-flex;
    gap: 4px;
}

.filter {
    width: 150px;
}

.include-closed {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
}

.legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-6);
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
}

.legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.swatch {
    width: 14px;
    height: 10px;
    border-radius: 2px;
}

.swatch.late {
    background: repeating-linear-gradient(135deg, rgb(163 92 92 / 55%) 0 3px, rgb(163 92 92 / 20%) 3px 6px);
}

.swatch.open-ended {
    width: 20px;
    border-radius: 2px 0 0 2px;
    background: linear-gradient(90deg, #6b7a80 0 50%, #c4cdcf 100%);
    clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%);
}

.chart {
    flex: 1;
    min-height: 0;
    margin: 0 var(--space-5) var(--space-5);
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    transition: opacity var(--transition);
}

.chart.loading {
    opacity: 0.7;
}
</style>
