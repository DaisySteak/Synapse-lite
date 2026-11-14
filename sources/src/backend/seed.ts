/**
 * Initial content of an empty data folder, and of the folder after a reset:
 * one administrator account (employee number "admin") and nothing else. The
 * administrator then creates the team accounts and the ticket types in the
 * administration screens.
 *
 * The team and the ticket types of the demonstration (tests, demo-data
 * script) are added by addDemoReference().
 */
import type { RoleCode } from '@/types/models';
import { MARKER_FILE } from '@/storage/directoryHandle';
import type { FileStore } from '@/storage/FileStore';
import { nowIso } from './clock';
import { Database } from './database';
import { SCHEMA_VERSION, type EpicRecord, type MarkerRecord, type UserRecord } from './records';

interface AccountSeed {
    login: string;
    first_name: string;
    last_name: string;
    role: RoleCode;
}

/** The only account of a new folder (employee numbers are stored in capitals). */
export const DEFAULT_ADMIN: AccountSeed = { login: 'ADMIN', first_name: 'admin', last_name: 'admin', role: 'admin' };

/** Ticket types of the demonstration: identifier, label, colour. */
export const DEMO_EPICS: Pick<EpicRecord, 'code' | 'title' | 'color'>[] = [
    { code: 'CREATION', title: 'Création', color: '#007A6E' },
    { code: 'EVOLUTION', title: 'Évolution', color: '#2F6EBA' },
    { code: 'ETUDE', title: 'Étude', color: '#7A4FA0' },
    { code: 'PROBLEME', title: 'Problème', color: '#B23A48' },
    { code: 'QUESTION', title: 'Question', color: '#C27C0E' },
];

/** Team of the demonstration: employee number, names, profile. */
export const DEMO_TEAM: AccountSeed[] = [
    { login: 'LOGIN1', first_name: 'admin', last_name: 'admin', role: 'admin' },
    { login: 'LOGIN2', first_name: 'lead-tech', last_name: 'lead-tech', role: 'lead_tech' },
    { login: 'LOGIN3', first_name: 'user1', last_name: 'user1', role: 'user' },
    { login: 'LOGIN4', first_name: 'user2', last_name: 'user2', role: 'user' },
    { login: 'LOGIN5', first_name: 'user3', last_name: 'user3', role: 'user' },
];

const nextId = (records: { id: number }[]) => Math.max(0, ...records.map((record) => record.id)) + 1;

async function saveAccount(db: Database, account: AccountSeed, timestamp: string): Promise<void> {
    const user: UserRecord = {
        id: nextId(db.users.all()),
        ...account,
        email: null,
        is_active: true,
        last_login_at: null,
        created_at: timestamp,
        updated_at: timestamp,
    };
    await db.users.save(user);
}

/**
 * Add the ticket types and the team of the demonstration that are missing
 * (same code, same employee number): tests and demo-data script.
 */
export async function addDemoReference(db: Database): Promise<void> {
    const timestamp = nowIso();
    await Promise.all([db.epics.sync(), db.users.sync()]);

    for (const epic of DEMO_EPICS) {
        if (db.epics.all().some((existing) => existing.code === epic.code)) continue;
        const id = nextId(db.epics.all());
        await db.epics.save({ id, ...epic, is_active: true, created_at: timestamp, updated_at: timestamp });
    }

    for (const account of DEMO_TEAM) {
        if (db.users.all().some((existing) => existing.login === account.login)) continue;
        await saveAccount(db, account, timestamp);
    }
}

/** Read the marker file; null when the folder is not a Synapse Lite folder. */
export async function readMarker(store: FileStore): Promise<MarkerRecord | null> {
    const file = await store.readText(MARKER_FILE);
    if (!file) return null;

    try {
        const marker = JSON.parse(file.text) as MarkerRecord;

        return marker.application === 'Synapse Lite' ? marker : null;
    } catch {
        return null;
    }
}

/** Write the marker file and the administrator account in an empty folder. */
export async function initializeFolder(store: FileStore): Promise<void> {
    const timestamp = nowIso();
    await saveAccount(new Database(store), DEFAULT_ADMIN, timestamp);

    // The marker comes last: a folder with a marker is always complete.
    await writeMarker(store, timestamp);
}

/** Write the marker file (last step of an initialisation or of a restoration). */
export async function writeMarker(store: FileStore, createdAt: string = nowIso()): Promise<void> {
    const marker: MarkerRecord = { application: 'Synapse Lite', schema_version: SCHEMA_VERSION, created_at: createdAt };
    await store.writeText(MARKER_FILE, `${JSON.stringify(marker, null, 2)}\n`);
}
