<script setup lang="ts">
/**
 * Quick buttons under a date of a ticket. Start date: tomorrow, next week,
 * next month (from today). Planned end: end of the day, of the week and of the
 * month, counted from the start date (today without one).
 */
import { computed } from 'vue';
import { formatDate } from '@/utils/dates';
import { DUE_PRESETS, presetDate, START_PRESETS } from '@/utils/datePresets';

const props = defineProps<{
    kind: 'start' | 'due';
    /** Start date of the ticket ("YYYY-MM-DD", "" or null), for the planned end. */
    startDate?: string | null;
    /** Current value, to highlight the matching button. */
    modelValue?: string | null;
    disabled?: boolean;
}>();

const emit = defineEmits<{ choose: [value: string] }>();

const presets = computed(() =>
    (props.kind === 'start' ? START_PRESETS : DUE_PRESETS).map((preset) => {
        const value = presetDate(preset, props.kind === 'due' ? props.startDate : null);

        return { key: preset.key, label: preset.label, value, title: `${preset.title} : ${formatDate(value)}` };
    }),
);
</script>

<template>
    <div
        class="presets"
        role="group"
        :aria-label="kind === 'start' ? 'Date de début rapide' : 'Fin prévisionnelle rapide'"
    >
        <button
            v-for="preset in presets"
            :key="preset.key"
            type="button"
            class="preset"
            :class="{ active: modelValue === preset.value }"
            :title="preset.title"
            :disabled="disabled"
            @click="emit('choose', preset.value)"
        >
            {{ preset.label }}
        </button>
    </div>
</template>

<style scoped>
.presets {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: 4px;
}

.preset {
    height: 28px;
    padding: 0 4px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition:
        background var(--transition-fast),
        border-color var(--transition-fast);
}

.preset:hover:not(:disabled):not(.active) {
    border-color: var(--color-brand-500);
    background: var(--color-brand-50);
}

.preset.active {
    border-color: var(--color-brand-600);
    background: var(--color-brand-600);
    color: #fff;
}

.preset:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}
</style>
