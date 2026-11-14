/**
 * Color helpers for user-defined colors (requesters, epics).
 */

/** Relative luminance of an "#RRGGBB" color (WCAG). */
function luminance(hex: string): number {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map((index) => {
        const channel = parseInt(value.slice(index, index + 2), 16) / 255;

        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Readable text color (dark or white) on the given background. */
export function readableTextColor(background: string): string {
    if (!/^#[0-9a-f]{6}$/i.test(background)) {
        return '#1d2b2f';
    }

    return luminance(background) > 0.45 ? '#1d2b2f' : '#ffffff';
}

/** Proposed colors in the color pickers. */
export const PRESET_COLORS = [
    '#007A6E',
    '#00594F',
    '#2E7D32',
    '#7CB342',
    '#2F6EBA',
    '#1565C0',
    '#6A4C93',
    '#8E44AD',
    '#C27C0E',
    '#D35400',
    '#B23A48',
    '#C8102E',
    '#6B7A80',
    '#37474F',
];
