import { onBeforeUnmount, onMounted } from 'vue';
import { errorMessage } from '@/api/errors';
import { backend, hasBackend, SYNC_INTERVAL_MS } from '@/backend/Backend';
import { useAuthStore } from '@/stores/auth';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';

/**
 * Near real time: every few seconds (and when the window gets the focus),
 * the changes written by the other users in the data folder are read; the
 * screens showing tickets refresh themselves (ui.ticketsVersion).
 */
export function useDataSync(): void {
    const ui = useUiStore();
    const reference = useReferenceStore();
    const auth = useAuthStore();

    let timer: number | undefined;
    let running = false;
    let failing = false;

    async function synchronize(): Promise<void> {
        if (running || document.visibilityState !== 'visible' || !hasBackend()) return;

        running = true;

        try {
            const changes = await backend().sync();

            if (changes.reference) {
                await reference.load(true);
                // Profile changed or account deactivated by an administrator.
                await auth.refresh();
            }

            if (changes.tickets) ui.ticketsChanged();

            if (failing) ui.notify('Accès au dossier de données rétabli.', 'info');
            failing = false;
        } catch (error) {
            // Network or synchronisation hiccup: reported once, retried at the next tick.
            if (!failing) ui.notify(errorMessage(error), 'error', 8000);
            failing = true;
        } finally {
            running = false;
        }
    }

    const onFocus = () => void synchronize();

    onMounted(() => {
        timer = window.setInterval(onFocus, SYNC_INTERVAL_MS);
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
    });

    onBeforeUnmount(() => {
        window.clearInterval(timer);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onFocus);
    });
}
