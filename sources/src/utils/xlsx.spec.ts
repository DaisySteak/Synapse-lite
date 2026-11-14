import { describe, expect, it } from 'vitest';
import { buildWorkbook, buildXlsx, columnName, excelDate } from './xlsx';
import { crc32 } from './zip';

describe('xlsx', () => {
    it('computes the CRC-32 of the ZIP entries', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });

    it('names the columns like Excel', () => {
        expect(columnName(0)).toBe('A');
        expect(columnName(25)).toBe('Z');
        expect(columnName(26)).toBe('AA');
        expect(columnName(27)).toBe('AB');
    });

    it('converts dates to Excel serial numbers', () => {
        expect(excelDate(new Date(2026, 10, 12))).toBe(46338);
        expect(excelDate(new Date(1900, 0, 1))).toBe(2);
    });

    it('produces a ZIP archive with escaped cells', () => {
        const data = buildXlsx('Tickets', [{ header: 'Titre' }], [['A & <B>'], [null]]);
        const text = new TextDecoder().decode(data);

        expect(Array.from(data.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
        expect(text).toContain('A &amp; &lt;B&gt;');
        expect(text).toContain('xl/worksheets/sheet1.xml');
    });

    it('writes one sheet per entity, with unique names', () => {
        const data = buildWorkbook([
            { name: 'Tickets', columns: [{ header: 'id' }], rows: [[1]] },
            { name: 'tickets', columns: [{ header: 'id' }], rows: [] },
            { name: 'Champs: [perso]', columns: [{ header: 'id' }], rows: [] },
        ]);
        const text = new TextDecoder().decode(data);

        expect(text).toContain('xl/worksheets/sheet3.xml');
        expect(text).toContain('<sheet name="Tickets" sheetId="1"');
        expect(text).toContain('<sheet name="tickets 2" sheetId="2"');
        expect(text).toContain('<sheet name="Champs   perso" sheetId="3"');
    });
});
