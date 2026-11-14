<script setup lang="ts">
/**
 * Projects: group tickets of any type (e.g. "Travaux de début d'année").
 * Managed by the administrators and the lead techs.
 */
import { adminApi } from '@/api/admin';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import ColorBadge from '@/components/ui/ColorBadge.vue';
import ColorInput from '@/components/ui/ColorInput.vue';
import { useAdminResource } from '@/composables/useAdminResource';
import type { Project } from '@/types/models';

type ProjectForm = Pick<Project, 'name' | 'description' | 'color' | 'is_active'>;

const empty = (): ProjectForm => ({ name: '', description: '', color: '#007A6E', is_active: true });

const { items, loading, dialogOpen, editing, form, errors, saving, openCreate, openEdit, submit, remove } =
    useAdminResource<Project, ProjectForm>(adminApi.projects, empty);

function edit(project: Project): void {
    openEdit(project, (p) => ({
        name: p.name,
        description: p.description ?? '',
        color: p.color,
        is_active: p.is_active,
    }));
}
</script>

<template>
    <div class="page">
        <PageHeader title="Projets" subtitle="Regroupent des tickets de tous types autour d'un même objectif">
            <button class="btn btn-primary" type="button" @click="openCreate">
                <AppIcon name="plus" :size="16" />
                Nouveau projet
            </button>
        </PageHeader>

        <div class="page-content">
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Projet</th>
                            <th>Description</th>
                            <th>Tickets</th>
                            <th>État</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="5" class="muted">Chargement…</td>
                        </tr>
                        <tr v-else-if="items.length === 0">
                            <td colspan="5" class="muted">Aucun projet pour le moment.</td>
                        </tr>
                        <tr v-for="project in items" :key="project.id">
                            <td><ColorBadge :color="project.color" :label="project.name" /></td>
                            <td class="muted">{{ project.description }}</td>
                            <td>
                                <RouterLink :to="{ name: 'tickets', query: { projet: project.id } }">
                                    {{ project.tickets_count ?? 0 }}
                                </RouterLink>
                            </td>
                            <td>
                                <span :class="['badge', project.is_active ? 'badge-success' : 'badge-muted']">
                                    {{ project.is_active ? 'Actif' : 'Inactif' }}
                                </span>
                            </td>
                            <td class="actions">
                                <button class="btn btn-ghost btn-sm" type="button" @click="edit(project)">
                                    <AppIcon name="edit" :size="14" />
                                    Modifier
                                </button>
                                <button
                                    v-if="!project.tickets_count"
                                    class="btn btn-ghost btn-sm"
                                    type="button"
                                    title="Supprimer"
                                    @click="remove(project, project.name)"
                                >
                                    <AppIcon name="trash" :size="14" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <BaseModal
            :open="dialogOpen"
            :title="editing ? `Modifier ${editing.name}` : 'Nouveau projet'"
            width="520px"
            @close="dialogOpen = false"
        >
            <form class="form-grid" novalidate @submit.prevent="submit()">
                <div class="field">
                    <label class="field-label" for="p-name">Nom<span class="required">*</span></label>
                    <input
                        id="p-name"
                        v-model="form.name"
                        class="input"
                        maxlength="150"
                        placeholder="Ex. : Travaux de début d'année"
                        :class="{ 'has-error': errors.name }"
                    />
                    <span v-if="errors.name" class="field-error">{{ errors.name }}</span>
                </div>
                <div class="field">
                    <label class="field-label" for="p-description">Description</label>
                    <textarea
                        id="p-description"
                        v-model="form.description"
                        class="input"
                        rows="3"
                        maxlength="500"
                        :class="{ 'has-error': errors.description }"
                    />
                    <span v-if="errors.description" class="field-error">{{ errors.description }}</span>
                </div>
                <div class="field">
                    <span class="field-label">Couleur</span>
                    <ColorInput v-model="form.color" />
                    <span v-if="errors.color" class="field-error">{{ errors.color }}</span>
                </div>
                <label class="checkbox">
                    <input v-model="form.is_active" type="checkbox" />
                    Proposé à la création de tickets
                </label>
            </form>
            <template #footer>
                <button class="btn btn-secondary" type="button" @click="dialogOpen = false">Annuler</button>
                <button class="btn btn-primary" type="button" :disabled="saving" @click="submit()">Enregistrer</button>
            </template>
        </BaseModal>
    </div>
</template>
