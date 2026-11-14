/**
 * Sign-in with the employee number only (no password): typed on the sign-in
 * screen, or given by the Windows launcher (automatic sign-in).
 */
import { backend } from '@/backend/Backend';
import { nowIso } from '@/backend/clock';
import { fieldError } from '@/backend/errors';
import { LOGIN_FORMAT_MESSAGE, LOGIN_PATTERN } from '@/backend/reference';
import { toCurrentUser } from '@/backend/serializers';
import { session } from '@/backend/session';
import type { CurrentUser } from '@/types/models';
import { call } from './call';

/** " login1 " gives "LOGIN1", "testuser" gives "TESTUSER". */
export function normalizeLogin(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase();
}

export const authApi = {
    me: (): Promise<CurrentUser> => call(() => toCurrentUser(backend().actor())),

    login: (value: string, remember: boolean): Promise<CurrentUser> =>
        call(async () => {
            const login = normalizeLogin(value);

            if (login === '') throw fieldError('login', 'Le champ matricule est obligatoire.');
            if (!LOGIN_PATTERN.test(login)) {
                throw fieldError('login', LOGIN_FORMAT_MESSAGE);
            }

            const server = backend();
            await server.db.users.sync();

            const user = server.db.users.all().find((candidate) => candidate.login === login);
            if (!user?.is_active) {
                throw fieldError(
                    'login',
                    "Ce matricule n'a pas accès à Synapse Lite. Demandez à l'administrateur de vous ajouter.",
                );
            }

            session.open(login, remember);

            // The date of the last sign-in is informative: a failure is not blocking.
            await server.db.users.mutate(user.id, (record) => (record.last_login_at = nowIso())).catch(() => null);

            return toCurrentUser(server.actor());
        }),

    logout: (): Promise<void> =>
        call(() => {
            session.close();
        }),
};
