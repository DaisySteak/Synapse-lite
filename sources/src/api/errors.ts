/**
 * Error helpers shared by the screens (same role as api/http.ts in Synapse).
 */
import { ApiError } from '@/backend/errors';

type Handler = () => void;

let unauthenticatedHandler: Handler | undefined;

/** Hook called when the signed-in user is no longer valid (registered in main.ts). */
export function onUnauthenticated(handler: Handler): void {
    unauthenticatedHandler = handler;
}

/** Called by the API layer for every error. */
export function reportError(error: unknown): void {
    if (error instanceof ApiError && error.status === 401) unauthenticatedHandler?.();
}

/** True when the error is a validation error (field errors). */
export function isValidationError(error: unknown): error is ApiError {
    return error instanceof ApiError && error.status === 422;
}

/** Field errors of a validation error, first message per field. */
export function fieldErrors(error: unknown): Record<string, string> {
    if (!isValidationError(error)) return {};

    return Object.fromEntries(Object.entries(error.errors).map(([field, messages]) => [field, messages[0] ?? '']));
}

/** Human readable message for any error. */
export function errorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.message;

    if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
            return "Synapse Lite n'a plus accès au dossier de données. Rechargez la page pour l'autoriser à nouveau.";
        }
        if (error.name === 'NotFoundError') return "L'élément demandé n'existe pas ou a été supprimé.";
        if (error.name === 'QuotaExceededError') return "Il n'y a plus assez d'espace disque pour enregistrer.";
        if (error.name === 'NoModificationAllowedError' || error.name === 'InvalidStateError') {
            return 'Le fichier est en cours de modification ou de synchronisation. Réessayez dans quelques secondes.';
        }

        return 'Le dossier de données est inaccessible (réseau ou synchronisation). Réessayez dans quelques secondes.';
    }

    return 'Une erreur inattendue est survenue.';
}
