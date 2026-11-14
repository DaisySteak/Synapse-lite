<script setup lang="ts">
/**
 * Confirmation of an irreversible operation on the whole data folder
 * (restoration, reset): warning, details given by the page, optional backup
 * of the current data first (checked by default), and the sentence to type
 * before the button becomes available.
 */
import { computed, ref, watch } from 'vue';
import { CONFIRMATIONS, isConfirmed, type ConfirmedOperation } from '@/api/data';
import AppIcon from '@/components/ui/AppIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import TypedConfirmation from '@/components/ui/TypedConfirmation.vue';

const props = defineProps<{
    open: boolean;
    title: string;
    operation: ConfirmedOperation;
    confirmLabel: string;
    busy?: boolean;
    error?: string | null;
}>();
const emit = defineEmits<{ close: []; confirm: [confirmation: string, backupFirst: boolean] }>();

const confirmation = ref('');
const backupFirst = ref(true);

const sentence = computed(() => CONFIRMATIONS[props.operation]);
const canConfirm = computed(() => isConfirmed(props.operation, confirmation.value) && !props.busy);

watch(
    () => props.open,
    (open) => {
        if (!open) return;
        confirmation.value = '';
        backupFirst.value = true;
    },
);

function close(): void {
    if (!props.busy) emit('close');
}

function confirm(): void {
    if (canConfirm.value) emit('confirm', confirmation.value, backupFirst.value);
}
</script>

<template>
    <BaseModal :open="open" :title="title" width="540px" @close="close">
        <div class="warning" role="alert">
            <AppIcon name="alert" :size="18" />
            <p><slot name="warning" /></p>
        </div>

        <slot />

        <label class="checkbox backup">
            <input v-model="backupFirst" type="checkbox" />
            Télécharger d'abord une sauvegarde des données actuelles (recommandé)
        </label>

        <TypedConfirmation
            :id="`confirm-${operation}`"
            v-model="confirmation"
            :sentence="sentence"
            :error="error"
            @submit="confirm"
        />

        <template #footer>
            <button class="btn btn-secondary" type="button" :disabled="busy" @click="close">Annuler</button>
            <button class="btn btn-danger" type="button" :disabled="!canConfirm" @click="confirm">
                <AppIcon name="alert" :size="15" />
                {{ busy ? 'Opération en cours…' : confirmLabel }}
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

.backup {
    margin: var(--space-4) 0;
}
</style>
