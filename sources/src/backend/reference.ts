/**
 * Fixed reference data and settings (ticket_statuses table and
 * config/synapse.php of Synapse).
 */
import type { AppSettings, CustomFieldType, Option, RoleCode, TicketStatus } from '@/types/models';
import { DEFAULT_THEME } from '@/utils/themes';
import { ROLE_LABELS } from './permissions';

/** Workflow steps (kanban columns). */
export const STATUSES: TicketStatus[] = [
    { code: 'backlog', label: 'Backlog', position: 1, color: '#6B7A80', is_final: false },
    { code: 'todo', label: 'À faire', position: 2, color: '#2F6EBA', is_final: false },
    { code: 'in_progress', label: 'En cours', position: 3, color: '#007A6E', is_final: false },
    { code: 'waiting', label: 'En attente', position: 4, color: '#C27C0E', is_final: false },
    { code: 'done', label: 'Terminé', position: 5, color: '#3D8B37', is_final: true },
];

/**
 * Pseudo status of the tickets deleted logically. Only offered to the
 * administrators, in the status filter of "Tous les tickets".
 */
export const DELETED_STATUS = { code: 'deleted', label: 'Supprimé', color: '#A23B3B' } as const;

/**
 * Sentences the administrator has to type before an irreversible operation
 * on the data (page "Gestion des données").
 */
export const CONFIRMATIONS = {
    purge: 'Je confirme la purge des tickets',
    restore: 'Je confirme la restauration des données',
    reset: 'Je confirme la remise à zéro des données',
} as const;

export type ConfirmedOperation = keyof typeof CONFIRMATIONS;

/** Neither the case nor extra spaces matter; the words do. */
export function isConfirmed(operation: ConfirmedOperation, text: string): boolean {
    const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');

    return normalize(text) === normalize(CONFIRMATIONS[operation]);
}

export function isFinalStatus(code: string): boolean {
    return STATUSES.some((status) => status.code === code && status.is_final);
}

export function statusExists(code: unknown): boolean {
    return STATUSES.some((status) => status.code === code);
}

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
    date: 'Date',
    short_text: 'Texte court',
    long_text: 'Texte complexe (Markdown)',
};

export const ROLE_OPTIONS: Option<RoleCode>[] = (Object.keys(ROLE_LABELS) as RoleCode[]).map((value) => ({
    value,
    label: ROLE_LABELS[value],
}));

export const CUSTOM_FIELD_TYPE_OPTIONS: Option<CustomFieldType>[] = (
    Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[]
).map((value) => ({ value, label: CUSTOM_FIELD_TYPE_LABELS[value] }));

/** Functional settings. */
export const SETTINGS: AppSettings = {
    // Days a closed ticket stays visible in the "Terminé" column (editable on the board).
    closed_visible_days: 20,
    // Planning: length of the bar of a ticket without due date.
    open_ended_days: 14,
    // Maximum size of an attachment (20 MB).
    attachment_max_size_kb: 20480,
    // Color theme: replaced by data/settings/1.json once an administrator chooses one.
    theme: DEFAULT_THEME,
};

/** Forbidden attachment extensions (executables and scripts). */
export const FORBIDDEN_EXTENSIONS = ['exe', 'bat', 'cmd', 'com', 'msi', 'ps1', 'vbs', 'js', 'jar', 'scr', 'php', 'sh'];

/** Employee number (matricule) used to sign in: R5 followed by 5 digits. */
/**
 * Employee number: the company number or the Windows account name
 * (the launcher signs in with it), stored in capitals.
 */
export const LOGIN_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,31}$/;
export const LOGIN_FORMAT_MESSAGE =
    'Le matricule ne peut contenir que des lettres, des chiffres, « . », « _ » ou « - » (2 à 32 caractères).';
