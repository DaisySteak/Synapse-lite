<script setup lang="ts">
/**
 * Comments of a ticket (Markdown) with their attachments.
 */
import { onMounted, ref, watch } from 'vue';
import { errorMessage, fieldErrors } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import MarkdownEditor from '@/components/markdown/MarkdownEditor.vue';
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue';
import AttachmentList from '@/components/tickets/AttachmentList.vue';
import FileDropzone from '@/components/tickets/FileDropzone.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useUiStore } from '@/stores/ui';
import type { Attachment, Comment } from '@/types/models';
import { formatDateTime, formatRelative } from '@/utils/dates';

const props = defineProps<{ ticketId: number }>();
const emit = defineEmits<{ changed: [] }>();

const ui = useUiStore();
const comments = ref<Comment[]>([]);
const loading = ref(true);

const draft = ref('');
const draftFiles = ref<File[]>([]);
const sending = ref(false);
const error = ref('');

const editingId = ref<number | null>(null);
const editBody = ref('');
const editFiles = ref<File[]>([]);

/** @param silent  refresh without the loading state (changes of the other users) */
async function load(silent = false): Promise<void> {
    loading.value = !silent;

    try {
        comments.value = await ticketsApi.comments(props.ticketId);
    } catch (e) {
        // A background refresh stays quiet: the ticket may just have been deleted by someone.
        if (!silent) ui.notify(errorMessage(e), 'error');
    } finally {
        loading.value = false;
    }
}

// Comments written by the other users show up without reloading the page.
watch(
    () => ui.ticketsVersion,
    () => {
        if (editingId.value === null) void load(true);
    },
);

async function send(): Promise<void> {
    if (!draft.value.trim() || sending.value) return;

    sending.value = true;
    error.value = '';

    try {
        comments.value.push(await ticketsApi.addComment(props.ticketId, draft.value, draftFiles.value));
        draft.value = '';
        draftFiles.value = [];
        emit('changed');
    } catch (e) {
        error.value = Object.values(fieldErrors(e))[0] ?? errorMessage(e);
    } finally {
        sending.value = false;
    }
}

function startEdit(comment: Comment): void {
    editingId.value = comment.id;
    editBody.value = comment.body;
    editFiles.value = [];
}

async function saveEdit(comment: Comment): Promise<void> {
    try {
        const updated = await ticketsApi.updateComment(comment.id, editBody.value, editFiles.value);
        comments.value = comments.value.map((item) => (item.id === comment.id ? updated : item));
        editingId.value = null;
        emit('changed');
    } catch (e) {
        ui.notify(Object.values(fieldErrors(e))[0] ?? errorMessage(e), 'error');
    }
}

/** A checkbox was clicked in the comment: save the updated text at once. */
const togglingId = ref<number | null>(null);

async function toggleTask(comment: Comment, body: string): Promise<void> {
    if (togglingId.value !== null) return;

    togglingId.value = comment.id;
    try {
        const updated = await ticketsApi.updateComment(comment.id, body, []);
        comments.value = comments.value.map((item) => (item.id === comment.id ? updated : item));
        emit('changed');
    } catch (e) {
        ui.notify(Object.values(fieldErrors(e))[0] ?? errorMessage(e), 'error');
    } finally {
        togglingId.value = null;
    }
}

async function remove(comment: Comment): Promise<void> {
    const confirmed = await ui.confirm({
        title: 'Supprimer le commentaire',
        message: 'Le commentaire et ses pièces jointes seront supprimés.',
        confirmLabel: 'Supprimer',
        danger: true,
    });
    if (!confirmed) return;

    try {
        await ticketsApi.removeComment(comment.id);
        comments.value = comments.value.filter((item) => item.id !== comment.id);
        emit('changed');
    } catch (e) {
        ui.notify(errorMessage(e), 'error');
    }
}

async function removeAttachment(comment: Comment, attachment: Attachment): Promise<void> {
    const confirmed = await ui.confirm({
        title: 'Supprimer la pièce jointe',
        message: `« ${attachment.original_name} » sera définitivement supprimé.`,
        confirmLabel: 'Supprimer',
        danger: true,
    });
    if (!confirmed) return;

    try {
        await ticketsApi.removeAttachment(attachment.id);
        comment.attachments = comment.attachments.filter((item) => item.id !== attachment.id);
        emit('changed');
    } catch (e) {
        ui.notify(errorMessage(e), 'error');
    }
}

onMounted(load);
</script>

<template>
    <section class="comments">
        <p v-if="loading" class="muted">Chargement des commentaires…</p>
        <p v-else-if="comments.length === 0" class="muted empty">Aucun commentaire pour le moment.</p>

        <article v-for="comment in comments" :key="comment.id" class="comment">
            <UserAvatar :user="comment.author" :size="30" />
            <div class="bubble">
                <header class="comment-header">
                    <strong>{{ comment.author?.full_name }}</strong>
                    <span class="date" :title="formatDateTime(comment.created_at)">
                        {{ formatRelative(comment.created_at) }}<template v-if="comment.is_edited"> · modifié</template>
                    </span>
                    <span class="actions">
                        <button
                            v-if="comment.can_update && editingId !== comment.id"
                            type="button"
                            class="btn btn-ghost btn-icon btn-sm"
                            title="Modifier"
                            @click="startEdit(comment)"
                        >
                            <AppIcon name="edit" :size="14" />
                        </button>
                        <button
                            v-if="comment.can_delete"
                            type="button"
                            class="btn btn-ghost btn-icon btn-sm"
                            title="Supprimer"
                            @click="remove(comment)"
                        >
                            <AppIcon name="trash" :size="14" />
                        </button>
                    </span>
                </header>

                <template v-if="editingId === comment.id">
                    <MarkdownEditor v-model="editBody" :min-height="100" @submit="saveEdit(comment)" />
                    <FileDropzone v-model="editFiles" compact label="Ajouter des pièces jointes" />
                    <div class="edit-actions">
                        <button type="button" class="btn btn-secondary btn-sm" @click="editingId = null">
                            Annuler
                        </button>
                        <button type="button" class="btn btn-primary btn-sm" @click="saveEdit(comment)">
                            Enregistrer
                        </button>
                    </div>
                </template>
                <MarkdownViewer
                    v-else
                    :source="comment.body"
                    :interactive="comment.can_update"
                    :busy="togglingId === comment.id"
                    @toggle="toggleTask(comment, $event)"
                />

                <AttachmentList
                    v-if="comment.attachments.length"
                    class="comment-files"
                    :attachments="comment.attachments"
                    @remove="removeAttachment(comment, $event)"
                />
            </div>
        </article>

        <div class="new-comment">
            <MarkdownEditor v-model="draft" :min-height="90" placeholder="Ajouter un commentaire…" @submit="send" />
            <FileDropzone v-model="draftFiles" compact label="Joindre des fichiers au commentaire" />
            <p v-if="error" class="field-error">{{ error }}</p>
            <div class="send">
                <button type="button" class="btn btn-primary" :disabled="!draft.trim() || sending" @click="send">
                    <AppIcon name="message" :size="16" />
                    Commenter
                </button>
            </div>
        </div>
    </section>
</template>

<style scoped>
.comments {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.empty {
    font-style: italic;
}

.comment {
    display: flex;
    gap: var(--space-3);
}

.bubble {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
}

.comment-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}

.date {
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
}

.actions {
    margin-left: auto;
    display: flex;
}

.edit-actions,
.send {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
}

.comment-files {
    padding-top: var(--space-2);
    border-top: 1px dashed var(--color-border);
}

.new-comment {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
}
</style>
