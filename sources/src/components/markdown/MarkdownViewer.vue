<script setup lang="ts">
/**
 * Sanitized Markdown rendering (see utils/markdown.ts).
 *
 * With `interactive`, the checkboxes of task lists ("- [ ] ...") can be
 * clicked: the component emits the Markdown text with the box checked or
 * unchecked, and the parent saves it. No need to switch to edit mode.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { countTasks, renderMarkdown, toggleTask } from '@/utils/markdown';

const props = defineProps<{
    source: string | null | undefined;
    placeholder?: string;
    /** Task checkboxes can be clicked (the user may edit the text). */
    interactive?: boolean;
    /** A save is in progress: clicks are ignored. */
    busy?: boolean;
}>();
const emit = defineEmits<{ toggle: [source: string] }>();

const root = ref<HTMLElement | null>(null);
const html = computed(() => renderMarkdown(props.source));

/** Checkboxes produced by task lists, in reading order. */
function checkboxes(): HTMLInputElement[] {
    return Array.from(root.value?.querySelectorAll<HTMLInputElement>('li > input[type="checkbox"]') ?? []);
}

/** Enable the checkboxes when they match the tasks of the text exactly. */
async function prepare(): Promise<void> {
    await nextTick();
    const boxes = checkboxes();
    const enabled = !!props.interactive && boxes.length > 0 && boxes.length === countTasks(props.source);

    boxes.forEach((box) => {
        box.disabled = !enabled;
        box.title = enabled ? 'Cliquer pour cocher ou décocher' : '';
        box.closest('li')?.classList.toggle('task-interactive', enabled);
    });
}

watch([html, () => props.interactive], prepare, { immediate: true, flush: 'post' });

function onClick(event: MouseEvent): void {
    const box = event.target;
    if (!(box instanceof HTMLInputElement) || box.type !== 'checkbox' || box.disabled) return;

    // During a click, `checked` already holds the requested state. The native
    // toggle is then cancelled: the box is redrawn from the saved text.
    const wanted = box.checked;
    event.preventDefault();
    if (props.busy || !props.source) return;

    const index = checkboxes().indexOf(box);
    const updated = index === -1 ? null : toggleTask(props.source, index, wanted);

    if (updated !== null && updated !== props.source) emit('toggle', updated);
}
</script>

<template>
    <div
        v-if="html"
        ref="root"
        class="markdown-body"
        :class="{ busy: interactive && busy }"
        @click="onClick"
        v-html="html"
    />
    <p v-else class="placeholder">{{ placeholder ?? 'Aucun contenu.' }}</p>
</template>

<style scoped>
.placeholder {
    color: var(--color-text-subtle);
    font-style: italic;
}

.markdown-body {
    line-height: 1.6;
    word-wrap: break-word;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
    margin: 1em 0 0.5em;
    color: var(--color-brand-900);
}

.markdown-body :deep(h1) {
    font-size: 1.5em;
}

.markdown-body :deep(h2) {
    font-size: 1.3em;
    padding-bottom: 0.2em;
    border-bottom: 1px solid var(--color-border);
}

.markdown-body :deep(h3) {
    font-size: 1.1em;
}

.markdown-body :deep(> :first-child) {
    margin-top: 0;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(pre),
.markdown-body :deep(table) {
    margin: 0 0 0.8em;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
    padding-left: 1.6em;
}

.markdown-body :deep(li > input[type='checkbox']) {
    margin-right: 6px;
    accent-color: var(--color-brand-600);
}

.markdown-body :deep(li.task-interactive > input[type='checkbox']) {
    cursor: pointer;
}

.markdown-body.busy :deep(input[type='checkbox']) {
    cursor: progress;
    opacity: 0.6;
}

.markdown-body :deep(blockquote) {
    padding: 0.2em 1em;
    border-left: 3px solid var(--color-brand-300);
    color: var(--color-text-muted);
    background: var(--color-brand-50);
}

.markdown-body :deep(code) {
    padding: 0.1em 0.35em;
    border-radius: 4px;
    background: var(--color-surface-alt);
    font-family: var(--font-mono);
    font-size: 0.9em;
}

.markdown-body :deep(pre) {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: #1f2b2e;
    color: #e6f0ee;
    overflow-x: auto;
}

.markdown-body :deep(pre code) {
    padding: 0;
    background: transparent;
    color: inherit;
}

.markdown-body :deep(table) {
    border-collapse: collapse;
    display: block;
    overflow-x: auto;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
    padding: 6px 12px;
    border: 1px solid var(--color-border);
}

.markdown-body :deep(th) {
    background: var(--color-surface-alt);
}

.markdown-body :deep(hr) {
    border: 0;
    border-top: 1px solid var(--color-border);
}

.markdown-body :deep(img) {
    max-width: 100%;
}
</style>
