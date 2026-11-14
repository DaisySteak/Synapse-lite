import { reportError } from './errors';

/**
 * Run an API operation: every error goes through reportError() first (an
 * invalid session sends back to the sign-in screen), then to the caller.
 */
export async function call<T>(operation: () => Promise<T> | T): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        reportError(error);
        throw error;
    }
}
