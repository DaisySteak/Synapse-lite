<script setup lang="ts">
/**
 * Sign-in with the employee number (matricule) only: access to the data
 * folder is the real protection, the number tells who is working.
 */
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { errorMessage, fieldErrors } from '@/api/errors';
import AuthCard from '@/components/layout/AuthCard.vue';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';

const auth = useAuthStore();
const connection = useConnectionStore();
const router = useRouter();
const route = useRoute();

// Unknown Windows account given by the launcher: pre-filled, with the reason.
const launchLogin = typeof route.query.matricule === 'string' ? route.query.matricule : '';
const launchError = typeof route.query.erreur === 'string' ? route.query.erreur : '';

const form = reactive({ login: launchLogin, remember: true });
const errors = ref<Record<string, string>>(launchError ? { login: launchError } : {});
const message = ref('');
const submitting = ref(false);

async function submit(): Promise<void> {
    submitting.value = true;
    errors.value = {};
    message.value = '';

    try {
        await auth.login(form.login, form.remember);
        const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/tableau';
        await router.replace(redirect);
    } catch (error) {
        errors.value = fieldErrors(error);
        if (Object.keys(errors.value).length === 0) message.value = errorMessage(error);
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <AuthCard subtitle="Gestion des tickets de l'équipe">
        <form class="form-grid" novalidate @submit.prevent="submit">
            <div class="field">
                <label class="field-label" for="login">Matricule</label>
                <input
                    id="login"
                    v-model="form.login"
                    class="input input-lg mono"
                    :class="{ 'has-error': errors.login }"
                    placeholder="login"
                    maxlength="32"
                    autocomplete="username"
                    spellcheck="false"
                    autofocus
                />
                <span v-if="errors.login" class="field-error">{{ errors.login }}</span>
            </div>
            <label class="checkbox">
                <input v-model="form.remember" type="checkbox" />
                Rester connecté sur ce navigateur
            </label>
            <p v-if="message" class="field-error">{{ message }}</p>
            <button class="btn btn-primary submit" type="submit" :disabled="submitting">Se connecter</button>
        </form>
        <p class="help">
            Données : dossier « {{ connection.folderName }} ». Matricule inconnu ? Contactez l'administrateur de
            l'application.
        </p>
    </AuthCard>
</template>

<style scoped>
.submit {
    height: 42px;
    font-size: var(--font-size-lg);
}

.mono {
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.help {
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
    text-align: center;
}
</style>
