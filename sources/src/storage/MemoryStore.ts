import { blobBytes } from '@/utils/blob';
import { joinPath, splitPath, type FileInfo, type FileStore, type TextFile } from './FileStore';

/** Shared by every store, as a real disk clock would be. */
let clock = 0;

interface MemoryFile {
    content: Blob | string;
    lastModified: number;
}

/**
 * In-memory FileStore, used by the unit tests. Several stores can share the
 * same files to simulate several users working on the same folder.
 */
export class MemoryStore implements FileStore {
    readonly name = 'data';

    constructor(readonly files: Map<string, MemoryFile> = new Map()) {}

    async readText(path: string): Promise<TextFile | null> {
        const key = normalize(path);
        const file = this.files.get(key);
        if (!file) return null;

        const text =
            typeof file.content === 'string' ? file.content : new TextDecoder().decode(await blobBytes(file.content));

        return { text, info: this.info(key, file) };
    }

    async writeText(path: string, content: string): Promise<FileInfo> {
        const key = normalize(path);
        const file = { content, lastModified: this.tick() };
        this.files.set(key, file);

        return this.info(key, file);
    }

    async readBlob(path: string): Promise<Blob | null> {
        const file = this.files.get(normalize(path));
        if (!file) return null;

        return typeof file.content === 'string' ? new Blob([file.content]) : file.content;
    }

    async writeBlob(path: string, content: Blob): Promise<void> {
        this.files.set(normalize(path), { content, lastModified: this.tick() });
    }

    async listFiles(directory: string): Promise<FileInfo[]> {
        const prefix = withSlash(directory);

        return [...this.files.entries()]
            .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
            .map(([key, file]) => this.info(key, file));
    }

    async listDirectories(directory: string): Promise<string[]> {
        const prefix = withSlash(directory);
        const names = new Set<string>();

        for (const key of this.files.keys()) {
            if (!key.startsWith(prefix)) continue;
            const rest = key.slice(prefix.length).split('/');
            if (rest.length > 1) names.add(rest[0]);
        }

        return [...names];
    }

    async remove(path: string): Promise<void> {
        const key = normalize(path);
        for (const existing of [...this.files.keys()]) {
            if (existing === key || existing.startsWith(`${key}/`)) this.files.delete(existing);
        }
    }

    /** Strictly increasing modification times, even within the same millisecond. */
    private tick(): number {
        clock = Math.max(clock + 1, Date.now());

        return clock;
    }

    private info(key: string, file: MemoryFile): FileInfo {
        const size =
            typeof file.content === 'string' ? new TextEncoder().encode(file.content).length : file.content.size;

        return { name: key.split('/').pop() ?? key, lastModified: file.lastModified, size };
    }
}

function normalize(path: string): string {
    return joinPath(...splitPath(path));
}

function withSlash(directory: string): string {
    const normalized = normalize(directory);

    return normalized === '' ? '' : `${normalized}/`;
}
