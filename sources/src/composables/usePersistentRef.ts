import { ref, watch, type Ref } from 'vue';

/**
 * Ref persisted in the browser local storage (per-user display
 * preferences: filters, zoom...). Falls back to the default value when the
 * storage is unavailable or holds an invalid value.
 */
export function usePersistentRef<T>(key: string, defaultValue: T): Ref<T> {
    let initial = defaultValue;

    try {
        const stored = localStorage.getItem(key);
        if (stored !== null) initial = JSON.parse(stored) as T;
    } catch {
        initial = defaultValue;
    }

    const state = ref(initial) as Ref<T>;

    watch(
        state,
        (value) => {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch {
                // Storage full or disabled: the preference is simply not kept.
            }
        },
        { deep: true },
    );

    return state;
}
