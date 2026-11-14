/**
 * Add a test data set to a Synapse Lite data folder: the team and the ticket
 * types of the demonstration when missing, 5 requesters, 2 projects
 * and 20 tickets spread over the team, with every status, dates around today,
 * late tickets, recently closed tickets, contributors and time spent.
 *
 *   npm run demo-data             -> ../data
 *   npm run demo-data -- <folder> -> <folder>
 *
 * The data is added next to the existing data (nothing is modified or
 * removed) and goes through the services of the application, exactly as if
 * the tickets were created from the screens. Running the script twice is
 * refused, to avoid duplicates.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Backend } from '../src/backend/Backend';
import { nowIso } from '../src/backend/clock';
import { nextSequentialId } from '../src/backend/ids';
import { Actor } from '../src/backend/permissions';
import { addDemoReference } from '../src/backend/seed';
import type { ProjectRecord, RequesterRecord, UserRecord } from '../src/backend/records';
import { addDays, toIsoDate, today } from '../src/utils/dates';
import { NodeFileStore } from './NodeFileStore';

const REQUESTERS = [
    { key: 'support', name: 'Support informatique', color: '#0B6E4F' },
    { key: 'hr', name: 'Ressources humaines', color: '#A23B3B' },
    { key: 'operations', name: 'Services généraux', color: '#2F6EBA' },
    { key: 'product', name: 'Équipe produit', color: '#C27C0E' },
    { key: 'communications', name: 'Communication interne', color: '#7A4FA0' },
] as const;

const PROJECTS = [
    {
        key: 'intranet',
        name: 'Refonte de l’espace collaboratif',
        description: 'Simplifier le partage des informations et des ressources internes.',
        color: '#007A6E',
    },
    {
        key: 'automation',
        name: 'Automatisation des demandes internes',
        description: 'Centraliser les demandes et automatiser leur suivi.',
        color: '#C27C0E',
    },
] as const;

type RequesterKey = (typeof REQUESTERS)[number]['key'];
type ProjectKey = (typeof PROJECTS)[number]['key'];
type EpicCode = 'CREATION' | 'EVOLUTION' | 'ETUDE' | 'PROBLEME' | 'QUESTION';

const ADMIN = 'admin admin';
const LEAD_TECH = 'lead-tech lead-tech';
const USER1 = 'user1 user1';
const USER2 = 'user2 user2';
const USER3 = 'user3 user3';

interface DemoTicket {
    title: string;
    type: EpicCode;
    status: 'backlog' | 'todo' | 'in_progress' | 'waiting' | 'done';
    owner: string;
    contributors?: string[];
    requester: RequesterKey;
    project?: ProjectKey;
    /** Days from today. */
    start?: number;
    due?: number;
    end?: number;
    /** Man-days. */
    time?: number;
    description?: string;
}

const TICKETS: DemoTicket[] = [
    {
        title: 'Ajouter un filtre par statut au tableau de suivi',
        type: 'EVOLUTION',
        status: 'in_progress',
        owner: USER1,
        contributors: [LEAD_TECH],
        requester: 'product',
        project: 'intranet',
        start: -10,
        due: 5,
        time: 3.5,
        description:
            'Ajouter des filtres par statut et par période au tableau de suivi.\n\n' +
            '- [x] Recueillir les besoins\n- [x] Préparer une maquette\n' +
            '- [ ] Ajouter les filtres\n- [ ] Faire valider le résultat',
    },
    {
        title: 'Créer une synthèse hebdomadaire des activités',
        type: 'CREATION',
        status: 'todo',
        owner: USER2,
        requester: 'communications',
        project: 'intranet',
        start: 2,
        due: 16,
        description: 'Présenter les principales mises à jour et les tâches terminées de la semaine.',
    },
    {
        title: 'La date de mise à jour ne s’affiche pas correctement',
        type: 'PROBLEME',
        status: 'in_progress',
        owner: USER3,
        contributors: [ADMIN],
        requester: 'support',
        start: -4,
        due: -1,
        time: 1.5,
        description: 'Le format de date varie selon le navigateur utilisé.',
    },
    {
        title: 'Étudier la mise à jour de la bibliothèque de composants',
        type: 'ETUDE',
        status: 'waiting',
        owner: LEAD_TECH,
        requester: 'support',
        project: 'automation',
        start: -20,
        due: 10,
        time: 4,
        description: 'En attente de la vérification de compatibilité avec les outils existants.',
    },
    {
        title: 'Quel délai prévoir pour une demande d’accès ?',
        type: 'QUESTION',
        status: 'done',
        owner: USER1,
        requester: 'hr',
        start: -12,
        due: -8,
        end: -9,
        time: 0.5,
    },
    {
        title: 'Ajouter une recherche au répertoire interne',
        type: 'EVOLUTION',
        status: 'todo',
        owner: USER3,
        requester: 'hr',
        start: 5,
        due: 12,
    },
    {
        title: 'Automatiser la synchronisation des listes internes',
        type: 'CREATION',
        status: 'in_progress',
        owner: LEAD_TECH,
        contributors: [USER2, USER3],
        requester: 'operations',
        project: 'automation',
        start: -15,
        due: 20,
        time: 8,
        description:
            '- [x] Définir les sources\n- [x] Préparer la synchronisation\n- [ ] Ajouter les contrôles\n- [ ] Configurer les alertes',
    },
    {
        title: 'Échec de l’import du fichier de configuration',
        type: 'PROBLEME',
        status: 'done',
        owner: USER2,
        requester: 'support',
        start: -3,
        due: -2,
        end: -2,
        time: 1,
        description: 'Le fichier était incomplet. Import relancé après ajout d’un contrôle de validation.',
    },
    {
        title: 'Inventaire des formulaires utilisés en interne',
        type: 'ETUDE',
        status: 'backlog',
        owner: ADMIN,
        requester: 'operations',
    },
    {
        title: 'Envoyer une notification lors de la publication d’un article',
        type: 'EVOLUTION',
        status: 'backlog',
        owner: LEAD_TECH,
        requester: 'communications',
        project: 'intranet',
    },
    {
        title: 'Tableau de suivi des demandes de matériel',
        type: 'CREATION',
        status: 'todo',
        owner: USER1,
        requester: 'operations',
        start: 0,
        due: 21,
    },
    {
        title: 'Quelle est la règle d’archivage des documents internes ?',
        type: 'QUESTION',
        status: 'waiting',
        owner: USER2,
        requester: 'communications',
        start: -6,
        description: 'Question transmise à l’équipe en charge de la documentation.',
    },
    {
        title: 'Des éléments sont importés en double dans le catalogue',
        type: 'PROBLEME',
        status: 'todo',
        owner: USER3,
        requester: 'operations',
        project: 'automation',
        start: 1,
        due: 8,
    },
    {
        title: 'Conserver l’historique des modifications des paramètres',
        type: 'EVOLUTION',
        status: 'in_progress',
        owner: USER2,
        requester: 'support',
        project: 'automation',
        start: -8,
        due: 12,
        time: 2,
    },
    {
        title: 'Préparer l’export annuel de l’inventaire du matériel',
        type: 'CREATION',
        status: 'done',
        owner: ADMIN,
        requester: 'operations',
        start: -25,
        due: -10,
        end: -6,
        time: 2.5,
    },
    {
        title: 'Étudier une amélioration du parcours de demande interne',
        type: 'ETUDE',
        status: 'backlog',
        owner: USER1,
        requester: 'product',
    },
    {
        title: 'Quels champs inclure dans le formulaire de réservation ?',
        type: 'QUESTION',
        status: 'todo',
        owner: ADMIN,
        requester: 'operations',
        start: 3,
        due: 10,
    },
    {
        title: 'Le tableau de bord met du temps à charger',
        type: 'PROBLEME',
        status: 'waiting',
        owner: USER3,
        contributors: [LEAD_TECH],
        requester: 'product',
        project: 'intranet',
        start: -9,
        due: 3,
        time: 1,
    },
    {
        title: 'Ajouter des indicateurs de fréquentation de l’espace collaboratif',
        type: 'EVOLUTION',
        status: 'todo',
        owner: LEAD_TECH,
        requester: 'communications',
        project: 'intranet',
        start: 7,
        due: 35,
    },
    {
        title: 'Documenter les interfaces entre les outils internes',
        type: 'CREATION',
        status: 'done',
        owner: USER1,
        contributors: [ADMIN],
        requester: 'support',
        project: 'automation',
        start: -18,
        due: -5,
        end: -3,
        time: 3,
    },
];

const day = (offset: number | undefined) => (offset === undefined ? null : toIsoDate(addDays(today(), offset)));

async function main(): Promise<void> {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const folder = resolve(process.argv[2] ?? resolve(root, '..', 'data'));
    const server = await Backend.open(new NodeFileStore(folder));
    const { db } = server;
    await db.sync();

    // A new folder holds only the "admin" account: the team and the ticket types are added first.
    await addDemoReference(db);

    const existingTitles = new Set(db.tickets.all().map((ticket) => ticket.title));
    if (TICKETS.some((ticket) => existingTitles.has(ticket.title))) {
        throw new Error('Le jeu de test est déjà présent dans ce dossier : rien n’a été ajouté.');
    }

    const users = new Map<string, UserRecord>(
        db.users.all().map((user) => [`${user.first_name} ${user.last_name ?? ''}`.trim(), user]),
    );
    const user = (name: string) => {
        const found = users.get(name);
        if (!found) throw new Error(`Utilisateur « ${name} » introuvable dans le dossier.`);
        return found;
    };
    const epics = new Map(db.epics.all().map((epic) => [epic.code, epic.id]));

    // Requesters and projects: reused when one with the same name exists.
    const requesters = new Map<RequesterKey, number>();
    for (const { key, name, color } of REQUESTERS) {
        const existing = db.requesters.all().find((requester) => requester.name === name);
        const timestamp = nowIso();
        const record: RequesterRecord = existing ?? {
            id: nextSequentialId(db.requesters.all()),
            name,
            color,
            is_active: true,
            created_at: timestamp,
            updated_at: timestamp,
        };
        if (!existing) await db.requesters.save(record);
        requesters.set(key, record.id);
    }

    const projects = new Map<ProjectKey, number>();
    for (const { key, name, description, color } of PROJECTS) {
        const existing = db.projects.all().find((project) => project.name === name);
        const timestamp = nowIso();
        const record: ProjectRecord = existing ?? {
            id: nextSequentialId(db.projects.all()),
            name,
            description,
            color,
            is_active: true,
            created_at: timestamp,
            updated_at: timestamp,
        };
        if (!existing) await db.projects.save(record);
        projects.set(key, record.id);
    }

    for (const ticket of TICKETS) {
        const owner = user(ticket.owner);
        const epicId = epics.get(ticket.type);
        if (epicId === undefined) throw new Error(`Type de ticket ${ticket.type} introuvable dans le dossier.`);

        await server.tickets.create(
            {
                title: ticket.title,
                description: ticket.description ?? null,
                status_code: ticket.status,
                epic_id: epicId,
                project_id: ticket.project ? projects.get(ticket.project)! : null,
                requester_id: requesters.get(ticket.requester)!,
                owner_id: owner.id,
                supporter_ids: (ticket.contributors ?? []).map((name) => user(name).id),
                start_date: day(ticket.start),
                due_date: day(ticket.due),
                actual_end_date: day(ticket.end),
                time_spent: ticket.time ?? null,
            },
            new Actor(owner),
        );
    }

    console.log(
        `Jeu de test ajouté dans ${folder} : ${REQUESTERS.length} demandeurs, ${PROJECTS.length} projets, ` +
            `${TICKETS.length} tickets.`,
    );
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
