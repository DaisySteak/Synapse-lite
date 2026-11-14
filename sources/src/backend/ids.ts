/**
 * Identifiers.
 *
 * Several people write in the same folder without any server to hand out
 * numbers, so the identifiers of the records created by everyone (tickets,
 * comments, history, attachments) are built from the clock plus a random
 * part: two users never get the same one in practice. The reference data
 * (types, users...), only edited by the administrators, keep small numbers.
 */

let lastId = 0;

/** Unique, increasing identifier (about 1.8e15, safe for JavaScript numbers). */
export function uniqueId(now: number = Date.now()): number {
    const candidate = now * 1000 + Math.floor(Math.random() * 1000);
    lastId = Math.max(lastId + 1, candidate);

    return lastId;
}

/**
 * Identifier derived from a key: everyone computing it gets the same value.
 * Used for the tickets created automatically from a recurring ticket, so that
 * two users opening Synapse Lite at the same time create the ticket only once.
 * The values (5e15 to 9e15) never meet the ones of uniqueId() before 2128.
 */
export function deterministicId(key: string): number {
    return 5e15 + (hash53(key) % 4e15);
}

/** Next small identifier of a reference list (max + 1). */
export function nextSequentialId(existing: Iterable<{ id: number }>): number {
    let max = 0;
    for (const item of existing) max = Math.max(max, item.id);

    return max + 1;
}

/** 53-bit string hash (cyrb53). */
function hash53(value: string): number {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;

    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        h1 = Math.imul(h1 ^ code, 2654435761);
        h2 = Math.imul(h2 ^ code, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
