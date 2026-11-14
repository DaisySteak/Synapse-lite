<script setup lang="ts">
/**
 * Ticket types (epics): identifier, title and color. The identifier is the
 * prefix of the ticket references (ETUDE-12).
 */
import { adminApi } from '@/api/admin';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import ColorInput from '@/components/ui/ColorInput.vue';
import { useAdminResource } from '@/composables/useAdminResource';
import type { Epic } from '@/types/models';

type EpicForm = Pick<Epic, 'code' | 'title' | 'color' | 'is_active'>;

const empty = (): EpicForm => ({ code: '', title: '', color: '#007A6E', is_active: true });

const { items, loading, dialogOpen, editing, form, errors, saving, openCreate, openEdit, submit, remove } =
    useAdminResource<Epic, EpicForm>(adminApi.epics, empty);

function edit(epic: Epic): void {
    openEdit(epic, (e) => ({ code: e.code, title: e.title, color: e.color, is_active: e.is_active }));
}
</script>

<template>
    <div class="page">
        <PageHeader title="Types de ticket" subtitle="L'identifiant sert de préfixe aux tickets (ex. ETUDE-12)">
            <button class="btn btn-primary" type="button" @click="openCreate">
                <AppIcon name="plus" :size="16" />
                Nouveau type
            </button>
        </PageHeader>

        <div class="page-content">
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Identifiant</th>
                            <th>Titre</th>
                            <th>Tickets</th>
                            <th>État</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="5" class="muted">Chargement…</td>
                        </tr>
                        <tr v-for="epic in items" :key="epic.id">
                            <td>
                                <span class="code"
                                    ><span class="swatch" :style="{ background: epic.color }" />{{ epic.code }}</span
                                >
                            </td>
                            <td>{{ epic.title }}</td>
                            <td>{{ epic.tickets_count ?? 0 }}</td>
                            <td>
                                <span :class="['badge', epic.is_active ? 'badge-success' : 'badge-muted']">
                                    {{ epic.is_active ? 'Actif' : 'Inactif' }}
                                </span>
                            </td>
                            <td class="actions">
                                <button class="btn btn-ghost btn-sm" type="button" @click="edit(epic)">
                                    <AppIcon name="edit" :size="14" />
                                    Modifier
                                </button>
                                <button
                                    v-if="!epic.tickets_count"
                                    class="btn btn-ghost btn-sm"
                                    type="button"
                                    title="Supprimer"
                                    @click="remove(epic, epic.title)"
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
            :title="editing ? `Modifier ${editing.title}` : 'Nouveau type'"
            @close="dialogOpen = false"
        >
            <form class="form-grid" novalidate @submit.prevent="submit()">
                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="e-code">Identifiant<span class="required">*</span></label>
                        <input
                            id="e-code"
                            v-model="form.code"
                            class="input mono"
                            maxlength="20"
                            :class="{ 'has-error': errors.code }"
                        />
                        <span class="field-help">
                            Majuscules sans accent, chiffres et « _ » (ex. ETUDE). Préfixe des tickets : ETUDE-12. Le
                            modifier renomme les références existantes.
                        </span>
                        <span v-if="errors.code" class="field-error">{{ errors.code }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label" for="e-title">Titre<span class="required">*</span></label>
                        <input
                            id="e-title"
                            v-model="form.title"
                            class="input"
                            maxlength="150"
                            :class="{ 'has-error': errors.title }"
                        />
                        <span v-if="errors.title" class="field-error">{{ errors.title }}</span>
                    </div>
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

<style scoped>
.code {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-mono);
    font-weight: 600;
}

.swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
}
</style>
