/**
 * Attachments (port of App\Services\Attachments\AttachmentService).
 *
 * The metadata of an attachment is a JSON file, the content is stored as a
 * regular file with its original name, so that the folder stays readable:
 *   attachments/<ticket id>/<id>.json
 *   attachments/<ticket id>/<id>/<file name>
 */
import { joinPath } from '@/storage/FileStore';
import { nowIso } from '../clock';
import type { Database } from '../database';
import { notFound, validationError, type FieldErrors } from '../errors';
import { uniqueId } from '../ids';
import type { Actor } from '../permissions';
import type { AttachmentRecord } from '../records';
import { FORBIDDEN_EXTENSIONS, SETTINGS } from '../reference';
import type { ActivityRecorder } from './ActivityRecorder';
import type { TicketService } from './TicketService';

/** Maximum number of files sent at once (Synapse: files max:10). */
export const MAX_FILES = 10;

export class AttachmentService {
    /** Ticket of every attachment met so far (deletion by attachment id). */
    private readonly owners = new Map<number, number>();

    constructor(
        private readonly db: Database,
        private readonly activities: ActivityRecorder,
        private readonly tickets: TicketService,
    ) {}

    /** Check the files before any write (size, forbidden types, count). */
    validate(files: File[], field = 'files'): void {
        const errors: FieldErrors = {};

        if (files.length > MAX_FILES)
            errors[field] = [`Le champ fichiers ne peut contenir plus de ${MAX_FILES} éléments.`];

        files.forEach((file, index) => {
            const extension = file.name.includes('.') ? (file.name.split('.').pop() ?? '').toLowerCase() : '';

            if (FORBIDDEN_EXTENSIONS.includes(extension)) {
                errors[`${field}.${index}`] = ["Ce type de fichier n'est pas autorisé."];
            } else if (file.size > SETTINGS.attachment_max_size_kb * 1024) {
                errors[`${field}.${index}`] = [
                    `Le fichier ${file.name} ne peut dépasser ${SETTINGS.attachment_max_size_kb} kilo-octets.`,
                ];
            }
        });

        if (Object.keys(errors).length > 0) throw validationError(errors);
    }

    /** Attachments of a ticket (its own ones and those of its comments). */
    async list(ticketId: number): Promise<AttachmentRecord[]> {
        const collection = this.db.attachments(ticketId);
        await collection.sync();

        const attachments = collection.all().sort((a, b) => a.id - b.id);
        attachments.forEach((attachment) => this.owners.set(attachment.id, ticketId));

        return attachments;
    }

    async attach(
        ticketId: number,
        file: File,
        actor: Actor,
        commentId: number | null = null,
    ): Promise<AttachmentRecord> {
        const id = uniqueId();
        const attachment: AttachmentRecord = {
            id,
            ticket_id: ticketId,
            comment_id: commentId,
            original_name: file.name.slice(0, 255),
            mime_type: (file.type || 'application/octet-stream').slice(0, 150),
            size_bytes: file.size,
            path: joinPath('attachments', ticketId, id, safeFileName(file.name)),
            uploaded_by: actor.id,
            created_at: nowIso(),
        };

        // Content first: the metadata never points to a missing file.
        await this.db.store.writeBlob(attachment.path, file);
        await this.db.attachments(ticketId).save(attachment);
        this.owners.set(id, ticketId);

        await this.activities.record(ticketId, 'attachment_added', actor.id, { name: attachment.original_name });
        await this.tickets.refreshCounters(ticketId);

        return attachment;
    }

    /** Attachment by id (it must have been listed before, see list()). */
    find(id: number): AttachmentRecord {
        const ticketId = this.owners.get(id);
        const attachment = ticketId !== undefined ? this.db.attachments(ticketId).get(id) : undefined;
        if (!attachment) throw notFound();

        return attachment;
    }

    async remove(attachment: AttachmentRecord, actor: Actor): Promise<void> {
        await this.db.attachments(attachment.ticket_id).remove(attachment.id);
        await this.db.store.remove(joinPath('attachments', attachment.ticket_id, attachment.id));
        this.owners.delete(attachment.id);

        await this.activities.record(attachment.ticket_id, 'attachment_removed', actor.id, {
            name: attachment.original_name,
        });
        await this.tickets.refreshCounters(attachment.ticket_id);
    }

    /** Content of the attachment. */
    async content(attachment: AttachmentRecord): Promise<Blob> {
        const blob = await this.db.store.readBlob(attachment.path);
        if (!blob) throw notFound();

        return blob;
    }
}

/** File name accepted by Windows and by OneDrive / SharePoint. */
export function safeFileName(name: string): string {
    const cleaned = name
        // Characters refused by Windows, plus "#" and "%" refused by SharePoint.
        // eslint-disable-next-line no-control-regex
        .replace(/[<>:"/\\|?*#%\u0000-\u001f]/g, '_')
        .replace(/[. ]+$/g, '')
        .trim();
    const base = cleaned === '' ? 'fichier' : cleaned;

    if (base.length <= 150) return base;

    const dot = base.lastIndexOf('.');
    const extension = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : '';

    return base.slice(0, 150 - extension.length) + extension;
}
