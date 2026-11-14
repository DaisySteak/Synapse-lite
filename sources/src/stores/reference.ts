import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { referenceApi } from '@/api/tickets';
import { DEFAULT_THEME } from '@/utils/themes';
import type {
    AppSettings,
    CustomField,
    Epic,
    Project,
    ReferenceData,
    Requester,
    TicketStatus,
    UserSummary,
} from '@/types/models';

/**
 * Reference data shared by every screen (statuses, epics, projects, requesters,
 * users, custom fields, settings), loaded once and refreshed after an
 * administration change.
 */
export const useReferenceStore = defineStore('reference', () => {
    const data = ref<ReferenceData | null>(null);
    const loading = ref(false);

    const statuses = computed<TicketStatus[]>(() => data.value?.statuses ?? []);
    const epics = computed<Epic[]>(() => data.value?.epics ?? []);
    const projects = computed<Project[]>(() => data.value?.projects ?? []);
    const requesters = computed<Requester[]>(() => data.value?.requesters ?? []);
    const users = computed<UserSummary[]>(() => data.value?.users ?? []);
    const customFields = computed<CustomField[]>(() => data.value?.custom_fields ?? []);
    const roles = computed(() => data.value?.roles ?? []);
    const customFieldTypes = computed(() => data.value?.custom_field_types ?? []);
    const settings = computed<AppSettings>(
        () =>
            data.value?.settings ?? {
                closed_visible_days: 20,
                open_ended_days: 14,
                attachment_max_size_kb: 20480,
                theme: DEFAULT_THEME,
            },
    );

    const activeEpics = computed(() => epics.value.filter((epic) => epic.is_active));
    const activeProjects = computed(() => projects.value.filter((project) => project.is_active));
    const activeRequesters = computed(() => requesters.value.filter((requester) => requester.is_active));
    const activeUsers = computed(() => users.value.filter((user) => user.is_active));
    const finalStatusCodes = computed(() => statuses.value.filter((s) => s.is_final).map((s) => s.code));

    const byId = <T extends { id: number }>(list: T[]) => new Map(list.map((item) => [item.id, item]));
    const epicMap = computed(() => byId(epics.value));
    const projectMap = computed(() => byId(projects.value));
    const requesterMap = computed(() => byId(requesters.value));
    const userMap = computed(() => byId(users.value));
    const statusMap = computed(() => new Map(statuses.value.map((status) => [status.code, status])));

    async function load(force = false): Promise<void> {
        if (data.value && !force) return;

        loading.value = true;

        try {
            data.value = await referenceApi.load();
        } finally {
            loading.value = false;
        }
    }

    /** Custom fields applicable to the tickets of an epic. */
    function fieldsForEpic(epicId: number | null | undefined): CustomField[] {
        return customFields.value.filter((field) => field.epic_id === null || field.epic_id === epicId);
    }

    function isClosed(statusCode: string): boolean {
        return finalStatusCodes.value.includes(statusCode);
    }

    function reset(): void {
        data.value = null;
    }

    return {
        data,
        loading,
        statuses,
        epics,
        projects,
        requesters,
        users,
        customFields,
        roles,
        customFieldTypes,
        settings,
        activeEpics,
        activeProjects,
        activeRequesters,
        activeUsers,
        epicMap,
        projectMap,
        requesterMap,
        userMap,
        statusMap,
        load,
        fieldsForEpic,
        isClosed,
        reset,
    };
});
