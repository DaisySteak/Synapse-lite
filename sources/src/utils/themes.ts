/**
 * Color themes of the application, chosen by an administrator for the whole
 * team (data/settings/1.json). A theme replaces the brand colors (sidebar,
 * buttons, links, selections) and the tint of the backgrounds; the colors of
 * the statuses, types, projects and charts never change.
 *
 * "green" is the default: its values are those of css/tokens.css.
 */

export type ThemeCode = 'green' | 'blue' | 'violet' | 'red' | 'orange' | 'slate';

export interface Theme {
    code: ThemeCode;
    label: string;
    /** Brand scale, from the darkest (950) to the lightest (50). */
    brand: Record<'950' | '900' | '800' | '700' | '600' | '500' | '300' | '100' | '50', string>;
    /** Page background, alternate surface and sunken areas (kanban columns), lightly tinted. */
    background: string;
    surfaceAlt: string;
    sunken: string;
    /** Text of the sidebar, on the dark brand gradient. */
    sidebarText: string;
}

export const DEFAULT_THEME: ThemeCode = 'green';

export const THEMES: Theme[] = [
    {
        code: 'green',
        label: 'Vert',
        brand: {
            950: '#003a33',
            900: '#00473f',
            800: '#00594f',
            700: '#006a5f',
            600: '#007a6e',
            500: '#009b8d',
            300: '#7cc5bb',
            100: '#dff1ed',
            50: '#f1f8f6',
        },
        background: '#eef2f1',
        surfaceAlt: '#f6f8f8',
        sunken: '#e4eae9',
        sidebarText: '#d9ece8',
    },
    {
        code: 'blue',
        label: 'Bleu',
        brand: {
            950: '#0b2545',
            900: '#0f3460',
            800: '#134a85',
            700: '#185a9d',
            600: '#1f6cb5',
            500: '#2f86d3',
            300: '#93bfe8',
            100: '#e1edf9',
            50: '#f2f7fc',
        },
        background: '#edf1f6',
        surfaceAlt: '#f5f7fa',
        sunken: '#e2e8f0',
        sidebarText: '#dbe8f6',
    },
    {
        code: 'violet',
        label: 'Violet',
        brand: {
            950: '#2a1745',
            900: '#37205c',
            800: '#472a78',
            700: '#55348e',
            600: '#6441a5',
            500: '#7c5cc4',
            300: '#c0afe3',
            100: '#ece6f7',
            50: '#f6f3fb',
        },
        background: '#f0eef5',
        surfaceAlt: '#f7f6fa',
        sunken: '#e7e3ef',
        sidebarText: '#e6def4',
    },
    {
        code: 'red',
        label: 'Bordeaux',
        brand: {
            950: '#3d0d16',
            900: '#52111e',
            800: '#6b1727',
            700: '#821d30',
            600: '#9b243a',
            500: '#bd3a52',
            300: '#e3a3ae',
            100: '#f8e3e7',
            50: '#fcf3f4',
        },
        background: '#f4eef0',
        surfaceAlt: '#faf6f7',
        sunken: '#ece3e5',
        sidebarText: '#f4dde2',
    },
    {
        code: 'orange',
        label: 'Orange',
        brand: {
            950: '#3f1d05',
            900: '#552708',
            800: '#6f330a',
            700: '#8a400c',
            600: '#a54c0f',
            500: '#cf661b',
            300: '#f0b88a',
            100: '#fcebdc',
            50: '#fef6ef',
        },
        background: '#f5f1ec',
        surfaceAlt: '#faf7f4',
        sunken: '#ede6de',
        sidebarText: '#f8e3d2',
    },
    {
        code: 'slate',
        label: 'Ardoise',
        brand: {
            950: '#1c252c',
            900: '#25313a',
            800: '#2f3e4a',
            700: '#3a4b59',
            600: '#475a69',
            500: '#5f7484',
            300: '#a9b8c3',
            100: '#e5eaee',
            50: '#f3f5f7',
        },
        background: '#eef1f3',
        surfaceAlt: '#f5f7f8',
        sunken: '#e3e8eb',
        sidebarText: '#dde4ea',
    },
];

export function isThemeCode(value: unknown): value is ThemeCode {
    return THEMES.some((theme) => theme.code === value);
}

export function themeOf(code: string | null | undefined): Theme {
    return THEMES.find((theme) => theme.code === code) ?? THEMES[0];
}

/** "#007a6e" → "0 122 110", for rgb() with an alpha. */
function channels(hex: string): string {
    const value = Number.parseInt(hex.slice(1), 16);

    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

/** CSS variables of a theme. */
export function themeVariables(theme: Theme): Record<string, string> {
    const variables: Record<string, string> = {
        '--color-background': theme.background,
        '--color-surface-alt': theme.surfaceAlt,
        '--color-surface-sunken': theme.sunken,
        '--color-sidebar-text': theme.sidebarText,
        '--focus-ring': `0 0 0 3px rgb(${channels(theme.brand[500])} / 35%)`,
    };

    for (const [step, color] of Object.entries(theme.brand)) variables[`--color-brand-${step}`] = color;

    return variables;
}

/** Last theme applied in this browser: shown at once on the next opening, before the data is read. */
const STORAGE_KEY = 'synapse-lite.theme';

/** Apply a theme to the whole page. */
export function applyTheme(code: string | null | undefined): void {
    const theme = themeOf(code);
    const style = document.documentElement.style;

    for (const [name, value] of Object.entries(themeVariables(theme))) style.setProperty(name, value);
    document.documentElement.dataset.theme = theme.code;

    try {
        localStorage.setItem(STORAGE_KEY, theme.code);
    } catch {
        // Storage disabled: the theme is applied again once the data is read.
    }
}

/** Theme of the previous opening, or the default one. */
export function rememberedTheme(): ThemeCode {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        return isThemeCode(stored) ? stored : DEFAULT_THEME;
    } catch {
        return DEFAULT_THEME;
    }
}
