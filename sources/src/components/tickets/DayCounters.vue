<script setup lang="ts">
/**
 * Day counters of a ticket: age (days since creation) and days left before
 * the planned end date, negative and muted red when late.
 */
import { computed } from 'vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useTicketPresentation } from '@/composables/useTicketPresentation';
import type { TicketCard } from '@/types/models';
import { plural } from '@/utils/format';

const props = defineProps<{ ticket: Pick<TicketCard, 'created_at' | 'due_date' | 'status_code'> }>();

const { counters } = useTicketPresentation();
const values = computed(() => counters(props.ticket));
</script>

<template>
    <span class="counters">
        <span class="counter" :title="`Créé il y a ${plural(values.age, 'jour')}`">
            <AppIcon name="clock" :size="13" />
            {{ values.age }} j
        </span>
        <span
            v-if="values.remaining !== null"
            class="counter"
            :class="{ late: values.remaining < 0, soon: values.remaining >= 0 && values.remaining <= 2 }"
            :title="
                values.remaining < 0
                    ? `En retard de ${plural(-values.remaining, 'jour')}`
                    : `Échéance dans ${plural(values.remaining, 'jour')}`
            "
        >
            <AppIcon name="flag" :size="13" />
            {{ values.remaining }} j
        </span>
    </span>
</template>

<style scoped>
.counters {
    display: inline-flex;
    gap: var(--space-2);
}

.counter {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
}

.counter.soon {
    color: var(--color-warning);
}

.counter.late {
    color: var(--color-late);
}
</style>
