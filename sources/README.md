# Synapse Lite

Synapse Lite est la version « dossier partagé » de **Synapse**, l'outil de suivi des tickets.
Elle offre les mêmes écrans et les mêmes fonctionnalités, sans serveur ni base de données : l'application
tient dans **un seul fichier HTML** ouvert dans Chrome, et toutes les données sont des fichiers JSON rangés dans
le dossier `data`.

```
synapse_lite/
├── Synapse Lite.cmd        ← le lanceur : double-clic pour ouvrir l'application
├── data/                   ← toutes les données
└── sources/                ← le code source (ce dossier), pour faire évoluer l'application
    └── Synapse Lite.html   ← l'application (complète, autonome), ouverte par le lanceur
```
## Utilisation

### Navigateur

Google Chrome ou Microsoft Edge (version 122 ou plus récente) sur un poste Windows. L'application utilise
l'API _File System Access_, que Firefox et Safari ne proposent pas : ils affichent un message d'explication.

### Premier lancement sur un poste

1. Double-cliquer sur `Synapse Lite.cmd`. Le lanceur ouvre l'application dans Chrome (ou Edge si Chrome n'est
   pas installé) avec l'identifiant Windows de la session.
2. Cliquer sur **Choisir le dossier data** et sélectionner le dossier `data` (ou le dossier
   `synapse_lite` qui le contient).
3. Chrome demande l'autorisation de modifier les fichiers : choisir **Modifier les fichiers**, puis, si Chrome le
   propose, **Autoriser à chaque visite** pour ne plus avoir à le refaire.
4. L'utilisateur est connecté automatiquement si son identifiant Windows est déclaré comme matricule dans
   **Administration › Utilisateurs**. Sinon, l'écran de connexion s'affiche, prérempli, avec la raison. Aucun mot
   de passe : c'est l'accès au dossier partagé qui protège les données.

### Matricule et connexion automatique

Le matricule est l'identifiant de connexion : le matricule de l'entreprise ou l'identifiant Windows
(lettres, chiffres, `.`, `_` ou `-`, de 2 à 32 caractères, sans distinction de casse). Pour la connexion
automatique, il doit être **identique à l'identifiant Windows** de la personne (`echo %USERNAME%` dans une invite
de commandes) : le lanceur ouvre `sources/Synapse Lite.html?matricule=<identifiant Windows>`, et l'application
retire aussitôt ce paramètre de la barre d'adresse.

Ouvrir directement `sources/Synapse Lite.html` reste possible : l'écran de connexion demande alors le matricule.

Le navigateur mémorise le dossier choisi. Aux ouvertures suivantes, Chrome peut redemander l'autorisation
d'accès d'un clic (« Autoriser l'accès »). Le dossier se change à tout moment depuis **Mon profil**.

### Compte de départ

Un dossier de données neuf, ou remis à zéro, contient un seul compte : prénom `admin`, nom `admin`, matricule
`admin`, profil Administrateur, et aucun type de ticket. Se connecter avec le matricule `admin`, puis créer les
comptes de l'équipe dans **Administration › Utilisateurs** (ajout, profil, désactivation) et les types de ticket
dans **Administration › Types de ticket**.

### Dossier partagé (OneDrive / SharePoint)

Le dossier `synapse_lite` peut être synchronisé par OneDrive (bibliothèque SharePoint de l'équipe) ou placé sur
un partage réseau. Recommandations :

- Sur chaque poste, faire un clic droit sur le dossier puis **Toujours conserver sur cet appareil**, pour que
  les fichiers soient réellement présents sur le disque.
- Les modifications des collègues apparaissent automatiquement : l'application relit le dossier toutes les
  10 secondes et à chaque retour sur l'onglet. Avec OneDrive, compter en plus le délai de synchronisation
  (quelques secondes à une minute).
- Ne pas modifier ni déplacer les fichiers du dossier `data` à la main. Les copies de conflit créées par
  OneDrive (`12.json` → `12-PC-LOGIN.json`) sont ignorées par l'application et peuvent être supprimées.

Le fonctionnement détaillé (organisation des fichiers, accès simultanés) est décrit dans
[docs/architecture.md](docs/architecture.md).

### Gestion des données (administrateurs)

La page **Administration › Gestion des données** regroupe les opérations sur l'ensemble des données :

- **Modification de masse** : remplace un propriétaire, un type de ticket ou un demandeur par un autre sur tous les
  tickets non supprimés et sur les tickets récurrents. Chaque ticket garde la trace du changement dans son
  historique ; un ticket qui change de type reçoit un nouveau numéro dans ce type.
- **Sauvegarde** : télécharge un fichier `.zip` contenant tout le dossier `data` (pièces jointes comprises).
- **Restauration** : remplace toutes les données par celles d'une sauvegarde. L'archive est vérifiée et son
  contenu affiché avant de confirmer.
- **Export Excel** : toutes les données dans un classeur, une feuille par type de données (tickets,
  commentaires, historique, pièces jointes, utilisateurs, demandeurs, projets, types, champs personnalisés,
  tickets récurrents).
- **Purge des tickets** : voir ci-dessous.
- **Remise à zéro** : efface toutes les données, utilisateurs et types de ticket compris, et ne laisse que le
  compte `admin` ; l'administrateur qui la lance est reconnecté avec ce compte.

La purge, la restauration et la remise à zéro demandent de taper une phrase de confirmation (le collage est
désactivé) et proposent de télécharger d'abord une sauvegarde des données actuelles.

### Sauvegarde

Les données sont de simples fichiers : une copie du dossier `data`, ou le `.zip` de la page **Gestion des
données**, est une sauvegarde complète. SharePoint conserve en plus l'historique des versions de chaque fichier.

### Planning

Le survol d'une barre affiche le ticket, son propriétaire, son statut, son demandeur et ses dates. Pour changer
les dates d'un ticket que l'on peut modifier, saisir à la souris le bord gauche de sa barre (date de début) ou
son bord droit (date de fin prévisionnelle, ou date de fin réelle d'un ticket terminé) et le faire glisser : la
date s'affiche jour par jour et s'enregistre au relâchement.

### Thème de couleur (administrateurs)

Menu **Administration > Thème** : six thèmes (vert par défaut, bleu, violet, bordeaux, orange, ardoise). Le choix
est enregistré dans le dossier de données (`settings/1.json`) et s'applique à toute l'équipe en quelques
secondes ; chaque navigateur réaffiche le dernier thème dès l'ouverture.

### Statistiques (administrateurs)

Menu **Administration > Statistiques**, pour un mois, un trimestre ou une année (flèches pour changer de
période). Les blocs marqués « À ce jour » montrent l'état actuel, les autres ce qui s'est passé sur la période :

- un ticket **ouvert** n'est ni terminé ni au backlog ; il est **en retard** quand son échéance est dépassée ;
- le **début** d'un ticket est sa date de début, ou à défaut sa date de création ; sa **fin** est sa date de fin
  réelle ;
- le **délai** d'un ticket terminé compte les jours calendaires de son début à sa fin, inclus ;
- le **temps consommé** et le **taux d'occupation** reprennent les tickets terminés sur la période ; le taux
  rapporte ce temps aux jours ouvrés de la période (jusqu'à aujourd'hui pour la période en cours) ;
- un ticket **bloqué** est en attente, ou ouvert sans aucune modification depuis le nombre de jours choisi.

Chaque bloc s'exporte vers Excel ; « Tout exporter » réunit tous les blocs et une synthèse dans un classeur.

### Temps consommé

Le temps consommé se saisit en jours/homme (j/h), au clavier ou avec les boutons rapides 1 h (0,125), ½ j (0,5),
1 j et 1 sem. (5). Quand un ticket passe en **Terminé** sans temps renseigné, l'application compte les jours
ouvrés (lundi au vendredi, jours fériés non connus) entre la date de début, ou à défaut la date de création, et
la date de fin, puis affiche ce calcul dans une fenêtre pour le confirmer ou le corriger. Les statistiques des
demandeurs cumulent ce temps consommé.

### Tickets récurrents

Les tickets récurrents sont créés à l'ouverture de l'application, une fois par jour et par poste (il n'y a pas
de serveur pour le faire en tâche planifiée). Plusieurs postes peuvent le faire en même temps sans créer de
doublon. Un administrateur peut aussi forcer la génération depuis **Administration › Tickets récurrents**.

### Tickets supprimés et purge

Supprimer un ticket le retire des écrans sans effacer son fichier (suppression logique). Les administrateurs
le retrouvent dans **Tous les tickets** en choisissant le statut **Supprimé** dans le filtre ; chaque ligne
propose alors de le restaurer ou de le supprimer définitivement.

La **suppression définitive** d'un ticket (ticket, commentaires, historique et pièces jointes effacés du dossier)
se fait ligne par ligne dans **Tous les tickets**, après confirmation. La **purge**, qui supprime définitivement
soit les tickets déjà supprimés, soit tous les tickets, se trouve dans **Gestion des données** : l'administrateur
doit taper la phrase « Je confirme la purge des tickets » avant que le bouton ne s'active.

Ces opérations sont irréversibles, hors historique des versions de SharePoint. Les numéros des tickets effacés ne
sont jamais réattribués.

### Différences avec Synapse

| Synapse                                     | Synapse Lite                                                      |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Identifiant + mot de passe                  | Matricule seul, connexion automatique par le lanceur              |
| Base SQL Server                             | Fichiers JSON du dossier `data`                                   |
| Tâche planifiée pour les tickets récurrents | Génération à l'ouverture de l'application                         |
| Bouton « Copier le lien » du ticket         | Copie la référence et le titre (« EVOLUTION-12 · Titre »)         |
| Mise à jour immédiate pour tous             | Mise à jour sous 10 s (plus le délai de synchronisation OneDrive) |

Toutes les autres fonctionnalités sont identiques : tableau kanban, backlog, liste de tous les tickets et
exports Excel/CSV/JSON, planning, fiche ticket (Markdown, cases à cocher, pièces jointes, commentaires,
historique, temps consommé, champs personnalisés), tickets récurrents, projets, types de ticket, demandeurs.

## Faire évoluer l'application

Les fichiers `Synapse Lite.html` et `../Synapse Lite.cmd` sont **générés** à partir du code de ce dossier `sources`. Ne jamais le modifier à
la main : modifier les sources puis reconstruire.

Prérequis : Node.js 18.4 ou plus récent.

```bash
cd sources
npm ci              # installe les dépendances (une seule fois)
npm run dev         # serveur de développement avec rechargement à chaud (http://localhost:5173)
npm run check       # contrôle des types, lint, format et tests
npm run build       # régénère Synapse Lite.html et ../Synapse Lite.cmd (depuis launcher/)
```

`npm run init-data -- <dossier>` crée un dossier de données vierge (utilisateurs et types par défaut) ; il refuse
d'écrire dans un dossier non vide.

`npm run demo-data -- <dossier data>` ajoute un jeu de test (5 demandeurs, 2 projets, 20 tickets répartis sur
l'équipe) à côté des données existantes, sans rien modifier ; il refuse de s'exécuter deux fois sur le même
dossier.

Voir aussi :

- [docs/architecture.md](docs/architecture.md) : organisation du code, stockage, accès concurrents ;
- [CONTRIBUTING.md](CONTRIBUTING.md) : conventions et processus de contribution ;
- [CHANGELOG.md](CHANGELOG.md) : historique des versions.
