/**
 * Markdown comments of a ticket, with their own attachments (port of
 * TicketCommentController). One file per comment.
 */
import { nowIso } from '../clock';
import type { Database } from '../database';
import { notFound } from '../errors';
import { uniqueId } from '../ids';
import type { Actor } from '../permissions';
import type { CommentRecord } from '../records';
import type { ActivityRecorder } from './ActivityRecorder';
import type { AttachmentService } from './AttachmentService';
import type { TicketService } from './TicketService';

export class CommentService {
    /** Ticket of every comment met so far (update and deletion by comment id). */
    private readonly owners = new Map<number, number>();

    constructor(
        private readonly db: Database,
        private readonly activities: ActivityRecorder,
        private readonly attachments: AttachmentService,
        private readonly tickets: TicketService,
    ) {}

    /** Comments of a ticket, oldest first. */
    async list(ticketId: number): Promise<CommentRecord[]> {
        const collection = this.db.comments(ticketId);
        await collection.sync();

        const comments = collection.all().sort((a, b) => a.id - b.id);
        comments.forEach((comment) => this.owners.set(comment.id, ticketId));

        return comments;
    }

    find(id: number): CommentRecord {
        const ticketId = this.owners.get(id);
        const comment = ticketId !== undefined ? this.db.comments(ticketId).get(id) : undefined;
        if (!comment) throw notFound();

        return comment;
    }

    async add(ticketId: number, body: string, files: File[], actor: Actor): Promise<CommentRecord> {
        this.attachments.validate(files);

        const timestamp = nowIso();
        const comment: CommentRecord = {
            id: uniqueId(),
            ticket_id: ticketId,
            author_id: actor.id,
            body,
            created_at: timestamp,
            updated_at: timestamp,
        };

        await this.db.comments(ticketId).save(comment);
        this.owners.set(comment.id, ticketId);

        await this.activities.record(ticketId, 'comment_added', actor.id);
        await this.tickets.refreshCounters(ticketId);

        for (const file of files) await this.attachments.attach(ticketId, file, actor, comment.id);

        return comment;
    }

    async update(comment: CommentRecord, body: string, files: File[], actor: Actor): Promise<CommentRecord> {
        this.attachments.validate(files);

        const updated = await this.db.comments(comment.ticket_id).mutate(comment.id, (record) => {
            if (record.body !== body) {
                record.body = body;
                record.updated_at = nowIso();
            }
        });
        if (!updated) throw notFound();

        for (const file of files) await this.attachments.attach(comment.ticket_id, file, actor, comment.id);

        return updated;
    }

    /** Delete a comment and its attachments. */
    async remove(comment: CommentRecord, actor: Actor): Promise<void> {
        const attachments = (await this.attachments.list(comment.ticket_id)).filter(
            (attachment) => attachment.comment_id === comment.id,
        );

        for (const attachment of attachments) await this.attachments.remove(attachment, actor);

        await this.db.comments(comment.ticket_id).remove(comment.id);
        this.owners.delete(comment.id);
        await this.tickets.refreshCounters(comment.ticket_id);
    }
}
