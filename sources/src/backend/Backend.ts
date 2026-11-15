/**
 * Composition root of the data layer: the "server" of Synapse Lite, running
 * in the browser on top of the data folder.
 */
import type { FileStore } from '@/storage/FileStore';
import { storedAccess } from './access';
import { todayIso } from './clock';
import { Database, type SyncResult } from './database';
import { ApiError, unauthenticated } from './errors';
import { Actor } from './permissions';
import { SCHEMA_VERSION } from './records';
import { readMarker } from './seed';
import { session } from './session';
import { ActivityRecorder } from './services/ActivityRecorder';
import { AttachmentService } from './services/AttachmentService';
import { CommentService } from './services/CommentService';
import { DataService } from './services/DataService';
import { RecurringTicketService } from './services/RecurringTicketService';
import { TicketService } from './services/TicketService';

/** Delay between two checks of the changes made by the other users. */
export const SYNC_INTERVAL_MS = 10_000;

export class Backend {
    readonly db: Database;
    readonly activities: ActivityRecorder;
    readonly tickets: TicketService;
    readonly attachments: AttachmentService;
    readonly comments: CommentService;
    readonly recurring: RecurringTicketService;
    readonly data: DataService;

    /** Day of the last generation of the recurring tickets. */
    private generatedOn: string | null = null;

    constructor(readonly store: FileStore) {
        this.db = new Database(store);
        this.activities = new ActivityRecorder(this.db);
        this.tickets = new TicketService(this.db, this.activities);
        this.attachments = new AttachmentService(this.db, this.activities, this.tickets);
        this.comments = new CommentService(this.db, this.activities, this.attachments, this.tickets);
        this.recurring = new RecurringTicketService(this.db, this.tickets);
        this.data = new DataService(this.db, this.tickets);
    }

    /** Check the folder, load its content and create the recurring tickets due. */
    static async open(store: FileStore): Promise<Backend> {
        const marker = await readMarker(store);

        if (!marker) {
            throw new ApiError(409, "Ce dossier n'est pas un dossier de données Synapse Lite.");
        }

        if (marker.schema_version > SCHEMA_VERSION) {
            throw new ApiError(
                409,
                'Ces données ont été écrites par une version plus récente de Synapse Lite : utilisez le dernier fichier Synapse Lite.html.',
            );
        }

        const backend = new Backend(store);
        await backend.db.sync();
        await backend.maintain();

        return backend;
    }

    /** Signed-in user (re-read at each call: a deactivation applies at once). */
    actor(): Actor {
        const login = session.login();
        const user = login ? this.db.users.all().find((candidate) => candidate.login === login) : undefined;

        if (!user?.is_active) throw unauthenticated();

        return new Actor(user, storedAccess(this.db.settings.get(1)));
    }

    /** Signed-in user, or null. */
    currentActor(): Actor | null {
        try {
            return this.actor();
        } catch {
            return null;
        }
    }

    /** Read the changes of the other users, then run the maintenance tasks. */
    async sync(): Promise<SyncResult> {
        const result = await this.db.sync();
        const maintained = await this.maintain(result.tickets);

        return { ...result, tickets: result.tickets || maintained };
    }

    /**
     * Tasks a server would run: create the recurring tickets due (once a day
     * per browser, the generation being idempotent) and repair the ticket
     * numbers given twice.
     *
     * @return true when tickets were written
     */
    private async maintain(ticketsChanged = true): Promise<boolean> {
        let written = false;
        const today = todayIso();

        if (this.generatedOn !== today) {
            written = (await this.recurring.generateDue(today)) > 0;
            this.generatedOn = today;
        }

        if (ticketsChanged || written) written = (await this.tickets.repairDuplicateNumbers()) > 0 || written;

        return written;
    }
}

let current: Backend | null = null;

/** Connected backend; error 503 when no data folder is connected. */
export function backend(): Backend {
    if (!current) throw new ApiError(503, "Le dossier de données n'est pas connecté.");

    return current;
}

export function setBackend(value: Backend | null): void {
    current = value;
}

export function hasBackend(): boolean {
    return current !== null;
}
