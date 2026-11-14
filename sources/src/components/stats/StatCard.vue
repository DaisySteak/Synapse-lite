<script setup lang="ts">
/**
 * Block of the statistics page: a title, what it covers ("À ce jour" or the
 * period), an optional setting and the Excel export of its data.
 */
import AppIcon from '@/components/ui/AppIcon.vue';

withDefaults(defineProps<{ title: string; scope: string; help?: string; exportable?: boolean }>(), {
    help: undefined,
    exportable: true,
});
defineEmits<{ export: [] }>();
</script>

<template>
    <section class="card stat-card">
        <header class="head">
            <div class="titles">
                <h3>{{ title }}</h3>
                <span class="scope">{{ scope }}</span>
            </div>
            <div class="tools">
                <slot name="tools" />
                <button
                    v-if="exportable"
                    type="button"
                    class="btn btn-ghost btn-sm"
                    title="Exporter ce tableau vers Excel"
                    @click="$emit('export')"
                >
                    <AppIcon name="download" :size="14" /> Excel
                </button>
            </div>
        </header>
        <p v-if="help" class="help">{{ help }}</p>
        <div class="content">
            <slot />
        </div>
    </section>
</template>

<style scoped>
.stat-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: var(--space-4) var(--space-5) var(--space-5);
}

.head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
}

.titles {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
}

h3 {
    margin: 0;
    color: var(--color-text);
    font-size: var(--font-size-lg);
}

.scope {
    color: var(--color-text-subtle);
    font-size: var(--font-size-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.tools {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
}

.help {
    margin: var(--space-1) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
}

.content {
    flex: 1;
    min-width: 0;
    margin-top: var(--space-4);
    overflow-x: auto;
}
</style>
