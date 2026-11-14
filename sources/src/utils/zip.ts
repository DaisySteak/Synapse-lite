/**
 * ZIP archives without any dependency: writing (Excel files, backups of the
 * data folder) and reading (restoration of a backup).
 *
 * The archives are written without compression ("stored" entries), which
 * every tool reads. Reading accepts stored and "deflated" entries, so that
 * a backup unzipped then zipped again with Windows can still be restored.
 */

export interface ZipEntry {
    /** Path inside the archive, with "/" as separator. */
    name: string;
    data: Uint8Array;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);

    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }

    return table;
})();

export function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);

    return (crc ^ 0xffffffff) >>> 0;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const UTF8_NAMES = 0x0800;
const STORED = 0;
const DEFLATED = 8;

/** MS-DOS date and time of the entries. */
function dosDateTime(date: Date): { time: number; date: number } {
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        date: (Math.max(date.getFullYear() - 1980, 0) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

/**
 * ZIP archive with stored (uncompressed) entries.
 *
 * @param modified date shown for every entry (default: 1980-01-01, which
 *                 keeps the generated Excel files identical from one run to
 *                 the other)
 */
export function zip(files: ZipEntry[], modified?: Date): Uint8Array {
    const encoder = new TextEncoder();
    const stamp = modified ? dosDateTime(modified) : { time: 0, date: 0x21 };
    const chunks: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
        const name = encoder.encode(file.name);
        const crc = crc32(file.data);
        const size = file.data.length;

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, LOCAL_HEADER, true);
        local.setUint16(4, 20, true); // version needed
        local.setUint16(6, UTF8_NAMES, true);
        local.setUint16(8, STORED, true);
        local.setUint16(10, stamp.time, true);
        local.setUint16(12, stamp.date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, size, true);
        local.setUint32(22, size, true);
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);
        chunks.push(new Uint8Array(local.buffer), name, file.data);

        const entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, CENTRAL_HEADER, true);
        entry.setUint16(4, 20, true);
        entry.setUint16(6, 20, true);
        entry.setUint16(8, UTF8_NAMES, true);
        entry.setUint16(10, STORED, true);
        entry.setUint16(12, stamp.time, true);
        entry.setUint16(14, stamp.date, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, size, true);
        entry.setUint32(24, size, true);
        entry.setUint16(28, name.length, true);
        entry.setUint32(42, offset, true);
        central.push(new Uint8Array(entry.buffer), name);

        offset += 30 + name.length + size;
    }

    const centralSize = central.reduce((total, chunk) => total + chunk.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, END_OF_CENTRAL, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return concat([...chunks, ...central, new Uint8Array(end.buffer)]);
}

/** Error raised for a file that is not a readable ZIP archive. */
export class InvalidZipError extends Error {}

/**
 * Files of a ZIP archive (folders are left out).
 *
 * @throws InvalidZipError when the archive is damaged or uses a feature not
 *         supported (encryption, ZIP64, other compression methods)
 */
export async function unzip(archive: Uint8Array): Promise<ZipEntry[]> {
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const end = findEndOfCentralDirectory(view);
    const count = view.getUint16(end + 10, true);
    let position = view.getUint32(end + 16, true);
    const decoder = new TextDecoder();
    const entries: ZipEntry[] = [];

    for (let index = 0; index < count; index++) {
        if (position + 46 > archive.length || view.getUint32(position, true) !== CENTRAL_HEADER) {
            throw new InvalidZipError('Répertoire de l’archive illisible.');
        }

        const flags = view.getUint16(position + 8, true);
        const method = view.getUint16(position + 10, true);
        const crc = view.getUint32(position + 16, true);
        const compressedSize = view.getUint32(position + 20, true);
        const size = view.getUint32(position + 24, true);
        const nameLength = view.getUint16(position + 28, true);
        const extraLength = view.getUint16(position + 30, true);
        const commentLength = view.getUint16(position + 32, true);
        const localOffset = view.getUint32(position + 42, true);
        const name = decoder.decode(archive.subarray(position + 46, position + 46 + nameLength)).replace(/\\/g, '/');

        position += 46 + nameLength + extraLength + commentLength;

        if (name.endsWith('/')) continue;
        if (flags & 0x0001) throw new InvalidZipError('Les archives protégées par mot de passe ne sont pas acceptées.');
        if (localOffset + 30 > archive.length || view.getUint32(localOffset, true) !== LOCAL_HEADER) {
            throw new InvalidZipError('Contenu de l’archive illisible.');
        }

        const dataStart =
            localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
        const raw = archive.subarray(dataStart, dataStart + compressedSize);
        const data = method === STORED ? raw.slice() : method === DEFLATED ? await inflate(raw) : null;

        if (!data) throw new InvalidZipError(`Méthode de compression non prise en charge (${name}).`);
        if (data.length !== size || crc32(data) !== crc) {
            throw new InvalidZipError(`Le fichier « ${name} » de l’archive est endommagé.`);
        }

        entries.push({ name, data });
    }

    return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
    // The record is at the very end, after an optional comment (64 KB at most).
    const last = view.byteLength - 22;

    for (let position = last; position >= Math.max(0, last - 0xffff); position--) {
        if (view.getUint32(position, true) === END_OF_CENTRAL) return position;
    }

    throw new InvalidZipError('Ce fichier n’est pas une archive ZIP.');
}

/** "Deflate" decompression, done by the browser. */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
    try {
        const stream = (new Response(data).body as ReadableStream<Uint8Array>).pipeThrough(
            new DecompressionStream('deflate-raw'),
        );

        return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
        throw new InvalidZipError('Contenu compressé de l’archive illisible.');
    }
}

function concat(parts: Uint8Array[]): Uint8Array {
    const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let position = 0;

    for (const part of parts) {
        result.set(part, position);
        position += part.length;
    }

    return result;
}
