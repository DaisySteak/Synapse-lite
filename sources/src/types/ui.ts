/** Option of a MultiSelect. */
export interface SelectOption<V> {
    value: V;
    label: string;
    color?: string;
    hint?: string;
    disabled?: boolean;
}
