import { buildXlsx, type XlsxCell, type XlsxColumn } from './xlsx';
import { saveFile } from './download';

/**
 * Exports of a list of tickets: CSV, Excel (.xlsx) and JSON. The tickets are
 * given already "resolved" (labels instead of identifiers), see ExportedTicket.
 */

export type ExportFormat = 'csv' | 'xlsx' | 'json';

export interface ExportedTicket {
    reference: string;
    title: string;
    status: string;
    type: string;
    project: string | null;
    requester: string | null;
    owner: string | null;
    contributors: string[];
    /** YYYY-MM-DD */
    start_date: string | null;
    due_date: string | null;
    actual_end_date: string | null;
    /** Man-days. */
    time_spent: number | null;
    created_at: string;
    comments_count: number;
    attachments_count: number;
    /** Markdown. */
    description: string | null;
}

/** Excel refuses cells longer than 32,767 characters. */
const EXCEL_CELL_MAX = 32_000;

const COLUMNS: {
    header: string;
    width: number;
    value: (t: ExportedTicket) => string | number | null;
    date?: boolean;
}[] = [
    { header: 'Identifiant', width: 14, value: (t) => t.reference },
    { header: 'Titre', width: 50, value: (t) => t.title },
    { header: 'Statut', width: 13, value: (t) => t.status },
    { header: 'Type', width: 13, value: (t) => t.type },
    { header: 'Projet', width: 26, value: (t) => t.project },
    { header: 'Demandeur', width: 22, value: (t) => t.requester },
    { header: 'Responsable', width: 18, value: (t) => t.owner },
    { header: 'Contributeurs', width: 26, value: (t) => t.contributors.join(', ') },
    { header: 'Début', width: 12, value: (t) => t.start_date, date: true },
    { header: 'Fin prévisionnelle', width: 12, value: (t) => t.due_date, date: true },
    { header: 'Fin réelle', width: 12, value: (t) => t.actual_end_date, date: true },
    { header: 'Temps consommé (j/h)', width: 12, value: (t) => t.time_spent },
    { header: 'Créé le', width: 12, value: (t) => t.created_at, date: true },
    { header: 'Commentaires', width: 8, value: (t) => t.comments_count },
    { header: 'Pièces jointes', width: 8, value: (t) => t.attachments_count },
    { header: 'Description', width: 80, value: (t) => t.description },
];

function localDate(value: string): Date {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);

    return new Date(year, month - 1, day);
}

function frenchDate(value: string): string {
    const [year, month, day] = value.slice(0, 10).split('-');

    return `${day}/${month}/${year}`;
}

/** Byte order mark: tells Excel the CSV is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** CSV for Excel in French: ";" separator, UTF-8 with BOM, CRLF lines. */
export function toCsv(tickets: ExportedTicket[]): string {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = tickets.map((ticket) =>
        COLUMNS.map((column) => {
            const value = column.value(ticket);
            if (value === null || value === '') return '';

            // Decimal comma, as expected by Excel in French.
            return typeof value === 'number'
                ? String(value).replace('.', ',')
                : escape(column.date ? frenchDate(value) : value);
        }).join(';'),
    );

    return `${BOM}${[COLUMNS.map((column) => escape(column.header)).join(';'), ...rows].join('\r\n')}`;
}

export function toXlsx(tickets: ExportedTicket[]): Uint8Array {
    const columns: XlsxColumn[] = COLUMNS.map(({ header, width }) => ({ header, width }));
    const rows: XlsxCell[][] = tickets.map((ticket) =>
        COLUMNS.map((column) => {
            const value = column.value(ticket);
            if (value === null || value === '') return null;
            if (column.date && typeof value === 'string') return localDate(value);

            return typeof value === 'string' && value.length > EXCEL_CELL_MAX
                ? `${value.slice(0, EXCEL_CELL_MAX)}…`
                : value;
        }),
    );

    return buildXlsx('Tickets', columns, rows);
}

export function toJson(tickets: ExportedTicket[]): string {
    return JSON.stringify(tickets, null, 2);
}

const MIME: Record<ExportFormat, string> = {
    csv: 'text/csv;charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    json: 'application/json;charset=utf-8',
};

/** Build the file and offer it as a download. */
export function downloadTickets(tickets: ExportedTicket[], format: ExportFormat, baseName: string): void {
    const content = format === 'csv' ? toCsv(tickets) : format === 'json' ? toJson(tickets) : toXlsx(tickets);
    saveFile(new Blob([content], { type: MIME[format] }), `${baseName}.${format}`);
}
