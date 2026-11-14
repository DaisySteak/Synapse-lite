<script setup lang="ts" generic="T extends string | number">
/**
 * Dropdown list with search, single or multiple selection.
 *
 * The list is rendered in <body> with a fixed position computed from the
 * trigger: it is never clipped by a scrolling container (modal, panel) and
 * opens upwards when there is not enough room below.
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { SelectOption } from '@/types/ui';

const props = withDefaults(
    defineProps<{
        options: SelectOption<T>[];
        placeholder?: string;
        multiple?: boolean;
        searchable?: boolean;
        clearable?: boolean;
        invalid?: boolean;
        compact?: boolean;
        id?: string;
    }>(),
    { placeholder: 'Sélectionner…', multiple: false, searchable: true, clearable: false },
);

const model = defineModel<T | T[] | null>({ default: null });

const open = ref(false);
const search = ref('');
const root = ref<HTMLElement | null>(null);
const dropdown = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const position = ref<Record<string, string>>({});

const DROPDOWN_MAX_HEIGHT = 320;
const GAP = 4;

/** Place the list under the trigger, or above it when the room is lacking. */
function place(): void {
    const trigger = root.value?.getBoundingClientRect();

    if (!trigger) return;

    const below = window.innerHeight - trigger.bottom - GAP;
    const above = trigger.top - GAP;
    const upwards = below < Math.min(DROPDOWN_MAX_HEIGHT, 200) && above > below;
    const room = Math.max(120, Math.min(DROPDOWN_MAX_HEIGHT, (upwards ? above : below) - 8));

    position.value = {
        left: `${Math.min(trigger.left, window.innerWidth - 348)}px`,
        minWidth: `${trigger.width}px`,
        maxHeight: `${room}px`,
        ...(upwards ? { bottom: `${window.innerHeight - trigger.top + GAP}px` } : { top: `${trigger.bottom + GAP}px` }),
    };
}

function onViewportChange(event: Event): void {
    // Scrolling inside the list itself must not move it.
    if (dropdown.value && event.target instanceof Node && dropdown.value.contains(event.target)) return;

    place();
}

const selectedValues = computed<T[]>(() => {
    if (props.multiple) return (model.value as T[] | null) ?? [];

    return model.value === null || model.value === undefined ? [] : [model.value as T];
});

const filtered = computed(() => {
    const term = search.value.trim().toLowerCase();

    return term ? props.options.filter((option) => option.label.toLowerCase().includes(term)) : props.options;
});

const display = computed(() => {
    const labels = props.options.filter((o) => selectedValues.value.includes(o.value)).map((o) => o.label);

    if (labels.length === 0) return '';
    if (labels.length <= 2) return labels.join(', ');

    return `${labels.length} sélectionnés`;
});

function isSelected(value: T): boolean {
    return selectedValues.value.includes(value);
}

function choose(option: SelectOption<T>): void {
    if (option.disabled) return;

    if (props.multiple) {
        const values = isSelected(option.value)
            ? selectedValues.value.filter((value) => value !== option.value)
            : [...selectedValues.value, option.value];
        model.value = values;
    } else {
        model.value = option.value;
        close();
    }
}

function clear(): void {
    model.value = props.multiple ? [] : null;
}

function onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;

    if (!root.value?.contains(target) && !dropdown.value?.contains(target)) close();
}

async function toggle(): Promise<void> {
    if (open.value) {
        close();

        return;
    }

    place();
    open.value = true;
    document.addEventListener('mousedown', onDocumentClick);
    window.addEventListener('scroll', onViewportChange, true);
    window.addEventListener('resize', onViewportChange);
    await nextTick();
    searchInput.value?.focus();
}

function close(): void {
    open.value = false;
    search.value = '';
    removeListeners();
}

function removeListeners(): void {
    document.removeEventListener('mousedown', onDocumentClick);
    window.removeEventListener('scroll', onViewportChange, true);
    window.removeEventListener('resize', onViewportChange);
}

onBeforeUnmount(removeListeners);
</script>

<template>
    <div ref="root" class="multiselect" :class="{ open, compact }" @keydown.esc="close">
        <button
            :id="id"
            type="button"
            class="trigger select"
            :class="{ 'has-error': invalid }"
            :aria-expanded="open"
            @click="toggle"
        >
            <span v-if="display" class="value">{{ display }}</span>
            <span v-else class="placeholder">{{ placeholder }}</span>
            <span
                v-if="clearable && selectedValues.length"
                class="clear"
                role="button"
                aria-label="Effacer"
                @click.stop="clear"
            >
                <AppIcon name="x" :size="14" />
            </span>
            <AppIcon name="chevron-down" :size="16" class="chevron" />
        </button>

        <Teleport to="body">
            <div
                v-if="open"
                ref="dropdown"
                class="multiselect-dropdown"
                :style="position"
                role="listbox"
                :aria-multiselectable="multiple"
                @keydown.esc="close"
            >
                <div v-if="searchable" class="search">
                    <AppIcon name="search" :size="14" />
                    <input ref="searchInput" v-model="search" type="text" placeholder="Rechercher…" />
                </div>
                <ul>
                    <li
                        v-for="option in filtered"
                        :key="String(option.value)"
                        :class="{ selected: isSelected(option.value), disabled: option.disabled }"
                        role="option"
                        :aria-selected="isSelected(option.value)"
                        @click="choose(option)"
                    >
                        <span v-if="multiple" class="check">
                            <AppIcon v-if="isSelected(option.value)" name="check" :size="12" :stroke-width="3" />
                        </span>
                        <span v-if="option.color" class="swatch" :style="{ background: option.color }" />
                        <span class="label">{{ option.label }}</span>
                        <span v-if="option.hint" class="hint">{{ option.hint }}</span>
                    </li>
                    <li v-if="filtered.length === 0" class="empty">Aucun résultat</li>
                </ul>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.multiselect {
    position: relative;
    min-width: 0;
}

.trigger {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    text-align: left;
    cursor: pointer;
}

.compact .trigger {
    min-height: 30px;
    padding: 3px 8px;
}

.value,
.placeholder {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.placeholder {
    color: var(--color-text-subtle);
}

.clear {
    display: flex;
    color: var(--color-text-subtle);
}

.clear:hover {
    color: var(--color-text);
}

.chevron {
    color: var(--color-text-subtle);
}

.multiselect-dropdown {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    width: max-content;
    max-width: 340px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
}

.search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-subtle);
}

.search input {
    flex: 1;
    border: 0;
    outline: none;
    background: transparent;
}

ul {
    flex: 1;
    min-height: 0;
    list-style: none;
    margin: 0;
    padding: var(--space-1) 0;
    overflow: auto;
}

li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 6px var(--space-3);
    cursor: pointer;
}

li:hover {
    background: var(--color-brand-50);
}

li.selected {
    color: var(--color-brand-700);
    font-weight: 600;
}

li.disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

li.empty {
    color: var(--color-text-subtle);
    cursor: default;
}

.check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 1px solid var(--color-border-strong);
    border-radius: 3px;
    color: #fff;
}

li.selected .check {
    background: var(--color-brand-600);
    border-color: var(--color-brand-600);
}

.swatch {
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

.label {
    flex: 1;
    white-space: nowrap;
}

.hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
}
</style>
