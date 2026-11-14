<script setup lang="ts">
import EmptyState from '@/components/ui/EmptyState.vue';
</script>

<template>
    <EmptyState icon="alert" title="Page introuvable" text="L'adresse demandée n'existe pas.">
        <RouterLink :to="{ name: 'board' }" class="btn btn-primary">Retour au tableau</RouterLink>
    </EmptyState>
</template>
