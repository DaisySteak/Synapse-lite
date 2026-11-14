/**
 * Test helpers: a data folder in memory, initialised like a real one plus the
 * team and ticket types of the demonstration, and sign-in of the accounts.
 */
import { adminApi } from '@/api/admin';
import { Backend, setBackend } from '@/backend/Backend';
import { setClock } from '@/backend/clock';
import { Database } from '@/backend/database';
import { addDemoReference, initializeFolder } from '@/backend/seed';
import { session } from '@/backend/session';
import { MemoryStore } from '@/storage/MemoryStore';
import type { TicketPayload } from '@/types/models';

/** Test accounts (see backend/seed.ts). */
export const ADMIN = 'LOGIN1';
export const LEAD = 'LOGIN2';
export const USER = 'LOGIN3';
export const OTHER_USER = 'LOGIN4';

export type Files = MemoryStore['files'];

/** New data folder with the types and accounts of the demonstration. */
export async function createFolder(): Promise<Files> {
    const store = new MemoryStore();
    await initializeFolder(store);
    await addDemoReference(new Database(store));

    return store.files;
}

/** Open the folder as a new browser would, signed in with the given employee number. */
export async function openAs(files: Files, login: string): Promise<Backend> {
    const server = await Backend.open(new MemoryStore(files));
    setBackend(server);
    session.open(login, false);

    return server;
}

/** Switch the signed-in user of the current backend. */
export function signIn(login: string): void {
    session.open(login, false);
}

export function userId(server: Backend, login: string): number {
    const user = server.db.users.all().find((candidate) => candidate.login === login);
    if (!user) throw new Error(`Unknown user ${login}`);

    return user.id;
}

/** Fix the current date (local time). */
export function freezeDate(value: string): void {
    const date = new Date(`${value}T09:00:00`);
    setClock(() => new Date(date));
}

export function restoreClock(): void {
    setClock();
}

/** A requester created by the administrator (needed by every ticket). */
export async function createRequester(name = 'Support informatique'): Promise<number> {
    const current = session.login();
    signIn(ADMIN);
    const requester = await adminApi.requesters.create({ name, color: '#0B6E4F', is_active: true });
    if (current) signIn(current);

    return requester.id;
}

export function ticketPayload(requesterId: number, overrides: TicketPayload = {}): TicketPayload {
    return { title: 'Analyser les écarts', epic_id: 1, requester_id: requesterId, ...overrides };
}

/** Expect a validation error on the given fields. */
export async function validationErrorsOf(promise: Promise<unknown>): Promise<string[]> {
    try {
        await promise;
    } catch (error) {
        const errors = (error as { status?: number; errors?: Record<string, string[]> }).errors;
        if ((error as { status?: number }).status === 422 && errors) return Object.keys(errors).sort();
        throw error;
    }

    throw new Error('A validation error was expected.');
}

/** HTTP-like status of a rejected operation. */
export async function statusOf(promise: Promise<unknown>): Promise<number> {
    try {
        await promise;
    } catch (error) {
        return (error as { status?: number }).status ?? 0;
    }

    return 200;
}
