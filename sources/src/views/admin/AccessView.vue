<script setup lang="ts">
/**
 * Access rights ("Gestion des accès", administrators): the pages of the menu
 * each profile may open. Every change is saved at once in the data folder and
 * applies to the whole team; the administrators always keep this page.
 */
import { computed, onMounted, ref } from 'vue';
import { errorMessage } from '@/api/errors';
import { settingsApi } from '@/api/settings';
import { LOCKED_ACCESS, PAGES, ROLES, type AccessMatrix, type PageAccess } from '@/backend/access';
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

/** Pages by group of the menu. */
const groups = computed(() => {
    const result: { title: string; pages: PageAccess[] }[] = [];
    for (const page of PAGES) {
        const title = page.group || 'Suivi des tickets';
        const group = result.find((candidate) => candidate.title === title);
        if (group) group.pages.push(page);
        else result.push({ title, pages: [page] });
    }

    return result;
});

const isLocked = (role: RoleCode, page: PageAccess) => LOCKED_ACCESS[role]?.includes(page.permission) ?? false;
const isGranted = (role: RoleCode, page: PageAccess) => matrix.value?.[role].includes(page.permission) ?? false;
const countOf = (role: RoleCode) => matrix.value?.[role].length ?? 0;

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

function toggle(role: RoleCode, page: PageAccess): void {
    if (!matrix.value || saving.value || isLocked(role, page)) return;

    const granted = isGranted(role, page);
    const pages = granted
        ? matrix.value[role].filter((permission) => permission !== page.permission)
        : [...matrix.value[role], page.permission];

    void save(
        { ...matrix.value, [role]: pages },
        `${page.label} : ${granted ? 'retirée' : 'ouverte'} au profil ${ROLE_LABELS[role]}.`,
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
        <PageHeader title="Gestion des accès" subtitle="Pages du menu accessibles à chaque profil, pour toute l'équipe">
            <button class="btn btn-secondary" type="button" :disabled="saving || !matrix" @click="restoreDefaults">
                <AppIcon name="restore" :size="16" />
                Rétablir les droits par défaut
            </button>
        </PageHeader>

        <div class="page-content">
            <p class="muted intro">
                Cochez les pages que chaque profil peut ouvrir. Chaque changement est enregistré tout de suite et
                s'applique en quelques secondes. Une page retirée disparaît du menu et ne s'ouvre plus, même par un
                lien. Les actions sur les tickets (créer, modifier, déplacer, supprimer) restent celles du profil. Les
                administrateurs gardent toujours cette page, pour ne jamais bloquer l'application.
            </p>

            <div class="card access-card">
                <p v-if="!matrix" class="muted loading">Chargement…</p>
                <table v-else class="table access">
                    <thead>
                        <tr>
                            <th>Page</th>
                            <th v-for="role in ROLES" :key="role" class="role">
                                {{ ROLE_LABELS[role] }}
                                <small>{{ countOf(role) }} / {{ PAGES.length }}</small>
                            </th>
                        </tr>
                    </thead>
                    <tbody v-for="group in groups" :key="group.title">
                        <tr class="group">
                            <th :colspan="ROLES.length + 1">{{ group.title }}</th>
                        </tr>
                        <tr v-for="page in group.pages" :key="page.permission">
                            <td class="page-name">{{ page.label }}</td>
                            <td v-for="role in ROLES" :key="role" class="cell">
                                <input
                                    type="checkbox"
                                    :checked="isGranted(role, page)"
                                    :disabled="saving || isLocked(role, page)"
                                    :title="
                                        isLocked(role, page)
                                            ? 'Toujours accessible aux administrateurs'
                                            : `${page.label} pour le profil ${ROLE_LABELS[role]}`
                                    "
                                    :aria-label="`${page.label}, ${ROLE_LABELS[role]}`"
                                    @change="toggle(role, page)"
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
