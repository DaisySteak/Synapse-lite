import { onMounted, ref, type Ref } from 'vue';
import { errorMessage, fieldErrors } from '@/api/errors';
import { useReferenceStore } from '@/stores/reference';
import { useUiStore } from '@/stores/ui';

interface ResourceApi<T, P> {
    list(): Promise<T[]>;
    create(payload: P): Promise<T>;
    update(id: number, payload: P): Promise<T>;
    remove(id: number): Promise<void>;
}

/**
 * Shared logic of the administration screens: list, create / edit dialog,
 * deletion, and refresh of the reference data after each change.
 */
export function useAdminResource<T extends { id: number }, P>(api: ResourceApi<T, P>, emptyForm: () => P) {
    const reference = useReferenceStore();
    const ui = useUiStore();

    const items = ref([]) as Ref<T[]>;
    const loading = ref(true);
    const dialogOpen = ref(false);
    const editing = ref(null) as Ref<T | null>;
    const form = ref(emptyForm()) as Ref<P>;
    const errors = ref<Record<string, string>>({});
    const saving = ref(false);

    async function load(): Promise<void> {
        loading.value = true;

        try {
            items.value = await api.list();
        } catch (error) {
            ui.notify(errorMessage(error), 'error');
        } finally {
            loading.value = false;
        }
    }

    function openCreate(): void {
        editing.value = null;
        form.value = emptyForm();
        errors.value = {};
        dialogOpen.value = true;
    }

    function openEdit(item: T, toForm: (item: T) => P): void {
        editing.value = item;
        form.value = toForm(item);
        errors.value = {};
        dialogOpen.value = true;
    }

    async function submit(payload: P = form.value): Promise<boolean> {
        saving.value = true;
        errors.value = {};

        try {
            if (editing.value) {
                await api.update(editing.value.id, payload);
                ui.notify('Modifications enregistrées.');
            } else {
                await api.create(payload);
                ui.notify('Élément créé.');
            }

            dialogOpen.value = false;
            await Promise.all([load(), reference.load(true)]);

            return true;
        } catch (error) {
            errors.value = fieldErrors(error);
            if (Object.keys(errors.value).length === 0) ui.notify(errorMessage(error), 'error');

            return false;
        } finally {
            saving.value = false;
        }
    }

    async function remove(item: T, label: string): Promise<void> {
        const confirmed = await ui.confirm({
            title: 'Supprimer',
            message: `Supprimer « ${label} » ? Cette action est définitive.`,
            confirmLabel: 'Supprimer',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await api.remove(item.id);
            ui.notify('Élément supprimé.');
            await Promise.all([load(), reference.load(true)]);
        } catch (error) {
            ui.notify(Object.values(fieldErrors(error))[0] ?? errorMessage(error), 'error');
        }
    }

    onMounted(load);

    return { items, loading, dialogOpen, editing, form, errors, saving, load, openCreate, openEdit, submit, remove };
}
