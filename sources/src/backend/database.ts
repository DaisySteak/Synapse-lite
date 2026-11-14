import type { FileStore } from '@/storage/FileStore';
import { Collection } from './collection';
import type {
    ActivityRecord,
    AttachmentRecord,
    CommentRecord,
    CustomFieldRecord,
    EpicRecord,
    ProjectRecord,
    RecurringTicketRecord,
    RequesterRecord,
    SettingsRecord,
    TicketRecord,
    UserRecord,
} from './records';

/** What changed during a synchronisation with the data folder. */
export interface SyncResult {
    /** Tickets created, changed or deleted by somebody else. */
    tickets: boolean;
    /** Reference data (users, types, projects, requesters, custom fields, settings). */
    reference: boolean;
    /** Recurring ticket templates. */
    recurring: boolean;
}

/**
 * Every record of the data folder.
 *
 * The reference data and the tickets are kept in memory (a few thousand small
 * files at most) and refreshed by sync(). The comments, history entries and
 * attachments of a ticket are only read when the ticket is opened.
 */
export class Database {
    readonly users: Collection<UserRecord>;
    readonly epics: Collection<EpicRecord>;
    readonly projects: Collection<ProjectRecord>;
    readonly requesters: Collection<RequesterRecord>;
    readonly customFields: Collection<CustomFieldRecord>;
    readonly recurringTickets: Collection<RecurringTicketRecord>;
    readonly tickets: Collection<TicketRecord>;
    readonly settings: Collection<SettingsRecord>;

    private readonly children = new Map<string, Collection<{ id: number }>>();

    constructor(readonly store: FileStore) {
        this.users = new Collection(store, 'users');
        this.epics = new Collection(store, 'epics');
        this.projects = new Collection(store, 'projects');
        this.requesters = new Collection(store, 'requesters');
        this.customFields = new Collection(store, 'custom-fields');
        this.recurringTickets = new Collection(store, 'recurring-tickets');
        this.tickets = new Collection(store, 'tickets');
        this.settings = new Collection(store, 'settings');
    }

    /** Collections making the reference data of the screens. */
    get referenceCollections(): Collection<{ id: number }>[] {
        return [this.users, this.epics, this.projects, this.requesters, this.customFields, this.settings];
    }

    comments(ticketId: number): Collection<CommentRecord> {
        return this.child('comments', ticketId) as Collection<CommentRecord>;
    }

    activities(ticketId: number): Collection<ActivityRecord> {
        return this.child('activities', ticketId) as Collection<ActivityRecord>;
    }

    attachments(ticketId: number): Collection<AttachmentRecord> {
        return this.child('attachments', ticketId) as Collection<AttachmentRecord>;
    }

    /** Read everything that changed in the folder since the previous call. */
    async sync(): Promise<SyncResult> {
        const [reference, recurring, tickets] = await Promise.all([
            Promise.all(this.referenceCollections.map((collection) => collection.sync())).then((changes) =>
                changes.some(Boolean),
            ),
            this.recurringTickets.sync(),
            this.tickets.sync(),
        ]);

        return { tickets, reference, recurring };
    }

    /** Tickets not deleted. */
    activeTickets(): TicketRecord[] {
        return this.tickets.all().filter((ticket) => ticket.deleted_at === null);
    }

    /** Remove the comments, history and attachments of a ticket. */
    async removeTicketFolders(ticketId: number): Promise<void> {
        for (const kind of ['attachments', 'comments', 'activities']) {
            const directory = `${kind}/${ticketId}`;
            await this.store.remove(directory);
            this.children.delete(directory);
        }
    }

    /** Drop the comments, history and attachments read so far (whole folder replaced). */
    forgetTicketChildren(): void {
        this.children.clear();
    }

    private child(kind: string, ticketId: number): Collection<{ id: number }> {
        const directory = `${kind}/${ticketId}`;
        let collection = this.children.get(directory);

        if (!collection) {
            collection = new Collection(this.store, directory);
            this.children.set(directory, collection);
        }

        return collection;
    }
}
