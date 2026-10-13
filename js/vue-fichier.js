'use strict';

/* Écran d'accueil (ouvrir / créer la base) et gestion du fichier. */
(function () {
  function erreur(e) {
    if (e && e.name === 'AbortError') return;   // l'utilisateur a fermé la boîte de dialogue
    U.toast(e && e.message ? e.message : String(e), true);
  }

  function apresOuverture() { App.aller('#/personnes'); }

  function lireJsonLocal(input) {
    return new Promise(function (ok, ko) {
      var f = input.files[0];
      if (!f) return ko(new Error('Aucun fichier choisi.'));
      f.text().then(function (txt) {
        try { ok(DB.normaliser(JSON.parse(txt))); } catch (e) { ko(e); }
      }, ko);
    });
  }

  function accueil(el) {
    el.innerHTML =
      '<div class="accueil"><div class="carte">' +
      '<h1>Suivi des badges</h1>' +
      '<p>Les données sont conservées dans un fichier <b>badges.json</b> (par exemple sur un lecteur réseau). ' +
      'Ouvrez le fichier existant ou créez-en un nouveau.</p>' +
      (DB.fichiersSupportes ? '' :
        '<div class="avertissement">Ce navigateur ne permet pas d\'accéder directement aux fichiers. ' +
        'Utilisez Google Chrome (ou Edge) à jour. À défaut, le stockage du navigateur peut servir de solution de secours.</div>') +
      '<div class="actions">' +
      '<button id="btn-rouvrir" hidden></button>' +
      (DB.fichiersSupportes ?
        '<button id="btn-ouvrir" class="secondaire">Ouvrir un fichier badges.json…</button>' +
        '<button id="btn-creer" class="secondaire">Créer une nouvelle base vide…</button>' : '') +
      '</div>' +
      '<h2>Solution de secours</h2>' +
      '<p class="aide">Travailler sans fichier : les données restent uniquement dans ce navigateur, sur ce PC. ' +
      'Pensez alors à télécharger régulièrement une sauvegarde.</p>' +
      '<button id="btn-navigateur" class="secondaire">Utiliser le stockage du navigateur</button>' +
      '</div></div>';

    DB.dernierFichier().then(function (h) {
      if (!h) return;
      var b = el.querySelector('#btn-rouvrir');
      b.hidden = false;
      b.textContent = 'Rouvrir « ' + h.name + ' »';
      b.onclick = function () { DB.rouvrir(h).then(apresOuverture, erreur); };
    });
    var o = el.querySelector('#btn-ouvrir');
    if (o) o.onclick = function () { DB.ouvrirFichier().then(apresOuverture, erreur); };
    var c = el.querySelector('#btn-creer');
    if (c) c.onclick = function () { DB.creerFichier().then(function () { App.aller('#/configuration'); }, erreur); };
    el.querySelector('#btn-navigateur').onclick = function () { DB.ouvrirNavigateur().then(apresOuverture, erreur); };
  }

  function gestion(el) {
    var d = DB.data;
    var copie = DB.copieDisponible();
    el.innerHTML =
      '<h1>Base de données</h1>' +
      '<div class="carte">' +
      (DB.mode === 'fichier'
        ? '<p>Fichier ouvert : <b>' + U.esc(DB.nomFichier) + '</b></p>'
        : '<div class="avertissement">Les données sont dans le <b>stockage du navigateur</b> de ce PC. ' +
          'Téléchargez régulièrement une sauvegarde' + (DB.fichiersSupportes ? ', ou enregistrez-les dans un fichier.' : '.') + '</div>') +
      '<p class="aide">' + U.pluriel(d.personnes.length, 'personne') + ' · ' + U.pluriel(d.documents.length, 'document') +
      ' · ' + U.pluriel(d.aeroports.length, 'aéroport') +
      (d.meta.modifieLe ? ' · dernière modification le ' + new Date(d.meta.modifieLe).toLocaleString('fr-BE') : '') + '</p>' +
      '<div class="barre">' +
      (DB.fichiersSupportes ? '<button id="btn-changer" class="secondaire">Ouvrir un autre fichier…</button>' : '') +
      (DB.fichiersSupportes && DB.mode === 'navigateur' ? '<button id="btn-vers-fichier">Enregistrer dans un fichier…</button>' : '') +
      (DB.mode === 'fichier' ? '<button id="btn-recharger" class="secondaire">Recharger le fichier</button>' : '') +
      '</div></div>' +
      '<div class="carte"><h2>Sauvegardes</h2>' +
      '<p class="aide">Une sauvegarde est une copie complète des données (fichier .json), à conserver en lieu sûr.</p>' +
      '<div class="barre">' +
      '<button id="btn-exporter">Télécharger une sauvegarde</button>' +
      '<label class="bouton secondaire">Restaurer une sauvegarde…<input id="inp-restaurer" type="file" accept=".json,application/json" hidden></label>' +
      (copie ? '<button id="btn-copie" class="secondaire">Télécharger la copie de secours du navigateur</button>' : '') +
      '</div></div>';

    var on = function (id, fn) { var b = el.querySelector(id); if (b) b.onclick = fn; };
    on('#btn-changer', function () { DB.ouvrirFichier().then(apresOuverture, erreur); });
    on('#btn-recharger', function () {
      DB.dernierFichier().then(function (h) { return DB.rouvrir(h); }).then(function () {
        U.toast('Fichier rechargé'); App.afficher();
      }, erreur);
    });
    on('#btn-vers-fichier', function () {
      DB.creerFichier(JSON.parse(JSON.stringify(DB.data))).then(function () { U.toast('Données enregistrées dans le fichier'); App.afficher(); }, erreur);
    });
    on('#btn-exporter', DB.exporter);
    on('#btn-copie', function () {
      U.telecharger('badges_copie_navigateur_' + U.aujourdhui() + '.json', copie, 'application/json');
    });
    el.querySelector('#inp-restaurer').onchange = function () {
      var input = this;
      lireJsonLocal(input).then(function (nouv) {
        if (!confirm('Remplacer TOUTES les données actuelles par cette sauvegarde (' +
          U.pluriel(nouv.personnes.length, 'personne') + ', ' + U.pluriel(nouv.documents.length, 'document') + ') ?')) return;
        return DB.remplacer(nouv).then(function () { U.toast('Sauvegarde restaurée'); App.afficher(); });
      }).catch(erreur).then(function () { input.value = ''; });
    };
  }

  App.enregistrerVue('fichier', function (el) {
    if (DB.data) gestion(el); else accueil(el);
  });
})();
