<script setup lang="ts">
/**
 * History of a ticket, in natural language.
 */
import { onMounted, ref, watch } from 'vue';
import { errorMessage } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { TicketActivity } from '@/types/models';
import { formatDate, formatDateTime, formatRelative } from '@/utils/dates';
import { formatManDays } from '@/utils/format';

const props = defineProps<{ ticketId: number; version: number }>();

const reference = useReferenceStore();
const ui = useUiStore();
const activities = ref<TicketActivity[]>([]);

const FIELD_LABELS: Record<string, string> = {
    title: 'le titre',
    description: 'la description',
    epic_id: 'le type',
    project_id: 'le projet',
    requester_id: 'le demandeur',
    data_processing_code: 'le traitement de données',
    work_folder_url: 'le dossier de travail',
    start_date: 'la date de début',
    due_date: 'la date de fin prévisionnelle',
    time_spent: 'le temps consommé',
    supporters: 'les contributeurs',
};

function statusLabel(code: unknown): string {
    return reference.statusMap.get(String(code))?.label ?? String(code);
}

function userName(id: unknown): string {
    return reference.userMap.get(Number(id))?.full_name ?? 'un utilisateur';
}

function value(field: string, raw: unknown): string {
    if (raw === null || raw === undefined || raw === '') return '∅';
    if (field === 'epic_id') return reference.epicMap.get(Number(raw))?.title ?? 'type supprimé';
    if (field === 'project_id') return reference.projectMap.get(Number(raw))?.name ?? String(raw);
    if (field === 'requester_id') return reference.requesterMap.get(Number(raw))?.name ?? String(raw);
    if (field.endsWith('_date')) return formatDate(String(raw));
    if (field === 'time_spent') return formatManDays(Number(raw));

    return String(raw);
}

function describe(activity: TicketActivity): string[] {
    const changes = (activity.changes ?? {}) as Record<string, { from?: unknown; to?: unknown }>;

    switch (activity.event) {
        case 'created':
            return changes.recurring_ticket_id
                ? ['a créé le ticket automatiquement (ticket récurrent)']
                : ['a créé le ticket'];
        case 'status_changed':
            return [`a déplacé le ticket de « ${statusLabel(changes.from)} » vers « ${statusLabel(changes.to)} »`];
        case 'owner_changed':
            return [`a réaffecté le ticket de ${userName(changes.from)} à ${userName(changes.to)}`];
        case 'comment_added':
            return ['a ajouté un commentaire'];
        case 'attachment_added':
            return [`a ajouté la pièce jointe « ${String(changes.name ?? '')} »`];
        case 'attachment_removed':
            return [`a supprimé la pièce jointe « ${String(changes.name ?? '')} »`];
        case 'deleted':
            return ['a supprimé le ticket'];
        case 'restored':
            return ['a restauré le ticket'];
        case 'updated':
            return Object.entries(changes).map(([field, change]) => {
                const label = FIELD_LABELS[field] ?? field;

                if (field === 'description' || field === 'supporters') return `a modifié ${label}`;

                return `a modifié ${label} : ${value(field, change.from)} → ${value(field, change.to)}`;
            });
        default:
            return ['a modifié le ticket'];
    }
}

async function load(): Promise<void> {
    try {
        activities.value = await ticketsApi.activities(props.ticketId);
    } catch (e) {
        ui.notify(errorMessage(e), 'error');
    }
}

onMounted(load);
watch(() => props.version, load);
</script>

<template>
    <ol class="activity">
        <li v-for="activity in activities" :key="activity.id">
            <UserAvatar :user="activity.user" :size="22" />
            <div class="text">
                <p v-for="(line, index) in describe(activity)" :key="index">
                    <strong>{{ activity.user?.full_name ?? 'Système' }}</strong> {{ line }}
                </p>
                <span class="date" :title="formatDateTime(activity.created_at)">{{
                    formatRelative(activity.created_at)
                }}</span>
            </div>
        </li>
    </ol>
</template>

<style scoped>
.activity {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

li {
    display: flex;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
}

.text {
    display: flex;
    flex-direction: column;
}

.date {
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
}
</style>
