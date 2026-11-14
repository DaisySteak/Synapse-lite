import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { connectionApi, type ConnectionState, type ConnectionStatus } from '@/api/connection';

/**
 * State of the connection to the data folder, shown by the connection
 * screen (ConnectView) and checked by the router before any other screen.
 */
export const useConnectionStore = defineStore('connection', () => {
    const status = ref<ConnectionStatus | null>(null);
    const folderName = ref<string | null>(null);
    const busy = ref(false);

    const isConnected = computed(() => status.value === 'connected');

    function apply(state: ConnectionState): void {
        status.value = state.status;
        folderName.value = state.folderName;
    }

    async function run(operation: () => Promise<ConnectionState | null>): Promise<void> {
        busy.value = true;

        try {
            const state = await operation();
            if (state) apply(state);
        } finally {
            busy.value = false;
        }
    }

    /** At start-up, once. */
    async function restore(): Promise<void> {
        if (status.value === null) await run(connectionApi.restore);
    }

    const allow = () => run(connectionApi.allow);
    const choose = () => run(connectionApi.choose);
    const initialize = () => run(connectionApi.initialize);

    async function forget(): Promise<void> {
        await connectionApi.forget();
        apply({ status: 'no-folder', folderName: null });
    }

    return { status, folderName, busy, isConnected, restore, allow, choose, initialize, forget };
});
