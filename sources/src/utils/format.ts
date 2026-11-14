/** "1,2 Mo" */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;

    return `${(bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

/** Man-days: 1.5 => "1,5 j/h" (no unit with `unit: false`). */
export function formatManDays(value: number | null | undefined, unit = true): string {
    if (value === null || value === undefined) return '—';
    const text = value.toLocaleString('fr-FR', { maximumFractionDigits: 3 });

    return unit ? `${text} j/h` : text;
}

/** Plural helper: plural(3, 'jour') => "3 jours". */
export function plural(count: number, word: string, pluralWord = `${word}s`): string {
    return `${count} ${Math.abs(count) > 1 ? pluralWord : word}`;
}
