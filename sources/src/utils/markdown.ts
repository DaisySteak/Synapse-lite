import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { isExternalUrl } from './externalLinks';

/**
 * Markdown rendering (GitHub flavoured) with HTML sanitization.
 *
 * - raw HTML typed by users is neutralised by DOMPurify (XSS protection);
 * - every link opens in a new tab (target="_blank" rel="noopener noreferrer").
 */

marked.setOptions({ gfm: true, breaks: true });

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
        const href = node.getAttribute('href') ?? '';

        if (isExternalUrl(href) || /^https?:/i.test(href)) {
            node.setAttribute('target', '_blank');
            node.setAttribute('rel', 'noopener noreferrer');
        }
    }
});

export function renderMarkdown(source: string | null | undefined): string {
    if (!source) {
        return '';
    }

    const html = marked.parse(source, { async: false }) as string;

    return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

/** Number of task list items ("- [ ] ...") that marked renders as checkboxes. */
export function countTasks(source: string | null | undefined): number {
    if (!source) return 0;

    let count = 0;
    marked.walkTokens(marked.lexer(source), (token) => {
        if (token.type === 'list_item' && token.task) count++;
    });

    return count;
}

/** "- [ ] ", "1. [x] ", "> * [ ] "... Groups: prefix, state, suffix. */
const TASK_LINE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(\](?:[ \t]|$))/;
const FENCE = /^(?:[ \t]*>)*[ \t]{0,3}(`{3,}|~{3,})/;

/**
 * Check or uncheck the `index`-th task (0-based, in reading order) of a
 * Markdown text, as displayed by renderMarkdown.
 *
 * Returns null when the text cannot be changed safely (task not found, or
 * the line scan disagrees with the Markdown parser): the user then edits the
 * text by hand.
 */
export function toggleTask(source: string, index: number, checked: boolean): string | null {
    const lines = source.split('\n');
    let fence: string | null = null;
    let current = 0;
    let target = -1;
    let found = 0;

    lines.forEach((line, lineIndex) => {
        const fenceMatch = FENCE.exec(line);

        if (fenceMatch) {
            const marker = fenceMatch[1];
            if (fence === null) fence = marker[0];
            else if (marker[0] === fence) fence = null;

            return;
        }

        if (fence !== null || !TASK_LINE.test(line)) return;

        if (current === index) target = lineIndex;
        current++;
        found++;
    });

    if (target === -1 || found !== countTasks(source)) return null;

    lines[target] = lines[target].replace(
        TASK_LINE,
        (_all, prefix: string, _state: string, suffix: string) => `${prefix}${checked ? 'x' : ' '}${suffix}`,
    );

    return lines.join('\n');
}
