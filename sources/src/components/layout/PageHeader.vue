<script setup lang="ts">
/**
 * Page title and actions. `stacked`: the actions (filters) always sit on
 * their own line below the title, whatever the window width.
 */
defineProps<{ title: string; subtitle?: string; stacked?: boolean }>();
</script>

<template>
    <header class="page-header" :class="{ stacked }">
        <div class="titles">
            <h1>{{ title }}</h1>
            <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
        </div>
        <div class="actions">
            <slot />
        </div>
    </header>
</template>

<style scoped>
.page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
    min-height: var(--header-height);
    padding: var(--space-3) var(--space-6);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
}

h1 {
    font-size: var(--font-size-2xl);
    color: var(--color-brand-900);
}

.subtitle {
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
}

.page-header.stacked {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-3);
}

.actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
}
</style>
