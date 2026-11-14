<script setup lang="ts">
/**
 * Field in which the administrator types the confirmation sentence of an
 * irreversible operation. Pasting is blocked and the sentence cannot be
 * selected, so that it really has to be typed.
 */
defineProps<{ id: string; sentence: string; error?: string | null }>();
const emit = defineEmits<{ submit: [] }>();

const model = defineModel<string>({ required: true });
</script>

<template>
    <div class="field">
        <label class="field-label" :for="id">
            Pour confirmer, saisissez : <span class="sentence">{{ sentence }}</span>
        </label>
        <input
            :id="id"
            v-model="model"
            class="input"
            :class="{ 'has-error': error }"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="sentence"
            @paste.prevent
            @drop.prevent
            @keydown.enter.prevent="emit('submit')"
        />
        <span v-if="error" class="field-error">{{ error }}</span>
    </div>
</template>

<style scoped>
.sentence {
    font-weight: 700;
    color: var(--color-text);
    user-select: none;
}
</style>
