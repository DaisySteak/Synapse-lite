/** Bytes of a Blob or a File. */
export async function blobBytes(blob: Blob): Promise<Uint8Array> {
    if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());

    // jsdom (unit tests) has no Blob.arrayBuffer().
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}
