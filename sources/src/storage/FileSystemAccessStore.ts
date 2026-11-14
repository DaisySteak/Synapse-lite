import { splitPath, type FileInfo, type FileStore, type TextFile } from './FileStore';

/**
 * FileStore backed by the File System Access API of Chrome / Edge: the user
 * picks the "data" folder once, the browser then reads and writes in it
 * directly (local disk, network share or folder synchronised by OneDrive).
 *
 * Writes go through createWritable(): the browser writes a temporary file and
 * replaces the target when the stream is closed, so that the other users
 * never read a half-written JSON file.
 */
export class FileSystemAccessStore implements FileStore {
    /** Folder handles already resolved, by path. */
    private readonly directories = new Map<string, Promise<FileSystemDirectoryHandle>>();

    constructor(private readonly root: FileSystemDirectoryHandle) {}

    get name(): string {
        return this.root.name;
    }

    async readText(path: string): Promise<TextFile | null> {
        const file = await this.getFile(path);
        if (!file) return null;

        return { text: await file.text(), info: toInfo(file) };
    }

    async writeText(path: string, content: string): Promise<FileInfo> {
        const handle = await this.fileHandle(path, true);
        await write(handle, content);

        return toInfo(await handle.getFile());
    }

    async readBlob(path: string): Promise<Blob | null> {
        return this.getFile(path);
    }

    async writeBlob(path: string, content: Blob): Promise<void> {
        await write(await this.fileHandle(path, true), content);
    }

    async listFiles(directory: string): Promise<FileInfo[]> {
        const folder = await this.directory(directory, false);
        if (!folder) return [];

        const files: Promise<File>[] = [];
        for await (const entry of folder.values()) {
            if (entry.kind === 'file') files.push((entry as FileSystemFileHandle).getFile());
        }

        // A file deleted while listing (another user) is simply skipped.
        const settled = await Promise.allSettled(files);

        return settled.flatMap((result) => (result.status === 'fulfilled' ? [toInfo(result.value)] : []));
    }

    async listDirectories(directory: string): Promise<string[]> {
        const folder = await this.directory(directory, false);
        if (!folder) return [];

        const names: string[] = [];
        for await (const entry of folder.values()) {
            if (entry.kind === 'directory') names.push(entry.name);
        }

        return names;
    }

    async remove(path: string): Promise<void> {
        const segments = splitPath(path);
        const name = segments.pop();
        if (!name) return;

        const parent = await this.directory(segments.join('/'), false);
        if (!parent) return;

        try {
            await parent.removeEntry(name, { recursive: true });
        } catch (error) {
            if (!isNotFound(error)) throw error;
        }

        // Forget the cached handles of the removed folder and its children.
        for (const key of this.directories.keys()) {
            if (key === path || key.startsWith(`${path}/`)) this.directories.delete(key);
        }
    }

    private async getFile(path: string): Promise<File | null> {
        try {
            const handle = await this.fileHandle(path, false);

            return handle ? await handle.getFile() : null;
        } catch (error) {
            if (isNotFound(error)) return null;
            throw error;
        }
    }

    private async fileHandle(path: string, create: true): Promise<FileSystemFileHandle>;
    private async fileHandle(path: string, create: false): Promise<FileSystemFileHandle | null>;
    private async fileHandle(path: string, create: boolean): Promise<FileSystemFileHandle | null> {
        const segments = splitPath(path);
        const name = segments.pop();
        if (!name) throw new Error(`Chemin de fichier invalide : ${path}`);

        const folder = await this.directory(segments.join('/'), create);
        if (!folder) return null;

        try {
            return await folder.getFileHandle(name, { create });
        } catch (error) {
            if (!create && isNotFound(error)) return null;
            throw error;
        }
    }

    /** Handle of a folder, created when asked; null when it does not exist. */
    private async directory(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
        const segments = splitPath(path);
        if (segments.length === 0) return this.root;

        const key = segments.join('/');
        const cached = this.directories.get(key);
        if (cached) return cached;

        const resolving = (async () => {
            let folder = this.root;
            for (const segment of segments) folder = await folder.getDirectoryHandle(segment, { create });

            return folder;
        })();

        try {
            const folder = await resolving;
            this.directories.set(key, Promise.resolve(folder));

            return folder;
        } catch (error) {
            if (!create && isNotFound(error)) return null;
            throw error;
        }
    }
}

async function write(handle: FileSystemFileHandle, content: string | Blob): Promise<void> {
    const stream = await handle.createWritable();

    try {
        await stream.write(content);
        await stream.close();
    } catch (error) {
        await stream.abort().catch(() => undefined);
        throw error;
    }
}

function toInfo(file: File): FileInfo {
    return { name: file.name, lastModified: file.lastModified, size: file.size };
}

function isNotFound(error: unknown): boolean {
    return error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');
}
