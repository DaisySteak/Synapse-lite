<script setup lang="ts">
/**
 * Kanban card: identifier, project, title, requester pill, attachments and
 * comments indicators, day counters and owner.
 */
import { computed } from 'vue';
import DayCounters from '@/components/tickets/DayCounters.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import ColorBadge from '@/components/ui/ColorBadge.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useTicketPresentation } from '@/composables/useTicketPresentation';
import type { TicketCard } from '@/types/models';

const props = defineProps<{ ticket: TicketCard; draggable: boolean; dragging?: boolean }>();

const presentation = useTicketPresentation();
const requester = computed(() => presentation.requester(props.ticket));
const epic = computed(() => presentation.epic(props.ticket));
const project = computed(() => presentation.project(props.ticket));
const owner = computed(() => presentation.owner(props.ticket));
</script>

<template>
    <RouterLink
        :to="{ name: 'ticket', params: { id: ticket.id } }"
        class="ticket-card"
        :class="{ dragging, locked: !draggable }"
        :draggable="draggable"
    >
        <div class="top">
            <span class="reference" :style="{ '--epic-color': epic?.color ?? '#6B7A80' }" :title="epic?.title">
                {{ ticket.reference }}
            </span>
            <span v-if="project" class="epic" :title="`Projet : ${project.name}`">{{ project.name }}</span>
            <span v-if="ticket.recurring_ticket_id" class="recurring" title="Créé par un ticket récurrent">
                <AppIcon name="repeat" :size="12" />
            </span>
        </div>
        <p class="title">{{ ticket.title }}</p>
        <ColorBadge v-if="requester" class="requester" :color="requester.color" :label="requester.name" />
        <div class="bottom">
            <div class="meta">
                <span
                    v-if="ticket.attachments_count > 0"
                    class="indicator"
                    :title="`${ticket.attachments_count} pièce(s) jointe(s)`"
                >
                    <AppIcon name="paperclip" :size="13" />
                </span>
                <span
                    class="indicator"
                    :class="{ empty: ticket.comments_count === 0 }"
                    :title="`${ticket.comments_count} commentaire(s)`"
                >
                    <AppIcon name="message" :size="13" />
                    {{ ticket.comments_count }}
                </span>
                <DayCounters :ticket="ticket" />
            </div>
            <UserAvatar :user="owner" :size="24" />
        </div>
    </RouterLink>
</template>

<style scoped>
.ticket-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-sm);
    color: var(--color-text);
    text-decoration: none;
    cursor: grab;
    transition:
        box-shadow var(--transition-fast),
        border-color var(--transition-fast),
        transform var(--transition-fast);
}

.ticket-card:hover {
    border-color: var(--color-brand-300);
    box-shadow: var(--shadow-md);
    text-decoration: none;
}

.ticket-card.locked {
    cursor: pointer;
}

.ticket-card.dragging {
    opacity: 0.4;
    transform: rotate(1deg);
}

.top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.reference {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: var(--font-size-xs);
    font-weight: 700;
    color: var(--color-text-muted);
    white-space: nowrap;
}

.reference::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--epic-color);
}

.epic {
    overflow: hidden;
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.recurring {
    display: inline-flex;
    margin-left: auto;
    color: var(--color-text-subtle);
}

.title {
    font-weight: 600;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.requester {
    align-self: flex-start;
}

.bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-top: 2px;
}

.meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
}

.indicator {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-muted);
}

.indicator.empty {
    color: var(--color-text-subtle);
}
</style>
