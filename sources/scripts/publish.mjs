/**
 * Publish the application next to the data:
 *
 *   synapse_lite/
 *   ├── Synapse Lite.cmd          launcher (copied from launcher/)
 *   ├── data/
 *   └── sources/
 *       └── Synapse Lite.html     the application (copied from dist/index.html)
 *
 * The users only double-click the launcher, which opens the HTML file with
 * their Windows account.
 */
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const application = resolve(root, 'dist', 'index.html');
const launcher = resolve(root, 'launcher', 'Synapse Lite.cmd');

if (!existsSync(application)) {
    console.error('dist/index.html introuvable : lancez "npm run build".');
    process.exit(1);
}

const targets = [
    [application, resolve(root, 'Synapse Lite.html')],
    [launcher, resolve(root, '..', 'Synapse Lite.cmd')],
];

for (const [source, target] of targets) {
    copyFileSync(source, target);
    const size = (statSync(target).size / 1024).toFixed(0);
    console.log(`Mis à jour (${size} Ko) : ${target}`);
}
