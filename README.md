# Suivi des badges

Eenvoudige applicatie om luchthavenbadges en -permits per persoon op te volgen.
Draait volledig in **Google Chrome** (of Edge), zonder installatie, zonder server en zonder internet.

## Starten

1. Zet de map `SuiviBadges` (applicatie + `badges.json`) op de pc of een netwerkschijf.
2. Dubbelklik op `index.html`; de pagina opent in Chrome.
3. Eerste keer: **« Ouvrir le dossier de la base… »** en kies de **map** waarin `badges.json` staat
   (bv. `\\server\share\SuiviBadges`). Chrome vraagt toestemming om de bestanden te bewerken: accepteer.
   Chrome vraagt ook eenmalig je naam (zichtbaar voor collega's).
4. Daarna toont het startscherm **« Rouvrir le dossier … »**: één klik volstaat.

Elke wijziging wordt meteen in `badges.json` bewaard (rechtsboven: « enregistré à … »).

## Meerdere gebruikers

- Wie de databank opent, zet een slot (`badges.lock`). Een tweede gebruiker opent de databank
  **in lezen**: raadplegen en afdrukken kan, wijzigen niet (gele balk bovenaan).
- Het slot wordt elke minuut ververst en vervalt na 5 minuten (pc uit, Chrome gecrasht).
  Met « Réessayer » kan de tweede gebruiker overnemen zodra de databank vrij is;
  « Forcer la modification » alleen gebruiken als de eerste gebruiker zeker gestopt is.
- Elke dag wordt bij het eerste openen ook **`SuiviBadges_export.xlsx`** overschreven: een leesbare Excel-export
  van alle gegevens t.e.m. de vorige dag, om bij een panne op terug te vallen (eerst kopiëren!).
- Elke dag wordt bij het eerste openen een kopie bewaard in `sauvegardes/badges_AAAA-MM-JJ.json`
  (laatste 30 dagen); terugzetten via *Base de données*.

## Schermen

| Scherm | Inhoud |
|---|---|
| **Personnes** | Zoeken, filteren op firma, klikken opent de fiche (naam, voornaam, firma, escorteur, badges & permits) |
| **Véhicules** | Wagens: type, immatriculatie, chauffeur, actief; per luchthaven één badge (nummer + geldigheid), met eigen aanvraagtermijn |
| **Rapports → Par aéroport** | Geldig & actief / geldig maar niet actief / ongeldig / geen badge, met resterende actieve dagen |
| **Rapports → Par personne** | Status van alle documenten van één persoon |
| **Rapports → Matrice** | Personen × (luchthaven → types); kolommen en namen uitvinken = niet afgedrukt/geëxporteerd |
| **Personnes → Importer le planning…** | Leest het planning (Excel) en werkt de laatste passage per luchthaven bij (aperçu vóór toepassen) |
| **Configuration** | Standaardfirma voor rapporten, marge oranje, luchthavens, délais d'activité per type, badge-types, firma's |
| **Base de données** | Ander bestand openen, herladen, back-up downloaden / terugzetten |

Rapporten kunnen afgedrukt worden (of als PDF via Chrome) en geëxporteerd naar Excel (CSV).

## Statusregels

| Status | Regel |
|---|---|
| ✘ Expiré (rood) | vervaldatum voorbij |
| ⚠ !!! Attention !!! (magenta) | vervalt binnen de *délai demande* (te laat om nog aan te vragen), of een lopende aanvraag komt pas na de vervaldatum aan |
| 🔒 Valide mais inactif (geel) | laatste passage + délai d'activité < vandaag (of geen passage gekend) |
| ✔ À renouveler (oranje) | vervalt binnen *délai demande* + marge (standaard 30 dagen) |
| ⏳ Demande lancée (paars) | aanvraag lopend (knop 📨 in de fiche); verwachte aankomst = aanvraagdatum + délai demande |
| ✔ Valide et actif (groen) | anders (met ⏳ erbij als er al een vernieuwing gevraagd is) |
| ? Date inconnue | geen vervaldatum ingevuld |

*Délai d'activité*: per luchthaven × type instelbaar in Configuration (leeg = délai dernier passage van
de luchthaven, `inf` = nooit inactief). *Jours actifs restants* = laatste passage + délai d'activité − vandaag
(begrensd door de vervaldatum). Een aanvraag sluit automatisch af zodra een latere vervaldatum wordt ingevuld.

## Technisch

- Gewone HTML/CSS/JavaScript, geen build-stap; één meegeleverde bibliotheek: SheetJS (`js/vendor/xlsx.full.min.js`, Apache-2.0) om het planning te lezen (`js/*.js` als klassieke scripts, want ES-modules werken niet via `file://`).
- Opslag via de *File System Access API* van Chrome (toegang tot de gekozen map); noodoplossing: opslag in de browser zelf.
- Naast het slot is er een tweede beveiliging: wordt `badges.json` toch buiten de applicatie gewijzigd, dan verschijnt een waarschuwing i.p.v. stil te overschrijven.
- `outils/import_excel.py`: eenmalige migratie van het oude Excel-bestand
  (`python3 outils/import_excel.py suivi.xlsx badges.json rapport.md`, vereist `openpyxl`).
- `outils/import_vehicules.py`: zet het tabblad *Véhicules* om naar `vehicules.json`, dat je in de applicatie
  importeert via *Véhicules → Importer…* (chauffeurs worden op naam gekoppeld).
