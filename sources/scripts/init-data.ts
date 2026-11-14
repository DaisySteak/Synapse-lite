/**
 * Create a ready-to-use data folder (marker and the "admin" account)
 * next to "Synapse Lite.html", exactly as the "Initialiser" button of the
 * application would.
 *
 *   npm run init-data             -> ../data
 *   npm run init-data -- <folder> -> <folder>
 *
 * The script refuses to write into a folder that already contains files, so
 * it can never overwrite the data of the team.
 */
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFolder } from '../src/backend/seed';
import { MemoryStore } from '../src/storage/MemoryStore';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] ?? resolve(root, '..', 'data'));

if (existsSync(target) && readdirSync(target).length > 0) {
    console.error(`Le dossier ${target} n'est pas vide : rien n'a été écrit.`);
    process.exit(1);
}

const store = new MemoryStore();
await initializeFolder(store);

for (const [path, file] of store.files) {
    const destination = resolve(target, ...path.split('/'));
    mkdirSync(dirname(destination), { recursive: true });
    const content = typeof file.content === 'string' ? file.content : Buffer.from(await file.content.arrayBuffer());
    writeFileSync(destination, content);
}

console.log(`Dossier de données créé (${store.files.size} fichiers) : ${target}`);
