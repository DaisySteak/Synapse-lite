<script setup lang="ts">
/**
 * Colored pill with a label (requester, epic).
 */
import { computed } from 'vue';
import { readableTextColor } from '@/utils/colors';

const props = withDefaults(defineProps<{ color: string; label: string; variant?: 'solid' | 'dot' }>(), {
    variant: 'solid',
});

const style = computed(() =>
    props.variant === 'solid' ? { background: props.color, color: readableTextColor(props.color) } : {},
);
</script>

<template>
    <span class="color-badge" :class="variant" :style="style" :title="label">
        <span v-if="variant === 'dot'" class="dot" :style="{ background: color }" />
        <span class="text">{{ label }}</span>
    </span>
</template>

<style scoped>
.color-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    height: 20px;
    padding: 0 8px;
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    font-weight: 600;
    white-space: nowrap;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.color-badge.dot {
    padding: 0;
    color: var(--color-text-muted);
}

.text {
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
