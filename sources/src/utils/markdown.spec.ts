import { describe, expect, it } from 'vitest';
import { countTasks, toggleTask } from './markdown';

describe('markdown task lists', () => {
    const source = ['# Étapes', '', '- [ ] Préparer', '- [x] Valider', '  - [ ] Sous-tâche', '1. [ ] Livrer'].join(
        '\n',
    );

    it('counts the rendered checkboxes', () => {
        expect(countTasks(source)).toBe(4);
    });

    it('checks and unchecks a task by its position', () => {
        expect(toggleTask(source, 0, true)).toContain('- [x] Préparer');
        expect(toggleTask(source, 1, false)).toContain('- [ ] Valider');
        expect(toggleTask(source, 2, true)).toContain('  - [x] Sous-tâche');
        expect(toggleTask(source, 3, true)).toContain('1. [x] Livrer');
    });

    it('leaves the rest of the text untouched', () => {
        const result = toggleTask(source, 0, true)!;

        expect(result.split('\n')).toHaveLength(source.split('\n').length);
        expect(result.replace('- [x] Préparer', '- [ ] Préparer')).toBe(source);
    });

    it('ignores checkboxes written in code blocks', () => {
        const text = ['```', '- [ ] pas une tâche', '```', '- [ ] vraie tâche'].join('\n');

        expect(countTasks(text)).toBe(1);
        expect(toggleTask(text, 0, true)).toContain('- [x] vraie tâche');
        expect(toggleTask(text, 0, true)).toContain('- [ ] pas une tâche');
    });

    it('handles tasks in a quote and CRLF line endings', () => {
        expect(toggleTask('> - [ ] cité', 0, true)).toBe('> - [x] cité');
        expect(toggleTask('- [ ] a\r\n- [ ] b', 1, true)).toBe('- [ ] a\r\n- [x] b');
    });

    it('refuses an unknown task', () => {
        expect(toggleTask(source, 9, true)).toBeNull();
    });
});
