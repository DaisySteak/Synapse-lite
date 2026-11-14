<script setup lang="ts">
/**
 * SVG icon. The available names are listed in ./icons.ts.
 */
import { computed } from 'vue';
import { ICONS, type IconName } from './icons';

const props = withDefaults(defineProps<{ name: IconName; size?: number; strokeWidth?: number }>(), {
    size: 18,
    strokeWidth: 2,
});

const path = computed(() => ICONS[props.name]);
</script>

<template>
    <svg
        class="icon"
        :width="size"
        :height="size"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path :d="path" />
    </svg>
</template>

<style scoped>
.icon {
    flex-shrink: 0;
}
</style>
