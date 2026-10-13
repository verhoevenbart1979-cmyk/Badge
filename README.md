# Suivi des badges

Eenvoudige applicatie om luchthavenbadges en -permits per persoon op te volgen.
Draait volledig in **Google Chrome** (of Edge), zonder installatie, zonder server en zonder internet.

## Starten

1. Kopieer deze map naar de pc (of naar een netwerkschijf).
2. Dubbelklik op `index.html`; de pagina opent in Chrome.
3. Eerste keer: **« Ouvrir un fichier badges.json… »** en kies de databank
   (bv. `\\server\share\Badges\badges.json`). Chrome vraagt toestemming om het
   bestand te lezen en te bewerken: kies *Modifier le fichier* / *Toestaan*.
4. Daarna toont het startscherm **« Rouvrir « badges.json » »**: één klik volstaat.

Elke wijziging wordt meteen in `badges.json` bewaard (rechtsboven: « enregistré à … »).

> De data staan **nooit** in GitHub: `.gitignore` sluit alle `.json`/`.xlsx`-bestanden uit.
> Maak regelmatig een back-up via *Base de données → Télécharger une sauvegarde*
> (of laat de netwerkschijf back-uppen).

## Schermen

| Scherm | Inhoud |
|---|---|
| **Personnes** | Zoeken, filteren op firma, klikken opent de fiche (naam, voornaam, firma, escorteur, badges & permits) |
| **Rapports → Par aéroport** | Geldig & actief / geldig maar niet actief / ongeldig / geen badge, met resterende actieve dagen |
| **Rapports → Par personne** | Status van alle documenten van één persoon |
| **Rapports → Matrice** | Personen × (luchthaven → types): ✔ groen, ✔ oranje, 🔒 geel, ✘ rood, ? grijs, – geen badge |
| **Configuration** | Luchthavens (termijnen, besoin escorteur, kolommen in de matrix), badge-types (dernier passage oui/non), firma's |
| **Base de données** | Ander bestand openen, herladen, back-up downloaden / terugzetten |

Rapporten kunnen afgedrukt worden (of als PDF via Chrome) en geëxporteerd naar Excel (CSV).

## Statusregels

| Status | Regel |
|---|---|
| ✘ Expiré | vervaldatum voorbij |
| 🔒 Valide mais inactif | type met « dernier passage » en laatste passage + délai passage < vandaag (of geen passage gekend) |
| ✔ À renouveler (oranje) | geldig en actief, maar vervalt binnen « délai demande de badge » |
| ✔ Valide et actif | anders |
| ? Date inconnue | geen vervaldatum ingevuld |

*Jours actifs restants* = laatste passage + délai passage − vandaag (begrensd door de vervaldatum).

## Technisch

- Gewone HTML/CSS/JavaScript, geen bibliotheken, geen build-stap (`js/*.js` als klassieke scripts, want ES-modules werken niet via `file://`).
- Opslag via de *File System Access API* van Chrome; noodoplossing: opslag in de browser zelf.
- Bij gelijktijdige wijziging van het bestand (andere pc) verschijnt een waarschuwing i.p.v. stil te overschrijven.
- `outils/import_excel.py`: eenmalige migratie van het oude Excel-bestand
  (`python3 outils/import_excel.py suivi.xlsx badges.json rapport.md`, vereist `openpyxl`).
