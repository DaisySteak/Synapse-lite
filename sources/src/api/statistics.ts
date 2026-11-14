/**
 * Statistics of the team, the tickets and the requesters (administrators,
 * page "Statistiques"), and their Excel exports.
 */
import { backend } from '@/backend/Backend';
import { todayIso } from '@/backend/clock';
import { forbidden } from '@/backend/errors';
import type { EpicRecord } from '@/backend/records';
import { STATUSES } from '@/backend/reference';
import { fullName, reference } from '@/backend/serializers';
import { computeStatistics, type Statistics } from '@/backend/statistics';
import { saveFile } from '@/utils/download';
import { periodOf, type PeriodKind } from '@/utils/periods';
import { buildWorkbook, type XlsxSheet } from '@/utils/xlsx';
import { call } from './call';

export type { GroupRow, PersonRow, RequesterRow, Statistics, TicketLine } from '@/backend/statistics';

export interface StatisticsQuery {
    kind: PeriodKind;
    /** Any day of the period ("YYYY-MM-DD"). */
    day: string;
    staleDays: number;
    overloadThreshold: number;
}

function administrator(): void {
    if (!backend().actor().can('admin.statistics')) throw forbidden();
}

export const statisticsApi = {
    compute: (query: StatisticsQuery): Promise<Statistics> =>
        call(async () => {
            administrator();
            const { db } = backend();
            await db.sync();

            const epics = new Map<number, EpicRecord>(db.epics.all().map((epic) => [epic.id, epic]));
            const users = new Map(db.users.all().map((user) => [user.id, fullName(user)]));
            const projects = new Map(db.projects.all().map((project) => [project.id, project.name]));
            const requesters = new Map(db.requesters.all().map((requester) => [requester.id, requester.name]));
            const statuses = new Map<string, string>(STATUSES.map((status) => [status.code, status.label]));
            const team = db.users
                .all()
                .filter((user) => user.is_active)
                .map((user) => ({ id: user.id, name: fullName(user) }));

            return computeStatistics(
                db.tickets.all(),
                periodOf(query.kind, query.day),
                {
                    reference: (ticket) => reference(ticket, epics),
                    user: (id) => users.get(id) ?? 'Utilisateur supprimé',
                    epic: (id) => epics.get(id)?.title ?? 'Type supprimé',
                    project: (id) => (id === null ? 'Sans projet' : (projects.get(id) ?? 'Projet supprimé')),
                    requester: (id) => requesters.get(id) ?? 'Demandeur supprimé',
                    status: (code) => statuses.get(code) ?? code,
                },
                { today: todayIso(), staleDays: query.staleDays, overloadThreshold: query.overloadThreshold },
                team,
            );
        }),

    /** Download sheets as an Excel workbook. */
    download: (fileName: string, sheets: XlsxSheet[]): Promise<void> =>
        call(() => {
            administrator();
            saveFile(
                new Blob([buildWorkbook(sheets)], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                }),
                fileName,
            );
        }),
};
