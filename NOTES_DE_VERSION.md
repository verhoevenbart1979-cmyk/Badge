# Notes de version — Suivi des badges

## Version 4.4

### Export Excel de secours

- Chaque jour, à la **première ouverture** de l'application (en modification), le fichier
  **SuiviBadges_export.xlsx** est remplacé dans le dossier de la base. Il contient toutes les données
  enregistrées jusqu'à ce moment, donc jusqu'à la veille (les données ne changent que dans l'application).
- Lisible avec Excel sans l'application : une feuille par aéroport (comme l'ancien classeur), la liste de tous
  les badges et permis avec leur statut, le dernier passage, les personnes, les véhicules, les délais,
  les projets et l'historique des imports du planning. Les dates sont de vraies dates Excel.
- *Base de données* : date de la dernière mise à jour, bouton « Mettre à jour l'export maintenant »
  et « Télécharger une copie Excel ».
- Si le fichier est ouvert dans Excel au moment de l'export, un message le signale ; l'export est refait
  à la prochaine ouverture.

## Version 4.3

### Suivi ISO de l'import du planning (au moins 1 fois par mois)

- Chaque import validé du planning est enregistré : date, heure, utilisateur, fichier, nombre de dates mises à jour.
  Un import sans changement se valide aussi (« Valider l'import ») pour être compté.
- Bandeau orange sur tous les écrans quand le dernier import date de plus de **20 jours**
  (réglable dans *Configuration → Paramètres généraux*), avec un bouton « Importer le planning… ».
- *Rapports → Suivi du planning (ISO)* : par mois, le nombre d'imports et l'état
  (conforme / non conforme : aucun import / mois en cours / à venir), les mois sans import inclus ;
  détail des imports ; impression et export Excel. Le suivi commence au mois d'installation de cette version.

## Version 4.2

- **Dernier passage par aéroport** : une seule date par personne et par aéroport, valable pour tous ses badges
  et permis de cet aéroport. Dans la fiche : bloc « Dernier passage par aéroport » (avec ↻ = aujourd'hui).
  Les anciennes dates par badge ont été regroupées automatiquement (la plus récente est gardée).
- **Projets** (*Configuration → Projets*) : numéro, aéroport et commentaire. 41 projets chargés au départ
  (liste JDC + onglet L_PROJET du planning) ; les projets sur un aéroport inconnu de l'application ne sont pas repris.
- **Import du planning** (*Personnes → Importer le planning…*) : l'application part d'aujourd'hui et remonte
  dans le temps pour trouver, par personne, le dernier jour passé sur chaque aéroport (via les codes projet).
  Les jours après aujourd'hui (prévisions) sont ignorés. Une date existante plus récente n'est jamais remplacée.
  Un aperçu des changements est affiché avant d'appliquer.

## Version 4.1

- Véhicules : chaque véhicule a une **société** (celle du chauffeur, sinon JDC) ; la page s'ouvre sur **JDC**.
- Véhicules : cases à cocher sur les colonnes et sur chaque véhicule, comme dans la matrice.
  Décoché = grisé à l'écran, absent de l'impression et de l'export. Boutons « tout cocher / tout décocher ».

## Version 4

### Nouveauté : les véhicules

- Nouveau menu **Véhicules**, séparé des personnes.
- Pour chaque véhicule : type, immatriculation, chauffeur (lié à une personne, ou « non attribué ») et case « Véhicule actif ».
  Un véhicule vendu (décoché) n'apparaît plus dans les tableaux.
- Un badge par aéroport : numéro et date de validité.
- Statuts comme pour les personnes, sans « inactif » : valide, à renouveler, demande lancée, !!! Attention !!!, expiré.
- Délai de demande propre aux véhicules, par aéroport (*Configuration* : « Badges véhicules » et « Délai demande véhicule »).
  Par défaut : Brussels Airport 62 jours, Charleroi, Liège et Luxembourg 90 jours.
- Vue d'ensemble avec filtres (aéroport, statut, « à traiter »), impression et export Excel.
- La fiche d'une personne indique son véhicule.
- Import des véhicules de l'ancien fichier Excel (menu Véhicules → Importer…).

## Version 3.2

### Nouveauté

- Matrice : un « E » vert à côté du nom des aéroports où un escorteur est nécessaire.
- Dans les cases badge de ces aéroports, un petit « E » à côté du statut pour chaque escorteur :
  - « E » vert : escorteur avec un badge valide et actif ;
  - « E » gris barré : escorteur, mais badge expiré ou inactif (il ne peut pas escorter).
- L'export Excel indique aussi « + escorteur ».

## Version 3.1

### Correction

- Après avoir fermé Chrome puis rouvert l'application, la base pouvait s'ouvrir en lecture seule
  avec le message « en cours de modification par » … soi-même (le verrou n'avait pas été libéré
  à la fermeture). L'application reconnaît maintenant ses propres anciens verrous sur le même PC
  et les reprend automatiquement. Un deuxième onglet ouvert en même temps reste en lecture seule,
  comme un autre PC.

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
