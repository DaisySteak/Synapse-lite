import { beforeEach, describe, expect, it } from 'vitest';
import { ticketsApi } from '@/api/tickets';
import type { Backend } from '@/backend/Backend';
import { safeFileName } from '@/backend/services/AttachmentService';
import {
    LEAD,
    OTHER_USER,
    USER,
    createFolder,
    createRequester,
    openAs,
    signIn,
    statusOf,
    ticketPayload,
    validationErrorsOf,
} from './helpers';

let server: Backend;
let ticketId: number;

/** jsdom's Blob has no text() method: read it the classic way. */
function readText(blob: Blob | null): Promise<string | null> {
    if (!blob) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

function file(name: string, content = 'contenu', type = 'text/plain'): File {
    return new File([content], name, { type });
}

beforeEach(async () => {
    server = await openAs(await createFolder(), USER);
    ticketId = (await ticketsApi.create(ticketPayload(await createRequester()))).id;
});

describe('attachments', () => {
    it('stores the file with its original name next to its metadata', async () => {
        const [attachment] = await ticketsApi.uploadAttachments(ticketId, [file('Compte rendu.docx', 'abc')]);

        expect(attachment.original_name).toBe('Compte rendu.docx');
        expect(attachment.size_bytes).toBe(3);
        expect(attachment.can_delete).toBe(true);

        const record = server.db.attachments(ticketId).get(attachment.id)!;
        expect(record.path).toBe(`attachments/${ticketId}/${attachment.id}/Compte rendu.docx`);
        expect(await readText(await server.store.readBlob(record.path))).toBe('abc');

        const ticket = await ticketsApi.get(ticketId);
        expect(ticket.attachments).toHaveLength(1);
        expect((await ticketsApi.list())[0].attachments_count).toBe(1);
    });

    it('refuses executables and files that are too large', async () => {
        expect(await validationErrorsOf(ticketsApi.uploadAttachments(ticketId, [file('outil.exe')]))).toEqual([
            'files.0',
        ]);

        const big = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'gros.zip');
        expect(await validationErrorsOf(ticketsApi.uploadAttachments(ticketId, [big]))).toEqual(['files.0']);
    });

    it('deletes the content with the attachment, by its uploader or a moderator', async () => {
        const [attachment] = await ticketsApi.uploadAttachments(ticketId, [file('note.txt')]);
        const path = server.db.attachments(ticketId).get(attachment.id)!.path;

        signIn(OTHER_USER);
        await ticketsApi.get(ticketId);
        expect(await statusOf(ticketsApi.removeAttachment(attachment.id))).toBe(403);

        signIn(LEAD);
        await ticketsApi.removeAttachment(attachment.id);
        expect(await server.store.readBlob(path)).toBeNull();
        expect((await ticketsApi.get(ticketId)).attachments).toHaveLength(0);
        expect((await ticketsApi.activities(ticketId)).map((activity) => activity.event)).toContain(
            'attachment_removed',
        );
    });

    it('keeps the attachments of a comment with the comment', async () => {
        const comment = await ticketsApi.addComment(ticketId, 'Voir la pièce jointe', [
            file('capture.png', 'png', 'image/png'),
        ]);
        expect(comment.attachments.map((attachment) => attachment.original_name)).toEqual(['capture.png']);
        expect((await ticketsApi.get(ticketId)).attachments).toHaveLength(0);

        const edited = await ticketsApi.updateComment(comment.id, 'Texte corrigé', []);
        expect(edited.body).toBe('Texte corrigé');

        await ticketsApi.removeComment(comment.id);
        expect(await ticketsApi.comments(ticketId)).toHaveLength(0);
        const [card] = await ticketsApi.list();
        expect(card.comments_count).toBe(0);
        expect(card.attachments_count).toBe(0);
    });

    it('builds file names accepted by Windows and SharePoint', () => {
        expect(safeFileName('rapport: v2/final?.pdf')).toBe('rapport_ v2_final_.pdf');
        expect(safeFileName('notes. ')).toBe('notes');
        expect(safeFileName(`${'a'.repeat(200)}.xlsx`)).toHaveLength(150);
    });
});
