import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { TicketCard } from '@/types/models';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

export interface ConfirmRequest {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    resolve: (confirmed: boolean) => void;
}

/** Ticket just closed, whose time spent is confirmed in TimeSpentModal. */
export type ClosedTicket = Pick<
    TicketCard,
    'id' | 'reference' | 'title' | 'start_date' | 'created_at' | 'actual_end_date' | 'time_spent'
>;

/** Values proposed by the quick creation dialog (e.g. the clicked column). */
export interface QuickCreateDefaults {
    status_code?: string;
    project_id?: number;
}

const SIDEBAR_KEY = 'synapse.sidebar.collapsed';

/**
 * Global interface state: notifications, confirmation dialog, quick ticket
 * creation and sidebar.
 */
export const useUiStore = defineStore('ui', () => {
    const toasts = ref<Toast[]>([]);
    const confirmRequest = ref<ConfirmRequest | null>(null);
    const quickCreateOpen = ref(false);
    const quickCreateDefaults = ref<QuickCreateDefaults>({});
    const sidebarCollapsed = ref(localStorage.getItem(SIDEBAR_KEY) === '1');
    /** Incremented after each ticket creation so that views can refresh. */
    const ticketsVersion = ref(0);
    const closedTicket = ref<ClosedTicket | null>(null);

    let sequence = 0;

    function notify(message: string, type: ToastType = 'success', duration = 4000): void {
        const id = ++sequence;
        toasts.value.push({ id, type, message });
        window.setTimeout(() => dismiss(id), duration);
    }

    function dismiss(id: number): void {
        toasts.value = toasts.value.filter((toast) => toast.id !== id);
    }

    /** Promise based confirmation dialog. */
    function confirm(options: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
        return new Promise((resolve) => {
            confirmRequest.value = { ...options, resolve };
        });
    }

    function answerConfirm(confirmed: boolean): void {
        confirmRequest.value?.resolve(confirmed);
        confirmRequest.value = null;
    }

    function openQuickCreate(defaults: QuickCreateDefaults = {}): void {
        quickCreateDefaults.value = defaults;
        quickCreateOpen.value = true;
    }

    function toggleSidebar(): void {
        sidebarCollapsed.value = !sidebarCollapsed.value;
        localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed.value ? '1' : '0');
    }

    function ticketsChanged(): void {
        ticketsVersion.value++;
    }

    /** A ticket has just been closed: ask to confirm its time spent. */
    function confirmTimeSpent(ticket: ClosedTicket): void {
        closedTicket.value = { ...ticket };
    }

    return {
        toasts,
        confirmRequest,
        quickCreateOpen,
        quickCreateDefaults,
        sidebarCollapsed,
        ticketsVersion,
        closedTicket,
        notify,
        dismiss,
        confirm,
        answerConfirm,
        openQuickCreate,
        toggleSidebar,
        ticketsChanged,
        confirmTimeSpent,
    };
});
