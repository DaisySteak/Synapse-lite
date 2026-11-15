/**
 * Page access by profile ("Gestion des accès"), chosen by an administrator and
 * saved in data/settings/1.json. Each page of the menu is opened with one
 * permission, and some pages have features granted the same way (sub-rows of
 * their page, e.g. the days of the "Terminé" column of the board); the actions
 * on the tickets (create, edit, move, delete, moderate) stay fixed by profile
 * (permissions.ts).
 *
 * The administrators always keep the "Gestion des accès" page, so that nobody can
 * lock the application.
 */
import type { Permission, RoleCode } from '@/types/models';

export type PagePermission = Extract<
    Permission,
    | 'pages.board'
    | 'board.closed_days'
    | 'pages.backlog'
    | 'pages.planning'
    | 'pages.tickets'
    | 'admin.statistics'
    | 'admin.projects'
    | 'admin.requesters'
    | 'admin.recurring_tickets'
    | 'admin.users'
    | 'admin.epics'
    | 'admin.custom_fields'
    | 'admin.data'
    | 'admin.access'
>;

/** Pages accessible to each profile. */
export type AccessMatrix = Record<RoleCode, PagePermission[]>;

export interface PageAccess {
    permission: PagePermission;
    label: string;
    /** Group of the menu ("" for the ticket follow-up pages). */
    group: string;
    /** Route of the page. */
    to: string;
}

/** Pages of the menu, in its order. */
export const PAGES: PageAccess[] = [
    { permission: 'pages.board', label: 'Tableau', group: '', to: '/tableau' },
    { permission: 'pages.backlog', label: 'Backlog', group: '', to: '/backlog' },
    { permission: 'pages.planning', label: 'Planning', group: '', to: '/planning' },
    { permission: 'pages.tickets', label: 'Tous les tickets', group: '', to: '/tickets' },
    { permission: 'admin.statistics', label: 'Statistiques', group: 'Pilotage', to: '/admin/statistiques' },
    { permission: 'admin.projects', label: 'Projets', group: 'Paramétrage', to: '/admin/projets' },
    { permission: 'admin.requesters', label: 'Demandeurs', group: 'Paramétrage', to: '/admin/demandeurs' },
    {
        permission: 'admin.recurring_tickets',
        label: 'Tickets récurrents',
        group: 'Paramétrage',
        to: '/admin/tickets-recurrents',
    },
    { permission: 'admin.epics', label: 'Types de ticket', group: 'Paramétrage', to: '/admin/epics' },
    { permission: 'admin.custom_fields', label: 'Champs personnalisés', group: 'Paramétrage', to: '/admin/champs' },
    { permission: 'admin.users', label: 'Utilisateurs', group: 'Habilitation', to: '/admin/utilisateurs' },
    { permission: 'admin.access', label: 'Gestion des accès', group: 'Habilitation', to: '/admin/habilitations' },
    { permission: 'admin.data', label: 'Paramétrage', group: 'Application', to: '/admin/parametrage' },
];

/** Feature of a page, granted like a page (sub-row of its page in "Gestion des accès"). */
export interface FeatureAccess {
    permission: PagePermission;
    label: string;
    /** Page the feature belongs to. */
    page: PagePermission;
}

export const FEATURES: FeatureAccess[] = [
    {
        permission: 'board.closed_days',
        label: 'Modifier le nombre de jours de la colonne Terminé',
        page: 'pages.board',
    },
];

/** Every right of the access table, in its order: each page followed by its features. */
export const ACCESS_ITEMS: PagePermission[] = PAGES.flatMap((page) => [
    page.permission,
    ...FEATURES.filter((feature) => feature.page === page.permission).map((feature) => feature.permission),
]);

/**
 * Rights known by version 1.11 and earlier: a folder saved by them knows
 * nothing of the newer rights, which keep their default.
 */
const LEGACY_KNOWN: string[] = [
    'pages.board',
    'pages.backlog',
    'pages.planning',
    'pages.tickets',
    'admin.statistics',
    'admin.projects',
    'admin.requesters',
    'admin.recurring_tickets',
    'admin.epics',
    'admin.custom_fields',
    'admin.users',
    'admin.access',
    'admin.theme',
    'admin.data',
];

const FOLLOW_UP: PagePermission[] = ['pages.board', 'pages.backlog', 'pages.planning', 'pages.tickets'];

/** Access before any choice of an administrator (and after a reset). */
export const DEFAULT_ACCESS: AccessMatrix = {
    admin: [...ACCESS_ITEMS],
    lead_tech: [
        ...FOLLOW_UP,
        'board.closed_days',
        'admin.statistics',
        'admin.projects',
        'admin.requesters',
        'admin.recurring_tickets',
        'admin.epics',
        'admin.custom_fields',
    ],
    user: [...FOLLOW_UP],
};

/** Pages a profile can never lose. */
export const LOCKED_ACCESS: Partial<Record<RoleCode, PagePermission[]>> = { admin: ['admin.access'] };

export const ROLES: RoleCode[] = ['admin', 'lead_tech', 'user'];

export function isPagePermission(value: unknown): value is PagePermission {
    return ACCESS_ITEMS.some((permission) => permission === value);
}

/**
 * Matrix read from the folder: unknown rights dropped, missing profiles taken
 * from the default, locked pages always present, in the order of the table.
 * `known` lists the rights the folder was saved with: the others (added by a
 * later version) keep their default.
 */
export function accessOf(
    stored: Partial<Record<string, unknown>> | null | undefined,
    known: unknown = LEGACY_KNOWN,
): AccessMatrix {
    const matrix = {} as AccessMatrix;
    const knownSet = new Set(Array.isArray(known) ? known : LEGACY_KNOWN);

    for (const role of ROLES) {
        const value = stored?.[role];
        const chosen = new Set<PagePermission>(
            Array.isArray(value)
                ? [
                      ...value.filter(isPagePermission),
                      ...DEFAULT_ACCESS[role].filter((permission) => !knownSet.has(permission)),
                  ]
                : DEFAULT_ACCESS[role],
        );
        for (const locked of LOCKED_ACCESS[role] ?? []) chosen.add(locked);
        matrix[role] = ACCESS_ITEMS.filter((permission) => chosen.has(permission));
    }

    return matrix;
}

/** Matrix of a settings record (settings/1.json), the default without one. */
export function storedAccess(record: { access?: unknown; access_known?: unknown } | null | undefined): AccessMatrix {
    return accessOf(record?.access as Partial<Record<string, unknown>> | undefined, record?.access_known);
}
