/**
 * Recurring tickets (port of App\Services\Recurring\RecurringTicketService):
 * saving the templates and creating the tickets.
 *
 * Without a server, the tickets due are created when Synapse Lite is opened
 * (and checked again while it stays open). The next creation date of every
 * template is stored (next_run_on); missed occurrences are all created, each
 * one with its own dates.
 *
 * Several users may open Synapse Lite at the same moment: the identifier of
 * a generated ticket is derived from the template and the occurrence date,
 * so the same ticket is written (once) whoever creates it.
 *
 * The title and the description accept placeholders replaced by the
 * occurrence date: {date} (31/01/2027), {jour} (31), {mois} (janvier),
 * {mois_num} (01), {annee} (2027), {semaine} (5), {trimestre} (1).
 */
import type { Schedule } from '@/types/models';
import { addDays, parseDate, toIsoDate } from '@/utils/dates';
import { nowIso, todayIso } from '../clock';
import type { Database } from '../database';
import { notFound } from '../errors';
import { deterministicId, nextSequentialId } from '../ids';
import type { Actor } from '../permissions';
import type { CustomValues, RecurringTicketRecord, TicketRecord } from '../records';
import { MONTH_NAMES, RecurrenceRule } from './RecurrenceRule';
import type { TicketService } from './TicketService';

/** Safety limit of tickets created for one template in one run. */
const MAX_OCCURRENCES_PER_RUN = 400;

/** Validated data of a template (see api/admin.ts). */
export interface RecurringTicketData {
    title: string;
    description: string | null;
    status_code: string;
    epic_id: number;
    project_id: number | null;
    requester_id: number;
    owner_id: number;
    supporter_ids?: number[];
    data_processing_code: string | null;
    work_folder_url: string | null;
    custom_fields?: Record<string, string | null>;
    time_spent: number | null;
    start_offset_days: number | null;
    due_offset_days: number | null;
    schedule: Schedule;
    starts_on: string;
    ends_on: string | null;
    is_active: boolean;
}

export class RecurringTicketService {
    constructor(
        private readonly db: Database,
        private readonly tickets: TicketService,
    ) {}

    static rule(template: Pick<RecurringTicketRecord, 'schedule'>): RecurrenceRule {
        return new RecurrenceRule(template.schedule);
    }

    /** Create (id null) or update a template. */
    async save(
        id: number | null,
        data: RecurringTicketData,
        actor: Actor,
        today: string = todayIso(),
    ): Promise<RecurringTicketRecord> {
        await this.db.recurringTickets.sync();

        const existing = id !== null ? await this.db.recurringTickets.fresh(id) : null;
        if (id !== null && !existing) throw notFound();

        const timestamp = nowIso();
        const template: RecurringTicketRecord = {
            ...(existing ?? {
                id: nextSequentialId(this.db.recurringTickets.all()),
                supporter_ids: [],
                custom_fields: {},
                next_run_on: null,
                last_run_on: null,
                created_by: actor.id,
                created_at: timestamp,
            }),
            title: data.title,
            description: data.description,
            status_code: data.status_code,
            epic_id: data.epic_id,
            project_id: data.project_id,
            requester_id: data.requester_id,
            owner_id: data.owner_id,
            data_processing_code: data.data_processing_code,
            work_folder_url: data.work_folder_url,
            time_spent: data.time_spent,
            start_offset_days: data.start_offset_days,
            due_offset_days: data.due_offset_days,
            schedule: new RecurrenceRule(data.schedule).toSchedule(),
            starts_on: data.starts_on,
            ends_on: data.ends_on,
            is_active: data.is_active,
            updated_by: actor.id,
            updated_at: timestamp,
        } as RecurringTicketRecord;

        if (data.supporter_ids !== undefined) {
            template.supporter_ids = [...new Set(data.supporter_ids.map(Number))].filter(
                (userId) => userId !== template.owner_id,
            );
        }

        if (data.custom_fields !== undefined) {
            template.custom_fields = this.applyCustomValues(template.custom_fields, data.custom_fields);
        }

        template.next_run_on = this.computeNextRun(template, today);

        return this.db.recurringTickets.save(template);
    }

    async remove(id: number): Promise<void> {
        if (!this.db.recurringTickets.has(id)) throw notFound();

        // The tickets already created are kept.
        await this.db.recurringTickets.remove(id);
    }

    /**
     * Create the tickets of every template due on or before today.
     *
     * @return number of tickets created
     */
    async generateDue(today: string = todayIso()): Promise<number> {
        await this.db.recurringTickets.sync();

        const due = this.db.recurringTickets
            .all()
            .filter((template) => template.is_active && template.next_run_on !== null && template.next_run_on <= today)
            .sort((a, b) => a.id - b.id);

        let created = 0;
        for (const template of due) created += await this.generateFor(template.id, today);

        return created;
    }

    /**
     * Create one ticket from the template, as if it occurred on `date`.
     * Used by the generation (deterministic identifier) and by the "Créer
     * maintenant" action (new identifier).
     */
    async createTicket(
        template: RecurringTicketRecord,
        date: string,
        actor: Actor | { id: number } | null = null,
        id?: number,
    ): Promise<TicketRecord> {
        const occurrence = parseDate(date);
        const activeUsers = new Set(
            this.db.users
                .all()
                .filter((user) => user.is_active)
                .map((user) => user.id),
        );

        return this.tickets.create(
            {
                title: this.fillPlaceholders(template.title, date),
                description: template.description !== null ? this.fillPlaceholders(template.description, date) : null,
                status_code: template.status_code,
                epic_id: template.epic_id,
                project_id: template.project_id,
                requester_id: template.requester_id,
                owner_id: template.owner_id,
                supporter_ids: template.supporter_ids.filter((userId) => activeUsers.has(userId)),
                data_processing_code: template.data_processing_code,
                work_folder_url: template.work_folder_url,
                start_date:
                    template.start_offset_days !== null
                        ? toIsoDate(addDays(occurrence, template.start_offset_days))
                        : null,
                due_date:
                    template.due_offset_days !== null ? toIsoDate(addDays(occurrence, template.due_offset_days)) : null,
                custom_fields: { ...template.custom_fields },
                time_spent: template.time_spent ?? null,
            },
            actor ?? { id: template.updated_by ?? template.created_by },
            template,
            id,
        );
    }

    /** Next occurrences of a rule, for the preview of the administration form. */
    preview(
        rule: RecurrenceRule,
        startsOn: string,
        endsOn: string | null,
        today: string = todayIso(),
        count = 6,
    ): string[] {
        return rule.occurrences(today > startsOn ? today : startsOn, startsOn, endsOn, count);
    }

    /** The next five creations of an active template. */
    nextOccurrences(template: RecurringTicketRecord, today: string = todayIso()): string[] {
        if (!template.is_active) return [];

        return RecurringTicketService.rule(template).occurrences(
            template.next_run_on ?? today,
            template.starts_on,
            template.ends_on,
            5,
        );
    }

    fillPlaceholders(text: string, dateValue: string): string {
        const date = parseDate(dateValue);
        const replacements: Record<string, string> = {
            '{date}': `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`,
            '{jour}': String(date.getDate()),
            '{mois}': MONTH_NAMES[date.getMonth() + 1],
            '{mois_num}': pad(date.getMonth() + 1),
            '{annee}': String(date.getFullYear()),
            '{semaine}': String(isoWeek(date)),
            '{trimestre}': String(Math.floor(date.getMonth() / 3) + 1),
        };

        return text.replace(/\{(date|jour|mois|mois_num|annee|semaine|trimestre)\}/g, (match) => replacements[match]);
    }

    private async generateFor(templateId: number, today: string): Promise<number> {
        let created = 0;

        for (let run = 0; run < MAX_OCCURRENCES_PER_RUN; run++) {
            // Re-read the template: another user may have created this occurrence.
            const template = await this.db.recurringTickets.fresh(templateId);
            if (!template?.is_active || template.next_run_on === null || template.next_run_on > today) break;

            const occurrence = template.next_run_on;
            const id = deterministicId(`recurring:${template.id}:${occurrence}`);

            await this.db.tickets.sync();
            if (!this.db.tickets.has(id) && !(await this.db.tickets.fresh(id))) {
                await this.createTicket(template, occurrence, null, id);
                created++;
            }

            const rule = RecurringTicketService.rule(template);
            await this.db.recurringTickets.mutate(template.id, (record) => {
                if (record.next_run_on !== occurrence) return;

                record.last_run_on = occurrence;
                record.next_run_on = rule.nextOccurrence(
                    toIsoDate(addDays(parseDate(occurrence), 1)),
                    record.starts_on,
                    record.ends_on,
                );
            });
        }

        return created;
    }

    /**
     * Next creation date from today, never before the last creation (so that
     * editing a template never creates the same occurrence twice).
     */
    private computeNextRun(template: RecurringTicketRecord, today: string): string | null {
        if (!template.is_active) return null;

        let from = today;
        if (template.last_run_on !== null) {
            const afterLast = toIsoDate(addDays(parseDate(template.last_run_on), 1));
            if (afterLast > from) from = afterLast;
        }

        return RecurringTicketService.rule(template).nextOccurrence(from, template.starts_on, template.ends_on);
    }

    private applyCustomValues(current: CustomValues, values: Record<string, string | null>): CustomValues {
        const result: CustomValues = { ...current };

        for (const [fieldId, value] of Object.entries(values)) {
            if (!this.db.customFields.has(Number(fieldId))) continue;

            if (value === null || value === '') delete result[fieldId];
            else result[fieldId] = String(value);
        }

        return result;
    }
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

/** ISO 8601 week number. */
export function isoWeek(date: Date): number {
    const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));

    return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
