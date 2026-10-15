'use strict';

/*
 * Import du planning (Excel) → dernier passage par personne × aéroport.
 *
 * Feuille : PLANNING_GENERAL (sinon la première qui a une ligne de dates jour par jour).
 * Pour chaque personne, on part d'aujourd'hui et on remonte vers la gauche (les jours
 * après aujourd'hui sont des prévisions et sont ignorés). Chaque code de cellule est
 * cherché dans Configuration → Projets ; le premier jour trouvé pour un aéroport est
 * le dernier passage sur cet aéroport.
 *
 * Règles : personne inconnue ou jamais présente → rien ; date existante aussi récente
 * ou plus récente → rien ; sinon la date est remplacée. Un aperçu est montré avant.
 */
(function () {
  var resultat = null;   // dernière analyse, en attente de validation

  function serieVersIso(n) {
    var d = new Date(Math.round((n - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }

  /* Ligne d'en-tête : celle qui a le plus de dates (numéros de série Excel) consécutives. */
  function trouverEnTete(lignes) {
    var meilleure = null;
    for (var i = 0; i < Math.min(lignes.length, 15); i++) {
      var cols = [];
      (lignes[i] || []).forEach(function (v, c) {
        if (typeof v === 'number' && v > 30000 && v < 80000 && Math.floor(v) === v) cols.push({ col: c, date: serieVersIso(v) });
      });
      if (cols.length >= 28 && (!meilleure || cols.length > meilleure.dates.length)) meilleure = { ligne: i, dates: cols };
    }
    return meilleure;
  }

  function colonne(enTete, noms, defaut) {
    for (var c = 0; c < enTete.length; c++) {
      var t = U.normaliser(enTete[c]);
      if (noms.indexOf(t) >= 0) return c;
    }
    return defaut;
  }

  function analyser(fichier) {
    if (typeof XLSX === 'undefined') return Promise.reject(new Error('Le lecteur Excel (js/vendor/xlsx.full.min.js) est absent.'));
    return fichier.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: 'array', cellDates: false, cellFormula: false, cellStyles: false });
      var noms = wb.SheetNames.slice();
      var i = noms.indexOf('PLANNING_GENERAL');
      if (i > 0) { noms.splice(i, 1); noms.unshift('PLANNING_GENERAL'); }
      for (var k = 0; k < noms.length; k++) {
        var lignes = XLSX.utils.sheet_to_json(wb.Sheets[noms[k]], { header: 1, raw: true, defval: null, blankrows: true });
        var et = trouverEnTete(lignes);
        if (et) return calculer(fichier.name, noms[k], lignes, et);
      }
      throw new Error('Aucune feuille avec une ligne de dates jour par jour n\'a été trouvée dans ce fichier.');
    });
  }

  function calculer(nomFichier, feuille, lignes, et) {
    var aujourdhui = U.aujourdhui();
    var enTete = lignes[et.ligne];
    var cNom = colonne(enTete, ['nom', 'nom2'], 2), cPrenom = colonne(enTete, ['prenom'], 3);
    // jours passés uniquement, du plus récent au plus ancien
    var jours = et.dates.filter(function (d) { return d.date <= aujourdhui; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var res = {
      fichier: nomFichier, feuille: feuille, aujourdhui: aujourdhui,
      debut: et.dates[0].date, fin: et.dates[et.dates.length - 1].date, joursFuturs: et.dates.length - jours.length,
      changements: [], inchanges: 0, sansPresence: 0, personnesLues: 0, nonReconnus: [], codesInconnus: {}
    };
    var vus = {};
    for (var i = et.ligne + 1; i < lignes.length; i++) {
      var l = lignes[i] || [];
      var nom = String(l[cNom] == null ? '' : l[cNom]).trim(), prenom = String(l[cPrenom] == null ? '' : l[cPrenom]).trim();
      if (!nom || !prenom || /^#/.test(nom) || /^#/.test(prenom)) continue;
      res.personnesLues++;
      // dernier jour par aéroport, en remontant depuis aujourd'hui
      var trouve = {};
      jours.forEach(function (j) {
        var v = l[j.col];
        if (v == null || v === '') return;
        var pr = DB.projetParCode(v);
        if (pr && pr.aeroportId) { if (!trouve[pr.aeroportId]) trouve[pr.aeroportId] = j.date; }
        else if (!pr && /^P\d{2}_?\d{3}/i.test(String(v).trim())) {
          var c = String(v).trim().toUpperCase();
          res.codesInconnus[c] = (res.codesInconnus[c] || 0) + 1;
        }
      });
      var p = DB.trouverPersonne(nom, prenom);
      if (!p) {
        if (Object.keys(trouve).length) res.nonReconnus.push(nom + ' ' + prenom);
        continue;
      }
      var aers = Object.keys(trouve);
      if (!aers.length) { res.sansPresence++; continue; }
      aers.forEach(function (a) {
        var cle = p.id + '|' + a;
        if (vus[cle] && vus[cle].nouveau >= trouve[a]) return;   // personne en double dans le planning
        var ancien = DB.passage(p.id, a);
        if (ancien && ancien >= trouve[a]) { res.inchanges++; return; }
        var ch = { personneId: p.id, aeroportId: a, ancien: ancien, nouveau: trouve[a], appliquer: true, nomPlanning: nom + ' ' + prenom };
        if (vus[cle]) res.changements.splice(res.changements.indexOf(vus[cle]), 1, ch); else res.changements.push(ch);
        vus[cle] = ch;
      });
    }
    res.changements.sort(function (a, b) {
      var pa = DB.personne(a.personneId), pb = DB.personne(b.personneId), aa = DB.aeroport(a.aeroportId), ab = DB.aeroport(b.aeroportId);
      return U.comparer(pa.nom, pb.nom) || U.comparer(pa.prenom, pb.prenom) || U.comparer(aa.nom, ab.nom);
    });
    return res;
  }

  /* Bouton d'import (placé sur la page Personnes). */
  function lancer(fichier) {
    if (!fichier) return Promise.resolve();
    U.toast('Lecture du planning…');
    return analyser(fichier).then(function (r) {
      resultat = r;
      App.aller('#/planning');
    });
  }

  function vue(el) {
    var r = resultat;
    if (!r) {
      el.innerHTML = '<h1>Import du planning</h1><p class="vide">Aucun planning chargé. Utilisez « Importer le planning… » sur la page Personnes.</p>';
      return;
    }
    var codes = Object.keys(r.codesInconnus).sort(function (a, b) { return r.codesInconnus[b] - r.codesInconnus[a]; });
    el.innerHTML =
      '<div class="barre"><a href="#/personnes">← Retour aux personnes</a></div>' +
      '<h1>Import du planning : aperçu</h1>' +
      '<div class="carte">' +
      '<p><b>' + U.esc(r.fichier) + '</b> · feuille ' + U.esc(r.feuille) + ' · du ' + U.fmtDate(r.debut) + ' au ' + U.fmtDate(r.fin) + '</p>' +
      '<p class="aide">Recherche à partir d\'aujourd\'hui (' + U.fmtDate(r.aujourdhui) + ') vers le passé' +
      (r.joursFuturs ? ' ; ' + U.pluriel(r.joursFuturs, 'jour') + ' après aujourd\'hui ignoré' + (r.joursFuturs > 1 ? 's' : '') + ' (prévisions)' : '') + '.</p>' +
      '<p>' + U.pluriel(r.personnesLues, 'personne') + ' lue' + (r.personnesLues > 1 ? 's' : '') + ' · <b>' +
      U.pluriel(r.changements.length, 'date') + ' à mettre à jour</b> · ' + r.inchanges + ' déjà à jour (date égale ou plus récente) · ' +
      r.sansPresence + ' sans présence sur un aéroport connu</p></div>' +

      (r.changements.length ? '<div class="carte"><div class="barre"><h2 style="margin:0">Mises à jour proposées</h2>' +
        '<div class="droite"><button id="pl-annuler" class="secondaire">Annuler</button>' +
        '<button id="pl-appliquer">Appliquer</button></div></div>' +
        '<table id="pl-table"><thead><tr><th><input type="checkbox" id="pl-tout" checked title="Tout cocher / décocher"></th>' +
        '<th>Personne</th><th>Aéroport</th><th>Dernier passage actuel</th><th>Nouveau</th></tr></thead><tbody>' +
        r.changements.map(function (c, i) {
          var p = DB.personne(c.personneId), a = DB.aeroport(c.aeroportId);
          return '<tr><td><input type="checkbox" data-i="' + i + '"' + (c.appliquer ? ' checked' : '') + '></td>' +
            '<td>' + U.esc(p.nom + ' ' + p.prenom) + '</td><td>' + U.esc(a.nom) + '</td>' +
            '<td>' + (c.ancien ? U.fmtDate(c.ancien) : '<span class="aide">—</span>') + '</td>' +
            '<td><b>' + U.fmtDate(c.nouveau) + '</b></td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="carte"><p>Rien à mettre à jour : toutes les dates sont déjà à jour.</p>' +
          '<button id="pl-annuler" class="secondaire">Fermer</button></div>') +

      (r.nonReconnus.length ? '<div class="carte"><h2 style="margin-top:0">Personnes non reconnues (ignorées)</h2>' +
        '<p class="aide">Présentes sur un aéroport dans le planning, mais introuvables dans la base (ou plusieurs correspondances possibles).</p>' +
        '<p>' + r.nonReconnus.map(U.esc).join(' · ') + '</p></div>' : '') +
      (codes.length ? '<div class="carte"><h2 style="margin-top:0">Codes projet inconnus (ignorés)</h2>' +
        '<p class="aide">Ajoutez-les dans Configuration → Projets si ce sont des chantiers sur un aéroport, puis réimportez.</p>' +
        '<p>' + codes.map(function (c) { return U.esc(c) + ' <span class="aide">(' + r.codesInconnus[c] + ' j)</span>'; }).join(' · ') + '</p></div>' : '');

    var table = el.querySelector('#pl-table');
    if (table) {
      table.onchange = function (e) {
        var t = e.target;
        if (t.id === 'pl-tout') {
          r.changements.forEach(function (c) { c.appliquer = t.checked; });
          table.querySelectorAll('input[data-i]').forEach(function (x) { x.checked = t.checked; });
        } else if (t.hasAttribute('data-i')) {
          r.changements[+t.getAttribute('data-i')].appliquer = t.checked;
        }
      };
    }
    var annuler = el.querySelector('#pl-annuler');
    if (annuler) annuler.onclick = function () { resultat = null; App.aller('#/personnes'); };
    var appliquer = el.querySelector('#pl-appliquer');
    if (appliquer) appliquer.onclick = function () {
      var choisis = r.changements.filter(function (c) { return c.appliquer; });
      if (!choisis.length) { U.toast('Aucune ligne cochée.', true); return; }
      choisis.forEach(function (c) {
        var actuel = DB.passage(c.personneId, c.aeroportId);   // la base a pu changer entre-temps
        if (!actuel || actuel < c.nouveau) DB.definirPassage(c.personneId, c.aeroportId, c.nouveau);
      });
      DB.enregistrer().then(function () {
        U.toast(U.pluriel(choisis.length, 'date') + ' de dernier passage mise' + (choisis.length > 1 ? 's' : '') + ' à jour.');
      });
      resultat = null;
      App.aller('#/personnes');
    };
  }

  window.Planning = { lancer: lancer, analyser: analyser };
  App.enregistrerVue('planning', vue);
})();
