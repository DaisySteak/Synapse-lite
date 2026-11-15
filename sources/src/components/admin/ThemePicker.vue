<script setup lang="ts">
/**
 * Color theme of the application (top of the "Configuration" page): six themes
 * on one row, the green one by default. The choice is saved in the data
 * folder, so it applies to the whole team; each preview is drawn with the
 * colors of its theme.
 */
import { computed, ref } from 'vue';
import { errorMessage } from '@/api/errors';
import { settingsApi } from '@/api/settings';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import { DEFAULT_THEME, THEMES, themeOf, themeVariables, type Theme } from '@/utils/themes';

const reference = useReferenceStore();
const ui = useUiStore();

const current = computed(() => themeOf(reference.settings.theme).code);
const saving = ref<string | null>(null);

async function choose(theme: Theme): Promise<void> {
    if (theme.code === current.value || saving.value) return;
    saving.value = theme.code;

    try {
        await settingsApi.setTheme(theme.code);
        await reference.load(true);
        ui.notify(`Thème « ${theme.label} » appliqué pour toute l'équipe.`);
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        saving.value = null;
    }
}
</script>

<template>
    <div class="themes" role="radiogroup" aria-label="Thème de couleur">
        <button
            v-for="theme in THEMES"
            :key="theme.code"
            type="button"
            role="radio"
            class="theme"
            :class="{ active: theme.code === current }"
            :aria-checked="theme.code === current"
            :disabled="saving !== null"
            :style="themeVariables(theme)"
            @click="choose(theme)"
        >
            <span class="preview" aria-hidden="true">
                <span class="mini-sidebar">
                    <span class="mini-logo"></span>
                    <span class="mini-item selected"></span>
                    <span class="mini-item"></span>
                    <span class="mini-item"></span>
                    <span class="mini-item short"></span>
                </span>
                <span class="mini-main">
                    <span class="mini-title"></span>
                    <span class="mini-card">
                        <span class="mini-chip">En cours</span>
                        <span class="mini-line"></span>
                        <span class="mini-line link"></span>
                        <span class="mini-button">Enregistrer</span>
                    </span>
                </span>
            </span>

            <span class="caption">
                <span class="name">
                    {{ theme.label }}
                    <span v-if="theme.code === DEFAULT_THEME" class="default">par défaut</span>
                </span>
                <span v-if="theme.code === current" class="state">
                    <AppIcon name="check" :size="14" /> Thème actuel
                </span>
                <span v-else-if="saving === theme.code" class="state muted">Application…</span>
            </span>

            <span class="swatches" aria-hidden="true">
                <span
                    v-for="step in ['900', '700', '500', '300', '100'] as const"
                    :key="step"
                    :style="{ background: theme.brand[step] }"
                ></span>
            </span>
        </button>
    </div>
</template>

<style scoped>
.themes {
    display: grid;
    grid-template-columns: repeat(6, minmax(150px, 1fr));
    gap: var(--space-3);
    overflow-x: auto;
    padding: 2px 2px var(--space-1);
}

.theme {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: #fff;
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition:
        box-shadow var(--transition-fast),
        border-color var(--transition-fast),
        transform var(--transition-fast);
}

.theme:hover:not(:disabled) {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
}

.theme:disabled {
    cursor: wait;
}

/* The variables of the card are those of its own theme. */
.theme.active {
    border-color: var(--color-brand-600);
    box-shadow:
        0 0 0 2px var(--color-brand-600),
        var(--shadow-md);
}

.preview {
    display: flex;
    height: 84px;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--color-background);
}

.mini-sidebar {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 30%;
    padding: 8px 6px;
    background: linear-gradient(180deg, var(--color-brand-800) 0%, var(--color-brand-950) 100%);
}

.mini-logo {
    width: 60%;
    height: 10px;
    margin-bottom: 6px;
    border-radius: 3px;
    background: #fff;
}

.mini-item {
    height: 8px;
    border-radius: 3px;
    background: var(--color-sidebar-text);
    opacity: 0.55;
}

.mini-item.selected {
    height: 14px;
    background: rgb(255 255 255 / 18%);
    opacity: 1;
    box-shadow: inset 3px 0 0 var(--color-brand-300);
}

.mini-item.short {
    width: 60%;
}

.mini-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
}

.mini-title {
    width: 50%;
    height: 10px;
    border-radius: 3px;
    background: var(--color-brand-900);
}

.mini-card {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 5px;
    padding: 6px;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

.mini-chip {
    align-self: flex-start;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: var(--color-brand-100);
    color: var(--color-brand-800);
    font-size: 10px;
    font-weight: 700;
}

.mini-line {
    width: 85%;
    height: 6px;
    border-radius: 3px;
    background: var(--color-surface-sunken);
}

.mini-line.link {
    width: 55%;
    background: var(--color-brand-700);
    opacity: 0.8;
}

.mini-button {
    align-self: flex-end;
    margin-top: auto;
    padding: 3px 9px;
    border-radius: 4px;
    background: var(--color-brand-600);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
}

.caption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 2px var(--space-2);
}

.name {
    font-size: var(--font-size-md);
    font-weight: 700;
}

.default {
    margin-left: 4px;
    color: var(--color-text-subtle);
    font-size: var(--font-size-xs);
    font-weight: 600;
}

.state {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-brand-700);
    font-size: var(--font-size-sm);
    font-weight: 700;
}

.swatches {
    display: flex;
    gap: 4px;
}

.swatches span {
    flex: 1;
    height: 8px;
    border-radius: 4px;
}
</style>
