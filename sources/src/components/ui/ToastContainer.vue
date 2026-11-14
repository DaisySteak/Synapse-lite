<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
</script>

<template>
    <div class="toasts" aria-live="polite">
        <TransitionGroup name="toast">
            <div v-for="toast in ui.toasts" :key="toast.id" class="toast" :class="`toast-${toast.type}`" role="status">
                <AppIcon :name="toast.type === 'error' ? 'alert' : 'check'" :size="16" />
                <span>{{ toast.message }}</span>
                <button class="close" type="button" aria-label="Fermer" @click="ui.dismiss(toast.id)">
                    <AppIcon name="x" :size="14" />
                </button>
            </div>
        </TransitionGroup>
    </div>
</template>

<style scoped>
.toasts {
    position: fixed;
    right: var(--space-5);
    bottom: var(--space-5);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.toast {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 260px;
    max-width: 420px;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-brand-900);
    color: #fff;
    box-shadow: var(--shadow-lg);
}

.toast-error {
    background: var(--color-danger);
}

.toast-info {
    background: var(--color-info);
}

.toast span {
    flex: 1;
}

.close {
    display: flex;
    border: 0;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
}

.toast-enter-active,
.toast-leave-active {
    transition: all var(--transition);
}

.toast-enter-from,
.toast-leave-to {
    opacity: 0;
    transform: translateY(8px);
}
</style>
