/**
 * Offer a file as a download (attachments, exports).
 */
export function saveFile(content: Blob, fileName: string): void {
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Let the browser start the download before releasing the content.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
