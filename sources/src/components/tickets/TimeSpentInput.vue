<script setup lang="ts">
/**
 * Time spent, in man-days: a number field and quick buttons (1 h, ½ day,
 * 1 day, 1 week) that set the value in one click. "1,5" is accepted as well
 * as "1.5". Emits `change` when the value is validated (field left, Enter or
 * quick button), so that the ticket screen can save it at once.
 */
import { ref, watch } from 'vue';
import { TIME_PRESETS } from '@/utils/workdays';

const props = defineProps<{ id: string; disabled?: boolean; error?: string | null }>();
const model = defineModel<number | null>({ required: true });
const emit = defineEmits<{ change: [value: number | null]; enter: [] }>();

const text = ref(toText(model.value));

watch(model, (value) => {
    if (parse(text.value) !== value) text.value = toText(value);
});

function toText(value: number | null): string {
    return value === null ? '' : String(value).replace('.', ',');
}

/** NaN for a text that is not a number (the API answers with the error). */
function parse(raw: string): number | null {
    const value = raw.trim().replace(',', '.');

    return value === '' ? null : Number(value);
}

function commit(): void {
    const value = parse(text.value);
    if (value === model.value) return;

    model.value = value;
    emit('change', value);
}

function choose(value: number): void {
    text.value = toText(value);
    model.value = value;
    emit('change', value);
}

function onEnter(): void {
    commit();
    emit('enter');
}

defineExpose({ focus: () => document.getElementById(props.id)?.focus() });
</script>

<template>
    <div class="time-spent">
        <div class="input-wrap">
            <input
                :id="id"
                v-model="text"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                class="input"
                :class="{ 'has-error': error }"
                :disabled="disabled"
                placeholder="—"
                @change="commit"
                @keydown.enter.prevent="onEnter"
            />
            <span class="unit">j/h</span>
        </div>
        <div class="presets" role="group" aria-label="Valeurs rapides">
            <button
                v-for="preset in TIME_PRESETS"
                :key="preset.value"
                type="button"
                class="preset"
                :class="{ active: model === preset.value }"
                :title="preset.title"
                :disabled="disabled"
                @click="choose(preset.value)"
            >
                {{ preset.label }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.time-spent {
    display: grid;
    gap: var(--space-2);
}

.input-wrap {
    position: relative;
}

.input-wrap .input {
    width: 100%;
    padding-right: 40px;
}

.unit {
    position: absolute;
    top: 50%;
    right: var(--space-3);
    transform: translateY(-50%);
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    pointer-events: none;
}

.presets {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
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
    transition:
        background var(--transition-fast),
        border-color var(--transition-fast);
}

.preset:hover:not(:disabled) {
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
