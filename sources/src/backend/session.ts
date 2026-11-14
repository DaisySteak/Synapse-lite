/**
 * Signed-in user of this browser tab.
 *
 * There is no password: whoever can open the data folder is trusted, the
 * employee number only tells who is working. The number is kept in the
 * session storage (this tab) or, with "Rester connecté", in the local
 * storage of the browser.
 */
const KEY = 'synapse-lite.session';

function storages(): Storage[] {
    try {
        return [window.sessionStorage, window.localStorage];
    } catch {
        return [];
    }
}

export const session = {
    login(): string | null {
        for (const storage of storages()) {
            const value = storage.getItem(KEY);
            if (value) return value;
        }

        return null;
    },

    /** The session is kept by the browser ("Rester connecté"). */
    isRemembered(): boolean {
        try {
            return window.localStorage.getItem(KEY) !== null;
        } catch {
            return false;
        }
    },

    open(login: string, remember: boolean): void {
        session.close();
        const [tab, browser] = storages();
        (remember ? browser : tab)?.setItem(KEY, login);
    },

    close(): void {
        storages().forEach((storage) => storage.removeItem(KEY));
    },
};
