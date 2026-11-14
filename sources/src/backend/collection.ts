import { joinPath, type FileInfo, type FileStore } from '@/storage/FileStore';

interface Entry<T> {
    record: T;
    info: FileInfo;
}

/** Records are stored as "<id>.json". Other files (conflict copies...) are ignored. */
const RECORD_FILE = /^(\d+)\.json$/;

/**
 * Records of one folder (one JSON file per record), kept in memory.
 *
 * - sync() reads the files changed since the previous call (modification
 *   date or size), so that the changes made by the other users show up;
 * - mutate() re-reads the file from the disk before applying a change, so
 *   that a change never overwrites a more recent change of somebody else
 *   with stale data (the screens send only the fields they change).
 */
export class Collection<T extends { id: number }> {
    private readonly entries = new Map<number, Entry<T>>();
    private loaded = false;
    private syncing: Promise<boolean> | null = null;

    constructor(
        private readonly store: FileStore,
        readonly directory: string,
    ) {}

    get isLoaded(): boolean {
        return this.loaded;
    }

    all(): T[] {
        return [...this.entries.values()].map((entry) => entry.record);
    }

    get(id: number): T | undefined {
        return this.entries.get(id)?.record;
    }

    has(id: number): boolean {
        return this.entries.has(id);
    }

    get size(): number {
        return this.entries.size;
    }

    /** Load the folder the first time, then only what changed. True when something changed. */
    sync(): Promise<boolean> {
        // Concurrent callers share the same read.
        this.syncing ??= this.readChanges().finally(() => {
            this.syncing = null;
        });

        return this.syncing;
    }

    /** Load the folder if it has never been read. */
    async ensureLoaded(): Promise<void> {
        if (!this.loaded) await this.sync();
    }

    /** Read one record from the disk (ignoring the memory), null when it does not exist. */
    async fresh(id: number): Promise<T | null> {
        const file = await this.store.readText(this.path(id));

        if (!file) {
            this.entries.delete(id);

            return null;
        }

        const record = parse<T>(file.text);
        if (!record) return this.get(id) ?? null;

        this.entries.set(id, { record, info: file.info });

        return record;
    }

    async save(record: T): Promise<T> {
        const info = await this.store.writeText(this.path(record.id), `${JSON.stringify(record, null, 2)}\n`);
        this.entries.set(record.id, { record, info });

        return record;
    }

    /**
     * Read-modify-write of one record. The callback receives the record as
     * currently stored on the disk and changes it in place.
     */
    async mutate(id: number, change: (record: T) => void): Promise<T | null> {
        const record = await this.fresh(id);
        if (!record) return null;

        change(record);

        return this.save(record);
    }

    async remove(id: number): Promise<void> {
        await this.store.remove(this.path(id));
        this.entries.delete(id);
    }

    private path(id: number): string {
        return joinPath(this.directory, `${id}.json`);
    }

    private async readChanges(): Promise<boolean> {
        const files = await this.store.listFiles(this.directory);
        const seen = new Set<number>();
        const changed: FileInfo[] = [];

        for (const info of files) {
            const match = RECORD_FILE.exec(info.name);
            if (!match) continue;

            const id = Number(match[1]);
            seen.add(id);

            const known = this.entries.get(id)?.info;
            if (!known || known.lastModified !== info.lastModified || known.size !== info.size) changed.push(info);
        }

        let modified = false;

        for (const id of [...this.entries.keys()]) {
            if (!seen.has(id)) {
                this.entries.delete(id);
                modified = true;
            }
        }

        // Read the changed files in parallel, by batches (network shares).
        for (let start = 0; start < changed.length; start += 32) {
            const batch = changed.slice(start, start + 32);
            const results = await Promise.all(
                batch.map((info) => this.store.readText(joinPath(this.directory, info.name))),
            );

            results.forEach((file, index) => {
                const id = Number(RECORD_FILE.exec(batch[index].name)?.[1]);
                const record = file ? parse<T>(file.text) : null;

                // A file being written or synchronised may be unreadable for a
                // moment: the previous version is kept, it is read again later.
                if (file && record && record.id === id) {
                    this.entries.set(id, { record, info: file.info });
                    modified = true;
                }
            });
        }

        this.loaded = true;

        return modified;
    }
}

function parse<T>(text: string): T | null {
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}
