<script setup lang="ts">
/**
 * Backlog: tickets prepared in advance, not shown on the board.
 *
 * Administrators and lead techs create and manage them; every user can
 * consult them and send a ticket to another workflow step, which makes it
 * appear on the board.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { errorMessage } from '@/api/errors';
import { ticketsApi } from '@/api/tickets';
import PageHeader from '@/components/layout/PageHeader.vue';
import TicketTable from '@/components/tickets/TicketTable.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import MultiSelect from '@/components/ui/MultiSelect.vue';
import { usePersistentRef } from '@/composables/usePersistentRef';
import { BACKLOG, useTicketPermissions } from '@/composables/useTicketPermissions';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';
import type { TicketCard } from '@/types/models';

const reference = useReferenceStore();
const auth = useAuthStore();
const ui = useUiStore();
const { canChangeStatus } = useTicketPermissions();

const tickets = ref<TicketCard[]>([]);
const loading = ref(false);
const moving = ref<number | null>(null);

const epicIds = usePersistentRef<number[]>('synapse.backlog.epics', []);
const projectIds = usePersistentRef<number[]>('synapse.backlog.projects', []);
const ownerIds = usePersistentRef<number[]>('synapse.backlog.owners', []);
const search = ref('');

const epicOptions = computed(() => reference.epics.map((e) => ({ value: e.id, label: e.title, color: e.color })));
const projectOptions = computed(() => reference.projects.map((p) => ({ value: p.id, label: p.name, color: p.color })));
const userOptions = computed(() => reference.users.map((u) => ({ value: u.id, label: u.full_name })));

/** Steps a backlog ticket can be sent to. */
const targets = computed(() => reference.statuses.filter((status) => status.code !== BACKLOG));

const searchTerm = computed(() => search.value.trim().toLowerCase());
const displayed = computed(() =>
    searchTerm.value
        ? tickets.value.filter(
              (t) =>
                  t.title.toLowerCase().includes(searchTerm.value) ||
                  t.reference.toLowerCase().includes(searchTerm.value),
          )
        : tickets.value,
);

async function load(): Promise<void> {
    loading.value = true;

    try {
        tickets.value = await ticketsApi.list({
            status_codes: [BACKLOG],
            epic_ids: epicIds.value,
            project_ids: projectIds.value,
            owner_ids: ownerIds.value,
        });
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        loading.value = false;
    }
}

async function sendTo(ticket: TicketCard, statusCode: string): Promise<void> {
    const status = reference.statusMap.get(statusCode);
    moving.value = ticket.id;

    try {
        await ticketsApi.move(ticket.id, statusCode, 0);
        tickets.value = tickets.value.filter((item) => item.id !== ticket.id);
        ui.notify(`${ticket.reference} déplacé dans « ${status?.label ?? statusCode} ».`);
        ui.ticketsChanged();
    } catch (error) {
        ui.notify(errorMessage(error), 'error');
    } finally {
        moving.value = null;
    }
}

function onSelect(ticket: TicketCard, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    select.value = '';

    if (value) void sendTo(ticket, value);
}

watch([epicIds, projectIds, ownerIds], load, { deep: true });
watch(() => ui.ticketsVersion, load);
onMounted(load);
</script>

<template>
    <div class="page">
        <PageHeader
            stacked
            title="Backlog"
            :subtitle="`${displayed.length} ticket(s) en préparation, non visibles dans le tableau`"
        >
            <div class="search-box">
                <AppIcon name="search" :size="15" />
                <input v-model="search" type="search" placeholder="Titre ou identifiant…" aria-label="Rechercher" />
            </div>
            <MultiSelect
                v-model="epicIds"
                class="toolbar-filter"
                :options="epicOptions"
                multiple
                clearable
                compact
                placeholder="Type"
            />
            <MultiSelect
                v-model="projectIds"
                class="toolbar-filter"
                :options="projectOptions"
                multiple
                clearable
                compact
                placeholder="Projet"
            />
            <MultiSelect
                v-model="ownerIds"
                class="toolbar-filter"
                :options="userOptions"
                multiple
                clearable
                compact
                placeholder="Responsable"
            />
            <button
                v-if="auth.can('backlog.manage')"
                class="btn btn-primary btn-sm"
                type="button"
                @click="ui.openQuickCreate({ status_code: 'backlog' })"
            >
                <AppIcon name="plus" :size="14" />
                Nouveau ticket au backlog
            </button>
        </PageHeader>

        <div class="page-content">
            <TicketTable
                :tickets="displayed"
                :loading="loading"
                :show-status="false"
                default-sort="rank"
                default-direction="asc"
                empty-text="Le backlog est vide."
            >
                <template #actions="{ ticket }">
                    <label v-if="canChangeStatus(ticket, 'todo')" class="send-to">
                        <AppIcon name="arrow-right" :size="14" />
                        <span class="sr-only">Envoyer {{ ticket.reference }} vers</span>
                        <select
                            class="select select-sm"
                            :disabled="moving === ticket.id"
                            @change="onSelect(ticket, $event)"
                        >
                            <option value="">Envoyer vers…</option>
                            <option v-for="status in targets" :key="status.code" :value="status.code">
                                {{ status.label }}
                            </option>
                        </select>
                    </label>
                </template>
            </TicketTable>
        </div>
    </div>
</template>

<style scoped>
.send-to {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-brand-600);
}

.send-to select {
    width: auto;
    min-height: 28px;
    padding-top: 2px;
    padding-bottom: 2px;
}
</style>
