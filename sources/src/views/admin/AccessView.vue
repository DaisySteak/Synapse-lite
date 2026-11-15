<script setup lang="ts">
/**
 * Access rights ("Gestion des accès", administrators): the pages of the menu
 * each profile may open, and the features of these pages (sub-rows). Every change is saved at once in the data folder and
 * applies to the whole team; the administrators always keep this page.
 */
import { computed, onMounted, ref } from 'vue';
import { errorMessage } from '@/api/errors';
import { settingsApi } from '@/api/settings';
import {
    ACCESS_ITEMS,
    FEATURES,
    LOCKED_ACCESS,
    PAGES,
    ROLES,
    type AccessMatrix,
    type PagePermission,
} from '@/backend/access';
import { ROLE_LABELS } from '@/backend/permissions';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import type { RoleCode } from '@/types/models';

const auth = useAuthStore();
const ui = useUiStore();

const matrix = ref<AccessMatrix | null>(null);
const saving = ref(false);

/** Row of the table: a page, or a feature of the page above it. */
interface AccessRow {
    permission: PagePermission;
    label: string;
    /** Page of a feature (sub-row), granted first. */
    page?: PagePermission;
}

/** Pages by group of the menu, each followed by its features. */
const groups = computed(() => {
    const result: { title: string; rows: AccessRow[] }[] = [];
    for (const page of PAGES) {
        const title = page.group || 'Suivi des tickets';
        const rows: AccessRow[] = [
            { permission: page.permission, label: page.label },
            ...FEATURES.filter((feature) => feature.page === page.permission),
        ];
        const group = result.find((candidate) => candidate.title === title);
        if (group) group.rows.push(...rows);
        else result.push({ title, rows });
    }

    return result;
});

const isLocked = (role: RoleCode, row: AccessRow) => LOCKED_ACCESS[role]?.includes(row.permission) ?? false;
const has = (role: RoleCode, permission: PagePermission) => matrix.value?.[role].includes(permission) ?? false;
const isGranted = (role: RoleCode, row: AccessRow) => has(role, row.permission);
/** A feature is only offered when its page is open to the profile. */
const isDisabled = (role: RoleCode, row: AccessRow) =>
    saving.value || isLocked(role, row) || (row.page !== undefined && !has(role, row.page));
const countOf = (role: RoleCode) => matrix.value?.[role].length ?? 0;

function titleOf(role: RoleCode, row: AccessRow): string {
    if (isLocked(role, row)) return 'Toujours accessible aux administrateurs';
    if (row.page && !has(role, row.page)) return 'Ouvrez d’abord la page à ce profil';

    return `${row.label} pour le profil ${ROLE_LABELS[role]}`;
}

async function save(next: AccessMatrix, message: string): Promise<void> {
    saving.value = true;
    try {
        matrix.value = await settingsApi.setAccess(next);
        // The menu of the administrator follows at once; the others within seconds.
        await auth.refresh();
        ui.notify(message);
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        saving.value = false;
    }
}

function toggle(role: RoleCode, row: AccessRow): void {
    if (!matrix.value || isDisabled(role, row)) return;

    const granted = isGranted(role, row);
    // Closing a page also takes back its features.
    const removed = new Set<PagePermission>([
        row.permission,
        ...FEATURES.filter((feature) => feature.page === row.permission).map((feature) => feature.permission),
    ]);
    const rights = granted
        ? matrix.value[role].filter((permission) => !removed.has(permission))
        : [...matrix.value[role], row.permission];

    void save(
        { ...matrix.value, [role]: rights },
        `${row.label} : ${granted ? 'retiré' : 'accordé'} au profil ${ROLE_LABELS[role]}.`,
    );
}

async function restoreDefaults(): Promise<void> {
    if (saving.value) return;
    saving.value = true;
    try {
        matrix.value = await settingsApi.resetAccess();
        await auth.refresh();
        ui.notify('Droits par défaut rétablis.');
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        saving.value = false;
    }
}

onMounted(async () => {
    try {
        matrix.value = await settingsApi.access();
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    }
});
</script>

<template>
    <div class="page">
        <PageHeader
            title="Gestion des accès"
            subtitle="Pages du menu et fonctionnalités accessibles à chaque profil, pour toute l'équipe"
        >
            <button class="btn btn-secondary" type="button" :disabled="saving || !matrix" @click="restoreDefaults">
                <AppIcon name="restore" :size="16" />
                Rétablir les droits par défaut
            </button>
        </PageHeader>

        <div class="page-content">
            <p class="muted intro">
                Cochez les pages que chaque profil peut ouvrir et, en retrait sous leur page, les fonctionnalités qui
                lui sont permises. Chaque changement est enregistré tout de suite et s'applique en quelques secondes.
                Une page retirée disparaît du menu et ne s'ouvre plus, même par un lien. Les actions sur les tickets
                (créer, modifier, déplacer, supprimer) restent celles du profil. Les administrateurs gardent toujours
                cette page, pour ne jamais bloquer l'application.
            </p>

            <div class="card access-card">
                <p v-if="!matrix" class="muted loading">Chargement…</p>
                <table v-else class="table access">
                    <thead>
                        <tr>
                            <th>Page</th>
                            <th v-for="role in ROLES" :key="role" class="role">
                                {{ ROLE_LABELS[role] }}
                                <small>{{ countOf(role) }} / {{ ACCESS_ITEMS.length }}</small>
                            </th>
                        </tr>
                    </thead>
                    <tbody v-for="group in groups" :key="group.title">
                        <tr class="group">
                            <th :colspan="ROLES.length + 1">{{ group.title }}</th>
                        </tr>
                        <tr v-for="row in group.rows" :key="row.permission" :class="{ feature: row.page }">
                            <td class="page-name">
                                <AppIcon v-if="row.page" name="chevron-right" :size="13" class="sub-icon" />
                                {{ row.label }}
                            </td>
                            <td v-for="role in ROLES" :key="role" class="cell">
                                <input
                                    type="checkbox"
                                    :checked="isGranted(role, row)"
                                    :disabled="isDisabled(role, row)"
                                    :title="titleOf(role, row)"
                                    :aria-label="`${row.label}, ${ROLE_LABELS[role]}`"
                                    @change="toggle(role, row)"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<style scoped>
.intro {
    max-width: 880px;
    margin: 0 0 var(--space-5);
}

.loading {
    padding: var(--space-5);
}

.access-card {
    max-width: 820px;
}

.access .role,
.access .cell {
    width: 150px;
    text-align: center;
}

.role small {
    display: block;
    color: var(--color-text-subtle);
    font-weight: 600;
}

.group th {
    padding-top: var(--space-4);
    background: var(--color-surface-alt);
    color: var(--color-brand-700);
    font-size: var(--font-size-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.page-name {
    font-weight: 600;
}

.feature .page-name {
    padding-left: var(--space-6, 32px);
    color: var(--color-text-muted);
    font-weight: 500;
}

.sub-icon {
    margin-right: 2px;
    vertical-align: -2px;
}

.cell input {
    width: 18px;
    height: 18px;
    accent-color: var(--color-brand-600);
    cursor: pointer;
}

.cell input:disabled {
    cursor: not-allowed;
}
</style>
