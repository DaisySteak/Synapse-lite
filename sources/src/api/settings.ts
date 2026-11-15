/**
 * Settings of the whole team: the color theme and the pages accessible to each
 * profile, chosen by an administrator, and the days of the "Terminé" column of
 * the board, chosen by the members granted it.
 */
import {
    ACCESS_ITEMS,
    accessOf,
    DEFAULT_ACCESS,
    isPagePermission,
    ROLES,
    storedAccess,
    type AccessMatrix,
} from '@/backend/access';
import { backend } from '@/backend/Backend';
import { nowIso } from '@/backend/clock';
import { fieldError, forbidden } from '@/backend/errors';
import type { Actor } from '@/backend/permissions';
import type { SettingsRecord } from '@/backend/records';
import { DEFAULT_THEME, isThemeCode, type ThemeCode } from '@/utils/themes';
import { call } from './call';

/** Change settings/1.json, created on the first change. */
async function saveSettings(actor: Actor, change: (record: SettingsRecord) => void): Promise<SettingsRecord> {
    const { settings } = backend().db;
    const now = nowIso();
    const update = (record: SettingsRecord) => {
        change(record);
        record.updated_at = now;
        record.updated_by = actor.id;
    };

    const existing = await settings.mutate(1, update);
    if (existing) return existing;

    const record: SettingsRecord = {
        id: 1,
        theme: DEFAULT_THEME,
        created_at: now,
        updated_at: now,
        updated_by: actor.id,
    };
    update(record);

    return settings.save(record);
}

export const settingsApi = {
    /** Color theme of the application, for every member of the team. */
    setTheme: (theme: ThemeCode): Promise<ThemeCode> =>
        call(async () => {
            const actor = backend().actor();
            if (!actor.can('admin.data')) throw forbidden();
            if (!isThemeCode(theme)) throw fieldError('theme', 'Thème inconnu.');

            const saved = await saveSettings(actor, (record) => {
                record.theme = theme;
            });

            return saved.theme as ThemeCode;
        }),

    /** Days a closed ticket stays in the "Terminé" column of the board, for the whole team. */
    setClosedVisibleDays: (days: number): Promise<number> =>
        call(async () => {
            const actor = backend().actor();
            if (!actor.can('board.closed_days')) throw forbidden();
            if (!Number.isInteger(days) || days < 0 || days > 3650) {
                throw fieldError('closed_visible_days', 'Le nombre de jours doit être un entier de 0 à 3650.');
            }

            const saved = await saveSettings(actor, (record) => {
                record.closed_visible_days = days;
            });

            return saved.closed_visible_days ?? days;
        }),

    /** Pages accessible to each profile ("Gestion des accès"). */
    access: (): Promise<AccessMatrix> =>
        call(() => {
            const server = backend();
            if (!server.actor().can('admin.access')) throw forbidden();

            return storedAccess(server.db.settings.get(1));
        }),

    /**
     * Choose the pages of the profiles. The administrators always keep the
     * "Gestion des accès" page.
     */
    setAccess: (matrix: AccessMatrix): Promise<AccessMatrix> =>
        call(async () => {
            const actor = backend().actor();
            if (!actor.can('admin.access')) throw forbidden();

            for (const role of ROLES) {
                const pages = matrix[role];
                if (!Array.isArray(pages) || !pages.every(isPagePermission)) {
                    throw fieldError('access', 'Page inconnue.');
                }
            }

            const access = accessOf(matrix, ACCESS_ITEMS);
            const saved = await saveSettings(actor, (record) => {
                record.access = { ...access };
                record.access_known = [...ACCESS_ITEMS];
            });

            return storedAccess(saved);
        }),

    /** Back to the access of a new folder. */
    resetAccess: (): Promise<AccessMatrix> => settingsApi.setAccess(accessOf(DEFAULT_ACCESS)),
};
