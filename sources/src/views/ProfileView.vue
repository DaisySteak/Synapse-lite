<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useAuthStore } from '@/stores/auth';
import { useConnectionStore } from '@/stores/connection';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const connection = useConnectionStore();
const reference = useReferenceStore();
const ui = useUiStore();
const router = useRouter();
const summary = computed(() => (auth.user ? reference.userMap.get(auth.user.id) : undefined));

/** Use another data folder on this computer (the current one is left untouched). */
async function changeFolder(): Promise<void> {
    const confirmed = await ui.confirm({
        title: 'Changer de dossier de données',
        message: 'Synapse Lite oubliera le dossier actuel sur ce navigateur. Ses données ne sont pas modifiées.',
        confirmLabel: 'Changer de dossier',
    });
    if (!confirmed) return;

    await connection.forget();
    auth.reset();
    reference.reset();
    await router.push({ name: 'connect' });
}

const PERMISSION_LABELS: Record<string, string> = {
    'tickets.create': 'Créer des tickets',
    'tickets.update_any': 'Modifier et réaffecter tous les tickets',
    'tickets.update_own': 'Modifier ses tickets (propriétaire ou contributeur)',
    'tickets.delete': 'Supprimer des tickets',
    'tickets.purge': 'Voir les tickets supprimés, les restaurer et les supprimer définitivement',
    'admin.data': 'Gérer les données : purge, modifications de masse, sauvegarde, restauration, remise à zéro',
    'admin.theme': 'Choisir le thème de couleur de l’application pour toute l’équipe',
    'admin.statistics': 'Consulter les statistiques de l’équipe, des tickets et des demandeurs',
    'backlog.manage': 'Préparer le backlog',
    'comments.moderate': 'Modérer les commentaires et pièces jointes',
    'admin.users': 'Gérer les utilisateurs',
    'admin.epics': 'Gérer les epics',
    'admin.requesters': 'Gérer les demandeurs',
    'admin.custom_fields': 'Gérer les champs personnalisés',
    'admin.projects': 'Gérer les projets',
    'admin.recurring_tickets': 'Gérer les tickets récurrents',
};
</script>

<template>
    <div class="page">
        <PageHeader title="Mon profil" />
        <div class="page-content">
            <div class="card card-body profile">
                <UserAvatar :user="summary" :size="56" />
                <div>
                    <h2>{{ auth.user?.full_name }}</h2>
                    <p class="muted">{{ auth.user?.login }} · {{ auth.user?.role_label }}</p>
                </div>
            </div>
            <div class="card card-body folder">
                <AppIcon name="folder" :size="20" class="folder-icon" />
                <div>
                    <h3 class="section-title">Dossier de données</h3>
                    <p class="muted">« {{ connection.folderName }} », partagé par toute l'équipe.</p>
                </div>
                <button class="btn btn-secondary" type="button" @click="changeFolder">Changer de dossier</button>
            </div>
            <div class="card card-body rights">
                <h3 class="section-title">Mes droits</h3>
                <ul>
                    <li v-for="permission in auth.user?.permissions" :key="permission">
                        {{ PERMISSION_LABELS[permission] ?? permission }}
                    </li>
                </ul>
            </div>
        </div>
    </div>
</template>

<style scoped>
.profile {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    max-width: 720px;
}

.profile > div {
    flex: 1;
}

.folder {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    max-width: 720px;
    margin-top: var(--space-4);
}

.folder > div {
    flex: 1;
}

.folder-icon {
    color: var(--color-brand-600);
}

.rights {
    max-width: 720px;
    margin-top: var(--space-4);
}

.rights ul {
    margin: var(--space-3) 0 0;
    padding-left: 1.2em;
    line-height: 1.8;
}
</style>
