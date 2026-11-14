<script setup lang="ts">
import BaseModal from '@/components/ui/BaseModal.vue';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
</script>

<template>
    <BaseModal
        :open="ui.confirmRequest !== null"
        :title="ui.confirmRequest?.title ?? ''"
        width="440px"
        @close="ui.answerConfirm(false)"
    >
        <p>{{ ui.confirmRequest?.message }}</p>
        <template #footer>
            <button class="btn btn-secondary" type="button" @click="ui.answerConfirm(false)">Annuler</button>
            <button
                class="btn"
                :class="ui.confirmRequest?.danger ? 'btn-danger' : 'btn-primary'"
                type="button"
                @click="ui.answerConfirm(true)"
            >
                {{ ui.confirmRequest?.confirmLabel ?? 'Confirmer' }}
            </button>
        </template>
    </BaseModal>
</template>
