<script setup lang="ts">
import { PRESET_COLORS } from '@/utils/colors';

const model = defineModel<string>({ required: true });
</script>

<template>
    <div class="color-input">
        <input v-model="model" type="color" class="native" aria-label="Couleur personnalisée" />
        <div class="presets">
            <button
                v-for="color in PRESET_COLORS"
                :key="color"
                type="button"
                class="preset"
                :class="{ active: model.toUpperCase() === color }"
                :style="{ background: color }"
                :aria-label="color"
                @click="model = color"
            />
        </div>
    </div>
</template>

<style scoped>
.color-input {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.native {
    width: 40px;
    height: 34px;
    padding: 2px;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    cursor: pointer;
}

.presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.preset {
    width: 20px;
    height: 20px;
    border: 2px solid transparent;
    border-radius: 50%;
    cursor: pointer;
}

.preset.active {
    border-color: var(--color-text);
    box-shadow: 0 0 0 2px #fff inset;
}
</style>
