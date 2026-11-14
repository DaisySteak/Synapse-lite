<script setup lang="ts">
/**
 * Accessible modal dialog: closes with Escape or a click on the backdrop,
 * focuses its first field when opened.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';

const props = withDefaults(defineProps<{ open: boolean; title: string; width?: string }>(), { width: '560px' });
const emit = defineEmits<{ close: [] }>();

const panel = ref<HTMLElement | null>(null);

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        emit('close');
    }
}

watch(
    () => props.open,
    async (open) => {
        if (open) {
            document.addEventListener('keydown', onKeydown);
            await nextTick();
            panel.value?.querySelector<HTMLElement>('input, select, textarea, button.btn-primary')?.focus();
        } else {
            document.removeEventListener('keydown', onKeydown);
        }
    },
    { immediate: true },
);

onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
    <Teleport to="body">
        <Transition name="modal">
            <div v-if="open" class="backdrop" @mousedown.self="emit('close')">
                <div ref="panel" class="panel" role="dialog" aria-modal="true" :aria-label="title" :style="{ width }">
                    <header class="header">
                        <h2>{{ title }}</h2>
                        <button class="btn btn-ghost btn-icon" type="button" aria-label="Fermer" @click="emit('close')">
                            <AppIcon name="x" />
                        </button>
                    </header>
                    <div class="body">
                        <slot />
                    </div>
                    <footer v-if="$slots.footer" class="footer">
                        <slot name="footer" />
                    </footer>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.backdrop {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 4vh var(--space-4);
    background: color-mix(in srgb, var(--color-brand-950) 45%, transparent);
}

.panel {
    display: flex;
    flex-direction: column;
    max-width: 100%;
    /* Uses the whole useful height of the window, the body scrolls. */
    max-height: 92vh;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
}

.header h2 {
    font-size: var(--font-size-xl);
}

.body {
    flex: 1;
    min-height: 0;
    padding: var(--space-5);
    overflow: auto;
}

.footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}

.modal-enter-active,
.modal-leave-active {
    transition: opacity var(--transition);
}

.modal-enter-active .panel,
.modal-leave-active .panel {
    transition: transform var(--transition);
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-from .panel,
.modal-leave-to .panel {
    transform: translateY(-12px);
}
</style>
