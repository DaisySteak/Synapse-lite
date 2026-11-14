<script setup lang="ts">
/**
 * Authenticated layout: vertical menu on the left, page on the right, quick
 * ticket creation available everywhere (button or "C" key), synchronisation
 * with the data folder.
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppSidebar from '@/components/layout/AppSidebar.vue';
import QuickCreateModal from '@/components/tickets/QuickCreateModal.vue';
import TimeSpentModal from '@/components/tickets/TimeSpentModal.vue';
import { errorMessage } from '@/api/errors';
import { useDataSync } from '@/composables/useDataSync';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import { homeRoute } from '@/router';
import { applyTheme } from '@/utils/themes';

const reference = useReferenceStore();
const ui = useUiStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

useDataSync();

function isTyping(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;

    return !!element && (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable);
}

function onKeydown(event: KeyboardEvent): void {
    if (
        event.key.toLowerCase() === 'c' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isTyping(event.target)
    ) {
        if (auth.can('tickets.create') && !ui.quickCreateOpen) {
            event.preventDefault();
            ui.openQuickCreate();
        }
    }
}

onMounted(async () => {
    document.addEventListener('keydown', onKeydown);

    try {
        await reference.load();
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    }
});

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

// Theme chosen by an administrator for the team, applied again when it changes.
watch(
    () => reference.data?.settings.theme,
    (theme) => {
        if (theme) applyTheme(theme);
    },
    { immediate: true },
);

// Page closed to the profile by an administrator while it is open: leave it.
watch(
    () => auth.user?.permissions,
    () => {
        const permission = route.meta.permission;
        if (auth.user && permission && !auth.can(permission)) void router.replace(homeRoute());
    },
);
</script>

<template>
    <div class="layout" :class="{ collapsed: ui.sidebarCollapsed }">
        <AppSidebar />
        <main class="main">
            <RouterView v-if="reference.data" />
            <div v-else class="loading">Chargement…</div>
        </main>
        <QuickCreateModal v-if="reference.data" />
        <TimeSpentModal v-if="reference.data" />
    </div>
</template>

<style scoped>
.layout {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    height: 100%;
    transition: grid-template-columns var(--transition);
}

.layout.collapsed {
    grid-template-columns: var(--sidebar-width-collapsed) 1fr;
}

.main {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.loading {
    padding: var(--space-8);
    color: var(--color-text-muted);
}
</style>
