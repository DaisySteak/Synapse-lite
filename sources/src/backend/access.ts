/**
 * Page access by profile ("Gestion des accès"), chosen by an administrator and
 * saved in data/settings/1.json. Each page of the menu is opened with one
 * permission; the actions on the tickets (create, edit, move, delete,
 * moderate) stay fixed by profile (permissions.ts).
 *
 * The administrators always keep the "Gestion des accès" page, so that nobody can
 * lock the application.
 */
import type { Permission, RoleCode } from '@/types/models';

export type PagePermission = Extract<
    Permission,
    | 'pages.board'
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
    | 'admin.theme'
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
    { permission: 'admin.theme', label: 'Thème', group: 'Application', to: '/admin/theme' },
    { permission: 'admin.data', label: 'Gestion des données', group: 'Application', to: '/admin/donnees' },
];

const FOLLOW_UP: PagePermission[] = ['pages.board', 'pages.backlog', 'pages.planning', 'pages.tickets'];

/** Access before any choice of an administrator (and after a reset). */
export const DEFAULT_ACCESS: AccessMatrix = {
    admin: PAGES.map((page) => page.permission),
    lead_tech: [
        ...FOLLOW_UP,
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
    return PAGES.some((page) => page.permission === value);
}

/**
 * Matrix read from the folder: unknown pages dropped, missing profiles taken
 * from the default, locked pages always present, in the order of the menu.
 */
export function accessOf(stored: Partial<Record<string, unknown>> | null | undefined): AccessMatrix {
    const matrix = {} as AccessMatrix;

    for (const role of ROLES) {
        const value = stored?.[role];
        const chosen = new Set<PagePermission>(
            Array.isArray(value) ? value.filter(isPagePermission) : DEFAULT_ACCESS[role],
        );
        for (const locked of LOCKED_ACCESS[role] ?? []) chosen.add(locked);
        matrix[role] = PAGES.map((page) => page.permission).filter((permission) => chosen.has(permission));
    }

    return matrix;
}
