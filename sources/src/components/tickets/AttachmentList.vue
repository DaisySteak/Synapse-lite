<script setup lang="ts">
import { errorMessage } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useUiStore } from '@/stores/ui';
import type { Attachment } from '@/types/models';
import { formatDateTime } from '@/utils/dates';
import { formatFileSize } from '@/utils/format';

defineProps<{ attachments: Attachment[] }>();
const emit = defineEmits<{ remove: [attachment: Attachment] }>();
const ui = useUiStore();

/** The file is read from the data folder and offered as a download. */
async function download(attachment: Attachment): Promise<void> {
    try {
        await ticketsApi.downloadAttachment(attachment);
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    }
}
</script>

<template>
    <ul class="attachments">
        <li v-for="attachment in attachments" :key="attachment.id" class="attachment">
            <AppIcon name="file" :size="16" class="file-icon" />
            <a
                href="#"
                class="name"
                :title="`Télécharger ${attachment.original_name}`"
                @click.prevent="download(attachment)"
            >
                {{ attachment.original_name }}
            </a>
            <span class="meta">
                {{ formatFileSize(attachment.size_bytes) }}
                <template v-if="attachment.uploaded_by"> · {{ attachment.uploaded_by.full_name }}</template>
                · {{ formatDateTime(attachment.created_at) }}
            </span>
            <button
                type="button"
                class="btn btn-ghost btn-icon btn-sm"
                title="Télécharger"
                @click="download(attachment)"
            >
                <AppIcon name="download" :size="15" />
            </button>
            <button
                v-if="attachment.can_delete"
                type="button"
                class="btn btn-ghost btn-icon btn-sm"
                title="Supprimer"
                @click="emit('remove', attachment)"
            >
                <AppIcon name="trash" :size="15" />
            </button>
        </li>
    </ul>
</template>

<style scoped>
.attachments {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.attachment {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 4px var(--space-2);
    border-radius: var(--radius-sm);
}

.attachment:hover {
    background: var(--color-surface-alt);
}

.file-icon {
    color: var(--color-brand-600);
}

.name {
    min-width: 0;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.meta {
    flex: 1;
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
