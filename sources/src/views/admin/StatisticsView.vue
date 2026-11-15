<script setup lang="ts">
/**
 * Statistics (administrators): four key figures, then the team, the tickets
 * and the requesters, for a month, a quarter or a year. Each block exports
 * its data to Excel, "Tout exporter" gathers every block in one workbook.
 *
 * The definitions of the figures are in backend/statistics.ts.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { errorMessage } from '@/api/errors';
import { statisticsApi, type Statistics, type TicketLine } from '@/api/statistics';
import PageHeader from '@/components/layout/PageHeader.vue';
import BarList from '@/components/stats/BarList.vue';
import LineChart from '@/components/stats/LineChart.vue';
import StatCard from '@/components/stats/StatCard.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { usePersistentRef } from '@/composables/usePersistentRef';
import { useUiStore } from '@/stores/ui';
import { formatDate, toIsoDate } from '@/utils/dates';
import { formatManDays, plural } from '@/utils/format';
import { periodOf, shiftPeriod, type PeriodKind } from '@/utils/periods';
import type { XlsxCell, XlsxSheet } from '@/utils/xlsx';

/** Colors of the series (validated for color blindness): A, then B. */
const SERIES_A = '#00927F';
const SERIES_B = '#C27C0E';

const KINDS: { value: PeriodKind; label: string }[] = [
    { value: 'month', label: 'Mois' },
    { value: 'quarter', label: 'Trimestre' },
    { value: 'year', label: 'Année' },
];

const ui = useUiStore();

const kind = usePersistentRef<PeriodKind>('synapse.statistics.kind', 'month');
const day = ref(toIsoDate(new Date()));
const overloadThreshold = usePersistentRef('synapse.statistics.overload', 8);
const staleDays = usePersistentRef('synapse.statistics.stale', 14);
const requesterSort = ref<'time' | 'count'>('time');

const period = computed(() => periodOf(kind.value, day.value));
const isCurrent = computed(() => period.value.start === periodOf(kind.value, toIsoDate(new Date())).start);
const stats = ref<Statistics | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

const positive = (value: number, fallback: number) =>
    Number.isFinite(value) && value >= 1 ? Math.round(value) : fallback;

async function load(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
        stats.value = await statisticsApi.compute({
            kind: kind.value,
            day: day.value,
            staleDays: positive(staleDays.value, 14),
            overloadThreshold: positive(overloadThreshold.value, 8),
        });
    } catch (e) {
        error.value = errorMessage(e);
    } finally {
        loading.value = false;
    }
}

onMounted(load);
watch([kind, day, staleDays, overloadThreshold], load);
watch(() => ui.ticketsVersion, load);

function shift(delta: number): void {
    day.value = shiftPeriod(period.value, delta).start;
}

// --- Display -------------------------------------------------------------------

const unitLabel = computed(() => (kind.value === 'year' ? 'mois' : 'semaine'));
const periodScope = computed(() => `Sur ${kind.value === 'year' ? "l'année" : 'la période'}`);
const TODAY_SCOPE = 'À ce jour';

const number = (value: number | null, digits = 1) =>
    value === null ? '—' : value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
const days = (value: number | null) => (value === null ? '—' : `${number(value)} j`);
const percent = (value: number | null) => (value === null ? '—' : `${number(value * 100, 0)} %`);
const labels = computed(() => stats.value?.buckets.map((bucket) => bucket.label) ?? []);

const maxOpen = computed(() =>
    Math.max(1, overloadThreshold.value, ...(stats.value?.team ?? []).map((row) => row.open)),
);
const maxOccupation = computed(() => Math.max(1, ...(stats.value?.team ?? []).map((row) => row.occupation ?? 0)));
const activeTeam = computed(() =>
    (stats.value?.team ?? []).filter((row) => row.open > 0 || row.closed > 0 || row.time_spent > 0),
);
const idleTeam = computed(() => (stats.value?.team.length ?? 0) - activeTeam.value.length);

const leadItems = computed(() =>
    (stats.value?.by_type ?? [])
        .filter((row) => row.average_lead !== null)
        .map((row) => ({
            label: row.name,
            value: row.average_lead ?? 0,
            display: days(row.average_lead),
            hint: `${row.name} : ${days(row.average_lead)} en moyenne sur ${plural(row.count, 'ticket terminé', 'tickets terminés')}`,
        }))
        .sort((a, b) => b.value - a.value),
);

const timeItems = (rows: Statistics['by_type']) =>
    rows.map((row) => ({
        label: row.name,
        value: row.time_spent,
        display: formatManDays(row.time_spent),
        hint: `${row.name} : ${formatManDays(row.time_spent)} sur ${plural(row.count, 'ticket terminé', 'tickets terminés')}`,
    }));

const stockItems = computed(() =>
    (stats.value?.stock ?? []).map((status) => ({
        label: status.label,
        value: status.count,
        display: String(status.count),
        marker: status.color,
    })),
);

const sortedRequesters = computed(() => {
    const rows = [...(stats.value?.requesters ?? [])];

    return requesterSort.value === 'time'
        ? rows
        : rows.sort((a, b) => b.started + b.closed - (a.started + a.closed) || b.time_spent - a.time_spent);
});
const maxRequesterTime = computed(() => Math.max(0, ...(stats.value?.requesters ?? []).map((row) => row.time_spent)));

const bar = (value: number, max: number) => ({ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` });

// --- Excel exports -------------------------------------------------------------

type SheetKey =
    'load' | 'occupation' | 'velocity' | 'stock' | 'flow' | 'lead' | 'due' | 'blocked' | 'time' | 'requesters';

const ticketColumns = (daysHeader: string) => [
    { header: 'Ticket', width: 14 },
    { header: 'Titre', width: 50 },
    { header: 'Responsable', width: 24 },
    { header: 'Demandeur', width: 24 },
    { header: 'Statut', width: 14 },
    { header: 'Échéance', width: 12 },
    { header: daysHeader, width: 14 },
];
const ticketRow = (line: TicketLine): XlsxCell[] => [
    line.reference,
    line.title,
    line.owner,
    line.requester,
    line.status,
    line.due_date ? new Date(`${line.due_date}T00:00:00`) : null,
    line.days,
];

function sheet(key: SheetKey, data: Statistics): XlsxSheet {
    const bucketColumns = data.buckets.map((bucket) => ({ header: bucket.label, width: 10 }));

    switch (key) {
        case 'load':
            return {
                name: 'Charge',
                columns: [
                    { header: 'Personne', width: 26 },
                    { header: 'Ouverts', width: 10 },
                    { header: 'En cours', width: 10 },
                    { header: 'En attente', width: 11 },
                    { header: 'En retard', width: 10 },
                    { header: 'Surcharge', width: 10 },
                ],
                rows: data.team.map((row) => [
                    row.name,
                    row.open,
                    row.in_progress,
                    row.waiting,
                    row.overdue,
                    row.overloaded ? 'Oui' : 'Non',
                ]),
            };
        case 'occupation':
            return {
                name: 'Occupation',
                columns: [
                    { header: 'Personne', width: 26 },
                    { header: 'Tickets terminés', width: 16 },
                    { header: 'Temps consommé (j/h)', width: 20 },
                    { header: 'Jours ouvrés disponibles', width: 22 },
                    { header: "Taux d'occupation (%)", width: 20 },
                ],
                rows: data.team.map((row) => [
                    row.name,
                    row.closed,
                    row.time_spent,
                    data.available_days,
                    row.occupation === null ? null : Math.round(row.occupation * 1000) / 10,
                ]),
            };
        case 'velocity':
            return {
                name: 'Vélocité',
                columns: [{ header: 'Personne', width: 26 }, ...bucketColumns, { header: 'Total', width: 10 }],
                rows: [
                    ...data.team.map((row) => [row.name, ...row.velocity, row.closed]),
                    ['Équipe', ...data.closed, data.tiles.closed],
                ],
            };
        case 'stock':
            return {
                name: 'Stock',
                columns: [
                    { header: 'Statut / fin de période', width: 24 },
                    { header: 'Tickets', width: 10 },
                ],
                rows: [
                    ...data.stock.map((status): XlsxCell[] => [status.label, status.count]),
                    ...data.buckets.map((bucket, index): XlsxCell[] => [
                        `Non terminés au ${formatDate(bucket.end)}`,
                        data.stock_evolution[index],
                    ]),
                ],
            };
        case 'flow':
            return {
                name: 'Démarrés et terminés',
                columns: [
                    { header: 'Du', width: 12 },
                    { header: 'Au', width: 12 },
                    { header: 'Démarrés', width: 10 },
                    { header: 'Terminés', width: 10 },
                ],
                rows: data.buckets.map((bucket, index) => [
                    new Date(`${bucket.start}T00:00:00`),
                    new Date(`${bucket.end}T00:00:00`),
                    data.started[index],
                    data.closed[index],
                ]),
            };
        case 'lead':
            return {
                name: 'Délai par type',
                columns: [
                    { header: 'Type', width: 26 },
                    { header: 'Tickets terminés', width: 16 },
                    { header: 'Délai moyen (jours)', width: 18 },
                ],
                rows: data.by_type.map((row) => [row.name, row.count, row.average_lead]),
            };
        case 'due':
            return { name: 'En retard', columns: ticketColumns('Jours de retard'), rows: data.overdue.map(ticketRow) };
        case 'blocked':
            return {
                name: 'Bloqués',
                columns: [...ticketColumns('Jours sans modification'), { header: 'Raison', width: 32 }],
                rows: data.blocked.map((line) => [...ticketRow(line), line.reason ?? null]),
            };
        case 'time':
            return {
                name: 'Temps par type et projet',
                columns: [
                    { header: 'Regroupement', width: 12 },
                    { header: 'Nom', width: 30 },
                    { header: 'Tickets terminés', width: 16 },
                    { header: 'Temps consommé (j/h)', width: 20 },
                ],
                rows: [
                    ...data.by_type.map((row): XlsxCell[] => ['Type', row.name, row.count, row.time_spent]),
                    ...data.by_project.map((row): XlsxCell[] => ['Projet', row.name, row.count, row.time_spent]),
                ],
            };
        case 'requesters':
            return {
                name: 'Demandeurs',
                columns: [
                    { header: 'Demandeur', width: 28 },
                    { header: 'Temps consommé (j/h)', width: 20 },
                    { header: 'Tickets démarrés', width: 16 },
                    { header: 'Tickets terminés', width: 16 },
                    { header: 'Délai moyen (jours)', width: 18 },
                    { header: 'Ouverts', width: 10 },
                    { header: 'En retard', width: 10 },
                ],
                rows: sortedRequesters.value.map((row) => [
                    row.name,
                    row.time_spent,
                    row.started,
                    row.closed,
                    row.average_lead,
                    row.open,
                    row.overdue,
                ]),
            };
    }
}

const SHEETS: SheetKey[] = [
    'load',
    'occupation',
    'velocity',
    'stock',
    'flow',
    'lead',
    'due',
    'blocked',
    'time',
    'requesters',
];

const slug = (text: string) =>
    text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

async function exportSheets(keys: SheetKey[]): Promise<void> {
    const data = stats.value;
    if (!data) return;

    const summary: XlsxSheet = {
        name: 'Synthèse',
        columns: [
            { header: 'Indicateur', width: 36 },
            { header: 'Valeur', width: 14 },
        ],
        rows: [
            ['Période', data.period.label],
            ['Tickets ouverts (à ce jour)', data.tiles.open],
            ['Tickets en retard (à ce jour)', data.tiles.overdue],
            ['Tickets terminés', data.tiles.closed],
            ['Délai moyen (jours)', data.tiles.average_lead],
            ['Temps consommé (j/h)', data.tiles.time_spent],
            ['Jours ouvrés disponibles', data.available_days],
            ['Échéances tenues (%)', data.due.rate === null ? null : Math.round(data.due.rate * 1000) / 10],
        ],
    };
    const sheets = keys.map((key) => sheet(key, data));
    const name = keys.length === 1 ? slug(sheets[0].name) : 'complet';

    try {
        await statisticsApi.download(`synapse-lite-statistiques-${name}-${slug(data.period.label)}.xlsx`, [
            ...(keys.length > 1 ? [summary] : []),
            ...sheets,
        ]);
    } catch (e) {
        ui.notify(errorMessage(e), 'error');
    }
}
</script>

<template>
    <div class="page">
        <PageHeader title="Statistiques" :subtitle="`Équipe, tickets et demandeurs : ${period.label}`">
            <div class="period-tools">
                <div class="segmented" role="group" aria-label="Période">
                    <button
                        v-for="option in KINDS"
                        :key="option.value"
                        type="button"
                        :class="{ active: kind === option.value }"
                        :aria-pressed="kind === option.value"
                        @click="kind = option.value"
                    >
                        {{ option.label }}
                    </button>
                </div>
                <div class="navigation">
                    <button type="button" class="btn btn-ghost btn-icon" title="Période précédente" @click="shift(-1)">
                        <AppIcon name="chevron-left" />
                    </button>
                    <span class="period-label">{{ period.label }}</span>
                    <button type="button" class="btn btn-ghost btn-icon" title="Période suivante" @click="shift(1)">
                        <AppIcon name="chevron-right" />
                    </button>
                    <button
                        v-if="!isCurrent"
                        type="button"
                        class="btn btn-secondary btn-sm"
                        @click="day = toIsoDate(new Date())"
                    >
                        Aujourd'hui
                    </button>
                </div>
                <button type="button" class="btn btn-secondary" :disabled="!stats" @click="exportSheets(SHEETS)">
                    <AppIcon name="download" :size="16" /> Tout exporter
                </button>
            </div>
        </PageHeader>

        <div class="page-content">
            <p v-if="error" class="field-error">{{ error }}</p>

            <template v-if="stats">
                <div class="tiles" :class="{ loading }">
                    <div class="tile">
                        <span class="tile-label">Tickets ouverts</span>
                        <strong class="tile-value">{{ stats.tiles.open }}</strong>
                        <span class="tile-detail">à ce jour, hors backlog</span>
                    </div>
                    <div class="tile">
                        <span class="tile-label">En retard</span>
                        <strong class="tile-value" :class="{ late: stats.tiles.overdue > 0 }">
                            {{ stats.tiles.overdue }}
                        </strong>
                        <span class="tile-detail">ouverts, échéance dépassée</span>
                    </div>
                    <div class="tile">
                        <span class="tile-label">Délai moyen</span>
                        <strong class="tile-value">{{ days(stats.tiles.average_lead) }}</strong>
                        <span class="tile-detail">
                            du début à la fin réelle,
                            {{ plural(stats.tiles.closed, 'ticket terminé', 'tickets terminés') }}
                        </span>
                    </div>
                    <div class="tile">
                        <span class="tile-label">Temps consommé</span>
                        <strong class="tile-value">{{ formatManDays(stats.tiles.time_spent) }}</strong>
                        <span class="tile-detail">
                            tickets terminés, sur {{ plural(stats.available_days, 'jour ouvré', 'jours ouvrés') }}
                        </span>
                    </div>
                </div>

                <!-- Team -------------------------------------------------------------------- -->
                <h2 class="group-title">Équipe</h2>
                <div class="grid two" :class="{ loading }">
                    <StatCard
                        title="Charge par personne"
                        :scope="TODAY_SCOPE"
                        help="Tickets ouverts dont la personne est responsable (hors backlog)."
                        @export="exportSheets(['load'])"
                    >
                        <template #tools>
                            <label class="setting" title="Alerte au-delà de ce nombre de tickets ouverts">
                                Alerte au-delà de
                                <input
                                    v-model.number="overloadThreshold"
                                    class="input"
                                    type="number"
                                    min="1"
                                    max="99"
                                />
                            </label>
                        </template>
                        <table class="table compact">
                            <thead>
                                <tr>
                                    <th>Personne</th>
                                    <th class="bar-column">Ouverts</th>
                                    <th class="number">En cours</th>
                                    <th class="number">Attente</th>
                                    <th class="number">Retard</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in stats.team" :key="row.id">
                                    <td>
                                        {{ row.name }}
                                        <span v-if="row.overloaded" class="badge badge-alert">
                                            <AppIcon name="flag" :size="12" /> Surcharge
                                        </span>
                                    </td>
                                    <td class="bar-column">
                                        <span class="inline-bar count">
                                            <span class="track">
                                                <span
                                                    class="fill"
                                                    :class="{ alert: row.overloaded }"
                                                    :style="bar(row.open, maxOpen)"
                                                ></span>
                                                <span
                                                    class="threshold"
                                                    :style="{ left: `${(overloadThreshold / maxOpen) * 100}%` }"
                                                    :title="`Seuil d'alerte : ${overloadThreshold}`"
                                                ></span>
                                            </span>
                                            <span class="number">{{ row.open }}</span>
                                        </span>
                                    </td>
                                    <td class="number">{{ row.in_progress }}</td>
                                    <td class="number">{{ row.waiting }}</td>
                                    <td class="number" :class="{ late: row.overdue > 0 }">{{ row.overdue }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </StatCard>

                    <StatCard
                        title="Occupation"
                        :scope="periodScope"
                        :help="`Temps consommé des tickets terminés, rapporté aux ${plural(stats.available_days, 'jour ouvré', 'jours ouvrés')} ${isCurrent ? 'écoulés' : ''} de la période.`"
                        @export="exportSheets(['occupation'])"
                    >
                        <table class="table compact">
                            <thead>
                                <tr>
                                    <th>Personne</th>
                                    <th class="number">Terminés</th>
                                    <th class="number">Temps</th>
                                    <th class="bar-column">Taux d'occupation</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in activeTeam" :key="row.id">
                                    <td>{{ row.name }}</td>
                                    <td class="number">{{ row.closed }}</td>
                                    <td class="number">{{ formatManDays(row.time_spent) }}</td>
                                    <td class="bar-column">
                                        <span class="inline-bar count">
                                            <span class="track">
                                                <span
                                                    class="fill"
                                                    :style="bar(row.occupation ?? 0, maxOccupation)"
                                                ></span>
                                            </span>
                                            <span class="number">{{ percent(row.occupation) }}</span>
                                        </span>
                                    </td>
                                </tr>
                                <tr v-if="activeTeam.length === 0">
                                    <td colspan="4" class="muted">Aucun ticket terminé ni ouvert.</td>
                                </tr>
                            </tbody>
                        </table>
                        <p v-if="idleTeam > 0" class="note">
                            {{ plural(idleTeam, 'personne', 'personnes') }} sans ticket ouvert ni terminé.
                        </p>
                    </StatCard>
                </div>

                <StatCard
                    :title="`Vélocité par ${unitLabel}`"
                    :scope="periodScope"
                    help="Tickets terminés par l'équipe, puis par personne."
                    :class="{ loading }"
                    @export="exportSheets(['velocity'])"
                >
                    <LineChart
                        :labels="labels"
                        :series="[{ name: 'Tickets terminés', color: SERIES_A, values: stats.closed }]"
                        :height="200"
                        :label="`Tickets terminés par ${unitLabel}`"
                    />
                    <table class="table compact velocity">
                        <thead>
                            <tr>
                                <th>Personne</th>
                                <th v-for="bucket in stats.buckets" :key="bucket.start" class="number">
                                    {{ bucket.label }}
                                </th>
                                <th class="number">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in activeTeam" :key="row.id">
                                <td>{{ row.name }}</td>
                                <td
                                    v-for="(value, index) in row.velocity"
                                    :key="index"
                                    class="number"
                                    :class="{ zero: !value }"
                                >
                                    {{ value ?? '' }}
                                </td>
                                <td class="number total">{{ row.closed }}</td>
                            </tr>
                        </tbody>
                    </table>
                </StatCard>

                <!-- Tickets ---------------------------------------------------------------- -->
                <h2 class="group-title">Tickets</h2>
                <div class="grid two" :class="{ loading }">
                    <StatCard
                        title="Stock par statut"
                        :scope="TODAY_SCOPE"
                        :help="`Tickets non terminés, puis leur nombre à la fin de chaque ${unitLabel}.`"
                        @export="exportSheets(['stock'])"
                    >
                        <BarList :items="stockItems" empty="Aucun ticket non terminé." />
                        <LineChart
                            class="spaced"
                            :labels="labels"
                            :series="[{ name: 'Tickets non terminés', color: SERIES_A, values: stats.stock_evolution }]"
                            :height="170"
                            label="Évolution du stock de tickets non terminés"
                        />
                    </StatCard>

                    <StatCard
                        :title="`Démarrés et terminés par ${unitLabel}`"
                        :scope="periodScope"
                        help="Selon la date de début (à défaut de création) et la date de fin réelle. Le stock augmente quand les démarrés dépassent les terminés."
                        @export="exportSheets(['flow'])"
                    >
                        <LineChart
                            :labels="labels"
                            :series="[
                                { name: 'Démarrés', color: SERIES_A, values: stats.started },
                                { name: 'Terminés', color: SERIES_B, values: stats.closed },
                            ]"
                            :height="260"
                            :label="`Tickets démarrés et terminés par ${unitLabel}`"
                        />
                    </StatCard>

                    <StatCard
                        title="Délai moyen par type"
                        :scope="periodScope"
                        help="Jours calendaires de la date de début (à défaut de création) à la date de fin réelle, inclus."
                        @export="exportSheets(['lead'])"
                    >
                        <BarList :items="leadItems" empty="Aucun ticket terminé sur la période." />
                    </StatCard>

                    <StatCard
                        title="Respect des échéances"
                        :scope="periodScope"
                        help="Tickets terminés avec une échéance, puis les tickets ouverts en retard à ce jour."
                        @export="exportSheets(['due'])"
                    >
                        <div class="due">
                            <strong class="due-rate">{{ percent(stats.due.rate) }}</strong>
                            <span class="muted">
                                {{ stats.due.on_time }} à l'heure, {{ stats.due.late }} en retard sur
                                {{ plural(stats.due.with_due_date, 'ticket terminé', 'tickets terminés') }} avec une
                                échéance
                            </span>
                        </div>
                        <div
                            v-if="stats.due.with_due_date > 0"
                            class="due-bar"
                            :title="`${stats.due.on_time} à l'heure`"
                        >
                            <span class="on-time" :style="{ flex: stats.due.on_time }"></span>
                            <span class="late-part" :style="{ flex: stats.due.late }"></span>
                        </div>
                        <table v-if="stats.overdue.length" class="table compact spaced">
                            <thead>
                                <tr>
                                    <th>Ticket en retard</th>
                                    <th>Responsable</th>
                                    <th class="number">Retard</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="line in stats.overdue" :key="line.id">
                                    <td>
                                        <RouterLink
                                            :to="{ name: 'ticket', params: { id: line.id } }"
                                            class="ticket-link"
                                        >
                                            <span class="mono">{{ line.reference }}</span> {{ line.title }}
                                        </RouterLink>
                                    </td>
                                    <td>{{ line.owner }}</td>
                                    <td class="number late">{{ line.days }} j</td>
                                </tr>
                            </tbody>
                        </table>
                        <p v-else class="note">Aucun ticket ouvert en retard.</p>
                    </StatCard>
                </div>

                <StatCard
                    title="Tickets bloqués"
                    :scope="TODAY_SCOPE"
                    :help="`Tickets en attente, et tickets ouverts sans aucune modification depuis plus de ${staleDays} jours.`"
                    :class="{ loading }"
                    @export="exportSheets(['blocked'])"
                >
                    <template #tools>
                        <label class="setting" title="Nombre de jours sans modification">
                            Sans modification depuis
                            <input v-model.number="staleDays" class="input" type="number" min="1" max="365" />
                            j
                        </label>
                    </template>
                    <table v-if="stats.blocked.length" class="table compact">
                        <thead>
                            <tr>
                                <th>Ticket</th>
                                <th>Responsable</th>
                                <th>Demandeur</th>
                                <th>Raison</th>
                                <th class="number">Sans modification</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="line in stats.blocked" :key="line.id">
                                <td>
                                    <RouterLink :to="{ name: 'ticket', params: { id: line.id } }" class="ticket-link">
                                        <span class="mono">{{ line.reference }}</span> {{ line.title }}
                                    </RouterLink>
                                </td>
                                <td>{{ line.owner }}</td>
                                <td>{{ line.requester }}</td>
                                <td>{{ line.reason }}</td>
                                <td class="number">{{ line.days }} j</td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else class="note">Aucun ticket bloqué.</p>
                </StatCard>

                <StatCard
                    title="Temps consommé par type et par projet"
                    :scope="periodScope"
                    help="Temps consommé des tickets terminés sur la période."
                    :class="{ loading }"
                    @export="exportSheets(['time'])"
                >
                    <div class="grid two inner">
                        <div>
                            <h4 class="sub-title">Par type</h4>
                            <BarList :items="timeItems(stats.by_type)" />
                        </div>
                        <div>
                            <h4 class="sub-title">Par projet</h4>
                            <BarList :items="timeItems(stats.by_project)" />
                        </div>
                    </div>
                </StatCard>

                <!-- Requesters ------------------------------------------------------------- -->
                <h2 class="group-title">Demandeurs</h2>
                <StatCard
                    title="Demandeurs"
                    :scope="periodScope"
                    help="Temps consommé, tickets démarrés et terminés sur la période ; tickets ouverts et en retard à ce jour."
                    :class="{ loading }"
                    @export="exportSheets(['requesters'])"
                >
                    <template #tools>
                        <div class="segmented small" role="group" aria-label="Classement">
                            <button
                                type="button"
                                :class="{ active: requesterSort === 'time' }"
                                @click="requesterSort = 'time'"
                            >
                                Par temps
                            </button>
                            <button
                                type="button"
                                :class="{ active: requesterSort === 'count' }"
                                @click="requesterSort = 'count'"
                            >
                                Par nombre de tickets
                            </button>
                        </div>
                    </template>
                    <table v-if="sortedRequesters.length" class="table compact">
                        <thead>
                            <tr>
                                <th>Demandeur</th>
                                <th class="bar-column">Temps consommé</th>
                                <th class="number">Démarrés</th>
                                <th class="number">Terminés</th>
                                <th class="number">Délai moyen</th>
                                <th class="number">Ouverts</th>
                                <th class="number">En retard</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in sortedRequesters" :key="row.id">
                                <td>{{ row.name }}</td>
                                <td class="bar-column">
                                    <span class="inline-bar">
                                        <span class="track">
                                            <span class="fill" :style="bar(row.time_spent, maxRequesterTime)"></span>
                                        </span>
                                        <span class="number">{{ formatManDays(row.time_spent) }}</span>
                                    </span>
                                </td>
                                <td class="number">{{ row.started }}</td>
                                <td class="number">{{ row.closed }}</td>
                                <td class="number">{{ days(row.average_lead) }}</td>
                                <td class="number">{{ row.open }}</td>
                                <td class="number" :class="{ late: row.overdue > 0 }">{{ row.overdue }}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p v-else class="note">Aucun ticket pour les demandeurs sur la période.</p>
                </StatCard>
            </template>

            <p v-else-if="loading" class="muted">Calcul des statistiques…</p>
        </div>
    </div>
</template>

<style scoped>
.page-content {
    display: grid;
    gap: var(--space-4);
    align-content: start;
}

.period-tools,
.navigation {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
}

.navigation {
    gap: var(--space-1);
}

.period-label {
    min-width: 130px;
    font-weight: 700;
    text-align: center;
    text-transform: capitalize;
}

.segmented {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-alt);
}

.segmented button {
    padding: 6px 12px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-muted);
    font: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
}

.segmented.small button {
    padding: 3px 8px;
    font-size: var(--font-size-xs);
}

.segmented button.active {
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    color: var(--color-text);
    font-weight: 600;
}

.loading {
    opacity: 0.6;
    transition: opacity 0.15s;
}

.tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
}

.tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
}

.tile-label {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    font-weight: 600;
}

.tile-value {
    color: var(--color-text);
    font-size: 2rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
}

.tile-detail {
    color: var(--color-text-subtle);
    font-size: var(--font-size-xs);
}

.late {
    color: var(--color-late);
}

.group-title {
    margin: var(--space-4) 0 0;
    color: var(--color-text);
    font-size: var(--font-size-xl);
}

.grid {
    display: grid;
    gap: var(--space-4);
}

.grid.two {
    grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
}

.grid.inner {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-6);
}

.sub-title {
    margin: 0 0 var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
}

.table.compact th,
.table.compact td {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
}

.number {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
}

th.number {
    text-align: right;
}

.bar-column {
    width: 34%;
    min-width: 130px;
}

.table.compact td:first-child {
    white-space: nowrap;
}

.inline-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.inline-bar .track {
    position: relative;
    flex: 1;
    height: 8px;
    border-radius: 0 4px 4px 0;
    background: var(--color-surface-alt);
}

.inline-bar .fill {
    display: block;
    height: 100%;
    border-radius: 0 4px 4px 0;
    background: #00927f;
}

.inline-bar .fill.alert {
    background: var(--color-late);
}

.inline-bar .threshold {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 0;
    border-left: 2px dashed var(--color-text-subtle);
}

.inline-bar .number {
    min-width: 64px;
}

.inline-bar.count .number {
    min-width: 20px;
}

.badge-alert {
    margin-left: var(--space-2);
    background: #f6e6e6;
    color: var(--color-late);
}

.velocity {
    margin-top: var(--space-4);
}

.velocity td.zero {
    color: var(--color-text-subtle);
}

.velocity .total {
    font-weight: 700;
}

.setting {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-muted);
    font-size: var(--font-size-xs);
    white-space: nowrap;
}

.setting .input {
    width: 64px;
    height: 28px;
    padding: 0 var(--space-2);
}

.note {
    margin: var(--space-3) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
}

.spaced {
    margin-top: var(--space-4);
}

.due {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3);
    font-size: var(--font-size-sm);
}

.due-rate {
    color: var(--color-text);
    font-size: 1.75rem;
    font-variant-numeric: tabular-nums;
}

.due-bar {
    display: flex;
    gap: 2px;
    height: 10px;
    margin-top: var(--space-2);
}

.due-bar span {
    border-radius: 4px;
}

.due-bar .on-time {
    background: #00927f;
}

.due-bar .late-part {
    background: var(--color-late);
}

.ticket-link {
    color: var(--color-text);
    text-decoration: none;
}

.ticket-link:hover {
    color: var(--color-brand-700);
    text-decoration: underline;
}

@media (max-width: 560px) {
    .grid.two {
        grid-template-columns: 1fr;
    }
}
</style>
