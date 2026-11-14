/**
 * Minimal file system used by the data layer.
 *
 * Paths are relative to the data folder and use "/" as separator, e.g.
 * "tickets/1763140000123.json". The application never reads or writes
 * anything outside this folder.
 */

/** Metadata of a file, used to detect the changes made by other users. */
export interface FileInfo {
    /** File name (last path segment). */
    name: string;
    /** Last modification, in milliseconds since the epoch. */
    lastModified: number;
    /** Size in bytes. */
    size: number;
}

export interface TextFile {
    text: string;
    info: FileInfo;
}

export interface FileStore {
    /** Human readable name of the folder (shown in the interface). */
    readonly name: string;

    /** Content and metadata of a text file, null when it does not exist. */
    readText(path: string): Promise<TextFile | null>;

    /** Write (create or replace) a text file, creating the missing folders. */
    writeText(path: string, content: string): Promise<FileInfo>;

    /** Binary content of a file, null when it does not exist. */
    readBlob(path: string): Promise<Blob | null>;

    /** Write (create or replace) a binary file, creating the missing folders. */
    writeBlob(path: string, content: Blob): Promise<void>;

    /** Files (not folders) of a folder; an empty list when the folder does not exist. */
    listFiles(directory: string): Promise<FileInfo[]>;

    /** Sub-folders of a folder; an empty list when the folder does not exist. */
    listDirectories(directory: string): Promise<string[]>;

    /** Delete a file or a folder (with its content). No error when it does not exist. */
    remove(path: string): Promise<void>;
}

/** Split "a/b/c.json" into its segments, rejecting any attempt to leave the folder. */
export function splitPath(path: string): string[] {
    const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');

    if (segments.some((segment) => segment === '..' || segment.includes('\\'))) {
        throw new Error(`Chemin invalide : ${path}`);
    }

    return segments;
}

/** Join path segments with "/". */
export function joinPath(...segments: (string | number)[]): string {
    return segments.map(String).filter(Boolean).join('/');
}
