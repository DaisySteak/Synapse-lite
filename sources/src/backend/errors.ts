/**
 * Errors raised by the data layer. They mirror the HTTP errors of the Synapse
 * API (403, 404, 422...) so that the screens handle them the same way.
 */

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
    constructor(
        /** Equivalent HTTP status: 403, 404, 409, 422, 503... */
        readonly status: number,
        message: string,
        /** Validation errors, by field (status 422). */
        readonly errors: FieldErrors = {},
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export function forbidden(): ApiError {
    return new ApiError(403, "Vous n'avez pas les droits nécessaires pour cette action.");
}

export function notFound(): ApiError {
    return new ApiError(404, "L'élément demandé n'existe pas ou a été supprimé.");
}

export function unauthenticated(): ApiError {
    return new ApiError(401, 'Vous devez vous connecter.');
}

/** Validation error: the message is the first field error, as in Laravel. */
export function validationError(errors: FieldErrors): ApiError {
    const first = Object.values(errors)[0]?.[0] ?? 'Les données saisies sont invalides.';

    return new ApiError(422, first, errors);
}

/** Single field validation error. */
export function fieldError(field: string, message: string): ApiError {
    return validationError({ [field]: [message] });
}
