# Notes de version — Suivi des badges

## Version 3

### Nouveautés

**Rapports présélectionnés sur JDC**
Les trois rapports (par aéroport, par personne, matrice) s'ouvrent directement sur la société JDC.
Une autre société (ou « Toutes les sociétés ») reste sélectionnable. La société présélectionnée se règle
dans *Configuration → Paramètres généraux*.

**Matrice : choix des colonnes et des noms**
Chaque colonne (aéroport ou type de badge) et chaque nom a une case à cocher, toutes cochées par défaut.
Une case décochée apparaît en grisé à l'écran et disparaît de l'impression et de l'export Excel.
Boutons « tout cocher / tout décocher » pour les colonnes et pour les noms. Le choix est mémorisé.

**Nouveau statut ⏳ « Demande lancée » (violet)**
Dans la fiche d'une personne, le lien « 📨 Demande lancée… » sous le statut enregistre la date de demande
(aujourd'hui par défaut, modifiable), sans ajouter de colonne au formulaire.
- Arrivée prévue = date de demande + délai de demande de badge de l'aéroport.
- Passé cette date, le statut devient « Demande en retard ».
- La demande se clôture automatiquement dès qu'une nouvelle date d'expiration plus lointaine est encodée
  (ou avec le bouton « ✓ Reçu »).
- Si l'ancien badge est encore valide, le statut reste vert avec ⏳ en plus.
- Le rapport par aéroport comporte une section « Demande lancée » (date de demande et arrivée prévue).

**Nouveau statut ⚠ « !!! Attention !!! » (magenta)**
- Le badge expire dans moins que le délai de demande : il est trop tard pour obtenir un nouveau badge à temps.
- Ou une demande est en cours mais son arrivée prévue tombe après l'expiration du badge actuel.

L'alerte orange « À renouveler » commence désormais plus tôt : délai de demande + marge
(30 jours par défaut, réglable dans *Configuration*).

**Délai d'activité par aéroport et par type de badge**
Nouveau tableau dans *Configuration* (aéroports × types) :
- case vide = délai « dernier passage » de l'aéroport (valeur par défaut) ;
- un nombre = délai spécifique en jours ;
- `inf` (∞) = le badge ne devient jamais inactif : il reste actif tant qu'il est valide.

Les permis (TRA, RAD, MAN…) passent automatiquement à ∞, comme auparavant.
L'ancienne case « Tenir compte du dernier passage » des types de badge est remplacée par ce tableau.

**Plusieurs utilisateurs : protection de la base**
- La base s'ouvre désormais en choisissant le **dossier** qui contient `badges.json`.
- Verrou (`badges.lock`) : le premier utilisateur peut modifier ; les suivants ouvrent la base en
  **lecture seule** (bandeau jaune « en cours de modification par … ») et peuvent consulter et imprimer.
- Le verrou est rafraîchi chaque minute et expire après 5 minutes (PC éteint, Chrome planté).
  Boutons « Réessayer » et « Forcer la modification ».
- Sauvegarde automatique chaque jour dans `sauvegardes/badges_AAAA-MM-JJ.json` (30 derniers jours),
  restaurable depuis *Base de données*.

### Mise à jour

1. Fermer l'onglet de l'application dans Chrome.
2. Remplacer les fichiers de l'application (le fichier `badges.json` n'est pas touché).
3. Ouvrir `index.html`, cliquer sur « Ouvrir le dossier de la base… » et choisir le dossier **SuiviBadges**.
4. Autoriser Chrome à modifier les fichiers du dossier, puis indiquer son nom.

Les données existantes sont converties automatiquement au nouveau format.

## Version 2

- Rapport par personne : choix de la société avant la personne.
- Rapports : la date du dernier passage se modifie directement (clic = calendrier, ↻ = aujourd'hui).

## Version 1

- Première version : fiches personnes, configuration (aéroports, types de badge, sociétés),
  rapports par aéroport, par personne et matrice, import du classeur Excel existant.
