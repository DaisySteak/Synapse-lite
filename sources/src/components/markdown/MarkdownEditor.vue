<script setup lang="ts">
/**
 * Markdown editor: toolbar, keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+K),
 * smart list continuation and three modes (write / split / preview).
 * Built in-house to work fully offline (no CDN, no external service).
 */
import { computed, nextTick, ref } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { IconName } from '@/components/ui/icons';
import MarkdownViewer from '@/components/markdown/MarkdownViewer.vue';

type Mode = 'write' | 'split' | 'preview';

interface ToolbarAction {
    icon: IconName;
    title: string;
    run: () => void;
}

const props = withDefaults(
    defineProps<{ placeholder?: string; minHeight?: number; autofocus?: boolean; invalid?: boolean }>(),
    { placeholder: 'Rédigez en Markdown…', minHeight: 160 },
);

const model = defineModel<string>({ default: '' });
const emit = defineEmits<{ submit: [] }>();

const textarea = ref<HTMLTextAreaElement | null>(null);
const mode = ref<Mode>('write');

const editorStyle = computed(() => ({ minHeight: `${props.minHeight}px` }));

/** Replace the current selection, keeping the given inner part selected. */
async function replaceSelection(build: (selected: string) => { text: string; select?: [number, number] }) {
    const element = textarea.value;
    if (!element) return;

    const { selectionStart: start, selectionEnd: end, value } = element;
    const { text, select } = build(value.slice(start, end));

    model.value = value.slice(0, start) + text + value.slice(end);
    await nextTick();
    element.focus();

    const [from, to] = select ?? [text.length, text.length];
    element.setSelectionRange(start + from, start + to);
}

function wrap(before: string, after: string, fallback: string): void {
    void replaceSelection((selected) => {
        const inner = selected || fallback;

        return { text: `${before}${inner}${after}`, select: [before.length, before.length + inner.length] };
    });
}

/** Prefix every selected line (lists, quotes, headings). */
function prefixLines(prefix: (index: number) => string): void {
    const element = textarea.value;
    if (!element) return;

    // Extend the selection to whole lines.
    const lineStart = element.value.lastIndexOf('\n', element.selectionStart - 1) + 1;
    element.setSelectionRange(lineStart, element.selectionEnd);

    void replaceSelection((selected) => {
        const text = (selected || '')
            .split('\n')
            .map((line, index) => `${prefix(index)}${line}`)
            .join('\n');

        return { text };
    });
}

function insertBlock(block: string): void {
    void replaceSelection(() => ({ text: `\n${block}\n` }));
}

const actions: ToolbarAction[] = [
    { icon: 'heading', title: 'Titre', run: () => prefixLines(() => '## ') },
    { icon: 'bold', title: 'Gras (Ctrl+B)', run: () => wrap('**', '**', 'texte en gras') },
    { icon: 'italic', title: 'Italique (Ctrl+I)', run: () => wrap('_', '_', 'texte en italique') },
    { icon: 'strike', title: 'Barré', run: () => wrap('~~', '~~', 'texte barré') },
    { icon: 'list', title: 'Liste à puces', run: () => prefixLines(() => '- ') },
    { icon: 'list-ordered', title: 'Liste numérotée', run: () => prefixLines((i) => `${i + 1}. `) },
    { icon: 'list-check', title: 'Liste de tâches', run: () => prefixLines(() => '- [ ] ') },
    { icon: 'quote', title: 'Citation', run: () => prefixLines(() => '> ') },
    { icon: 'code', title: 'Code', run: () => wrap('`', '`', 'code') },
    { icon: 'link', title: 'Lien (Ctrl+K)', run: () => wrap('[', '](https://)', 'libellé') },
    {
        icon: 'table',
        title: 'Tableau',
        run: () => insertBlock('| Colonne 1 | Colonne 2 |\n| --- | --- |\n| Valeur | Valeur |'),
    },
    { icon: 'minus', title: 'Séparateur', run: () => insertBlock('---') },
];

function onKeydown(event: KeyboardEvent): void {
    const ctrl = event.ctrlKey || event.metaKey;

    if (ctrl && event.key === 'Enter') {
        event.preventDefault();
        emit('submit');

        return;
    }

    if (ctrl && ['b', 'i', 'k'].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const key = event.key.toLowerCase();
        if (key === 'b') wrap('**', '**', 'texte en gras');
        if (key === 'i') wrap('_', '_', 'texte en italique');
        if (key === 'k') wrap('[', '](https://)', 'libellé');

        return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
        continueList(event);
    }
}

/** Continue a list on Enter, or end it on an empty item. */
function continueList(event: KeyboardEvent): void {
    const element = textarea.value;
    if (!element || element.selectionStart !== element.selectionEnd) return;

    const before = element.value.slice(0, element.selectionStart);
    const line = before.slice(before.lastIndexOf('\n') + 1);
    const match = /^(\s*)([-*+] \[[ x]\] |[-*+] |(\d+)\. )(.*)$/.exec(line);
    if (!match) return;

    event.preventDefault();
    const [, indent, marker, number, content] = match;

    if (content.trim() === '') {
        // Empty item: remove the marker and stop the list.
        const start = element.selectionStart - line.length;
        model.value = element.value.slice(0, start) + element.value.slice(element.selectionStart);
        void nextTick(() => element.setSelectionRange(start, start));

        return;
    }

    const next = number ? `${Number(number) + 1}. ` : marker.replace('[x]', '[ ]');
    void replaceSelection(() => ({ text: `\n${indent}${next}` }));
}

function focus(): void {
    textarea.value?.focus();
}

defineExpose({ focus });
</script>

<template>
    <div class="md-editor" :class="[`mode-${mode}`, { invalid }]">
        <div class="toolbar">
            <div class="tools" :class="{ disabled: mode === 'preview' }">
                <button
                    v-for="action in actions"
                    :key="action.icon"
                    type="button"
                    class="tool"
                    :title="action.title"
                    :disabled="mode === 'preview'"
                    @mousedown.prevent
                    @click="action.run"
                >
                    <AppIcon :name="action.icon" :size="16" />
                </button>
            </div>
            <div class="modes" role="tablist">
                <button type="button" :class="{ active: mode === 'write' }" @click="mode = 'write'">Écrire</button>
                <button type="button" :class="{ active: mode === 'split' }" @click="mode = 'split'">
                    <AppIcon name="columns" :size="14" />
                </button>
                <button type="button" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">Aperçu</button>
            </div>
        </div>
        <div class="panes">
            <textarea
                v-show="mode !== 'preview'"
                ref="textarea"
                v-model="model"
                class="source"
                :style="editorStyle"
                :placeholder="placeholder"
                :autofocus="autofocus"
                spellcheck="true"
                @keydown="onKeydown"
            />
            <div v-if="mode !== 'write'" class="preview" :style="editorStyle">
                <MarkdownViewer :source="model" placeholder="Rien à prévisualiser." />
            </div>
        </div>
        <p class="hint">Markdown pris en charge · Ctrl+Entrée pour valider</p>
    </div>
</template>

<style scoped>
.md-editor {
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    transition:
        border-color var(--transition-fast),
        box-shadow var(--transition-fast);
}

.md-editor:focus-within {
    border-color: var(--color-brand-500);
    box-shadow: var(--focus-ring);
}

.md-editor.invalid {
    border-color: var(--color-danger);
}

.toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 4px 6px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    flex-wrap: wrap;
}

.tools {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
}

.tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
}

.tool:hover:not(:disabled) {
    background: var(--color-brand-100);
    color: var(--color-brand-800);
}

.tool:disabled {
    opacity: 0.35;
    cursor: default;
}

.modes {
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-sm);
    background: var(--color-border);
}

.modes button {
    display: inline-flex;
    align-items: center;
    height: 24px;
    padding: 0 10px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-muted);
    cursor: pointer;
}

.modes button.active {
    background: var(--color-surface);
    color: var(--color-brand-700);
    box-shadow: var(--shadow-sm);
}

.panes {
    display: grid;
}

.mode-split .panes {
    grid-template-columns: 1fr 1fr;
}

.source {
    display: block;
    width: 100%;
    padding: var(--space-3);
    border: 0;
    outline: none;
    resize: vertical;
    background: transparent;
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    line-height: 1.6;
}

.preview {
    padding: var(--space-3);
    overflow: auto;
}

.mode-split .preview {
    border-left: 1px solid var(--color-border);
}

.hint {
    padding: 2px var(--space-3) 4px;
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
}
</style>
