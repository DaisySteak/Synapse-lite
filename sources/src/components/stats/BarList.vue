<script setup lang="ts">
/**
 * Horizontal bars, one per line: the label, the bar (relative to the largest
 * value, or to `max`) and the value written in full. The hover shows the
 * detail given in `hint`.
 */
import { computed } from 'vue';

export interface BarItem {
    label: string;
    value: number;
    /** Value as written, e.g. "4,5 j/h". */
    display: string;
    /** Detail shown on hover. */
    hint?: string;
    /** Marker shown before the label (e.g. the color of a status). */
    marker?: string;
}

const props = withDefaults(defineProps<{ items: BarItem[]; max?: number; color?: string; empty?: string }>(), {
    max: undefined,
    color: '#00927F',
    empty: 'Aucune donnée sur la période.',
});

const scale = computed(() => props.max ?? Math.max(0, ...props.items.map((item) => item.value)));
const width = (value: number) =>
    scale.value > 0 ? `${Math.max(value > 0 ? 1 : 0, (value / scale.value) * 100)}%` : '0';
</script>

<template>
    <p v-if="items.length === 0" class="muted empty">{{ empty }}</p>
    <ul v-else class="bars">
        <li v-for="item in items" :key="item.label" :title="item.hint ?? `${item.label} : ${item.display}`">
            <span class="label">
                <span v-if="item.marker" class="marker" :style="{ background: item.marker }"></span>
                {{ item.label }}
            </span>
            <span class="track">
                <span class="bar" :style="{ width: width(item.value), background: color }"></span>
            </span>
            <span class="value">{{ item.display }}</span>
        </li>
    </ul>
</template>

<style scoped>
.bars {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
}

.bars li {
    display: grid;
    grid-template-columns: minmax(90px, 34%) 1fr auto;
    gap: var(--space-3);
    align-items: center;
    padding: 2px 0;
    border-radius: var(--radius-sm);
}

.bars li:hover {
    background: var(--color-brand-50);
}

.label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    overflow: hidden;
    color: var(--color-text);
    font-size: var(--font-size-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.marker {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.track {
    height: 10px;
    border-radius: 0 4px 4px 0;
    background: var(--color-surface-alt);
}

.bar {
    display: block;
    height: 100%;
    border-radius: 0 4px 4px 0;
}

.value {
    min-width: 56px;
    color: var(--color-text);
    font-size: var(--font-size-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
}

.empty {
    margin: 0;
    font-size: var(--font-size-sm);
}
</style>
