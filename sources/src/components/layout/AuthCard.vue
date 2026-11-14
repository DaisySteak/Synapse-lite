<script setup lang="ts">
/**
 * Centered card of the screens shown before entering the application
 * (choice of the data folder, sign-in).
 */
defineProps<{ subtitle: string }>();
</script>

<template>
    <div class="auth-page">
        <div class="auth-card card">
            <div class="brand">
                <span class="logo" aria-hidden="true">S</span>
                <div>
                    <h1>Synapse <span class="lite">Lite</span></h1>
                    <p class="muted">{{ subtitle }}</p>
                </div>
            </div>
            <slot />
        </div>
    </div>
</template>

<style scoped>
.auth-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    padding: var(--space-4);
    background:
        radial-gradient(
            circle at 15% 20%,
            color-mix(in srgb, var(--color-brand-300) 35%, transparent),
            transparent 40%
        ),
        linear-gradient(160deg, var(--color-brand-800), var(--color-brand-950));
}

.auth-card {
    width: 420px;
    max-width: 100%;
    padding: var(--space-8);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    box-shadow: var(--shadow-lg);
}

.brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: var(--color-brand-600);
    color: #fff;
    font-size: 24px;
    font-weight: 700;
}

h1 {
    font-size: var(--font-size-2xl);
    color: var(--color-brand-900);
}

.lite {
    color: var(--color-brand-600);
    font-weight: 600;
}
</style>
