/**
 * Every external link opens in a new tab (functional requirement).
 *
 * - links produced by the application set target="_blank" themselves;
 * - this global listener is a safety net for any other link (Markdown,
 *   future components): a click on a link towards another origin is always
 *   redirected to a new tab, without access to the opener (noopener).
 */

export function isExternalUrl(href: string, origin: string = window.location.origin): boolean {
    try {
        const url = new URL(href, origin);

        return /^https?:$/.test(url.protocol) && url.origin !== origin;
    } catch {
        return false;
    }
}

export function installExternalLinkGuard(root: Document = document): void {
    root.addEventListener(
        'click',
        (event) => {
            if (event.defaultPrevented || event.button !== 0) return;

            const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;

            if (!anchor || !isExternalUrl(anchor.href)) return;

            event.preventDefault();
            window.open(anchor.href, '_blank', 'noopener,noreferrer');
        },
        true,
    );
}
