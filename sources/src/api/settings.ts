/**
 * Settings of the whole team, chosen by an administrator: the color theme and
 * the pages accessible to each profile.
 */
import { accessOf, DEFAULT_ACCESS, isPagePermission, ROLES, type AccessMatrix } from '@/backend/access';
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
            if (!actor.can('admin.theme')) throw forbidden();
            if (!isThemeCode(theme)) throw fieldError('theme', 'Thème inconnu.');

            const saved = await saveSettings(actor, (record) => {
                record.theme = theme;
            });

            return saved.theme as ThemeCode;
        }),

    /** Pages accessible to each profile ("Gestion des accès"). */
    access: (): Promise<AccessMatrix> =>
        call(() => {
            const server = backend();
            if (!server.actor().can('admin.access')) throw forbidden();

            return accessOf(server.db.settings.get(1)?.access);
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

            const access = accessOf(matrix);
            const saved = await saveSettings(actor, (record) => {
                record.access = { ...access };
            });

            return accessOf(saved.access);
        }),

    /** Back to the access of a new folder. */
    resetAccess: (): Promise<AccessMatrix> => settingsApi.setAccess(accessOf(DEFAULT_ACCESS)),
};
