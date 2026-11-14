<script setup lang="ts">
/**
 * Round avatar with the initials of a user; the color is derived from the
 * user id so that it stays stable everywhere.
 */
import { computed } from 'vue';
import type { UserSummary } from '@/types/models';

const props = withDefaults(defineProps<{ user: UserSummary | null | undefined; size?: number }>(), { size: 26 });

const PALETTE = ['#007A6E', '#2F6EBA', '#6A4C93', '#C27C0E', '#B23A48', '#2E7D32', '#37474F', '#00594F'];

const background = computed(() => (props.user ? PALETTE[props.user.id % PALETTE.length] : '#C4CDCF'));
</script>

<template>
    <span
        class="avatar"
        :class="{ inactive: user && !user.is_active }"
        :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px`, background }"
        :title="user?.full_name ?? 'Non assigné'"
    >
        {{ user?.initials ?? '?' }}
    </span>
</template>

<style scoped>
.avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    border-radius: 50%;
    color: #fff;
    font-weight: 700;
    letter-spacing: 0.02em;
    user-select: none;
}

.inactive {
    opacity: 0.5;
}
</style>
