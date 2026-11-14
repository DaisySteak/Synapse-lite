/**
 * Connection to the data folder.
 *
 * The HTML file cannot open its "data" folder by itself: the browser asks
 * the user to pick it once, then remembers it (see storage/directoryHandle).
 */
import { Backend, setBackend } from '@/backend/Backend';
import { ApiError } from '@/backend/errors';
import { initializeFolder, readMarker } from '@/backend/seed';
import {
    forgetHandle,
    hasMarker,
    isEmptyFolder,
    isFileSystemAccessSupported,
    loadSavedHandle,
    pickDataFolder,
    queryAccess,
    requestAccess,
    saveHandle,
} from '@/storage/directoryHandle';
import { FileSystemAccessStore } from '@/storage/FileSystemAccessStore';

export type ConnectionStatus =
    /** The browser has no File System Access API (Firefox, Safari...). */
    | 'unsupported'
    /** No folder chosen yet. */
    | 'no-folder'
    /** Folder known, the browser asks to confirm the access (click needed). */
    | 'permission'
    /** Empty folder chosen: it can be initialised. */
    | 'empty-folder'
    | 'connected';

export interface ConnectionState {
    status: ConnectionStatus;
    folderName: string | null;
}

let pending: FileSystemDirectoryHandle | null = null;

async function open(handle: FileSystemDirectoryHandle): Promise<ConnectionState> {
    setBackend(await Backend.open(new FileSystemAccessStore(handle)));
    await saveHandle(handle);
    pending = null;

    return { status: 'connected', folderName: handle.name };
}

export const connectionApi = {
    /** At start-up: reconnect silently when the browser still grants the access. */
    async restore(): Promise<ConnectionState> {
        if (!isFileSystemAccessSupported()) return { status: 'unsupported', folderName: null };

        const handle = await loadSavedHandle();
        if (!handle) return { status: 'no-folder', folderName: null };

        pending = handle;
        if ((await queryAccess(handle)) !== 'granted') return { status: 'permission', folderName: handle.name };

        try {
            return await open(handle);
        } catch {
            // Folder moved, renamed or no longer a data folder: choose it again.
            return { status: 'no-folder', folderName: null };
        }
    },

    /** Confirm the access to the known folder (must follow a click). */
    async allow(): Promise<ConnectionState> {
        if (!pending) return { status: 'no-folder', folderName: null };

        if ((await requestAccess(pending)) !== 'granted') {
            return { status: 'permission', folderName: pending.name };
        }

        return open(pending);
    },

    /** Let the user pick the folder (must follow a click). */
    async choose(): Promise<ConnectionState | null> {
        const handle = await pickDataFolder();
        if (!handle) return null;

        if (await hasMarker(handle)) return open(handle);

        if (await isEmptyFolder(handle)) {
            pending = handle;

            return { status: 'empty-folder', folderName: handle.name };
        }

        throw new ApiError(
            409,
            `Le dossier « ${handle.name} » n'est pas un dossier de données Synapse Lite. ` +
                'Choisissez le dossier « data » placé à côté du fichier Synapse Lite.html.',
        );
    },

    /** Create the initial data (types and team accounts) in the empty folder chosen. */
    async initialize(): Promise<ConnectionState> {
        if (!pending) return { status: 'no-folder', folderName: null };

        const store = new FileSystemAccessStore(pending);
        if (!(await readMarker(store))) await initializeFolder(store);

        return open(pending);
    },

    /** Forget the folder (to choose another one). */
    async forget(): Promise<void> {
        setBackend(null);
        pending = null;
        await forgetHandle();
    },
};
