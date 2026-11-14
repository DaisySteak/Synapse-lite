<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '@/components/ui/AppIcon.vue';
import type { IconName } from '@/components/ui/icons';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { Permission } from '@/types/models';

interface NavItem {
    to: string;
    label: string;
    icon: IconName;
    permission?: Permission;
}

const auth = useAuthStore();
const reference = useReferenceStore();
const ui = useUiStore();
const router = useRouter();

interface NavSection {
    /** Heading of the group; the first group (ticket follow-up) has none. */
    title?: string;
    items: NavItem[];
}

/**
 * Menu grouped by use, then by profile: the follow-up pages for everyone,
 * the statistics and what a lead tech can organise, the settings kept for the
 * administrators, and last the rare or sensitive pages (theme, data).
 */
const sections: NavSection[] = [
    {
        items: [
            { to: '/tableau', label: 'Tableau', icon: 'board' },
            { to: '/backlog', label: 'Backlog', icon: 'inbox' },
            { to: '/planning', label: 'Planning', icon: 'planning' },
            { to: '/tickets', label: 'Tous les tickets', icon: 'rows' },
        ],
    },
    {
        title: 'Pilotage',
        items: [{ to: '/admin/statistiques', label: 'Statistiques', icon: 'chart', permission: 'admin.statistics' }],
    },
    {
        title: 'Organisation',
        items: [
            { to: '/admin/projets', label: 'Projets', icon: 'briefcase', permission: 'admin.projects' },
            { to: '/admin/demandeurs', label: 'Demandeurs', icon: 'megaphone', permission: 'admin.requesters' },
            {
                to: '/admin/tickets-recurrents',
                label: 'Tickets récurrents',
                icon: 'repeat',
                permission: 'admin.recurring_tickets',
            },
        ],
    },
    {
        title: 'Paramétrage',
        items: [
            { to: '/admin/utilisateurs', label: 'Utilisateurs', icon: 'users', permission: 'admin.users' },
            { to: '/admin/epics', label: 'Types de ticket', icon: 'tag', permission: 'admin.epics' },
            { to: '/admin/champs', label: 'Champs personnalisés', icon: 'sliders', permission: 'admin.custom_fields' },
        ],
    },
    {
        title: 'Application',
        items: [
            { to: '/admin/theme', label: 'Thème', icon: 'palette', permission: 'admin.theme' },
            { to: '/admin/donnees', label: 'Gestion des données', icon: 'database', permission: 'admin.data' },
        ],
    },
];

/** Groups with at least one page the user may open. */
const visibleSections = computed(() =>
    sections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => !item.permission || auth.can(item.permission)),
        }))
        .filter((section) => section.items.length > 0),
);
const currentUser = computed(() => (auth.user ? reference.userMap.get(auth.user.id) : undefined));

async function logout(): Promise<void> {
    await auth.logout();
    reference.reset();
    await router.push({ name: 'login' });
}
</script>

<template>
    <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
        <div class="brand">
            <span class="logo" aria-hidden="true">S</span>
            <span class="brand-name">Synapse <span class="lite">Lite</span></span>
        </div>

        <button
            v-if="auth.can('tickets.create')"
            class="create"
            type="button"
            title="Créer un ticket (touche C)"
            @click="ui.openQuickCreate()"
        >
            <AppIcon name="plus" :stroke-width="2.5" />
            <span class="label">Créer un ticket</span>
            <kbd class="label">C</kbd>
        </button>

        <nav class="nav" aria-label="Navigation principale">
            <template v-for="section in visibleSections" :key="section.title ?? 'main'">
                <p v-if="section.title" class="nav-section">
                    <span class="label">{{ section.title }}</span>
                </p>
                <RouterLink
                    v-for="item in section.items"
                    :key="item.to"
                    :to="item.to"
                    class="nav-item"
                    :title="item.label"
                >
                    <AppIcon :name="item.icon" />
                    <span class="label">{{ item.label }}</span>
                </RouterLink>
            </template>
        </nav>

        <div class="footer">
            <RouterLink to="/profil" class="profile" title="Mon profil">
                <UserAvatar :user="currentUser" :size="30" />
                <span class="label who">
                    <strong>{{ auth.user?.full_name }}</strong>
                    <small>{{ auth.user?.role_label }}</small>
                </span>
            </RouterLink>
            <div class="footer-actions">
                <button class="icon-button" type="button" title="Se déconnecter" @click="logout">
                    <AppIcon name="logout" />
                </button>
                <button
                    class="icon-button"
                    type="button"
                    :title="ui.sidebarCollapsed ? 'Déplier le menu' : 'Replier le menu'"
                    @click="ui.toggleSidebar()"
                >
                    <AppIcon :name="ui.sidebarCollapsed ? 'chevron-right' : 'chevron-left'" />
                </button>
            </div>
        </div>
    </aside>
</template>

<style scoped>
.sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-4) var(--space-3);
    background: linear-gradient(180deg, var(--color-brand-800) 0%, var(--color-brand-950) 100%);
    color: var(--color-sidebar-text);
    overflow: hidden;
}

.brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0 var(--space-2) var(--space-2);
}

.logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 8px;
    background: #fff;
    color: var(--color-brand-700);
    font-weight: 700;
    font-size: 18px;
}

.brand-name {
    font-size: var(--font-size-xl);
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.01em;
    white-space: nowrap;
}

.brand-name .lite {
    font-weight: 600;
    opacity: 0.75;
}

.create {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 38px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: #fff;
    color: var(--color-brand-700);
    font-weight: 700;
    cursor: pointer;
    transition: background var(--transition-fast);
}

.create:hover {
    background: var(--color-brand-100);
}

.create kbd {
    margin-left: auto;
    padding: 0 6px;
    border: 1px solid var(--color-brand-300);
    border-radius: 4px;
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    color: var(--color-brand-600);
}

.nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    overflow-y: auto;
}

.nav-section {
    margin: var(--space-4) var(--space-2) var(--space-1);
    min-height: 1px;
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-brand-300);
}

.nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 38px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-sidebar-text);
    font-weight: 600;
    text-decoration: none;
    transition: background var(--transition-fast);
}

.nav-item:hover {
    background: rgb(255 255 255 / 8%);
    text-decoration: none;
}

.nav-item.router-link-active {
    background: rgb(255 255 255 / 15%);
    color: #fff;
    box-shadow: inset 3px 0 0 var(--color-brand-300);
}

.footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid rgb(255 255 255 / 12%);
}

.profile {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    color: inherit;
    text-decoration: none;
}

.profile:hover {
    background: rgb(255 255 255 / 8%);
    text-decoration: none;
}

.who {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.2;
}

.who strong {
    color: #fff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.who small {
    color: var(--color-brand-300);
}

.footer-actions {
    display: flex;
    justify-content: space-between;
}

.icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-sidebar-text);
    cursor: pointer;
}

.icon-button:hover {
    background: rgb(255 255 255 / 10%);
    color: #fff;
}

/* Collapsed menu: icons only; the headings become a thin separator. */
.collapsed .nav-section {
    margin: var(--space-2) var(--space-2);
    border-top: 1px solid rgb(255 255 255 / 15%);
}

.collapsed .label,
.collapsed .brand-name {
    display: none;
}

.collapsed .create,
.collapsed .nav-item,
.collapsed .profile {
    justify-content: center;
    padding: 0;
}

.collapsed .footer-actions {
    flex-direction: column;
    align-items: center;
}
</style>
