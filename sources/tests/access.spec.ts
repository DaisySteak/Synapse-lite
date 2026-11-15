import { afterEach, describe, expect, it } from 'vitest';
import { adminApi } from '@/api/admin';
import { authApi } from '@/api/auth';
import { settingsApi } from '@/api/settings';
import { statisticsApi } from '@/api/statistics';
import { referenceApi } from '@/api/tickets';
import { accessOf, DEFAULT_ACCESS, type AccessMatrix } from '@/backend/access';
import { ADMIN, LEAD, USER, createFolder, openAs, signIn, statusOf, validationErrorsOf } from './helpers';

afterEach(() => signIn(USER));

const STATISTICS = { kind: 'month', day: '2026-11-13', staleDays: 14, overloadThreshold: 8 } as const;

describe('access by profile', () => {
    it('gives the default pages until an administrator changes them', async () => {
        const files = await createFolder();
        await openAs(files, ADMIN);

        expect(await settingsApi.access()).toEqual(accessOf(DEFAULT_ACCESS));
        expect((await authApi.me()).permissions).toContain('admin.access');

        await openAs(files, LEAD);
        const lead = (await authApi.me()).permissions;
        expect(lead).toEqual(
            expect.arrayContaining([
                'pages.board',
                'admin.statistics',
                'admin.requesters',
                'admin.epics',
                'admin.custom_fields',
            ]),
        );
        expect(lead).not.toContain('admin.users');

        await openAs(files, USER);
        expect((await authApi.me()).permissions).toEqual(
            expect.arrayContaining(['tickets.create', 'pages.board', 'pages.tickets']),
        );
    });

    it('opens and closes pages for the whole team, checked by the data layer', async () => {
        const files = await createFolder();
        await openAs(files, ADMIN);
        const matrix: AccessMatrix = {
            ...(await settingsApi.access()),
            lead_tech: ['pages.board', 'admin.users'],
            user: ['pages.board', 'admin.statistics'],
        };
        await settingsApi.setAccess(matrix);
        expect(JSON.parse(files.get('settings/1.json')?.content as string).access.user).toEqual([
            'pages.board',
            'admin.statistics',
        ]);

        await openAs(files, USER);
        expect((await statisticsApi.compute(STATISTICS)).tiles).toBeDefined();
        // The actions on the tickets do not change.
        expect((await authApi.me()).permissions).toContain('tickets.create');

        await openAs(files, LEAD);
        expect(await statusOf(statisticsApi.compute(STATISTICS))).toBe(403);
        expect((await adminApi.users.list()).length).toBeGreaterThan(0);
        expect(await statusOf(settingsApi.access())).toBe(403);
    });

    it('keeps the access page for the administrators and refuses unknown pages', async () => {
        const files = await createFolder();
        await openAs(files, ADMIN);

        const saved = await settingsApi.setAccess({ admin: [], lead_tech: [], user: [] });
        expect(saved.admin).toEqual(['admin.access']);
        expect(await settingsApi.access()).toMatchObject({ admin: ['admin.access'], user: [] });

        expect(
            await validationErrorsOf(
                settingsApi.setAccess({ admin: [], lead_tech: [], user: ['tickets.purge'] } as unknown as AccessMatrix),
            ),
        ).toEqual(['access']);

        expect(await settingsApi.resetAccess()).toEqual(accessOf(DEFAULT_ACCESS));
    });

    it('keeps the theme when the access changes, and the reverse', async () => {
        const files = await createFolder();
        await openAs(files, ADMIN);
        await settingsApi.setTheme('blue');
        await settingsApi.setAccess({ ...(await settingsApi.access()), user: ['pages.board'] });
        await settingsApi.setTheme('violet');

        const record = JSON.parse(files.get('settings/1.json')?.content as string);
        expect(record).toMatchObject({ theme: 'violet', access: { user: ['pages.board'] } });
    });

    it('grants the days of the Terminé column like a page, to admins and lead techs by default', async () => {
        const files = await createFolder();
        await openAs(files, ADMIN);
        await settingsApi.setClosedVisibleDays(7);
        expect((await referenceApi.load()).settings.closed_visible_days).toBe(7);

        await openAs(files, LEAD);
        await settingsApi.setClosedVisibleDays(30);

        await openAs(files, USER);
        expect((await referenceApi.load()).settings.closed_visible_days).toBe(30);
        expect(await statusOf(settingsApi.setClosedVisibleDays(5))).toBe(403);

        await openAs(files, ADMIN);
        expect(await validationErrorsOf(settingsApi.setClosedVisibleDays(-1))).toEqual(['closed_visible_days']);
        await settingsApi.setAccess({ ...(await settingsApi.access()), user: ['pages.board', 'board.closed_days'] });
        await openAs(files, USER);
        expect(await settingsApi.setClosedVisibleDays(5)).toBe(5);
    });

    it('gives the new rights their default in a folder saved by an older version', () => {
        const legacy = accessOf({ admin: ['admin.access'], lead_tech: ['pages.board'], user: ['pages.board'] });
        expect(legacy.admin).toEqual(['board.closed_days', 'admin.access']);
        expect(legacy.lead_tech).toEqual(['pages.board', 'board.closed_days']);
        expect(legacy.user).toEqual(['pages.board']);
    });
});
