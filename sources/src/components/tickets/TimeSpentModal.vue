<script setup lang="ts">
/**
 * Shown right after a ticket is closed: the time spent proposed (working
 * days from the start to the end of the ticket, Monday to Friday), how it is
 * computed, and a field with quick buttons to correct it.
 *
 * Built to cost one keystroke: the field is focused and selected, Enter
 * validates, Escape keeps the value already stored.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { errorMessage, fieldErrors } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import TimeSpentInput from '@/components/tickets/TimeSpentInput.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import { useUiStore } from '@/stores/ui';
import { parseDate } from '@/utils/dates';
import { formatManDays, plural } from '@/utils/format';
import { estimateTimeSpent } from '@/utils/workdays';

const ui = useUiStore();

const value = ref<number | null>(null);
const error = ref<string | null>(null);
const saving = ref(false);

const ticket = computed(() => ui.closedTicket);
const estimate = computed(() => (ticket.value ? estimateTimeSpent(ticket.value) : null));
/** Working days proposed, null when there is nothing to count (start after the end). */
const proposed = computed(() => (estimate.value && estimate.value.workingDays > 0 ? estimate.value.workingDays : null));
const differs = computed(() => proposed.value !== null && value.value !== proposed.value);

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
/** "Ven. 14 nov." */
const day = (iso: string) => {
    const text = dayFormatter.format(parseDate(iso));

    return text.charAt(0).toUpperCase() + text.slice(1);
};

watch(ticket, async (current) => {
    if (!current) return;

    // The value stored when closing (computed by the application, or given before).
    value.value = current.time_spent ?? proposed.value;
    error.value = null;
    await nextTick();
    const input = document.getElementById('closed-time-spent') as HTMLInputElement | null;
    input?.focus();
    input?.select();
});

function close(): void {
    if (!saving.value) ui.closedTicket = null;
}

async function validate(): Promise<void> {
    const current = ticket.value;
    if (!current || saving.value) return;

    if (value.value === current.time_spent) {
        ui.closedTicket = null;

        return;
    }

    saving.value = true;
    error.value = null;

    try {
        await ticketsApi.update(current.id, { time_spent: value.value });
        ui.notify(`${current.reference} : ${formatManDays(value.value)} enregistré(s).`);
        ui.ticketsChanged();
        ui.closedTicket = null;
    } catch (e) {
        error.value = fieldErrors(e).time_spent ?? errorMessage(e);
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <BaseModal :open="ticket !== null" title="Temps consommé" width="460px" @close="close">
        <template v-if="ticket && estimate">
            <p class="ticket">
                <span class="reference">{{ ticket.reference }}</span> {{ ticket.title }}
                <span class="done">est terminé.</span>
            </p>

            <div class="calculation" aria-label="Calcul du temps proposé">
                <div class="period">
                    <span>{{ day(estimate.from) }}</span>
                    <span class="arrow" aria-hidden="true">→</span>
                    <span>{{ day(estimate.to) }}</span>
                </div>
                <p v-if="estimate.calendarDays === 0" class="detail">
                    La date de début est après le passage en terminé : aucun jour à compter. Indiquez le temps passé
                    ci-dessous.
                </p>
                <p v-else class="detail">
                    {{ estimate.fromCreation ? 'Création du ticket' : 'Date de début' }} → passage en terminé :
                    {{ plural(estimate.calendarDays, 'jour') }}, dont
                    <strong>{{ plural(estimate.workingDays, 'jour ouvré', 'jours ouvrés') }}</strong>
                    (du lundi au vendredi) = <strong>{{ formatManDays(estimate.workingDays) }}</strong>
                </p>
            </div>

            <div class="field">
                <label class="field-label" for="closed-time-spent">Temps consommé réel</label>
                <TimeSpentInput id="closed-time-spent" v-model="value" :error="error" @enter="validate" />
                <span v-if="error" class="field-error">{{ error }}</span>
                <button v-else-if="differs" type="button" class="link" @click="value = proposed">
                    Reprendre le calcul ({{ formatManDays(proposed) }})
                </button>
            </div>
        </template>

        <template #footer>
            <button class="btn btn-secondary" type="button" :disabled="saving" @click="close">Plus tard</button>
            <button class="btn btn-primary" type="button" :disabled="saving" @click="validate">
                {{ saving ? 'Enregistrement…' : 'Valider' }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.ticket {
    margin: 0 0 var(--space-4);
    color: var(--color-text);
}

.reference {
    font-family: var(--font-mono);
    font-weight: 700;
}

.done {
    color: var(--color-text-muted);
}

.calculation {
    margin-bottom: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-brand-50);
}

.period {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 700;
}

.arrow {
    color: var(--color-text-muted);
}

.detail {
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
}

.link {
    justify-self: start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-brand-700);
    font-size: var(--font-size-sm);
    cursor: pointer;
}

.link:hover {
    text-decoration: underline;
}
</style>
