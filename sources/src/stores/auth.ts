import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi, normalizeLogin } from '@/api/auth';
import { errorMessage, fieldErrors } from '@/api/errors';
import type { CurrentUser, Permission } from '@/types/models';

/**
 * Signed-in user and permissions.
 *
 * The interface only relies on permissions (never on profiles), exactly as
 * in Synapse.
 */
export const useAuthStore = defineStore('auth', () => {
    const user = ref<CurrentUser | null>(null);
    const initialized = ref(false);

    const isAuthenticated = computed(() => user.value !== null);

    function can(permission: Permission): boolean {
        return user.value?.permissions.includes(permission) ?? false;
    }

    const isAdmin = computed(() =>
        (['admin.users', 'admin.epics', 'admin.requesters', 'admin.custom_fields'] as Permission[]).some(can),
    );

    /** Restore the session at start-up (no error when not signed in). */
    async function initialize(): Promise<void> {
        if (initialized.value) return;

        try {
            user.value = await authApi.me();
        } catch {
            user.value = null;
        } finally {
            initialized.value = true;
        }
    }

    async function login(login: string, remember: boolean): Promise<void> {
        user.value = await authApi.login(login, remember);
        initialized.value = true;
    }

    /**
     * Automatic sign-in with the Windows account given by the launcher. A
     * session already open with this account is kept; an unknown account
     * leaves the sign-in screen, pre-filled, with the reason.
     *
     * @return the reason of the failure, or null
     */
    async function loginFromLauncher(value: string): Promise<string | null> {
        await initialize();
        if (user.value && user.value.login === normalizeLogin(value)) return null;

        try {
            await login(value, true);
            return null;
        } catch (error) {
            // Another Windows account: the previous session must not stay open.
            await authApi.logout().catch(() => undefined);
            user.value = null;
            return fieldErrors(error).login ?? errorMessage(error);
        }
    }

    async function logout(): Promise<void> {
        try {
            await authApi.logout();
        } finally {
            clear();
        }
    }

    /** Reload the profile and permissions (changed by an administrator). */
    async function refresh(): Promise<void> {
        user.value = await authApi.me();
    }

    function clear(): void {
        user.value = null;
    }

    /** Forget everything (another data folder is connected). */
    function reset(): void {
        user.value = null;
        initialized.value = false;
    }

    return {
        user,
        initialized,
        isAuthenticated,
        isAdmin,
        can,
        initialize,
        login,
        loginFromLauncher,
        logout,
        refresh,
        clear,
        reset,
    };
});
