<script setup lang="ts">
/**
 * Purge of the tickets (administrators): permanent deletion of the deleted
 * tickets, or of every ticket, with their comments, history and attachments.
 *
 * Critical and irreversible: the administrator chooses the scope, sees how
 * many tickets will disappear and has to type the confirmation sentence
 * before the button becomes available (the sentence is checked again by
 * the API).
 */
import { computed, ref, watch } from 'vue';
import { errorMessage, fieldErrors } from '@/api/errors';
import { CONFIRMATIONS, dataApi, isConfirmed } from '@/api/data';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import TypedConfirmation from '@/components/ui/TypedConfirmation.vue';
import { useUiStore } from '@/stores/ui';
import type { PurgeScope } from '@/types/models';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; purged: [count: number] }>();

const ui = useUiStore();

const scope = ref<PurgeScope>('deleted');
const confirmation = ref('');
const counts = ref<Record<PurgeScope, number> | null>(null);
const error = ref<string | null>(null);
const purging = ref(false);

const count = computed(() => counts.value?.[scope.value] ?? 0);
const confirmed = computed(() => isConfirmed('purge', confirmation.value));
const canPurge = computed(() => confirmed.value && count.value > 0 && !purging.value);

watch(
    () => props.open,
    async (open) => {
        if (!open) return;

        scope.value = 'deleted';
        confirmation.value = '';
        error.value = null;
        counts.value = null;

        try {
            counts.value = await dataApi.purgeCounts();
        } catch (e) {
            error.value = errorMessage(e);
        }
    },
    { immediate: true },
);

// Changing the scope after typing the sentence asks for it again.
watch(scope, () => {
    confirmation.value = '';
});

function close(): void {
    if (!purging.value) emit('close');
}

async function purge(): Promise<void> {
    if (!canPurge.value) return;

    purging.value = true;
    error.value = null;

    try {
        const removed = await dataApi.purge(scope.value, confirmation.value);
        ui.notify(`${removed} ticket(s) supprimé(s) définitivement.`, 'success');
        emit('purged', removed);
    } catch (e) {
        error.value = fieldErrors(e).confirmation ?? errorMessage(e);
    } finally {
        purging.value = false;
    }
}
</script>

<template>
    <BaseModal :open="open" title="Purger les tickets" width="520px" @close="close">
        <div class="warning" role="alert">
            <AppIcon name="alert" :size="18" />
            <p>
                La purge <strong>supprime définitivement</strong> les tickets du dossier de données, avec leurs
                commentaires, leur historique et leurs pièces jointes. <strong>Elle est irréversible.</strong>
            </p>
        </div>

        <fieldset class="scopes">
            <legend class="field-label">Tickets à purger</legend>
            <label class="scope" :class="{ selected: scope === 'deleted' }">
                <input v-model="scope" type="radio" value="deleted" name="purge-scope" />
                <span>
                    <strong>Les tickets supprimés uniquement</strong>
                    <span class="muted">
                        {{ counts ? `${counts.deleted} ticket(s)` : '…' }} déjà supprimé(s), visibles avec le statut «
                        Supprimé »
                    </span>
                </span>
            </label>
            <label class="scope danger" :class="{ selected: scope === 'all' }">
                <input v-model="scope" type="radio" value="all" name="purge-scope" />
                <span>
                    <strong>Tous les tickets</strong>
                    <span class="muted">
                        {{ counts ? `${counts.all} ticket(s)` : '…' }} : l'application repart sans aucun ticket
                    </span>
                </span>
            </label>
        </fieldset>

        <TypedConfirmation
            id="purge-confirmation"
            v-model="confirmation"
            :sentence="CONFIRMATIONS.purge"
            :error="error"
            @submit="purge"
        />

        <template #footer>
            <button class="btn btn-secondary" type="button" :disabled="purging" @click="close">Annuler</button>
            <button class="btn btn-danger" type="button" :disabled="!canPurge" @click="purge">
                <AppIcon name="trash" :size="15" />
                {{ purging ? 'Purge en cours…' : `Supprimer définitivement ${count} ticket(s)` }}
            </button>
        </template>
    </BaseModal>
</template>

<style scoped>
.warning {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-md);
    background: #fbeeee;
    color: #7a2626;
}

.warning p {
    margin: 0;
}

.scopes {
    display: grid;
    gap: var(--space-2);
    margin: 0 0 var(--space-4);
    padding: 0;
    border: 0;
}

.scope {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
}

.scope > span {
    display: grid;
    gap: 2px;
}

.scope.selected {
    border-color: var(--color-brand-600);
    background: var(--color-brand-50);
}

.scope.danger.selected {
    border-color: #a23b3b;
    background: #fbeeee;
}

.scope input {
    margin-top: 3px;
}
</style>
