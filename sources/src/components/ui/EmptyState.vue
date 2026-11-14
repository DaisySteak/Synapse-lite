<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue';
import type { IconName } from '@/components/ui/icons';

defineProps<{ icon?: IconName; title: string; text?: string }>();
</script>

<template>
    <div class="empty-state">
        <AppIcon :name="icon ?? 'search'" :size="28" />
        <p class="title">{{ title }}</p>
        <p v-if="text" class="text">{{ text }}</p>
        <slot />
    </div>
</template>

<style scoped>
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-8);
    color: var(--color-text-subtle);
    text-align: center;
}

.title {
    font-weight: 600;
    color: var(--color-text-muted);
}

.text {
    font-size: var(--font-size-sm);
}
</style>
