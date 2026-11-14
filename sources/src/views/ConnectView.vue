<script setup lang="ts">
/**
 * Connection to the "data" folder, placed next to Synapse Lite.html.
 *
 * - first visit: the user picks the folder (browser folder picker);
 * - next visits: the browser only asks to confirm the access, unless the
 *   user chose "Autoriser à chaque visite" in Chrome;
 * - empty folder: the initial data (types, team accounts) can be created.
 */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { errorMessage } from '@/api/errors';
import AuthCard from '@/components/layout/AuthCard.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useConnectionStore } from '@/stores/connection';

const connection = useConnectionStore();
const router = useRouter();
const route = useRoute();
const message = ref('');

const status = computed(() => connection.status);

async function run(action: () => Promise<void>): Promise<void> {
    message.value = '';

    try {
        await action();

        if (connection.isConnected) {
            await router.replace({ name: 'login', query: route.query });
        }
    } catch (error) {
        message.value = errorMessage(error);
    }
}
</script>

<template>
    <AuthCard subtitle="Gestion des tickets de l'équipe">
        <div v-if="status === 'unsupported'" class="content">
            <p class="lead">Ce navigateur ne permet pas d'accéder au dossier de données.</p>
            <p class="muted">
                Ouvrez le fichier <strong>Synapse Lite.html</strong> avec Google Chrome ou Microsoft Edge.
            </p>
        </div>

        <div v-else-if="status === 'permission'" class="content">
            <p class="lead">
                Autorisez l'accès au dossier <strong>« {{ connection.folderName }} »</strong> pour ouvrir Synapse Lite.
            </p>
            <p class="muted">
                Dans la fenêtre du navigateur, choisissez « Autoriser à chaque visite » pour ne plus avoir à le faire.
            </p>
            <button
                class="btn btn-primary action"
                type="button"
                :disabled="connection.busy"
                @click="run(connection.allow)"
            >
                <AppIcon name="check" :size="16" />
                Autoriser l'accès
            </button>
            <button
                class="btn btn-ghost btn-sm"
                type="button"
                :disabled="connection.busy"
                @click="run(connection.choose)"
            >
                Choisir un autre dossier
            </button>
        </div>

        <div v-else-if="status === 'empty-folder'" class="content">
            <p class="lead">
                Le dossier <strong>« {{ connection.folderName }} »</strong> est vide.
            </p>
            <p class="muted">
                Synapse Lite peut y créer ses données de départ : un compte administrateur de matricule « admin ».
            </p>
            <button
                class="btn btn-primary action"
                type="button"
                :disabled="connection.busy"
                @click="run(connection.initialize)"
            >
                Initialiser ce dossier
            </button>
            <button
                class="btn btn-ghost btn-sm"
                type="button"
                :disabled="connection.busy"
                @click="run(connection.choose)"
            >
                Choisir un autre dossier
            </button>
        </div>

        <div v-else class="content">
            <p class="lead">Sélectionnez le dossier <strong>data</strong> de Synapse Lite.</p>
            <p class="muted">
                Il se trouve à côté du fichier <strong>Synapse Lite.html</strong>. Ce choix n'est demandé qu'une fois
                sur ce poste.
            </p>
            <button
                class="btn btn-primary action"
                type="button"
                :disabled="connection.busy"
                @click="run(connection.choose)"
            >
                <AppIcon name="folder" :size="16" />
                Choisir le dossier data
            </button>
        </div>

        <p v-if="message" class="field-error">{{ message }}</p>
        <p v-if="connection.busy" class="muted loading">Chargement des données…</p>
    </AuthCard>
</template>

<style scoped>
.content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.lead {
    font-size: var(--font-size-lg);
    color: var(--color-text);
}

.action {
    height: 42px;
    margin-top: var(--space-2);
    font-size: var(--font-size-lg);
    justify-content: center;
}

.loading {
    text-align: center;
}
</style>
