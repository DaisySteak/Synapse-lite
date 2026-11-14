<script setup lang="ts">
/**
 * Line chart drawn in SVG, without any library: thin lines, a recessive grid,
 * one value axis, a legend from two series on, and a crosshair with a
 * tooltip under the mouse. A null value (future week) interrupts the line.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

export interface LineSeries {
    name: string;
    color: string;
    values: (number | null)[];
}

const props = withDefaults(
    defineProps<{
        labels: string[];
        series: LineSeries[];
        height?: number;
        /** Text of a value in the tooltip. */
        format?: (value: number) => string;
        /** Accessible description of the chart. */
        label: string;
    }>(),
    { height: 220, format: (value: number) => String(value) },
);

const PADDING = { top: 12, right: 16, bottom: 26, left: 36 };

const root = ref<HTMLElement | null>(null);
const width = ref(600);
const hovered = ref<number | null>(null);
let observer: ResizeObserver | null = null;

onMounted(() => {
    if (!root.value) return;
    width.value = root.value.clientWidth || 600;
    observer = new ResizeObserver(([entry]) => {
        width.value = Math.max(200, Math.floor(entry.contentRect.width));
    });
    observer.observe(root.value);
});

onBeforeUnmount(() => observer?.disconnect());

const plotWidth = computed(() => width.value - PADDING.left - PADDING.right);
const plotHeight = computed(() => props.height - PADDING.top - PADDING.bottom);

/** Round step of the value axis: 1, 2, 5, 10, 20... */
const axis = computed(() => {
    const values = props.series.flatMap((serie) => serie.values.filter((value): value is number => value !== null));
    const max = Math.max(1, ...values);
    const raw = max / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const round = [1, 2, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
    // Counts of tickets: whole steps only.
    const step = values.every(Number.isInteger) ? Math.max(1, round) : round;
    const top = Math.max(step, Math.ceil(max / step) * step);
    const ticks: number[] = [];
    for (let value = 0; value <= top + step / 2; value += step) ticks.push(Math.round(value * 1000) / 1000);

    return { top, ticks };
});

const x = (index: number) =>
    PADDING.left +
    (props.labels.length <= 1 ? plotWidth.value / 2 : (index * plotWidth.value) / (props.labels.length - 1));
const y = (value: number) => PADDING.top + plotHeight.value - (value / axis.value.top) * plotHeight.value;

/** Path of a series, interrupted on the null values. */
function path(values: (number | null)[]): string {
    let text = '';
    let drawing = false;

    values.forEach((value, index) => {
        if (value === null) {
            drawing = false;

            return;
        }
        text += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`;
        drawing = true;
    });

    return text;
}

/** One label out of `every`, so that they never overlap. */
const every = computed(() => Math.max(1, Math.ceil((props.labels.length * 52) / plotWidth.value)));
const showDots = computed(() => props.labels.length <= 16);

function onMove(event: MouseEvent): void {
    const box = (event.currentTarget as SVGElement).getBoundingClientRect();
    const position = event.clientX - box.left - PADDING.left;
    const count = props.labels.length;
    if (count === 0) return;
    const index = count === 1 ? 0 : Math.round((position / plotWidth.value) * (count - 1));
    hovered.value = Math.min(count - 1, Math.max(0, index));
}

const tooltipStyle = computed(() => {
    if (hovered.value === null) return {};
    const left = x(hovered.value);
    const flip = left > width.value - 170;

    return flip
        ? { right: `${width.value - left + 10}px`, top: `${PADDING.top}px` }
        : { left: `${left + 10}px`, top: `${PADDING.top}px` };
});
</script>

<template>
    <div ref="root" class="line-chart">
        <ul v-if="series.length > 1" class="legend">
            <li v-for="serie in series" :key="serie.name">
                <span class="swatch" :style="{ background: serie.color }"></span>{{ serie.name }}
            </li>
        </ul>

        <div class="plot">
            <svg
                :width="width"
                :height="height"
                :viewBox="`0 0 ${width} ${height}`"
                role="img"
                :aria-label="label"
                @mousemove="onMove"
                @mouseleave="hovered = null"
            >
                <g class="grid">
                    <g v-for="tick in axis.ticks" :key="tick">
                        <line :x1="PADDING.left" :x2="width - PADDING.right" :y1="y(tick)" :y2="y(tick)" />
                        <text :x="PADDING.left - 8" :y="y(tick)" dy="0.32em" text-anchor="end">{{ tick }}</text>
                    </g>
                </g>

                <g class="x-labels">
                    <template v-for="(text, index) in labels" :key="index">
                        <text v-if="index % every === 0" :x="x(index)" :y="height - 6" text-anchor="middle">
                            {{ text }}
                        </text>
                    </template>
                </g>

                <line
                    v-if="hovered !== null"
                    class="crosshair"
                    :x1="x(hovered)"
                    :x2="x(hovered)"
                    :y1="PADDING.top"
                    :y2="PADDING.top + plotHeight"
                />

                <g v-for="serie in series" :key="serie.name">
                    <path :d="path(serie.values)" :stroke="serie.color" class="line" />
                    <template v-for="(value, index) in serie.values" :key="index">
                        <circle
                            v-if="value !== null && (showDots || hovered === index)"
                            :cx="x(index)"
                            :cy="y(value)"
                            :r="hovered === index ? 5 : 3"
                            :fill="serie.color"
                            class="dot"
                        />
                    </template>
                </g>
            </svg>

            <div v-if="hovered !== null" class="tooltip" :style="tooltipStyle">
                <strong>{{ labels[hovered] }}</strong>
                <div v-for="serie in series" :key="serie.name" class="tooltip-row">
                    <span class="swatch" :style="{ background: serie.color }"></span>
                    <span class="name">{{ serie.name }}</span>
                    <span class="value">{{
                        serie.values[hovered] === null ? '—' : format(serie.values[hovered] as number)
                    }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.line-chart {
    width: 100%;
    min-width: 0;
}

.plot {
    position: relative;
}

svg {
    display: block;
    overflow: visible;
}

.legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: 0 0 var(--space-2);
    padding: 0;
    list-style: none;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
}

.legend li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.swatch {
    display: inline-block;
    width: 12px;
    height: 3px;
    border-radius: 2px;
}

.grid line {
    stroke: var(--color-border);
    stroke-width: 1;
}

.grid text,
.x-labels text {
    fill: var(--color-text-subtle);
    font-size: 11px;
}

.line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
}

.dot {
    stroke: var(--color-surface);
    stroke-width: 2;
}

.crosshair {
    stroke: var(--color-border-strong);
    stroke-width: 1;
    stroke-dasharray: 3 3;
}

.tooltip {
    position: absolute;
    z-index: 2;
    min-width: 140px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-md, 0 4px 12px rgb(0 0 0 / 12%));
    color: var(--color-text);
    font-size: var(--font-size-sm);
    pointer-events: none;
}

.tooltip-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
}

.tooltip-row .name {
    flex: 1;
    color: var(--color-text-muted);
}

.tooltip-row .value {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}
</style>
