# Contribuer à Synapse Lite

## Environnement

| Outil   | Version                                                  |
| ------- | -------------------------------------------------------- |
| Node.js | 18.4 minimum. Le code doit compiler en Node 18 (Vite 5). |
| Chrome  | 122 ou plus récent (ou Edge) pour tester l'application.  |

```bash
npm ci
npm run dev        # http://localhost:5173, rechargement à chaud
```

En développement, l'application s'ouvre sur `http://localhost:5173` et demande un dossier de données comme le
fichier final. Utiliser un **dossier de test** (créé avec `npm run init-data -- <dossier>` ou initialisé depuis
l'écran de connexion), jamais le dossier `data` de l'équipe.

## Commandes

| Commande             | Effet                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`        | Serveur de développement.                                                     |
| `npm run build`      | Construit `Synapse Lite.html` et met à jour le lanceur `../Synapse Lite.cmd`. |
| `npm run init-data`  | Crée un dossier de données vierge (par défaut `../data`, s'il est vide).      |
| `npm run demo-data`  | Ajoute un jeu de test (demandeurs, projets, tickets) à un dossier.            |
| `npm run type-check` | Contrôle des types (`vue-tsc`).                                               |
| `npm run lint`       | ESLint.                                                                       |
| `npm run format`     | Formate le code (Prettier).                                                   |
| `npm run test`       | Tests (Vitest).                                                               |
| `npm run check`      | Tout ce qui précède sauf le build : à lancer avant chaque livraison.          |

## Conventions

- Composants en `<script setup lang="ts">`, typage strict, pas de `any`.
- Les messages destinés aux utilisateurs sont en français ; le code, les noms et les commentaires techniques sont
  en anglais.
- Les vues n'accèdent aux données que par `src/api`. La validation des entrées se fait dans `src/api`, les
  règles métier dans `src/backend/services`, les droits dans `src/backend/permissions.ts`.
- Les droits se testent avec `auth.can('…')` ou les drapeaux `can` du ticket, jamais avec le profil.
- Les fichiers ne sont lus et écrits que par `Database` et `Collection` (`src/backend`). Une écriture sur un
  enregistrement existant passe par `Collection.mutate()` (relecture avant écriture).
- Couleurs et espacements via les variables de `src/css/tokens.css`.
- Liens externes : le gestionnaire global les ouvre dans un nouvel onglet.

## Faire évoluer le format des données

Le format est versionné par `schema_version` (`src/backend/records.ts`, fichier `data/synapse-lite.json`).

- Ajouter un champ **facultatif** ne demande pas de nouvelle version : le code doit accepter son absence dans les
  fichiers existants (valeur par défaut à la lecture).
- Tout changement incompatible (renommage, changement de type, réorganisation des dossiers) demande d'augmenter
  `SCHEMA_VERSION` et d'écrire une migration exécutée à l'ouverture. Une ancienne version de l'application refuse
  alors d'ouvrir les données, ce qui évite qu'un poste non mis à jour les abîme.

## Reporter une évolution de Synapse

Les vues, composants et styles sont communs aux deux applications. Pour reporter une évolution :

1. copier les vues et composants modifiés ;
2. reporter la logique du contrôleur et du _Form Request_ dans `src/api`, celle du service dans
   `src/backend/services`, la sérialisation de la _Resource_ dans `src/backend/serializers.ts` ;
3. ajouter les tests correspondants dans `tests/`.

## Livraison

1. `npm run check` doit être vert.
2. Mettre à jour `CHANGELOG.md` et la version de `package.json`.
3. `npm run build`, puis vérifier `Synapse Lite.html` dans Chrome sur un dossier de test.
4. Remplacer `sources/Synapse Lite.html` (et `Synapse Lite.cmd` s'il a changé) dans le dossier partagé. Les
   utilisateurs n'ont qu'à recharger la page.
