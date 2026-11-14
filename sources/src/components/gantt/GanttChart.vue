<script setup lang="ts">
/**
 * Planning (Gantt) of the tickets: one row per ticket, bars from the start
 * date to the planned end date (or the actual end date once closed), late
 * part hatched, today marker, optional grouping by owner.
 *
 * Only the tickets with a start date are drawn. A ticket without end date
 * takes a fixed length (settings.open_ended_days) and ends with a point.
 *
 * A single scroll container with sticky header and sticky first column
 * keeps both axes aligned without any JavaScript synchronisation.
 *
 * The edges of a bar can be dragged with the mouse (tickets the user may
 * modify): the left edge changes the start date, the right edge the due date
 * (the actual end date of a closed ticket). The bar follows the mouse day by
 * day, and `resize` is emitted on release.
 */
import { computed, ref } from 'vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useTicketPermissions } from '@/composables/useTicketPermissions';
import { useTicketPresentation } from '@/composables/useTicketPresentation';
import { useReferenceStore } from '@/stores/reference';
import type { TicketCard } from '@/types/models';
import { daysBetween, formatDate, toIsoDate, today } from '@/utils/dates';
import {
    DAY_WIDTH,
    buildBar,
    clampResize,
    endField,
    groupBars,
    isPlanned,
    isVisible,
    monthCells,
    unitCells,
    resizePatch,
    weekendOffsets,
    type GanttBar,
    type GanttEdge,
    type GanttRange,
    type GanttZoom,
} from '@/utils/gantt';

const props = defineProps<{ tickets: TicketCard[]; range: GanttRange; zoom: GanttZoom; byOwner: boolean }>();
const emit = defineEmits<{
    open: [ticket: TicketCard];
    resize: [ticket: TicketCard, patch: Partial<Pick<TicketCard, 'start_date' | 'due_date' | 'actual_end_date'>>];
}>();

const reference = useReferenceStore();
const presentation = useTicketPresentation();
const { canUpdate } = useTicketPermissions();

/** Bar being resized: the edge grabbed and the days moved so far. */
const drag = ref<{
    ticket: TicketCard;
    edge: GanttEdge;
    originX: number;
    start: Date;
    end: Date;
    days: number;
} | null>(null);

/** Ticket as drawn: with the dates of the bar being resized. */
function drawn(ticket: TicketCard): TicketCard {
    const current = drag.value;
    if (!current || current.ticket.id !== ticket.id || current.days === 0) return ticket;

    const closed = reference.isClosed(ticket.status_code);

    return { ...ticket, ...resizePatch(ticket, closed, current.edge, current.days, current.start, current.end) };
}

const dayWidth = computed(() => DAY_WIDTH[props.zoom]);
const timelineWidth = computed(() => props.range.days * dayWidth.value);

const bars = computed(() =>
    props.tickets
        .map(drawn)
        .filter(isPlanned)
        .map((ticket) =>
            buildBar(
                ticket,
                props.range,
                dayWidth.value,
                reference.isClosed(ticket.status_code),
                today(),
                reference.settings.open_ended_days,
            ),
        )
        .filter((bar) => isVisible(bar, props.range)),
);

const ownerOrder = computed(() => reference.users.map((user) => user.id));
const groups = computed(() => groupBars(bars.value, props.byOwner, ownerOrder.value));

const months = computed(() => monthCells(props.range, dayWidth.value));
const units = computed(() => unitCells(props.range, props.zoom));
const weekends = computed(() => (props.zoom === 'quarter' ? [] : weekendOffsets(props.range, dayWidth.value)));

const todayOffset = computed(() => {
    const offset = daysBetween(props.range.start, today());

    return offset >= 0 && offset < props.range.days ? offset * dayWidth.value + dayWidth.value / 2 : null;
});

function barColor(statusCode: string): string {
    return reference.statusMap.get(statusCode)?.color ?? '#6B7A80';
}

function tooltip(ticket: TicketCard): string {
    const owner = presentation.owner(ticket)?.full_name ?? '';
    const status = presentation.status(ticket)?.label ?? '';
    const end = ticket.actual_end_date
        ? `terminé le ${formatDate(ticket.actual_end_date)}`
        : ticket.due_date
          ? `fin prévue le ${formatDate(ticket.due_date)}`
          : 'sans date de fin prévisionnelle (durée indicative)';

    const requester = presentation.requester(ticket)?.name;

    return (
        `${ticket.reference} · ${ticket.title}\n${owner} · ${status}\n` +
        (requester ? `Demandeur : ${requester}\n` : '') +
        `Début le ${formatDate(ticket.start_date)}, ${end}`
    );
}

// --- Resizing ------------------------------------------------------------------

function resizable(bar: GanttBar, edge: GanttEdge): boolean {
    return canUpdate(bar.ticket) && !(edge === 'start' && bar.clippedStart);
}

function handleTitle(bar: GanttBar, edge: GanttEdge): string {
    if (edge === 'start') return 'Glisser pour changer la date de début';

    return endField(bar.ticket, bar.isClosed) === 'actual_end_date'
        ? 'Glisser pour changer la date de fin réelle'
        : 'Glisser pour changer la date de fin prévisionnelle';
}

function startResize(event: PointerEvent, bar: GanttBar, edge: GanttEdge): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    drag.value = { ticket: bar.ticket, edge, originX: event.clientX, start: bar.start, end: bar.end, days: 0 };
}

function moveResize(event: PointerEvent): void {
    const current = drag.value;
    if (!current) return;

    const days = Math.round((event.clientX - current.originX) / dayWidth.value);
    current.days = clampResize(current.edge, days, current.start, current.end);
}

function endResize(cancelled = false): void {
    const current = drag.value;
    drag.value = null;
    if (!current || cancelled || current.days === 0) return;

    const closed = reference.isClosed(current.ticket.status_code);
    emit(
        'resize',
        current.ticket,
        resizePatch(current.ticket, closed, current.edge, current.days, current.start, current.end),
    );
}

/** Date shown next to the edge being dragged. */
function dragLabel(bar: GanttBar): { text: string; left: number } | null {
    const current = drag.value;
    if (!current || current.ticket.id !== bar.ticket.id) return null;

    return current.edge === 'start'
        ? { text: `Début : ${formatDate(toIsoDate(bar.start))}`, left: bar.left }
        : { text: `Fin : ${formatDate(toIsoDate(bar.end))}`, left: bar.left + bar.width };
}
</script>

<template>
    <div
        class="gantt"
        :class="{ resizing: drag !== null }"
        :style="{ '--timeline-width': `${timelineWidth}px`, '--day-width': `${dayWidth}px` }"
    >
        <!-- Header -->
        <div class="row header-row">
            <div class="label-cell header-label">Ticket</div>
            <div class="timeline-cell header-timeline">
                <div class="months">
                    <span
                        v-for="cell in months"
                        :key="cell.left"
                        :style="{ left: `${cell.left}px`, width: `${cell.width}px` }"
                    >
                        {{ cell.label }}
                    </span>
                </div>
                <div class="units">
                    <span
                        v-for="cell in units"
                        :key="cell.left"
                        :style="{ left: `${cell.left}px`, width: `${cell.width}px` }"
                    >
                        {{ cell.label }}
                    </span>
                </div>
            </div>
        </div>

        <template v-for="group in groups" :key="group.key">
            <div v-if="byOwner" class="row group-row">
                <div class="label-cell group-label">
                    <UserAvatar :user="reference.userMap.get(group.ownerId ?? 0)" :size="22" />
                    <strong>{{ reference.userMap.get(group.ownerId ?? 0)?.full_name ?? 'Non assigné' }}</strong>
                    <span class="badge">{{ group.bars.length }}</span>
                </div>
                <div class="timeline-cell group-timeline" />
            </div>

            <div v-for="bar in group.bars" :key="bar.ticket.id" class="row ticket-row">
                <button
                    type="button"
                    class="label-cell ticket-label"
                    :title="tooltip(bar.ticket)"
                    @click="emit('open', bar.ticket)"
                >
                    <span class="reference">{{ bar.ticket.reference }}</span>
                    <span class="title">{{ bar.ticket.title }}</span>
                    <UserAvatar v-if="!byOwner" :user="presentation.owner(bar.ticket)" :size="20" />
                </button>
                <div class="timeline-cell">
                    <span v-for="offset in weekends" :key="offset" class="weekend" :style="{ left: `${offset}px` }" />
                    <button
                        v-if="bar.width > 0"
                        type="button"
                        class="bar"
                        :class="{
                            closed: bar.isClosed,
                            'open-ended': bar.openEnded,
                            clipped: bar.clippedStart,
                            dragged: drag?.ticket.id === bar.ticket.id,
                        }"
                        :style="{
                            left: `${bar.left}px`,
                            width: `${bar.width}px`,
                            '--bar-color': barColor(bar.ticket.status_code),
                        }"
                        :title="tooltip(bar.ticket)"
                        @click="emit('open', bar.ticket)"
                    >
                        <span
                            class="requester-dot"
                            :style="{ background: presentation.requester(bar.ticket)?.color ?? 'transparent' }"
                        />
                        <span class="bar-label">{{ bar.ticket.title }}</span>
                        <template v-for="edge in ['start', 'end'] as const" :key="edge">
                            <span
                                v-if="resizable(bar, edge)"
                                class="handle"
                                :class="edge"
                                :title="handleTitle(bar, edge)"
                                @pointerdown="startResize($event, bar, edge)"
                                @pointermove="moveResize"
                                @pointerup="endResize()"
                                @pointercancel="endResize(true)"
                                @click.stop.prevent
                            />
                        </template>
                    </button>
                    <span v-if="dragLabel(bar)" class="drag-label" :style="{ left: `${dragLabel(bar)?.left ?? 0}px` }">
                        {{ dragLabel(bar)?.text }}
                    </span>
                    <span
                        v-if="bar.lateWidth > 0"
                        class="late"
                        :style="{ left: `${bar.lateLeft}px`, width: `${bar.lateWidth}px` }"
                        :title="`En retard depuis le ${formatDate(bar.ticket.due_date)}`"
                    />
                </div>
            </div>
        </template>

        <div v-if="todayOffset !== null" class="today" :style="{ left: `calc(var(--label-width) + ${todayOffset}px)` }">
            <span>Aujourd'hui</span>
        </div>
    </div>
</template>

<style scoped>
.gantt {
    --label-width: 300px;
    --row-height: 34px;
    position: relative;
    width: max-content;
    min-width: 100%;
}

.row {
    display: grid;
    grid-template-columns: var(--label-width) var(--timeline-width);
    min-height: var(--row-height);
}

/*
 * Layers, bottom to top: timeline (bars z1), today line (z3), sticky ticket
 * column (z4: the today line passes under it when scrolling horizontally),
 * sticky header row (z6).
 */
.label-cell {
    position: sticky;
    left: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: 0 var(--space-3);
    border-right: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
}

.timeline-cell {
    position: relative;
    border-bottom: 1px solid #edf1f1;
    background: var(--color-surface);
}

/* Header */
.header-row {
    position: sticky;
    top: 0;
    z-index: 6;
    min-height: 52px;
}

.header-label {
    z-index: 5;
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    background: var(--color-surface-alt);
}

.header-timeline {
    background: var(--color-surface-alt);
    border-bottom: 1px solid var(--color-border);
}

.months,
.units {
    position: relative;
    height: 26px;
}

.months span,
.units span {
    position: absolute;
    top: 0;
    height: 100%;
    padding: 0 6px;
    overflow: hidden;
    border-left: 1px solid var(--color-border);
    font-size: var(--font-size-xs);
    line-height: 26px;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.months span {
    font-weight: 700;
    text-transform: capitalize;
    color: var(--color-brand-800);
}

.units span {
    color: var(--color-text-muted);
    border-top: 1px solid var(--color-border);
}

/* Groups */
.group-row .label-cell,
.group-timeline {
    background: var(--color-brand-50);
}

.group-label strong {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Ticket rows */
.ticket-label {
    border-top: 0;
    border-left: 0;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.ticket-row:hover .ticket-label,
.ticket-row:hover .timeline-cell {
    background: var(--color-brand-50);
}

.reference {
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    font-weight: 700;
    color: var(--color-text-subtle);
}

.title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.weekend {
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--day-width);
    background: rgb(0 40 35 / 3.5%);
}

.bar {
    position: absolute;
    top: 6px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 6px;
    height: calc(var(--row-height) - 12px);
    padding: 0 6px;
    overflow: hidden;
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--bar-color);
    color: #fff;
    font: inherit;
    font-size: var(--font-size-xs);
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition:
        filter var(--transition-fast),
        box-shadow var(--transition-fast);
}

.bar:hover {
    filter: brightness(1.08);
    box-shadow: var(--shadow-md);
}

.bar.clipped {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
}

.bar.closed {
    opacity: 0.55;
}

/* No end date: indicative length, faded towards a pointed end. */
.bar.open-ended {
    padding-right: 14px;
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    background: linear-gradient(90deg, var(--bar-color) 0 55%, color-mix(in srgb, var(--bar-color) 45%, white) 100%);
    box-shadow: none;
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%);
}

.requester-dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    box-shadow: 0 0 0 1.5px #fff;
}

.bar-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Edges dragged to change the dates. */
.handle {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 2;
    width: 8px;
    cursor: ew-resize;
}

.handle.start {
    left: 0;
}

.handle.end {
    right: 0;
}

.bar.open-ended .handle.end {
    right: 6px;
}

.handle::after {
    position: absolute;
    top: 25%;
    bottom: 25%;
    left: 3px;
    width: 2px;
    border-radius: 1px;
    background: rgb(255 255 255 / 85%);
    content: '';
    opacity: 0;
    transition: opacity var(--transition-fast);
}

.bar:hover .handle::after,
.bar.dragged .handle::after {
    opacity: 1;
}

.bar.dragged {
    z-index: 2;
    box-shadow:
        0 0 0 2px var(--color-surface),
        0 0 0 4px var(--bar-color);
    transition: none;
}

.resizing,
.resizing * {
    cursor: ew-resize !important;
    user-select: none;
}

.drag-label {
    position: absolute;
    top: -14px;
    z-index: 5;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    background: var(--color-text);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    transform: translateX(-50%);
    pointer-events: none;
}

.late {
    position: absolute;
    top: 6px;
    height: calc(var(--row-height) - 12px);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background: repeating-linear-gradient(135deg, rgb(163 92 92 / 55%) 0 4px, rgb(163 92 92 / 20%) 4px 8px);
}

.today {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 3;
    width: 2px;
    margin-left: -1px;
    background: var(--color-accent);
    pointer-events: none;
}

.today span {
    position: sticky;
    top: 52px;
    display: inline-block;
    margin-left: 4px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--color-accent);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
}
</style>
