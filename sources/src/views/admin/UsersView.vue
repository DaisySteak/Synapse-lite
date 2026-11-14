<script setup lang="ts">
/**
 * Users of Synapse Lite: employee number (used to sign in), names and
 * profile. Users are never deleted (they own tickets and history): they are
 * deactivated instead.
 */
import { computed } from 'vue';
import { adminApi, type UserPayload } from '@/api/admin';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useAdminResource } from '@/composables/useAdminResource';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import type { User } from '@/types/models';
import { formatDateTime } from '@/utils/dates';

const auth = useAuthStore();
const reference = useReferenceStore();

const empty = (): UserPayload => ({
    login: '',
    first_name: '',
    last_name: '',
    email: null,
    role: 'user',
    is_active: true,
});

const { items, loading, dialogOpen, editing, form, errors, saving, openCreate, openEdit, submit } = useAdminResource<
    User,
    UserPayload
>(adminApi.users, empty);

const isSelf = computed(() => editing.value?.id === auth.user?.id);

function edit(user: User): void {
    openEdit(user, (u) => ({
        login: u.login,
        first_name: u.first_name,
        last_name: u.last_name ?? '',
        email: u.email,
        role: u.role,
        is_active: u.is_active,
    }));
}

function save(): void {
    const payload: UserPayload = {
        ...form.value,
        last_name: form.value.last_name?.trim() || null,
        email: form.value.email || null,
    };
    void submit(payload);
}
</script>

<template>
    <div class="page">
        <PageHeader title="Utilisateurs" subtitle="Matricules autorisés et profils d'accès">
            <button class="btn btn-primary" type="button" @click="openCreate">
                <AppIcon name="plus" :size="16" />
                Nouvel utilisateur
            </button>
        </PageHeader>

        <div class="page-content">
            <div class="card">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Utilisateur</th>
                            <th>Matricule</th>
                            <th>Profil</th>
                            <th>Dernière connexion</th>
                            <th>État</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="loading">
                            <td colspan="6" class="muted">Chargement…</td>
                        </tr>
                        <tr v-for="user in items" :key="user.id">
                            <td>
                                <span class="who">
                                    <UserAvatar :user="user" :size="28" />
                                    <span>
                                        <strong>{{ user.full_name }}</strong>
                                        <small v-if="user.email" class="muted">{{ user.email }}</small>
                                    </span>
                                </span>
                            </td>
                            <td class="mono">{{ user.login }}</td>
                            <td>{{ user.role_label }}</td>
                            <td class="muted">{{ formatDateTime(user.last_login_at) }}</td>
                            <td>
                                <span v-if="!user.is_active" class="badge badge-muted">Désactivé</span>
                                <span v-else class="badge badge-success">Actif</span>
                            </td>
                            <td class="actions">
                                <button class="btn btn-ghost btn-sm" type="button" @click="edit(user)">
                                    <AppIcon name="edit" :size="14" />
                                    Modifier
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <BaseModal
            :open="dialogOpen"
            :title="editing ? `Modifier ${editing.full_name}` : 'Nouvel utilisateur'"
            @close="dialogOpen = false"
        >
            <form class="form-grid" novalidate @submit.prevent="save">
                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="u-first">Prénom<span class="required">*</span></label>
                        <input
                            id="u-first"
                            v-model="form.first_name"
                            class="input"
                            :class="{ 'has-error': errors.first_name }"
                        />
                        <span v-if="errors.first_name" class="field-error">{{ errors.first_name }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label" for="u-last">Nom</label>
                        <input
                            id="u-last"
                            v-model="form.last_name"
                            class="input"
                            :class="{ 'has-error': errors.last_name }"
                        />
                        <span v-if="errors.last_name" class="field-error">{{ errors.last_name }}</span>
                    </div>
                </div>
                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="u-login">Matricule<span class="required">*</span></label>
                        <input
                            id="u-login"
                            v-model="form.login"
                            class="input mono"
                            :class="{ 'has-error': errors.login }"
                            placeholder="login"
                            maxlength="32"
                            autocomplete="off"
                            spellcheck="false"
                        />
                        <span class="field-help">
                            Sert à se connecter : matricule ou identifiant Windows, utilisé par le lanceur pour la
                            connexion automatique.
                        </span>
                        <span v-if="errors.login" class="field-error">{{ errors.login }}</span>
                    </div>
                    <div class="field">
                        <label class="field-label" for="u-email">E-mail</label>
                        <input
                            id="u-email"
                            v-model="form.email"
                            type="email"
                            class="input"
                            :class="{ 'has-error': errors.email }"
                        />
                        <span v-if="errors.email" class="field-error">{{ errors.email }}</span>
                    </div>
                </div>
                <div class="form-row">
                    <div class="field">
                        <label class="field-label" for="u-role">Profil<span class="required">*</span></label>
                        <select id="u-role" v-model="form.role" class="select" :disabled="isSelf">
                            <option v-for="role in reference.roles" :key="role.value" :value="role.value">
                                {{ role.label }}
                            </option>
                        </select>
                        <span v-if="errors.role" class="field-error">{{ errors.role }}</span>
                    </div>
                    <div class="field" />
                </div>
                <label class="checkbox">
                    <input v-model="form.is_active" type="checkbox" :disabled="isSelf" />
                    Compte actif
                </label>
            </form>
            <template #footer>
                <button class="btn btn-secondary" type="button" @click="dialogOpen = false">Annuler</button>
                <button class="btn btn-primary" type="button" :disabled="saving" @click="save">Enregistrer</button>
            </template>
        </BaseModal>
    </div>
</template>

<style scoped>
.who {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
}

.who > span {
    display: flex;
    flex-direction: column;
}
</style>
