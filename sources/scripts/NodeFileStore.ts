/**
 * FileStore on the local disk, for the command line scripts (the application
 * itself uses FileSystemAccessStore in the browser).
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { splitPath, type FileInfo, type FileStore, type TextFile } from '../src/storage/FileStore';

export class NodeFileStore implements FileStore {
    readonly name: string;

    constructor(private readonly root: string) {
        this.name = basename(resolve(root));
    }

    async readText(path: string): Promise<TextFile | null> {
        const file = this.resolve(path);
        try {
            return { text: await readFile(file, 'utf8'), info: await this.info(file) };
        } catch (error) {
            if (isNotFound(error)) return null;
            throw error;
        }
    }

    async writeText(path: string, content: string): Promise<FileInfo> {
        const file = this.resolve(path);
        await this.writeAtomically(file, content);

        return this.info(file);
    }

    async readBlob(path: string): Promise<Blob | null> {
        try {
            return new Blob([await readFile(this.resolve(path))]);
        } catch (error) {
            if (isNotFound(error)) return null;
            throw error;
        }
    }

    async writeBlob(path: string, content: Blob): Promise<void> {
        await this.writeAtomically(this.resolve(path), Buffer.from(await content.arrayBuffer()));
    }

    async listFiles(directory: string): Promise<FileInfo[]> {
        const folder = this.resolve(directory);
        const entries = await this.entries(folder);

        return Promise.all(
            entries.filter((entry) => entry.isFile()).map((entry) => this.info(join(folder, entry.name))),
        );
    }

    async listDirectories(directory: string): Promise<string[]> {
        const entries = await this.entries(this.resolve(directory));

        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    }

    async remove(path: string): Promise<void> {
        await rm(this.resolve(path), { recursive: true, force: true });
    }

    private resolve(path: string): string {
        return join(this.root, ...splitPath(path));
    }

    private async entries(folder: string) {
        try {
            return await readdir(folder, { withFileTypes: true });
        } catch (error) {
            if (isNotFound(error)) return [];
            throw error;
        }
    }

    private async info(file: string): Promise<FileInfo> {
        const stats = await stat(file);

        return { name: basename(file), lastModified: stats.mtimeMs, size: stats.size };
    }

    /** Same guarantee as the browser: readers never see a half-written file. */
    private async writeAtomically(file: string, content: string | Buffer): Promise<void> {
        await mkdir(dirname(file), { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        await writeFile(temporary, content);
        await rename(temporary, file);
    }
}

function isNotFound(error: unknown): boolean {
    return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}
