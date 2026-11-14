/**
 * Settings of the whole team, chosen by an administrator: the color theme.
 */
import { backend } from '@/backend/Backend';
import { nowIso } from '@/backend/clock';
import { fieldError, forbidden } from '@/backend/errors';
import { isThemeCode, type ThemeCode } from '@/utils/themes';
import { call } from './call';

export const settingsApi = {
    /** Color theme of the application, for every member of the team. */
    setTheme: (theme: ThemeCode): Promise<ThemeCode> =>
        call(async () => {
            const server = backend();
            const actor = server.actor();
            if (!actor.can('admin.theme')) throw forbidden();
            if (!isThemeCode(theme)) throw fieldError('theme', 'Thème inconnu.');

            const { settings } = server.db;
            const now = nowIso();
            const saved =
                (await settings.mutate(1, (record) => {
                    record.theme = theme;
                    record.updated_at = now;
                    record.updated_by = actor.id;
                })) ?? (await settings.save({ id: 1, theme, created_at: now, updated_at: now, updated_by: actor.id }));

            return saved.theme as ThemeCode;
        }),
};
