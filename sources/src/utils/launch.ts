/**
 * Parameters given by the Windows launcher ("Synapse Lite.cmd"), which opens
 * the application with the account of the session:
 *
 *   Synapse Lite.html?matricule=LOGIN1#/tableau
 *
 * The parameter is read once at start-up and removed from the address bar,
 * so that a copied address never signs someone else in.
 */
const PARAMETER = 'matricule';

let pending: string | null = readParameter();

function readParameter(): string | null {
    if (typeof window === 'undefined') return null;

    const url = new URL(window.location.href);
    const value = url.searchParams.get(PARAMETER)?.trim() || null;

    if (url.searchParams.has(PARAMETER)) {
        url.searchParams.delete(PARAMETER);
        window.history.replaceState(window.history.state, '', url.toString());
    }

    return value;
}

/** Employee number given by the launcher, returned only once. */
export function takeLaunchLogin(): string | null {
    const value = pending;
    pending = null;

    return value;
}
