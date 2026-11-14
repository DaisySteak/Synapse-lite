/**
 * Bulk operations on the whole data folder (administrators, page "Gestion
 * des données"): reassignment of tickets, backup, restoration and reset.
 *
 * Restoration and reset follow the same order as the initialisation of a
 * folder: the marker file (synapse-lite.json) is removed first and written
 * last, so that a folder with a marker is always complete. When the
 * operation is interrupted, the folder is refused by the application and the
 * backup can simply be restored again.
 */
import { MARKER_FILE } from '@/storage/directoryHandle';
import type { ReassignField } from '@/types/models';
import { joinPath, splitPath, type FileStore } from '@/storage/FileStore';
import { blobBytes } from '@/utils/blob';
import type { ZipEntry } from '@/utils/zip';
import { nowIso } from '../clock';
import type { Database } from '../database';
import { ApiError } from '../errors';
import type { Actor } from '../permissions';
import {
    SCHEMA_VERSION,
    type ActivityRecord,
    type AttachmentRecord,
    type CommentRecord,
    type MarkerRecord,
    type TicketRecord,
} from '../records';
import { initializeFolder } from '../seed';
import type { TicketService } from './TicketService';

const COLUMNS = { owner: 'owner_id', epic: 'epic_id', requester: 'requester_id' } as const;

/** Name of the folder holding the files inside a backup archive. */
export const BACKUP_FOLDER = 'data';

/** Content of a backup archive, checked. */
export interface BackupContent {
    marker: MarkerRecord;
    /** Text of the marker file, written back as is. */
    markerText: string;
    /** Files other than the marker, path relative to the data folder. */
    files: { path: string; data: Uint8Array }[];
}

/** Files left by the archiving tools, never restored. */
const IGNORED = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;

export class DataService {
    constructor(
        private readonly db: Database,
        private readonly tickets: TicketService,
    ) {}

    private get store(): FileStore {
        return this.db.store;
    }

    // --- Reassignment ---------------------------------------------------------

    /** Tickets (not deleted) and recurring tickets having this value. */
    async reassignCounts(field: ReassignField, fromId: number): Promise<{ tickets: number; recurring: number }> {
        await Promise.all([this.db.tickets.sync(), this.db.recurringTickets.sync()]);
        const column = COLUMNS[field];

        return {
            tickets: this.db.activeTickets().filter((ticket) => ticket[column] === fromId).length,
            recurring: this.db.recurringTickets.all().filter((template) => template[column] === fromId).length,
        };
    }

    /**
     * Give another owner, type or requester to every ticket (not deleted) and
     * every recurring ticket having the first one. Each ticket goes through
     * the usual update: its history shows the change and, for a change of
     * type, it gets a new number in the new type.
     *
     * @return number of tickets and recurring tickets changed
     */
    async reassign(
        field: ReassignField,
        fromId: number,
        toId: number,
        actor: Actor,
    ): Promise<{ tickets: number; recurring: number }> {
        await Promise.all([this.db.tickets.sync(), this.db.recurringTickets.sync()]);
        const column = COLUMNS[field];
        const tickets = this.db.activeTickets().filter((ticket) => ticket[column] === fromId);
        const templates = this.db.recurringTickets.all().filter((template) => template[column] === fromId);

        for (const ticket of tickets) {
            await this.tickets.update(ticket.id, { [column]: toId }, actor);
        }

        for (const template of templates) {
            await this.db.recurringTickets.mutate(template.id, (record) => {
                record[column] = toId;
                if (field === 'owner') record.supporter_ids = record.supporter_ids.filter((id) => id !== toId);
                record.updated_by = actor.id;
                record.updated_at = nowIso();
            });
        }

        return { tickets: tickets.length, recurring: templates.length };
    }

    // --- Reading everything -----------------------------------------------------

    /** Comments, history entries and attachments of every ticket (deleted ones included). */
    async ticketChildren(): Promise<{
        comments: CommentRecord[];
        activities: ActivityRecord[];
        attachments: AttachmentRecord[];
    }> {
        const read = async <T>(kind: 'comments' | 'activities' | 'attachments'): Promise<T[]> => {
            const records: T[] = [];

            for (const directory of await this.store.listDirectories(kind)) {
                if (!/^\d+$/.test(directory)) continue;

                const collection = this.db[kind](Number(directory));
                await collection.sync();
                records.push(...(collection.all() as T[]));
            }

            return records;
        };

        const [comments, activities, attachments] = await Promise.all([
            read<CommentRecord>('comments'),
            read<ActivityRecord>('activities'),
            read<AttachmentRecord>('attachments'),
        ]);

        return { comments, activities, attachments };
    }

    /** Every ticket, deleted ones included. */
    async allTickets(): Promise<TicketRecord[]> {
        await this.db.tickets.sync();

        return this.db.tickets.all();
    }

    // --- Backup and restoration -------------------------------------------------

    /** Every file of the data folder, as archive entries "data/…". */
    async backup(): Promise<ZipEntry[]> {
        const entries: ZipEntry[] = [];

        for (const path of await this.listFiles('')) {
            const blob = await this.store.readBlob(path);
            if (blob) entries.push({ name: joinPath(BACKUP_FOLDER, path), data: await blobBytes(blob) });
        }

        return entries;
    }

    /**
     * Check the content of a backup archive: it must hold a Synapse Lite
     * marker written by this version or an older one. The files may be at
     * the root of the archive or in a folder (the "data" folder of the
     * backups, or any folder after a manual re-zip).
     */
    static readBackup(entries: ZipEntry[]): BackupContent {
        const markers = entries
            .filter((entry) => !IGNORED.test(entry.name))
            .filter((entry) => entry.name === MARKER_FILE || entry.name.endsWith(`/${MARKER_FILE}`))
            .sort((a, b) => a.name.length - b.name.length);
        const markerEntry = markers[0];

        if (!markerEntry) {
            throw new ApiError(
                422,
                "Cette archive n'est pas une sauvegarde Synapse Lite (fichier synapse-lite.json absent).",
            );
        }

        const markerText = new TextDecoder().decode(markerEntry.data);
        let marker: MarkerRecord | null = null;

        try {
            marker = JSON.parse(markerText) as MarkerRecord;
        } catch {
            marker = null;
        }

        if (marker?.application !== 'Synapse Lite') {
            throw new ApiError(
                422,
                "Cette archive n'est pas une sauvegarde Synapse Lite (fichier synapse-lite.json illisible).",
            );
        }

        if (!(marker.schema_version <= SCHEMA_VERSION)) {
            throw new ApiError(
                422,
                'Cette sauvegarde a été faite par une version plus récente de Synapse Lite : utilisez le dernier fichier Synapse Lite.html.',
            );
        }

        const prefix = markerEntry.name.slice(0, -MARKER_FILE.length);
        const files = entries
            .filter((entry) => entry !== markerEntry && entry.name.startsWith(prefix) && !IGNORED.test(entry.name))
            .map((entry) => {
                const path = entry.name.slice(prefix.length);

                try {
                    return { path: splitPath(path).join('/'), data: entry.data };
                } catch {
                    throw new ApiError(422, `Chemin refusé dans l'archive : ${entry.name}`);
                }
            })
            .filter((file) => file.path !== '');

        return { marker, markerText, files };
    }

    /** Replace the whole content of the data folder by a backup. */
    async restore(content: BackupContent): Promise<void> {
        await this.clear();

        for (const file of content.files) {
            await this.store.writeBlob(file.path, new Blob([file.data]));
        }

        await this.store.writeText(MARKER_FILE, content.markerText);
        await this.reload();
    }

    /**
     * Remove every file of the data folder (tickets, users, ticket types...)
     * and write the initial data again: the "admin" account only.
     */
    async reset(): Promise<void> {
        await this.clear();
        await initializeFolder(this.store);
        await this.reload();
    }

    /** Empty the data folder, marker first. */
    private async clear(): Promise<void> {
        await this.store.remove(MARKER_FILE);

        for (const directory of await this.store.listDirectories('')) await this.store.remove(directory);
        for (const file of await this.store.listFiles('')) await this.store.remove(file.name);
    }

    /** Forget what was in memory and read the folder again. */
    private async reload(): Promise<void> {
        this.db.forgetTicketChildren();
        await this.db.sync();
    }

    private async listFiles(directory: string): Promise<string[]> {
        const files = (await this.store.listFiles(directory)).map((file) => joinPath(directory, file.name));

        for (const child of await this.store.listDirectories(directory)) {
            files.push(...(await this.listFiles(joinPath(directory, child))));
        }

        return files;
    }
}
