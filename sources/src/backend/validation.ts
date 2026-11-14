/**
 * Small validation library reproducing the Laravel rules (and their French
 * messages) used by the Synapse form requests.
 *
 *     const errors = validate(input, {
 *         title: [required, string(255)],
 *         epic_id: [required, integer, exists(isActiveEpic)],
 *     }, { title: 'titre', epic_id: 'type' });
 *
 * A field that is empty (undefined, null or '') is only checked by `required`.
 * A schema entry wrapped with `sometimes()` is only checked when the field is
 * present in the input (partial updates).
 */
import { validationError, type FieldErrors } from './errors';

export interface RuleContext {
    value: unknown;
    /** Name of the field shown in the messages ("titre"). */
    attribute: string;
    input: Record<string, unknown>;
}

/** A rule returns an error message, or null when the value is valid. */
export type Rule = (context: RuleContext) => string | null;

interface FieldSchema {
    rules: Rule[];
    sometimes: boolean;
}

export type Schema = Record<string, Rule[] | FieldSchema>;

export function sometimes(rules: Rule[]): FieldSchema {
    return { rules, sometimes: true };
}

export function isEmpty(value: unknown): boolean {
    return value === undefined || value === null || value === '';
}

/** Validate the input; returns the errors by field (empty when valid). */
export function validate(
    input: Record<string, unknown>,
    schema: Schema,
    attributes: Record<string, string> = {},
): FieldErrors {
    const errors: FieldErrors = {};

    for (const [field, definition] of Object.entries(schema)) {
        const { rules, sometimes: onlyIfPresent } = Array.isArray(definition)
            ? { rules: definition, sometimes: false }
            : definition;

        if (onlyIfPresent && !(field in input)) continue;

        const value = input[field];
        const context: RuleContext = { value, attribute: attributes[field] ?? field.replace(/_/g, ' '), input };
        const applicable = isEmpty(value) ? rules.filter((rule) => rule === required) : rules;

        for (const rule of applicable) {
            const message = rule(context);

            if (message) {
                errors[field] = [message];
                break;
            }
        }
    }

    return errors;
}

/** Throw a validation error (422) when there are errors. */
export function assertValid(errors: FieldErrors): void {
    if (Object.keys(errors).length > 0) throw validationError(errors);
}

// Rules -------------------------------------------------------------------------

export const required: Rule = ({ value, attribute }) =>
    isEmpty(value) || (Array.isArray(value) && value.length === 0) ? `Le champ ${attribute} est obligatoire.` : null;

export function string(max?: number): Rule {
    return ({ value, attribute }) => {
        if (typeof value !== 'string') return `Le champ ${attribute} doit être une chaîne de caractères.`;
        if (max !== undefined && value.length > max) return `Le champ ${attribute} ne peut dépasser ${max} caractères.`;

        return null;
    };
}

export const integer: Rule = ({ value, attribute }) =>
    Number.isInteger(typeof value === 'string' && value.trim() !== '' ? Number(value) : value)
        ? null
        : `Le champ ${attribute} doit être un entier.`;

export function between(min: number, max: number): Rule {
    return ({ value, attribute }) => {
        const number = Number(value);
        if (number < min) return `Le champ ${attribute} doit être supérieur ou égal à ${min}.`;
        if (number > max) return `Le champ ${attribute} ne peut être supérieur à ${max}.`;

        return null;
    };
}

/** Number with at most `decimals` decimals, between min and max. */
export function decimal(decimals: number, min: number, max: number): Rule {
    return (context) => {
        const number = Number(context.value);
        if (typeof context.value === 'boolean' || !Number.isFinite(number)) {
            return `Le champ ${context.attribute} doit être un nombre.`;
        }
        if (Math.abs(Math.round(number * 10 ** decimals) - number * 10 ** decimals) > 1e-6) {
            return `Le champ ${context.attribute} doit comporter au plus ${decimals} décimales.`;
        }

        return between(min, max)(context);
    };
}

export const boolean: Rule = ({ value, attribute }) =>
    typeof value === 'boolean' ? null : `Le champ ${attribute} doit être vrai ou faux.`;

export function oneOf(values: readonly unknown[], message?: string): Rule {
    return ({ value, attribute }) =>
        values.includes(value) ? null : (message ?? `La valeur du champ ${attribute} est invalide.`);
}

/** The value references an existing (and active) record. */
export function exists(predicate: (value: number) => boolean): Rule {
    return ({ value, attribute }) =>
        predicate(Number(value)) ? null : `La valeur du champ ${attribute} est invalide ou inactive.`;
}

/** The value is not used by another record. */
export function unique(isTaken: (value: string) => boolean): Rule {
    return ({ value, attribute }) =>
        isTaken(String(value)) ? `La valeur du champ ${attribute} est déjà utilisée.` : null;
}

export function regex(pattern: RegExp, message?: string): Rule {
    return ({ value, attribute }) =>
        pattern.test(String(value)) ? null : (message ?? `Le format du champ ${attribute} est invalide.`);
}

export const dateFormat: Rule = ({ value, attribute }) =>
    isIsoDate(value) ? null : `Le champ ${attribute} doit respecter le format Y-m-d.`;

/** Date on or after another date (null: no constraint). */
export function afterOrEqual(
    other: (input: Record<string, unknown>) => string | null | undefined,
    message?: string,
): Rule {
    return ({ value, attribute, input }) => {
        const limit = other(input);
        if (!isIsoDate(limit) || !isIsoDate(value)) return null;

        return value >= limit
            ? null
            : (message ?? `Le champ ${attribute} doit être une date postérieure ou égale au ${limit}.`);
    };
}

export const url: Rule = ({ value, attribute }) => {
    try {
        const parsed = new URL(String(value));

        return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname !== ''
            ? null
            : `Le champ ${attribute} doit être une URL valide (http ou https).`;
    } catch {
        return `Le champ ${attribute} doit être une URL valide (http ou https).`;
    }
};

export const email: Rule = ({ value, attribute }) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))
        ? null
        : `Le champ ${attribute} doit être une adresse e-mail valide.`;

export const hexColor: Rule = ({ value, attribute }) =>
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value))
        ? null
        : `Le champ ${attribute} doit être une couleur hexadécimale (ex. #007A6E).`;

/** List of at most `max` items, each one checked by the given rules. */
export function list(max: number, itemRules: Rule[] = []): Rule {
    return (context) => {
        const { value, attribute } = context;
        if (!Array.isArray(value)) return `Le champ ${attribute} doit être une liste.`;
        if (value.length > max) return `Le champ ${attribute} ne peut contenir plus de ${max} éléments.`;
        if (new Set(value).size !== value.length) return `Le champ ${attribute} contient une valeur en double.`;

        for (const item of value) {
            for (const rule of itemRules) {
                const message = rule({ ...context, value: item });
                if (message) return message;
            }
        }

        return null;
    };
}

/** Plain object (custom field values). */
export const object: Rule = ({ value, attribute }) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? null
        : `Le champ ${attribute} doit être une liste.`;

export function isIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
