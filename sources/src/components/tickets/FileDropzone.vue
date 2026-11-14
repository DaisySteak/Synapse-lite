<script setup lang="ts">
/**
 * File selection by drag and drop or file picker. The selected files are
 * kept in the v-model until the parent uploads them.
 */
import { ref } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import { formatFileSize } from '@/utils/format';

const props = withDefaults(defineProps<{ compact?: boolean; label?: string }>(), {
    label: 'Glissez vos fichiers ici ou cliquez pour parcourir',
});

const files = defineModel<File[]>({ default: () => [] });

const reference = useReferenceStore();
const ui = useUiStore();
const over = ref(false);
const input = ref<HTMLInputElement | null>(null);

function add(list: FileList | null): void {
    if (!list) return;

    const maxBytes = reference.settings.attachment_max_size_kb * 1024;
    const accepted: File[] = [];

    Array.from(list).forEach((file) => {
        if (file.size > maxBytes) {
            ui.notify(`« ${file.name} » dépasse la taille maximale (${formatFileSize(maxBytes)}).`, 'error');
        } else {
            accepted.push(file);
        }
    });

    files.value = [...files.value, ...accepted];
    if (input.value) input.value.value = '';
}

function remove(index: number): void {
    files.value = files.value.filter((_, position) => position !== index);
}

function onDrop(event: DragEvent): void {
    over.value = false;
    add(event.dataTransfer?.files ?? null);
}
</script>

<template>
    <div class="dropzone-wrapper">
        <div
            class="dropzone"
            :class="{ over, compact: props.compact }"
            role="button"
            tabindex="0"
            @click="input?.click()"
            @keydown.enter.prevent="input?.click()"
            @dragover.prevent="over = true"
            @dragleave.prevent="over = false"
            @drop.prevent="onDrop"
        >
            <AppIcon name="upload" :size="16" />
            <span>{{ label }}</span>
            <input ref="input" type="file" multiple hidden @change="add(($event.target as HTMLInputElement).files)" />
        </div>
        <ul v-if="files.length" class="pending">
            <li v-for="(file, index) in files" :key="`${file.name}-${index}`">
                <AppIcon name="file" :size="14" />
                <span class="name">{{ file.name }}</span>
                <span class="size">{{ formatFileSize(file.size) }}</span>
                <button type="button" class="remove" aria-label="Retirer" @click="remove(index)">
                    <AppIcon name="x" :size="14" />
                </button>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.dropzone {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1.5px dashed var(--color-border-strong);
    border-radius: var(--radius-md);
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition:
        border-color var(--transition-fast),
        background var(--transition-fast);
}

.dropzone.compact {
    padding: var(--space-2);
}

.dropzone:hover,
.dropzone.over {
    border-color: var(--color-brand-500);
    background: var(--color-brand-50);
    color: var(--color-brand-700);
}

.pending {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.pending li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
}

.name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.size {
    color: var(--color-text-subtle);
    font-size: var(--font-size-xs);
}

.remove {
    display: flex;
    border: 0;
    background: transparent;
    color: var(--color-text-subtle);
    cursor: pointer;
}

.remove:hover {
    color: var(--color-danger);
}
</style>
