<script setup lang="ts">
/**
 * Custom fields ("variables") of the tickets: date, short text or complex
 * text (Markdown), global or restricted to one epic.
 */
import { adminApi } from '@/api/admin';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import { useAdminResource } from '@/composables/useAdminResource';
import { useReferenceStore } from '@/stores/reference';
import type { CustomField, CustomFieldType } from '@/types/models';

interface FieldForm {
    code: string;
    label: string;
    field_type?: CustomFieldType;
    epic_id: number | null;
    help_text: string | null;
    is_required: boolean;
    is_active: boolean;
    position: number;
}

const reference = useReferenceStore();

const empty = (): FieldForm => ({
    code: '',
    label: '',
    field_type: 'short_text',
    epic_id: null,
    help_text: null,
    is_required: false,
    is_active: true,
    position: 0,
});

const { items, loading, dialogOpen, editing, form, errors, saving, openCreate, openEdit, submit, remove } =
    useAdminResource<CustomField, FieldForm>(adminApi.customFields, empty);

function edit(field: CustomField): void {
    openEdit(field, (f) => ({
        code: f.code,
        label: f.label,
        field_type: f.field_type,
        epic_id: f.epic_id,
        help_text: f.help_text,
        is_required: f.is_required,
        is_active: f.is_active,
        position: f.position,
    }));
}

function save(): void {
    const payload: FieldForm = { ...form.value, help_text: form.value.help_text || null };
    // The type cannot be changed once the field exists.
    if (editing.value) delete payload.field_type;
    void submit(payload);
}
</script>

<template>
    <div class="page">
        <PageHeader title="Champs personnalisés" subtitle="Variables complémentaires saisies dans les tickets">
            <button class="btn btn-primary" type="button" @click="openCreate">
                <AppIcon name="plus" :size="16" />
                Nouveau champ
            </button>
        </PageHeader>

        <div class="page-content">
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Ordre</th>
                            <th>Libellé</th>
                            <th>Identifiant</th>
                            <th>Type</th>
                            <th>Portée</th>
                            <th>État</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="7" class="muted">Chargement…</td>
                        </tr>
                        <tr v-else-if="items.length === 0">
                            <td colspan="7" class="muted">Aucun champ personnalisé pour le moment.</td>
                        </tr>
                        <tr v-for="field in items" :key="field.id">
                            <td>{{ field.position }}</td>
                            <td>
                                <strong>{{ field.label }}</strong>
                                <span v-if="field.is_required" class="badge">Obligatoire</span>
                            </td>
                            <td class="mono">{{ field.code }}</td>
                            <td>{{ field.field_type_label }}</td>
                            <td>
                                {{ field.epic_id ? reference.epicMap.get(field.epic_id)?.title : 'Tous les tickets' }}
                            </td>
                            <td>
                                <span :class="['badge', field.is_active ? 'badge-success' : 'badge-muted']">
                                    {{ field.is_active ? 'Actif' : 'Inactif' }}
                                </span>
                            </td>
                            <td class="actions">
                                <button class="btn btn-ghost btn-sm" type="button" @click="edit(field)">
                                    <AppIcon name="edit" :size="14" />
                                    Modifier
                                </button>
                                <button
                                    class="btn btn-ghost btn-sm"
                                    type="button"
                                    title="Supprimer"
                                    @click="remove(field, field.label)"
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
            :title="editing ? `Modifier ${editing.label}` : 'Nouveau champ'"
            @close="dialogOpen = false"
        >
            <form class="form-grid" novalidate @submit.prevent="save">
                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="f-label">Libellé<span class="required">*</span></label>
                        <input
                            id="f-label"
                            v-model="form.label"
                            class="input"
                            maxlength="150"
                            :class="{ 'has-error': errors.label }"
                        />
                        <span v-if="errors.label" class="field-error">{{ errors.label }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label" for="f-code">Identifiant<span class="required">*</span></label>
                        <input
                            id="f-code"
                            v-model="form.code"
                            class="input mono"
                            maxlength="50"
                            :class="{ 'has-error': errors.code }"
                        />
                        <span class="field-help">Minuscules, chiffres et « _ » (ex. date_comite)</span>
                        <span v-if="errors.code" class="field-error">{{ errors.code }}</span>
                    </div>
                </div>
                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="f-type">Type<span class="required">*</span></label>
                        <select id="f-type" v-model="form.field_type" class="select" :disabled="!!editing">
                            <option v-for="type in reference.customFieldTypes" :key="type.value" :value="type.value">
                                {{ type.label }}
                            </option>
                        </select>
                        <span v-if="editing" class="field-help">Le type ne peut plus être modifié.</span>
                    </div>
                    <div class="field">
                        <label class="field-label" for="f-epic">Portée</label>
                        <select id="f-epic" v-model="form.epic_id" class="select">
                            <option :value="null">Tous les tickets</option>
                            <option v-for="epic in reference.epics" :key="epic.id" :value="epic.id">
                                Type « {{ epic.title }} »
                            </option>
                        </select>
                    </div>
                    <div class="field">
                        <label class="field-label" for="f-position">Ordre d'affichage</label>
                        <input id="f-position" v-model.number="form.position" type="number" min="0" class="input" />
                    </div>
                </div>
                <div class="field">
                    <label class="field-label" for="f-help">Texte d'aide</label>
                    <input id="f-help" v-model="form.help_text" class="input" maxlength="255" />
                </div>
                <div class="checks">
                    <label class="checkbox">
                        <input v-model="form.is_required" type="checkbox" />
                        Obligatoire
                    </label>
                    <label class="checkbox">
                        <input v-model="form.is_active" type="checkbox" />
                        Actif
                    </label>
                </div>
            </form>
            <template #footer>
                <button class="btn btn-secondary" type="button" @click="dialogOpen = false">Annuler</button>
                <button class="btn btn-primary" type="button" :disabled="saving" @click="save">Enregistrer</button>
            </template>
        </BaseModal>
    </div>
</template>

<style scoped>
.checks {
    display: flex;
    gap: var(--space-5);
}

td .badge {
    margin-left: var(--space-2);
}
</style>
