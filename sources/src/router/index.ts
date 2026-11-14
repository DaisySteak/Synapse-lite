import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { PAGES } from '@/backend/access';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';
import type { Permission } from '@/types/models';
import { takeLaunchLogin } from '@/utils/launch';

declare module 'vue-router' {
    interface RouteMeta {
        /** Page accessible without being signed in. */
        guest?: boolean;
        /** Page accessible without any data folder connected. */
        offline?: boolean;
        /** Permission required to open the page. */
        permission?: Permission;
        /** Title displayed in the browser tab. */
        title?: string;
    }
}

const routes: RouteRecordRaw[] = [
    {
        path: '/dossier',
        name: 'connect',
        component: () => import('@/views/ConnectView.vue'),
        meta: { guest: true, offline: true, title: 'Dossier de données' },
    },
    {
        path: '/connexion',
        name: 'login',
        component: () => import('@/views/LoginView.vue'),
        meta: { guest: true, title: 'Connexion' },
    },
    {
        path: '/',
        component: () => import('@/components/layout/AppLayout.vue'),
        children: [
            { path: '', redirect: { name: 'board' } },
            {
                path: 'tableau',
                name: 'board',
                component: () => import('@/views/BoardView.vue'),
                meta: { permission: 'pages.board', title: 'Tableau' },
            },
            {
                path: 'backlog',
                name: 'backlog',
                component: () => import('@/views/BacklogView.vue'),
                meta: { permission: 'pages.backlog', title: 'Backlog' },
            },
            {
                path: 'tickets',
                name: 'tickets',
                component: () => import('@/views/TicketListView.vue'),
                meta: { permission: 'pages.tickets', title: 'Tous les tickets' },
            },
            {
                path: 'planning',
                name: 'planning',
                component: () => import('@/views/PlanningView.vue'),
                meta: { permission: 'pages.planning', title: 'Planning' },
            },
            {
                path: 'tickets/:id(\\d+)',
                name: 'ticket',
                component: () => import('@/views/TicketView.vue'),
                props: (route) => ({ id: Number(route.params.id) }),
                meta: { title: 'Ticket' },
            },
            {
                path: 'profil',
                name: 'profile',
                component: () => import('@/views/ProfileView.vue'),
                meta: { title: 'Mon profil' },
            },
            {
                path: 'admin/utilisateurs',
                name: 'admin-users',
                component: () => import('@/views/admin/UsersView.vue'),
                meta: { permission: 'admin.users', title: 'Utilisateurs' },
            },
            {
                path: 'admin/projets',
                name: 'admin-projects',
                component: () => import('@/views/admin/ProjectsView.vue'),
                meta: { permission: 'admin.projects', title: 'Projets' },
            },
            {
                path: 'admin/tickets-recurrents',
                name: 'admin-recurring-tickets',
                component: () => import('@/views/admin/RecurringTicketsView.vue'),
                meta: { permission: 'admin.recurring_tickets', title: 'Tickets récurrents' },
            },
            {
                path: 'admin/epics',
                name: 'admin-epics',
                component: () => import('@/views/admin/EpicsView.vue'),
                meta: { permission: 'admin.epics', title: 'Types de ticket' },
            },
            {
                path: 'admin/demandeurs',
                name: 'admin-requesters',
                component: () => import('@/views/admin/RequestersView.vue'),
                meta: { permission: 'admin.requesters', title: 'Demandeurs' },
            },
            {
                path: 'admin/champs',
                name: 'admin-custom-fields',
                component: () => import('@/views/admin/CustomFieldsView.vue'),
                meta: { permission: 'admin.custom_fields', title: 'Champs personnalisés' },
            },
            {
                path: 'admin/donnees',
                name: 'admin-data',
                component: () => import('@/views/admin/DataView.vue'),
                meta: { permission: 'admin.data', title: 'Gestion des données' },
            },
            {
                path: 'admin/theme',
                name: 'admin-theme',
                component: () => import('@/views/admin/ThemeView.vue'),
                meta: { permission: 'admin.theme', title: 'Thème de couleur' },
            },
            {
                path: 'admin/habilitations',
                name: 'admin-access',
                component: () => import('@/views/admin/AccessView.vue'),
                meta: { permission: 'admin.access', title: 'Gestion des accès' },
            },
            {
                path: 'admin/statistiques',
                name: 'admin-statistics',
                component: () => import('@/views/admin/StatisticsView.vue'),
                meta: { permission: 'admin.statistics', title: 'Statistiques' },
            },
            {
                path: ':pathMatch(.*)*',
                name: 'not-found',
                component: () => import('@/views/NotFoundView.vue'),
                meta: { title: 'Page introuvable' },
            },
        ],
    },
];

/**
 * Hash history ("Synapse Lite.html#/tableau"): the application is opened as
 * a local file, without any server to answer the other paths.
 */
export const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

router.beforeEach(async (to) => {
    const connection = useConnectionStore();
    await connection.restore();

    // First the data folder, then the employee number.
    if (!connection.isConnected) {
        return to.meta.offline ? true : { name: 'connect', query: redirectQuery(to.fullPath) };
    }

    const auth = useAuthStore();

    // Opened by the Windows launcher: sign in with the account of the session.
    const launchLogin = takeLaunchLogin();
    if (launchLogin) {
        const failure = await auth.loginFromLauncher(launchLogin);
        if (failure) {
            return { name: 'login', query: { ...redirectQuery(to.fullPath), matricule: launchLogin, erreur: failure } };
        }
    }

    await auth.initialize();

    if (to.meta.guest) {
        return auth.isAuthenticated ? homeRoute() : to.name === 'connect' ? { name: 'login', query: to.query } : true;
    }

    if (!auth.isAuthenticated) {
        return { name: 'login', query: redirectQuery(to.fullPath) };
    }

    if (to.meta.permission && !auth.can(to.meta.permission)) {
        const home = homeRoute();
        return home === to.path ? { name: 'profile' } : home;
    }

    return true;
});

router.afterEach((to) => {
    document.title = to.meta.title ? `${to.meta.title} · Synapse Lite` : 'Synapse Lite';
});

/**
 * First page of the menu the signed-in user may open (the board, unless an
 * administrator closed it to the profile), or the profile page.
 */
export function homeRoute(): string {
    const auth = useAuthStore();

    return PAGES.find((page) => auth.can(page.permission))?.to ?? '/profil';
}

function redirectQuery(fullPath: string): Record<string, string> {
    return fullPath !== '/' && !fullPath.startsWith('/connexion') && !fullPath.startsWith('/dossier')
        ? { redirect: fullPath }
        : {};
}
