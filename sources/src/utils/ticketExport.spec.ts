import { describe, expect, it } from 'vitest';
import { toCsv, toJson, toXlsx, type ExportedTicket } from './ticketExport';

const ticket: ExportedTicket = {
    reference: 'ETUDE-1',
    title: 'Étude "flux" ; clients',
    status: 'À faire',
    type: 'Étude',
    project: null,
    requester: 'Marketing',
    owner: 'Rodolphe',
    contributors: ['user1', 'user2'],
    start_date: '2026-11-12',
    due_date: null,
    actual_end_date: null,
    time_spent: 1.5,
    created_at: '2026-11-10',
    comments_count: 2,
    attachments_count: 0,
    description: '## Contexte\n\n- [ ] étape',
};

describe('ticket exports', () => {
    it('writes a CSV for Excel with the description', () => {
        const csv = toCsv([ticket]);
        const [header, row] = csv.slice(1).split('\r\n');

        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(header.split(';')).toHaveLength(16);
        expect(header).toContain('"Description"');
        expect(header).toContain('"Contributeurs"');
        expect(row).toContain(';1,5;');
        expect(row).toContain('"Étude ""flux"" ; clients"');
        expect(row).toContain('"12/11/2026"');
        expect(row).toContain('"user1, user2"');
        expect(csv).toContain('"## Contexte\n\n- [ ] étape"');
    });

    it('writes a JSON array keeping the structure', () => {
        const data = JSON.parse(toJson([ticket]));

        expect(data[0].contributors).toEqual(['user1', 'user2']);
        expect(data[0].description).toBe(ticket.description);
        expect(data[0].due_date).toBeNull();
        expect(data[0].time_spent).toBe(1.5);
    });

    it('writes an Excel workbook with the description', () => {
        const text = new TextDecoder().decode(toXlsx([ticket]));

        expect(text).toContain('Description');
        expect(text).toContain('## Contexte');
    });
});
