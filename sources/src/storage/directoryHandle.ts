/**
 * Access to the "data" folder chosen by the user.
 *
 * The browser cannot open a folder by its path: the user picks it once with
 * the folder picker, the handle is then kept in IndexedDB so that the next
 * visits only have to confirm the access (Chrome can also remember it, with
 * the "Autoriser à chaque visite" option of its permission prompt).
 */

const DATABASE = 'synapse-lite';
const STORE = 'handles';
const KEY = 'data-folder';

/** Name of the data folder, next to the HTML file. */
export const DATA_FOLDER_NAME = 'data';

/** File identifying a Synapse Lite data folder. */
export const MARKER_FILE = 'synapse-lite.json';

export type AccessState = 'granted' | 'prompt' | 'denied';

/** True when the browser supports the File System Access API (Chrome, Edge). */
export function isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Folder chosen during a previous visit, if any. */
export async function loadSavedHandle(): Promise<FileSystemDirectoryHandle | null> {
    try {
        const db = await openDatabase();
        const handle = await request<FileSystemDirectoryHandle | undefined>(
            db.transaction(STORE).objectStore(STORE).get(KEY),
        );
        db.close();

        return handle ?? null;
    } catch {
        return null;
    }
}

export async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    try {
        const db = await openDatabase();
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(handle, KEY);
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    } catch {
        // Without IndexedDB the folder is simply asked again at the next visit.
    }
}

export async function forgetHandle(): Promise<void> {
    try {
        const db = await openDatabase();
        db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY);
        db.close();
    } catch {
        // Nothing to forget.
    }
}

/** Current read/write permission on the folder, without prompting. */
export async function queryAccess(handle: FileSystemDirectoryHandle): Promise<AccessState> {
    return handle.queryPermission({ mode: 'readwrite' });
}

/** Ask the read/write permission; must be called from a user gesture (click). */
export async function requestAccess(handle: FileSystemDirectoryHandle): Promise<AccessState> {
    return handle.requestPermission({ mode: 'readwrite' });
}

/**
 * Let the user pick the data folder. Returns null when the picker is
 * cancelled. Picking the folder that contains "data" (the folder of the
 * HTML file) is accepted too.
 */
export async function pickDataFolder(): Promise<FileSystemDirectoryHandle | null> {
    let picked: FileSystemDirectoryHandle;

    try {
        picked = await window.showDirectoryPicker({ id: 'synapse-lite-data', mode: 'readwrite' });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return null;
        throw error;
    }

    if (picked.name === DATA_FOLDER_NAME || (await hasMarker(picked))) return picked;

    try {
        return await picked.getDirectoryHandle(DATA_FOLDER_NAME);
    } catch {
        return picked;
    }
}

/** True when the folder holds the Synapse Lite marker file. */
export async function hasMarker(folder: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        await folder.getFileHandle(MARKER_FILE);

        return true;
    } catch {
        return false;
    }
}

/** True when the folder holds no file nor sub-folder. */
export async function isEmptyFolder(folder: FileSystemDirectoryHandle): Promise<boolean> {
    for await (const entry of folder.values()) {
        // Hidden files created by the operating system do not count.
        if (!entry.name.startsWith('.') && entry.name.toLowerCase() !== 'desktop.ini') return false;
    }

    return true;
}

function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(DATABASE, 1);
        open.onupgradeneeded = () => open.result.createObjectStore(STORE);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
    });
}

function request<T>(req: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
    });
}
