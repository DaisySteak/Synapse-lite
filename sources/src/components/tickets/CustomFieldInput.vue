<script setup lang="ts">
/**
 * Input of a custom field according to its type: date, short text or
 * Markdown (complex text).
 */
import MarkdownEditor from '@/components/markdown/MarkdownEditor.vue';
import type { CustomField } from '@/types/models';

defineProps<{ field: CustomField; error?: string }>();

const model = defineModel<string | null>({ default: null });
</script>

<template>
    <div class="field">
        <label class="field-label" :for="`cf-${field.id}`">
            {{ field.label }}<span v-if="field.is_required" class="required">*</span>
        </label>
        <input
            v-if="field.field_type === 'date'"
            :id="`cf-${field.id}`"
            v-model="model"
            type="date"
            class="input"
            :class="{ 'has-error': error }"
        />
        <input
            v-else-if="field.field_type === 'short_text'"
            :id="`cf-${field.id}`"
            v-model="model"
            type="text"
            maxlength="255"
            class="input"
            :class="{ 'has-error': error }"
        />
        <MarkdownEditor
            v-else
            :model-value="model ?? ''"
            :min-height="100"
            :invalid="!!error"
            @update:model-value="model = $event"
        />
        <span v-if="field.help_text" class="field-help">{{ field.help_text }}</span>
        <span v-if="error" class="field-error">{{ error }}</span>
    </div>
</template>
