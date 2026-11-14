import { afterEach, describe, expect, it } from 'vitest';
import { referenceApi } from '@/api/tickets';
import { settingsApi } from '@/api/settings';
import type { ThemeCode } from '@/utils/themes';
import { THEMES, themeOf, themeVariables } from '@/utils/themes';
import { ADMIN, LEAD, USER, createFolder, openAs, signIn, statusOf, validationErrorsOf } from './helpers';

afterEach(() => signIn(USER));

describe('color theme', () => {
    it('is green until an administrator chooses another one for the whole team', async () => {
        const files = await createFolder();
        await openAs(files, ADMIN);
        expect((await referenceApi.load()).settings.theme).toBe('green');

        await settingsApi.setTheme('violet');
        expect((await referenceApi.load()).settings.theme).toBe('violet');
        expect(JSON.parse(files.get('settings/1.json')?.content as string)).toMatchObject({ id: 1, theme: 'violet' });

        // Another member opening the folder gets the same theme.
        await openAs(files, USER);
        expect((await referenceApi.load()).settings.theme).toBe('violet');
    });

    it('can only be changed by an administrator, to a known theme', async () => {
        const files = await createFolder();
        await openAs(files, ADMIN);
        expect(await validationErrorsOf(settingsApi.setTheme('pink' as ThemeCode))).toEqual(['theme']);

        await openAs(files, LEAD);
        expect(await statusOf(settingsApi.setTheme('blue'))).toBe(403);
    });

    it('defines six themes with every brand step', () => {
        expect(THEMES.map((theme) => theme.code)).toEqual(['green', 'blue', 'violet', 'red', 'orange', 'slate']);
        expect(themeOf('unknown').code).toBe('green');
        for (const theme of THEMES) {
            expect(Object.keys(themeVariables(theme))).toHaveLength(14);
        }
    });
});
