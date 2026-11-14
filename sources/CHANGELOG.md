# Journal des versions

Ce projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

## [1.9.0] - 2026-11-14

### Modifié

- Les lead tech accèdent à la page Statistiques (groupe **Pilotage** du menu).
- Menu réorganisé en groupes titrés, chacun ne s'affichant que s'il contient une page accessible :
    - suivi des tickets : Tableau, Backlog, Planning, Tous les tickets ;
    - **Pilotage** : Statistiques ;
    - **Organisation** (lead tech et administrateurs) : Projets, Demandeurs, Tickets récurrents ;
    - **Paramétrage** : Utilisateurs, Types de ticket, Champs personnalisés ;
    - **Application** : Thème, Gestion des données.
- Menu replié : un trait sépare les groupes.

## [1.8.0] - 2026-11-14

### Modifié

- Remise à zéro : supprime aussi tous les utilisateurs et tous les types de ticket. Il ne reste qu'un compte
  `admin` (prénom admin, nom admin, profil Administrateur), avec lequel l'administrateur est reconnecté.
- Un dossier de données neuf ne contient plus que ce compte `admin`, sans type de ticket.

## [1.7.1] - 2026-11-14

### Modifié

- Les lead tech gèrent les demandeurs (création, modification, désactivation, suppression).
- Tous les tickets : la case « Terminés » disparaît ; la liste s'ouvre filtrée sur tous les statuts sauf Terminé
  (et Supprimé), filtre auquel « Effacer » revient.

## [1.7.0] - 2026-11-14

### Ajouté

- Thème de couleur (Administration > Thème, administrateurs) : vert par défaut, bleu, violet, bordeaux, orange
  ou ardoise. Le choix est enregistré dans `data/settings/1.json` et s'applique à toute l'équipe ; les couleurs
  des statuts, types, projets, demandeurs et graphiques ne changent pas.

## [1.6.1] - 2026-11-14

### Modifié

- Statistiques : le délai, le stock et les tickets démarrés (anciennement « créés ») se calculent sur la date
  de début (à défaut la date de création) et la date de fin réelle ; le délai compte les deux jours extrêmes.

## [1.6.0] - 2026-11-14

### Ajouté

- Planning : l'infobulle d'une barre indique le demandeur.
- Planning : on raccourcit ou rallonge une barre à la souris en saisissant son bord gauche (date de début) ou
  droit (date de fin prévisionnelle, date de fin réelle pour un ticket terminé), avec les droits de modification
  habituels.

## [1.5.0] - 2026-11-14

### Ajouté

- Page **Statistiques** (administrateurs) pour un mois, un trimestre ou une année :
    - quatre chiffres clés : tickets ouverts, en retard, délai moyen, temps consommé ;
    - équipe : charge par personne avec alerte de surcharge (seuil réglable), taux d'occupation (temps consommé
      rapporté aux jours ouvrés), vélocité par semaine (par mois sur une année) ;
    - tickets : stock par statut et son évolution, créés et terminés par semaine, délai moyen par type, respect
      des échéances et tickets en retard, tickets bloqués (en attente ou sans modification depuis N jours),
      temps consommé par type et par projet ;
    - demandeurs : temps consommé, tickets créés et terminés, délai moyen, tickets ouverts et en retard, classés
      par temps ou par nombre de tickets ;
    - export Excel de chaque bloc, et « Tout exporter » dans un classeur unique.
- Graphiques intégrés au fichier de l'application, sans bibliothèque ni accès à Internet.

## [1.4.1] - 2026-11-14

### Ajouté

- Demandeurs : tri par colonne (clic sur l'en-tête), notamment par temps consommé ; le tri choisi est mémorisé.

## [1.4.0] - 2026-11-14

### Ajouté

- Temps consommé : boutons rapides 1 h (0,125 j/h), ½ j (0,5), 1 j et 1 sem. (5) sur le ticket et dans les
  tickets récurrents ; trois décimales acceptées.
- Au passage en Terminé, le temps consommé non renseigné est calculé en jours ouvrés (lundi au vendredi) de la
  date de début (ou de création) à la date de fin, et une fenêtre affiche ce calcul pour le confirmer ou le
  corriger (Entrée pour valider).
- Tickets récurrents : temps consommé repris sur chaque ticket créé.

### Corrigé

- Suppression d'un type de ticket : un ticket qui a seulement changé de type ne la bloque plus, et le message
  indique ce qui utilise encore le type (tickets, tickets supprimés, tickets récurrents, champs personnalisés).
  Même message précis pour les projets et les demandeurs.
- La page Gestion des données occupe toute la largeur.

## [1.3.0] - 2026-11-14

### Ajouté

- Page **Administration › Gestion des données** (administrateurs) :
    - modification de masse du propriétaire, du type ou du demandeur des tickets et des tickets récurrents ;
    - sauvegarde du dossier `data` en `.zip` et restauration d'une sauvegarde ;
    - export Excel de toutes les données, une feuille par type de données ;
    - remise à zéro des données, le compte de l'administrateur étant conservé.
- La restauration et la remise à zéro demandent une phrase de confirmation tapée et proposent de télécharger
  d'abord une sauvegarde.

### Modifié

- La purge des tickets quitte « Tous les tickets » pour la page Gestion des données. La suppression définitive
  d'un ticket reste disponible dans la liste.

## [1.2.1] - 2026-11-14

### Supprimé

- Code jamais utilisé : `withAlpha`, `formatShortDate`, le type `ValidationErrors` et six icônes.
- Dépendance de développement inutilisée `@vue/test-utils`.
- Réglages hérités de Synapse (Laravel) dans `.gitattributes`, `.editorconfig` et `.prettierignore`.

## [1.2.0] - 2026-11-14

### Ajouté

- Lanceur `Synapse Lite.cmd` à la racine : ouvre l'application dans Chrome (ou Edge) et connecte automatiquement
  l'utilisateur avec son identifiant Windows.
- Le matricule accepte aussi un identifiant Windows (lettres, chiffres, `.`, `_`, `-`).

### Modifié

- L'application est désormais `sources/Synapse Lite.html` ; la racine ne contient plus que le lanceur et `data`.
- `npm run demo-data` retrouve les membres de l'équipe par leur nom.

### Corrigé

- Backlog : les filtres s'affichent sous le titre, comme sur les autres pages.
- Planning : la ligne « Aujourd'hui » passe sous la colonne des tickets lors du défilement horizontal.

## [1.1.0] - 2026-11-14

### Ajouté

- Statut « Supprimé » dans le filtre de **Tous les tickets**, réservé aux administrateurs : les tickets supprimés
  y sont listés (identifiant barré) et peuvent être restaurés.
- Suppression définitive d'un ticket depuis la liste (administrateurs), avec ses commentaires, son historique et
  ses pièces jointes.
- Purge des tickets (administrateurs) : tickets supprimés uniquement ou tous les tickets, après saisie de la
  phrase « Je confirme la purge des tickets ».
- Les numéros des tickets supprimés définitivement ne sont jamais redonnés.
- Script `npm run demo-data` : jeu de test de 5 demandeurs, 2 projets et 20 tickets.

### Corrigé

- Supprimer un ticket depuis sa fiche n'affiche plus d'erreur « L'élément demandé n'existe pas ».

## [1.0.0] - 2026-11-14

Première version de Synapse Lite, fonctionnellement identique à Synapse 1.1.

### Ajouté

- Application en un seul fichier `Synapse Lite.html`, sans serveur, données JSON dans le dossier `data`.
- Choix du dossier de données mémorisé par le navigateur, initialisation d'un dossier vide.
- Connexion par matricule, sans mot de passe ; option « Rester connecté ».
- Resynchronisation automatique toutes les 10 secondes et au retour sur l'onglet.
- Génération des tickets récurrents à l'ouverture, sans doublon entre postes.
- Réparation automatique des numéros de ticket en double.
- Script `npm run init-data` pour créer un dossier de données vierge.

### Différences avec Synapse

- Plus de mot de passe ni d'écran de changement de mot de passe.
- Le bouton de copie de la fiche ticket copie la référence et le titre au lieu d'un lien.
