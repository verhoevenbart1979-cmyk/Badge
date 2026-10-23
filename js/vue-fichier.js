'use strict';

/* Écran d'accueil (ouvrir / créer la base) et gestion de la base. */
(function () {
  function erreur(e) {
    if (e && e.name === 'AbortError') return;   // l'utilisateur a fermé la boîte de dialogue
    U.toast(e && e.message ? e.message : String(e), true);
  }

  function apresOuverture() {
    if (DB.lectureSeule) U.toast('Base ouverte en lecture seule : elle est utilisée par ' + (DB.verrouAutre ? DB.verrouAutre.utilisateur : 'quelqu\'un d\'autre') + '.', true);
    App.aller('#/personnes');
  }

  function lireJsonLocal(input) {
    return new Promise(function (ok, ko) {
      var f = input.files[0];
      if (!f) return ko(new Error('Aucun fichier choisi.'));
      f.text().then(function (txt) {
        try { ok(DB.normaliser(JSON.parse(txt))); } catch (e) { ko(e); }
      }, ko);
    });
  }

  function confirmerRemplacement(nouv, origine) {
    return confirm('Remplacer TOUTES les données actuelles par ' + origine + ' (' +
      U.pluriel(nouv.personnes.length, 'personne') + ', ' + U.pluriel(nouv.documents.length, 'document') + ') ?');
  }

  function accueil(el) {
    el.innerHTML =
      '<div class="accueil"><div class="carte">' +
      '<h1>Suivi des badges</h1>' +
      '<p>Les données sont dans le fichier <b>' + DB.NOM_FICHIER + '</b>. ' +
      'Choisissez le <b>dossier</b> qui contient ce fichier (par exemple le dossier <i>SuiviBadges</i> sur le lecteur réseau).</p>' +
      (DB.dossiersSupportes ? '' :
        '<div class="avertissement">Ce navigateur ne permet pas d\'accéder aux dossiers. ' +
        'Utilisez Google Chrome (ou Edge) à jour. À défaut, le stockage du navigateur peut servir de solution de secours.</div>') +
      '<div class="actions">' +
      '<button id="btn-rouvrir" hidden></button>' +
      (DB.dossiersSupportes ?
        '<button id="btn-ouvrir" class="secondaire">Ouvrir le dossier de la base…</button>' +
        '<button id="btn-creer" class="secondaire">Créer une nouvelle base vide…</button>' : '') +
      '</div>' +
      '<p class="aide">Chrome demande ensuite l\'autorisation de modifier les fichiers du dossier : acceptez. ' +
      'Si une autre personne utilise déjà la base, elle s\'ouvre en lecture seule.</p>' +
      '<h2>Solution de secours</h2>' +
      '<p class="aide">Travailler sans fichier : les données restent uniquement dans ce navigateur, sur ce PC. ' +
      'Pensez alors à télécharger régulièrement une sauvegarde.</p>' +
      '<button id="btn-navigateur" class="secondaire">Utiliser le stockage du navigateur</button>' +
      '</div></div>';

    DB.dernierDossier().then(function (h) {
      if (!h) return;
      var b = el.querySelector('#btn-rouvrir');
      b.hidden = false;
      b.textContent = 'Rouvrir le dossier « ' + h.name + ' »';
      b.onclick = function () { DB.rouvrir(h).then(apresOuverture, erreur); };
    });
    var o = el.querySelector('#btn-ouvrir');
    if (o) o.onclick = function () { DB.ouvrirDossier().then(apresOuverture, erreur); };
    var c = el.querySelector('#btn-creer');
    if (c) c.onclick = function () { DB.creerBase().then(function () { App.aller('#/configuration'); }, erreur); };
    el.querySelector('#btn-navigateur').onclick = function () { DB.ouvrirNavigateur().then(apresOuverture, erreur); };
  }

  function gestion(el) {
    var d = DB.data;
    var copie = DB.copieDisponible();
    el.innerHTML =
      '<h1>Base de données</h1>' +
      '<div class="carte">' +
      (DB.mode === 'dossier'
        ? '<p>Dossier ouvert : <b>' + U.esc(DB.nomDossier) + '</b> (fichier ' + DB.NOM_FICHIER + ')' +
          (DB.lectureSeule ? ' — <b>lecture seule</b>' : '') + '</p>' +
          '<p>Votre nom : <b>' + U.esc(DB.utilisateur() || '?') + '</b> <button class="secondaire filtre" id="btn-nom">Modifier</button></p>'
        : '<div class="avertissement">Les données sont dans le <b>stockage du navigateur</b> de ce PC. ' +
          'Téléchargez régulièrement une sauvegarde' + (DB.dossiersSupportes ? ', ou enregistrez-les dans un dossier.' : '.') + '</div>') +
      '<p class="aide">' + U.pluriel(d.personnes.length, 'personne') + ' · ' + U.pluriel(d.documents.length, 'document') +
      ' · ' + U.pluriel(d.aeroports.length, 'aéroport') +
      (d.meta.modifieLe ? ' · dernière modification le ' + new Date(d.meta.modifieLe).toLocaleString('fr-BE') +
        (d.meta.modifiePar ? ' par ' + U.esc(d.meta.modifiePar) : '') : '') + '</p>' +
      '<div class="barre filtre">' +
      (DB.dossiersSupportes ? '<button id="btn-changer" class="secondaire">Ouvrir un autre dossier…</button>' : '') +
      (DB.dossiersSupportes && DB.mode === 'navigateur' ? '<button id="btn-vers-dossier">Enregistrer dans un dossier…</button>' : '') +
      (DB.mode === 'dossier' ? '<button id="btn-recharger" class="secondaire">Recharger</button>' : '') +
      '</div></div>' +

      (DB.mode === 'dossier' ? '<div class="carte"><h2 style="margin-top:0">Export Excel de secours</h2>' +
        '<p class="aide">Chaque jour, à la première ouverture, l\'application remplace le fichier <b>' + U.esc(ExportExcel.NOM_FICHIER) +
        '</b> dans le dossier de la base. Il contient toutes les données jusqu\'à la veille et se lit avec Excel, sans l\'application. ' +
        'En cas de panne : faites-en une copie et travaillez dans la copie.</p>' +
        '<p id="info-export" class="aide">…</p>' +
        '<div class="barre filtre"><button id="btn-export-xlsx" class="secondaire edition">Mettre à jour l\'export maintenant</button>' +
        '<button id="btn-export-dl" class="secondaire">Télécharger une copie Excel</button></div></div>' : '') +

      (DB.mode === 'dossier' ? '<div class="carte"><h2 style="margin-top:0">Sauvegardes automatiques</h2>' +
        '<p class="aide">Chaque jour, à la première ouverture en modification, une copie est enregistrée dans le sous-dossier ' +
        '<b>sauvegardes</b> (les 30 dernières sont gardées).</p><div id="liste-sauvegardes" class="aide">Chargement…</div></div>' : '') +

      '<div class="carte"><h2 style="margin-top:0">Sauvegarde manuelle</h2>' +
      '<p class="aide">Une copie complète des données (fichier .json), à conserver en lieu sûr.</p>' +
      '<div class="barre filtre">' +
      '<button id="btn-exporter">Télécharger une sauvegarde</button>' +
      '<label class="bouton secondaire edition">Restaurer une sauvegarde…<input id="inp-restaurer" class="edition" type="file" accept=".json,application/json" hidden></label>' +
      (copie ? '<button id="btn-copie" class="secondaire">Télécharger la copie de secours du navigateur</button>' : '') +
      '</div></div>';

    var on = function (id, fn) { var b = el.querySelector(id); if (b) b.onclick = fn; };
    on('#btn-nom', function () { DB.changerUtilisateur(); App.afficher(); });
    on('#btn-changer', function () { DB.ouvrirDossier().then(apresOuverture, erreur); });
    on('#btn-recharger', function () {
      DB.reessayer().then(function () { U.toast('Base rechargée'); App.afficher(); }, erreur);
    });
    on('#btn-vers-dossier', function () {
      DB.creerBase(JSON.parse(JSON.stringify(DB.data))).then(function () { U.toast('Données enregistrées dans le dossier'); App.afficher(); }, erreur);
    });
    on('#btn-exporter', DB.exporter);
    on('#btn-copie', function () {
      U.telecharger('badges_copie_navigateur_' + U.aujourdhui() + '.json', copie, 'application/json');
    });
    el.querySelector('#inp-restaurer').onchange = function () {
      var input = this;
      lireJsonLocal(input).then(function (nouv) {
        if (!confirmerRemplacement(nouv, 'cette sauvegarde')) return;
        return DB.remplacer(nouv).then(function () { U.toast('Sauvegarde restaurée'); App.afficher(); });
      }).catch(erreur).then(function () { input.value = ''; });
    };

    var infoExport = el.querySelector('#info-export');
    function majInfoExport() {
      if (!infoExport) return;
      DB.dateExportExcel().then(function (e) {
        infoExport.innerHTML = e ? 'Dernière mise à jour : <b>' + e.date.toLocaleString('fr-BE') + '</b>' : 'Pas encore d\'export.';
      });
    }
    majInfoExport();
    on('#btn-export-xlsx', function () {
      DB.exporterExcelMaintenant().then(function () { U.toast('Export Excel mis à jour.'); majInfoExport(); }, function (e) {
        erreur(new Error('Export impossible : ' + (e.message || e) + ' (le fichier est peut-être ouvert dans Excel).'));
      });
    });
    on('#btn-export-dl', function () {
      U.telecharger('SuiviBadges_export_' + U.aujourdhui() + '.xlsx', ExportExcel.octets(DB.utilisateur()),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    var zone = el.querySelector('#liste-sauvegardes');
    if (zone) DB.listerSauvegardes().then(function (noms) {
      if (!noms.length) { zone.textContent = 'Aucune sauvegarde pour l\'instant.'; return; }
      zone.innerHTML = '<table style="max-width:520px"><tbody>' + noms.map(function (n) {
        var m = /badges_(\d{4}-\d{2}-\d{2})/.exec(n);
        return '<tr><td>' + U.esc(m ? U.fmtDate(m[1]) : n) + '</td><td class="aide">' + U.esc(n) + '</td>' +
          '<td><button class="secondaire" data-restaurer="' + U.esc(n) + '">Restaurer</button></td></tr>';
      }).join('') + '</tbody></table>';
      zone.onclick = function (e) {
        var n = e.target.getAttribute('data-restaurer');
        if (!n) return;
        DB.lireSauvegarde(n).then(function (nouv) {
          if (!confirmerRemplacement(nouv, 'la sauvegarde ' + n)) return;
          return DB.remplacer(nouv).then(function () { U.toast('Sauvegarde ' + n + ' restaurée'); App.afficher(); });
        }).catch(erreur);
      };
    });
  }

  App.enregistrerVue('fichier', function (el) {
    if (DB.data) gestion(el); else accueil(el);
  });
})();
