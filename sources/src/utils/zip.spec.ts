import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crc32, InvalidZipError, unzip, zip } from './zip';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** One-file archive whose entry is compressed ("deflate"), as Windows writes them. */
async function deflatedArchive(name: string, text: string): Promise<Uint8Array> {
    const data = encoder.encode(text);
    const compressed = new Uint8Array(deflateRawSync(data));
    const nameBytes = encoder.encode(name);
    const archive = zip([{ name, data: compressed }]);
    const view = new DataView(archive.buffer);
    const central = 30 + nameBytes.length + compressed.length;

    // Same layout as a stored entry: only the method, CRC and size differ.
    for (const [header, method, crc, size] of [
        [0, 8, 14, 22],
        [central, 10, 16, 24],
    ]) {
        view.setUint16(header + method, 8, true);
        view.setUint32(header + crc, crc32(data), true);
        view.setUint32(header + size, data.length, true);
    }

    return archive;
}

describe('zip', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('reads back the archives it writes', async () => {
        const files = [
            { name: 'data/synapse-lite.json', data: encoder.encode('{"a":1}') },
            { name: 'data/attachments/1/2/é.bin', data: new Uint8Array([0, 255, 7]) },
        ];

        const entries = await unzip(zip(files, new Date(2026, 10, 14, 19, 3)));

        expect(entries.map((entry) => entry.name)).toEqual(files.map((file) => file.name));
        expect(Array.from(entries[1].data)).toEqual([0, 255, 7]);
    });

    it('reads compressed entries', async () => {
        vi.stubGlobal(
            'DecompressionStream',
            class extends TransformStream<Uint8Array, Uint8Array> {
                constructor(format: string) {
                    if (format !== 'deflate-raw') throw new TypeError(`Unsupported format: ${format}`);
                    super({
                        transform(chunk, controller) {
                            controller.enqueue(new Uint8Array(inflateRawSync(chunk)));
                        },
                    });
                }
            },
        );
        const text = 'Synapse Lite '.repeat(200);
        const [entry] = await unzip(await deflatedArchive('data/tickets/1.json', text));

        expect(decoder.decode(entry.data)).toBe(text);
    });

    it('rejects a file that is not an archive, or a damaged one', async () => {
        await expect(unzip(encoder.encode('bonjour'))).rejects.toBeInstanceOf(InvalidZipError);

        const archive = zip([{ name: 'a.txt', data: encoder.encode('contenu') }]);
        archive[30 + 'a.txt'.length] ^= 0xff;

        await expect(unzip(archive)).rejects.toThrow(/endommagé/);
    });
});
