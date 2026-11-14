/**
 * Minimal Excel (.xlsx) writer, without any dependency: one or several
 * sheets, a bold header row with filters, frozen first row, text / number /
 * date cells.
 *
 * An .xlsx file is a ZIP archive of XML files (see zip.ts).
 */
import { zip } from './zip';

export type XlsxCell = string | number | Date | null | undefined;

export interface XlsxColumn {
    header: string;
    /** Width in characters. */
    width?: number;
}

export interface XlsxSheet {
    name: string;
    columns: XlsxColumn[];
    rows: XlsxCell[][];
}

/** Longest text an Excel cell can hold. */
const MAX_CELL_LENGTH = 32_767;

// --- Spreadsheet -------------------------------------------------------------

function escapeXml(value: string): string {
    return (
        value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            // Control characters are not allowed in XML.
            // eslint-disable-next-line no-control-regex
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    );
}

/** Column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
    let name = '';
    let n = index + 1;

    while (n > 0) {
        const rest = (n - 1) % 26;
        name = String.fromCharCode(65 + rest) + name;
        n = Math.floor((n - 1) / 26);
    }

    return name;
}

/** Excel date serial number (days since 1899-12-30), local calendar day. */
export function excelDate(date: Date): number {
    return Math.round(
        (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000,
    );
}

const STYLE_HEADER = 1;
const STYLE_DATE = 2;

function cell(value: XlsxCell, ref: string, style?: number): string {
    if (value === null || value === undefined || value === '') return '';

    const s = style ? ` s="${style}"` : '';

    if (value instanceof Date) return `<c r="${ref}" s="${STYLE_DATE}"><v>${excelDate(value)}</v></c>`;
    if (typeof value === 'number') return `<c r="${ref}"${s}><v>${value}</v></c>`;

    const text = value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH - 1)}…` : value;

    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function sheetXml(columns: XlsxColumn[], rows: XlsxCell[][]): string {
    const last = columnName(Math.max(columns.length - 1, 0));
    const cols = columns
        .map(
            (column, index) =>
                `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 15}" customWidth="1"/>`,
        )
        .join('');
    const header = `<row r="1">${columns.map((column, i) => cell(column.header, `${columnName(i)}1`, STYLE_HEADER)).join('')}</row>`;
    const body = rows
        .map(
            (row, r) =>
                `<row r="${r + 2}">${row.map((value, c) => cell(value, `${columnName(c)}${r + 2}`)).join('')}</row>`,
        )
        .join('');

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        `<cols>${cols}</cols>` +
        `<sheetData>${header}${body}</sheetData>` +
        `<autoFilter ref="A1:${last}${rows.length + 1}"/>` +
        '</worksheet>'
    );
}

const STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF007A6E"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

/** Build an .xlsx workbook containing one sheet. */
export function buildXlsx(sheetName: string, columns: XlsxColumn[], rows: XlsxCell[][]): Uint8Array {
    return buildWorkbook([{ name: sheetName, columns, rows }]);
}

/** Sheet names: 31 characters at most, none of []:*?/\ and all different. */
function sheetNames(sheets: XlsxSheet[]): string[] {
    const used = new Set<string>();

    return sheets.map((sheet, index) => {
        const base =
            sheet.name
                .replace(/[[\]:*?/\\]/g, ' ')
                .trim()
                .slice(0, 31) || `Feuille${index + 1}`;
        let name = base;

        for (let n = 2; used.has(name.toLowerCase()); n++) {
            name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
        }
        used.add(name.toLowerCase());

        return name;
    });
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SPREADSHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml';

/** Build an .xlsx workbook, one sheet per entry. */
export function buildWorkbook(sheets: XlsxSheet[]): Uint8Array {
    const encoder = new TextEncoder();
    const names = sheetNames(sheets);
    const each = (part: (sheet: XlsxSheet, index: number) => string) => sheets.map(part).join('');

    const files: Record<string, string> = {
        '[Content_Types].xml':
            XML_HEADER +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            `<Override PartName="/xl/workbook.xml" ContentType="${SPREADSHEET}.sheet.main+xml"/>` +
            each(
                (_, i) =>
                    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${SPREADSHEET}.worksheet+xml"/>`,
            ) +
            `<Override PartName="/xl/styles.xml" ContentType="${SPREADSHEET}.styles+xml"/>` +
            '</Types>',
        '_rels/.rels':
            XML_HEADER +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            `<Relationship Id="rId1" Type="${RELATIONSHIPS}/officeDocument" Target="xl/workbook.xml"/>` +
            '</Relationships>',
        'xl/workbook.xml':
            XML_HEADER +
            `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RELATIONSHIPS}">` +
            `<sheets>${each((_, i) => `<sheet name="${escapeXml(names[i])}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)}</sheets>` +
            '<definedNames>' +
            each((sheet, i) => {
                const last = columnName(Math.max(sheet.columns.length - 1, 0));
                const quoted = escapeXml(names[i].replace(/'/g, "''"));

                return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${quoted}'!$A$1:$${last}$${sheet.rows.length + 1}</definedName>`;
            }) +
            '</definedNames>' +
            '</workbook>',
        'xl/_rels/workbook.xml.rels':
            XML_HEADER +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            each(
                (_, i) =>
                    `<Relationship Id="rId${i + 1}" Type="${RELATIONSHIPS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
            ) +
            `<Relationship Id="rId${sheets.length + 1}" Type="${RELATIONSHIPS}/styles" Target="styles.xml"/>` +
            '</Relationships>',
        'xl/styles.xml': STYLES,
    };

    sheets.forEach((sheet, i) => {
        files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet.columns, sheet.rows);
    });

    return zip(Object.entries(files).map(([path, content]) => ({ name: path, data: encoder.encode(content) })));
}
