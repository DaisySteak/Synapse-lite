# Architecture de Synapse Lite

Synapse Lite reprend l'interface de Synapse (Vue 3, TypeScript, Pinia) et remplace le serveur Laravel et SQL
Server par un **« serveur dans le navigateur »** qui lit et écrit des fichiers JSON dans le dossier `data`.

```
┌──────────────────────────── Synapse Lite.html ────────────────────────────┐
│  Vues et composants (src/views, src/components)  — identiques à Synapse    │
│  Stores Pinia (src/stores)                                                  │
│  Client API (src/api)          — mêmes fonctions que le client HTTP Synapse │
│        │  validation (ticketRules, admin) + droits (permissions)            │
│  Backend (src/backend)         — services, politiques, sérialisation        │
│        │  Database → Collection<T> (cache + resynchronisation)              │
│  Stockage (src/storage)        — FileStore                                  │
│        └─ FileSystemAccessStore (Chrome)   └─ MemoryStore (tests)           │
└─────────────────────────────────────────────┬──────────────────────────────┘
                                              ▼
                                   dossier data (OneDrive / SharePoint / réseau)
```

## Organisation du code

| Dossier                                  | Rôle                                                                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/views`, `src/components`, `src/css` | Interface, reprise de Synapse. Seuls les écrans liés à l'authentification et au dossier changent.                                                                          |
| `src/stores`                             | État partagé (session, référentiels, interface, connexion au dossier).                                                                                                     |
| `src/api`                                | Équivalent des contrôleurs et _Form Requests_ Laravel : valide les entrées, vérifie les droits, appelle le backend et renvoie les mêmes structures JSON que l'API Synapse. |
| `src/backend`                            | Équivalent des services, _policies_ et _resources_ Laravel (`services/`, `permissions.ts`, `serializers.ts`).                                                              |
| `src/storage`                            | Accès aux fichiers : interface `FileStore` et ses deux implémentations.                                                                                                    |
| `src/composables/useDataSync.ts`         | Boucle de resynchronisation (10 s, retour sur l'onglet).                                                                                                                   |
| `tests/`                                 | Tests du backend sur un dossier en mémoire, y compris plusieurs utilisateurs simultanés.                                                                                   |
| `scripts/`                               | `publish.mjs` (copie du build vers `Synapse Lite.html` et du lanceur vers `../Synapse Lite.cmd`), `init-data.ts`, `demo-data.ts`.                                          |

Les vues n'appellent jamais le backend directement : elles passent par `src/api`, comme dans Synapse. Une
évolution fonctionnelle se reporte donc d'une application à l'autre en adaptant la couche `api` et `backend`
à la place du contrôleur et du service PHP.

## Le fichier unique

Vite construit l'application, puis `vite-plugin-singlefile` intègre le JavaScript, le CSS, les polices
(sous-ensemble latin) et l'icône dans `dist/index.html`. `scripts/publish.mjs` copie ce fichier vers
`sources/Synapse Lite.html`, et `launcher/Synapse Lite.cmd` vers la racine. Le fichier ne charge rien depuis Internet et fonctionne ouvert en `file://`, qui est un
contexte sécurisé pour Chrome. La navigation utilise le mode _hash_ (`Synapse Lite.html#/tableau`).

## Lanceur et connexion automatique

Une page HTML ne peut pas lire le compte Windows. Le lanceur `Synapse Lite.cmd` (source :
`launcher/Synapse Lite.cmd`, fins de ligne CRLF) cherche Chrome, puis Edge (emplacements standard puis registre
`App Paths`), et ouvre `file:///…/sources/Synapse Lite.html?matricule=%USERNAME%`.

`src/utils/launch.ts` lit ce paramètre une seule fois au démarrage et le retire de l'adresse. Le garde du routeur
le consomme dès que le dossier de données est connecté : `auth.loginFromLauncher()` garde une session déjà ouverte
avec ce compte, connecte sinon l'utilisateur (« rester connecté »), ou ferme la session précédente et affiche
l'écran de connexion prérempli quand le compte n'est pas déclaré.

## Accès au dossier

`src/storage/directoryHandle.ts` :

- `showDirectoryPicker()` ouvre le sélecteur ; l'utilisateur peut désigner le dossier `data`, le dossier qui le
  contient, ou un dossier vide à initialiser ;
- le _handle_ obtenu est conservé dans IndexedDB (base `synapse-lite`) pour les visites suivantes ;
- à chaque ouverture, `queryPermission` indique si l'accès est encore accordé, sinon un clic sur « Autoriser
  l'accès » appelle `requestPermission` (Chrome exige un geste de l'utilisateur).

Le fichier `data/synapse-lite.json` identifie un dossier Synapse Lite et porte la version du format
(`schema_version`). Une version de l'application plus ancienne que les données refuse de les ouvrir.

## Organisation des données

Un fichier par enregistrement, nommé par son identifiant :

```
data/
├── synapse-lite.json                  marqueur et version du format
├── users/<id>.json                    comptes (matricule, profil, actif)
├── epics/<id>.json                    types de ticket
├── projects/<id>.json
├── requesters/<id>.json
├── custom-fields/<id>.json
├── recurring-tickets/<id>.json        modèles et règles de récurrence
├── tickets/<id>.json                  tickets (suppression logique : deleted_at)
├── comments/<ticket>/<id>.json
├── activities/<ticket>/<id>.json      historique du ticket
└── attachments/<ticket>/<id>.json     métadonnées de la pièce jointe
    attachments/<ticket>/<id>/<nom>    contenu du fichier
```

Le format de chaque fichier est décrit par les interfaces de `src/backend/records.ts`. Les dates sont en ISO 8601
(heure locale avec décalage), les montants de temps en nombres décimaux.

### Identifiants

| Données                                           | Identifiant                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| Référentiels (utilisateurs, types, projets…)      | Séquentiel (max + 1) : créés rarement, par l'administration.              |
| Tickets, commentaires, historique, pièces jointes | `Date.now() × 1000 + aléa` : deux postes ne produisent jamais le même.    |
| Tickets créés par une récurrence                  | Empreinte de (modèle, date d'occurrence) : déterministe, donc idempotent. |

Le **numéro affiché** (`EVOLUTION-12`) est distinct de l'identifiant : c'est le plus grand numéro jamais donné
dans le type (tickets supprimés et anciens numéros compris) plus un. Si deux postes créent un ticket du même type
au même instant, ils peuvent obtenir le même numéro : `TicketService.repairDuplicateNumbers()` le détecte à
l'ouverture et renumérote le plus récent (l'ancien numéro est conservé dans `previous_numbers`).

## Lecture et cache

`Collection<T>` (`src/backend/collection.ts`) garde en mémoire les enregistrements d'un dossier. `sync()` liste le
dossier et ne relit que les fichiers dont la date de modification ou la taille a changé ; les fichiers disparus
sont retirés du cache. Les noms qui ne sont pas `<nombre>.json` (copies de conflit OneDrive, fichiers
temporaires) sont ignorés.

Les commentaires, l'historique et les pièces jointes ne sont chargés qu'à l'ouverture du ticket concerné.

## Écritures et accès simultanés

Il n'y a ni verrou ni transaction : la cohérence repose sur des écritures petites et localisées.

- **Un fichier par enregistrement** : deux personnes qui modifient deux tickets différents n'écrivent jamais le
  même fichier.
- **Lecture-modification-écriture** : `Collection.mutate()` relit le fichier juste avant de le modifier et
  applique la modification sur cette version fraîche : les champs modifiés par un collègue entre-temps sont
  conservés. Seules deux modifications du même ticket à la même seconde peuvent se
  recouvrir ; la dernière gagne, comme dans la plupart des outils collaboratifs.
- **Écriture atomique** : `createWritable()` écrit dans un fichier temporaire puis le remplace ; un lecteur ne voit
  jamais un fichier à moitié écrit.
- **Rangs du kanban fractionnaires** : déplacer une carte n'écrit que cette carte (son rang devient la moyenne de
  ses voisines). La colonne n'est renumérotée que lorsque l'écart devient trop petit.
- **Compteurs recalculés** : les nombres de commentaires et de pièces jointes affichés sur les cartes sont
  recomptés à partir du dossier à chaque ajout ou suppression, jamais incrémentés.
- **Tickets récurrents idempotents** : chaque occurrence a un identifiant déterministe ; un poste vérifie que le
  ticket n'existe pas avant de le créer et n'avance la date de la prochaine occurrence que si elle n'a pas déjà été
  avancée par un autre poste.

## Suppression et purge

- **Suppression logique** (`TicketService.delete`) : `deleted_at` est renseigné, le fichier reste. Les écrans ne
  listent que les tickets actifs ; `ticketsApi.list` n'inclut les tickets supprimés que pour un utilisateur ayant
  la permission `tickets.purge` (administrateurs) et seulement quand le statut `deleted` est demandé.
  `TicketService.restore` annule la suppression.
- **Suppression définitive** (`TicketService.destroy`) : enregistre d'abord sur le type de ticket le plus grand
  numéro effacé (`last_number`, pris en compte par `nextNumber`), supprime les dossiers `attachments/<id>`,
  `comments/<id>` et `activities/<id>`, puis le fichier du ticket en dernier pour qu'une opération interrompue
  puisse être relancée.
- **Purge** (`dataApi.purge`) : applique la suppression définitive aux tickets supprimés ou à tous les
  tickets. La phrase de confirmation est vérifiée par l'API elle-même (`isConfirmed`), pas seulement par
  l'écran.

## Gestion des données

Page « Paramétrage » `views/admin/DataView.vue` (le thème en haut, `components/admin/ThemePicker.vue`), API
`src/api/data.ts`, service `backend/services/DataService.ts`, permission `admin.data` (administrateurs).

- **Modification de masse** (`DataService.reassign`) : chaque ticket non supprimé passe par
  `TicketService.update`, donc par les mêmes règles qu'une modification à l'écran (historique, nouveau numéro en
  cas de changement de type, responsable retiré des contributeurs). Les tickets récurrents sont modifiés
  directement.
- **Sauvegarde** : tous les fichiers du dossier, sous `data/` dans une archive ZIP sans compression écrite par
  `utils/zip.ts` (aucune dépendance).
- **Restauration** : `utils/zip.ts` lit les archives sans compression ou compressées (« deflate », décompressé
  par le navigateur avec `DecompressionStream`), donc aussi une sauvegarde recompressée avec Windows.
  `DataService.readBackup` cherche `synapse-lite.json` (à la racine ou dans un dossier), refuse une version de
  format plus récente et les chemins qui sortiraient du dossier. Le dossier est ensuite vidé en commençant par
  le marqueur, les fichiers sont écrits, et le marqueur en dernier : un dossier interrompu en cours de route est
  refusé par l'application et la restauration peut être relancée. L'application est rechargée ensuite.
- **Export Excel** : `utils/xlsx.ts` écrit un classeur à plusieurs feuilles ; les identifiants de plus de 15
  chiffres sont écrits en texte (Excel arrondirait les nombres).
- **Remise à zéro** (`DataService.reset`) : même ordre que la restauration, puis `initializeFolder`, qui
  n'écrit que le compte `ADMIN` (`seed.ts`, comme pour un dossier neuf). La session passe sur ce compte. Les
  tests et `npm run demo-data` ajoutent l'équipe et les types de la démonstration avec `addDemoReference`.

## Thème de couleur

`utils/themes.ts` décrit les six thèmes (échelle des couleurs de marque, fonds, texte de la barre latérale) et
les applique en variables CSS sur `<html>`, par-dessus `css/tokens.css` (dont les valeurs sont celles du vert).
Le choix d'un administrateur (`api/settings.ts`, permission `admin.data` de la page Paramétrage) est enregistré dans
`settings/1.json`, collection lue avec les référentiels : la resynchronisation l'applique chez chacun.
`main.ts` applique dès l'ouverture le dernier thème mémorisé par le navigateur, pour éviter un changement de
couleur au chargement.

## Statistiques

Page `views/admin/StatisticsView.vue`, API `src/api/statistics.ts`, permission `admin.statistics`
(administrateurs et lead tech). Les calculs sont des fonctions pures dans `backend/statistics.ts` (`computeStatistics`), sur
les tickets non supprimés déjà en mémoire ; les définitions des indicateurs sont en tête du fichier.
`utils/periods.ts` découpe la période en semaines du lundi au dimanche (mois, trimestre) ou en mois (année) ;
les semaines à venir valent `null` et interrompent les courbes.

Les graphiques (`components/stats/LineChart.vue`, `BarList.vue`) sont dessinés en SVG et CSS, sans
bibliothèque : le fichier unique reste utilisable sans Internet. Les deux couleurs de séries (#00927F, #C27C0E)
restent distinguables pour les daltoniens. Chaque bloc exporte ses données avec `utils/xlsx.ts`.

## Resynchronisation

`useDataSync` relance `Backend.sync()` toutes les 10 secondes, au retour sur l'onglet et quand la fenêtre reprend
le focus. Selon ce qui a changé :

- tickets → les vues ouvertes (tableau, backlog, liste, planning, fiche, commentaires) se rechargent sans perdre la
  saisie en cours ;
- référentiels → les listes (utilisateurs, types, projets…) et les droits de l'utilisateur connecté sont
  rechargés ; un compte désactivé est déconnecté.

`Backend.maintain()` s'exécute à l'ouverture : génération des tickets récurrents (une fois par jour et par
navigateur) et réparation des numéros en double.

## Droits

`src/backend/permissions.ts` reprend `PermissionResolver` et les _policies_ de Synapse : mêmes profils
(administrateur, lead tech, utilisateur), mêmes permissions, mêmes règles (un utilisateur ne modifie que les
tickets dont il est responsable ou contributeur, etc.). L'interface lit les mêmes drapeaux `can`.
Différence voulue : dans Synapse Lite, le lead tech gère aussi les demandeurs (`admin.requesters`) et consulte
les statistiques (`admin.statistics`).

Gestion des accès : chaque page du menu s'ouvre avec une permission (`pages.board`, `pages.backlog`,
`pages.planning`, `pages.tickets`, puis les `admin.*`, dont `admin.access` pour la page Gestion des accès), et
certaines fonctionnalités d'une page aussi (`FEATURES`, sous-lignes de leur page : `board.closed_days`, nombre
de jours de la colonne Terminé, enregistré pour toute l'équipe dans `settings/1.json` `closed_visible_days`).
Les droits de chaque profil se choisissent dans `views/admin/AccessView.vue` et sont rangés dans
`settings/1.json` (`access`, profil → permissions ; `access_known`, droits connus à l'enregistrement : un droit
ajouté par une version plus récente garde sa valeur par défaut). `backend/access.ts` décrit les pages (`PAGES`),
les fonctionnalités, les droits par défaut (`DEFAULT_ACCESS`) et `accessOf` / `storedAccess`, qui nettoient la
matrice lue et gardent toujours `admin.access` aux administrateurs. `permissionsFor` ajoute ces pages aux actions fixes du profil (`ACTIONS`) ; `Backend.actor()`
lit la matrice à chaque appel, donc l'API refuse aussitôt une page retirée. Le routeur renvoie vers
`homeRoute()`, la première page du menu encore permise, et `AppLayout` quitte la page ouverte si elle est retirée.

Ces règles organisent le travail ; elles ne protègent pas les données. Toute personne ayant accès au dossier peut
en lire et modifier les fichiers : la sécurité est celle des droits sur le dossier partagé.

## Tests

`npm run test` lance Vitest. Les tests du backend (`tests/`) utilisent `MemoryStore` ; plusieurs instances
partageant les mêmes fichiers simulent plusieurs postes (création simultanée, numéros en double, commentaires
concurrents, récurrences générées par deux postes, copies de conflit OneDrive).
