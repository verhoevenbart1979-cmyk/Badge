'use strict';

/*
 * Véhicules : vue d'ensemble (sert aussi de rapport) et fiche d'un véhicule.
 * Un véhicule a au plus un badge par aéroport (aéroports cochés « Badges véhicules »).
 * Statuts comme pour les personnes, sans « inactif » ; délai de demande propre aux véhicules.
 */
(function () {
  var filtres = { texte: '', aeroport: '', statut: '', inactifs: false };
  var A_TRAITER = ['renouveler', 'attention', 'expire', 'inconnu', 'demande'];

  function nomChauffeur(v) {
    var p = v.chauffeurId && DB.personne(v.chauffeurId);
    return p ? (p.nom + ' ' + p.prenom).trim() : '';
  }

  function statutBadge(v, a, aujourdhui) {
    var b = v.badges[a.id];
    return b && (b.numero || b.dateExpiration || b.dateDemande) ? Statut.calculerVehicule(b, a, aujourdhui) : null;
  }

  function vehiculesFiltres() {
    var q = U.normaliser(filtres.texte), aujourdhui = U.aujourdhui();
    var aers = DB.aeroportsVehicules().filter(function (a) { return !filtres.aeroport || a.id === filtres.aeroport; });
    return DB.data.vehicules.filter(function (v) {
      if (!filtres.inactifs && !v.actif) return false;
      if (q && U.normaliser(v.immatriculation + ' ' + v.type + ' ' + nomChauffeur(v)).indexOf(q) < 0) return false;
      if (filtres.statut) {
        return aers.some(function (a) {
          var s = statutBadge(v, a, aujourdhui);
          return filtres.statut === 'a-traiter' ? s && A_TRAITER.indexOf(s.code) >= 0 : filtres.statut === 'sans' ? !s : s && s.code === filtres.statut;
        });
      }
      return true;
    }).sort(function (x, y) { return U.comparerVidesFin(x.immatriculation, y.immatriculation); });
  }

  /* ======================= VUE D'ENSEMBLE ======================= */
  function liste(el) {
    var aers = DB.aeroportsVehicules();
    el.innerHTML =
      '<h1>Véhicules</h1>' +
      '<div class="barre filtre">' +
      '<input type="search" id="v-texte" placeholder="Immatriculation, type, chauffeur…" value="' + U.esc(filtres.texte) + '">' +
      '<select id="v-aer">' + U.options(aers.map(function (a) { return { value: a.id, label: a.nom }; }), filtres.aeroport, 'Tous les aéroports') + '</select>' +
      '<select id="v-statut">' + U.options([
        { value: 'a-traiter', label: 'À traiter (orange, attention, expiré, demande…)' },
        { value: 'valide', label: 'Valides' }, { value: 'renouveler', label: 'À renouveler' },
        { value: 'attention', label: '!!! Attention !!!' }, { value: 'expire', label: 'Expirés' },
        { value: 'demande', label: 'Demande lancée' }, { value: 'sans', label: 'Sans badge' }
      ], filtres.statut, 'Tous les statuts') + '</select>' +
      '<label><input type="checkbox" id="v-inactifs"' + (filtres.inactifs ? ' checked' : '') + '> véhicules inactifs (vendus)</label>' +
      '<div class="droite">' +
      '<label class="bouton secondaire edition">Importer…<input id="v-import" class="edition" type="file" accept=".json,application/json" hidden></label>' +
      '<button class="secondaire" id="v-csv">Exporter (Excel)</button><button class="secondaire" onclick="window.print()">Imprimer</button>' +
      '<button id="v-nouveau" class="edition">+ Nouveau véhicule</button></div>' +
      '</div>' + legende(['valide', 'renouveler', 'demande', 'attention', 'inconnu', 'expire', 'aucun']) +
      '<div id="v-res"></div>';

    var zone = el.querySelector('#v-res');
    function remplir() {
      var vs = vehiculesFiltres(), aujourdhui = U.aujourdhui();
      var cols = aers.filter(function (a) { return !filtres.aeroport || a.id === filtres.aeroport; });
      if (!aers.length) { zone.innerHTML = '<p class="vide">Aucun aéroport n\'est coché « Badges véhicules » dans la Configuration.</p>'; return; }
      zone.innerHTML = '<div class="titre-imprime">Badges véhicules — situation au ' + U.fmtDate(aujourdhui) + '</div>' +
        '<div class="carte" style="padding:0;overflow-x:auto"><table class="table-vehicules"><thead><tr>' +
        '<th>Immatriculation</th><th>Type</th><th>Chauffeur</th>' +
        cols.map(function (a) { return '<th>' + U.esc(a.nom) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        (vs.length ? vs.map(function (v) {
          return '<tr class="cliquable' + (v.actif ? '' : ' archive') + '" data-v="' + U.esc(v.id) + '">' +
            '<td><b>' + U.esc(v.immatriculation || '(sans immatriculation)') + '</b>' + (v.actif ? '' : ' <span class="aide">inactif</span>') + '</td>' +
            '<td>' + U.esc(v.type) + '</td>' +
            '<td>' + (v.chauffeurId ? '<a href="#/personne/' + encodeURIComponent(v.chauffeurId) + '">' + U.esc(nomChauffeur(v)) + '</a>' : '<span class="aide">non attribué</span>') + '</td>' +
            cols.map(function (a) {
              var s = statutBadge(v, a, aujourdhui), b = v.badges[a.id];
              if (!s) return '<td class="aide">–</td>';
              return '<td class="cel-vehicule"><span class="pastille ' + s.classe + '" title="' + U.esc(s.detail) + '">' + U.esc(s.icone) +
                (b.dateExpiration ? ' ' + U.fmtDate(b.dateExpiration) : ' ' + U.esc(s.libelle)) + '</span>' +
                (b.numero ? '<span class="aide"> n° ' + U.esc(b.numero) + '</span>' : '') + '</td>';
            }).join('') + '</tr>';
        }).join('') : '<tr><td colspan="' + (3 + cols.length) + '" class="vide">Aucun véhicule.</td></tr>') +
        '</tbody></table></div><p class="aide">' + U.pluriel(vs.length, 'véhicule') + '</p>';
    }
    remplir();

    el.querySelector('#v-texte').oninput = function () { filtres.texte = this.value; remplir(); };
    el.querySelector('#v-aer').onchange = function () { filtres.aeroport = this.value; remplir(); };
    el.querySelector('#v-statut').onchange = function () { filtres.statut = this.value; remplir(); };
    el.querySelector('#v-inactifs').onchange = function () { filtres.inactifs = this.checked; remplir(); };
    zone.onclick = function (e) {
      if (e.target.closest('a')) return;
      var tr = e.target.closest('tr[data-v]');
      if (tr) App.aller('#/vehicule/' + encodeURIComponent(tr.getAttribute('data-v')));
    };
    el.querySelector('#v-nouveau').onclick = function () {
      var v = { id: U.uid('v'), type: '', immatriculation: '', chauffeurId: null, actif: true, remarque: '', badges: {} };
      DB.data.vehicules.push(v);
      DB.enregistrer();
      App.aller('#/vehicule/' + v.id);
    };
    el.querySelector('#v-csv').onclick = function () {
      var aujourdhui = U.aujourdhui();
      var cols = aers.filter(function (a) { return !filtres.aeroport || a.id === filtres.aeroport; });
      var l1 = ['Immatriculation', 'Type', 'Chauffeur', 'Actif'];
      cols.forEach(function (a) { l1.push(a.nom + ' n°', a.nom + ' validité', a.nom + ' statut'); });
      var lignes = [l1];
      vehiculesFiltres().forEach(function (v) {
        var l = [v.immatriculation, v.type, nomChauffeur(v) || 'non attribué', v.actif ? 'oui' : 'non'];
        cols.forEach(function (a) {
          var s = statutBadge(v, a, aujourdhui), b = v.badges[a.id] || {};
          l.push(b.numero || '', U.fmtDate(b.dateExpiration), s ? s.libelle : '');
        });
        lignes.push(l);
      });
      U.exporterCsv('badges_vehicules_' + aujourdhui + '.csv', lignes);
    };
    el.querySelector('#v-import').onchange = function () {
      var input = this;
      importer(input.files[0]).catch(function (e) { U.toast(e.message || String(e), true); })
        .then(function () { input.value = ''; });
    };
  }

  /* Import d'un vehicules.json (outils/import_vehicules.py) : ajoute les véhicules absents. */
  function importer(fichier) {
    if (!fichier) return Promise.resolve();
    return fichier.text().then(function (txt) {
      var j = JSON.parse(txt);
      if (!j || !Array.isArray(j.vehicules)) throw new Error('Ce fichier ne contient pas de véhicules.');
      var plaque = function (s) { return U.normaliser(s).replace(/[^a-z0-9]/g, ''); };
      // déjà présent : même immatriculation, ou (sans immatriculation) même type et même chauffeur
      var cle = function (immat, type, chauffeurId) {
        return immat ? 'p:' + plaque(immat) : 's:' + U.normaliser(type) + '|' + (chauffeurId || '');
      };
      var existants = DB.data.vehicules.map(function (v) { return cle(v.immatriculation, v.type, v.chauffeurId); });
      var ajoutes = 0, ignores = 0, inconnus = [];
      j.vehicules.forEach(function (src) {
        var pc = src.chauffeur ? trouverPersonne(src.chauffeur) : null;
        if (existants.indexOf(cle(src.immatriculation, src.type, pc && pc.id)) >= 0) { ignores++; return; }
        var badges = {};
        Object.keys(src.badges || {}).forEach(function (k) {
          var a = DB.aeroport(k) || DB.data.aeroports.filter(function (x) { return U.normaliser(x.code) === U.normaliser(k); })[0];
          if (a) badges[a.id] = { numero: src.badges[k].numero || null, dateExpiration: src.badges[k].dateExpiration || null, dateDemande: src.badges[k].dateDemande || null };
        });
        var p = pc;
        if (src.chauffeur && !p) inconnus.push(src.chauffeur);
        DB.data.vehicules.push({
          id: U.uid('v'), type: src.type || '', immatriculation: src.immatriculation || '', chauffeurId: p ? p.id : null,
          actif: src.actif !== false, badges: badges,
          remarque: [src.remarque, src.chauffeur && !p ? 'Chauffeur dans l\'ancien fichier : ' + src.chauffeur : ''].filter(Boolean).join(' · ')
        });
        ajoutes++;
      });
      return DB.enregistrer().then(function () {
        U.toast(U.pluriel(ajoutes, 'véhicule') + ' importé' + (ajoutes > 1 ? 's' : '') +
          (ignores ? ', ' + ignores + ' déjà présent(s)' : '') +
          (inconnus.length ? '. Chauffeur non trouvé : ' + inconnus.join(', ') : ''), inconnus.length > 0);
        App.afficher();
      });
    });
  }

  /* « DENIS Frédéric » → la personne DENIS Frederic (accents, prénom abrégé « Fred »…). */
  function trouverPersonne(texte) {
    var t = U.normaliser(texte).replace(/\s+/g, ' ');
    var ps = DB.data.personnes;
    var exact = ps.filter(function (p) { return U.normaliser(p.nom + ' ' + p.prenom) === t || U.normaliser(p.prenom + ' ' + p.nom) === t; });
    if (exact.length === 1) return exact[0];
    var proches = ps.filter(function (p) {
      var nom = U.normaliser(p.nom), pre = U.normaliser(p.prenom);
      if (t.indexOf(nom + ' ') !== 0) return false;
      var reste = t.slice(nom.length + 1);
      return reste && pre && (pre.indexOf(reste.slice(0, 4)) === 0 || reste.indexOf(pre.slice(0, 4)) === 0);
    });
    return proches.length === 1 ? proches[0] : null;
  }

  /* ======================= FICHE ======================= */
  function fiche(el, id) {
    var v = DB.vehicule(id);
    if (!v) { el.innerHTML = '<p>Véhicule introuvable. <a href="#/vehicules">Retour à la liste</a></p>'; return; }
    var personnes = DB.personnesTriees(false);
    if (v.chauffeurId && !personnes.some(function (p) { return p.id === v.chauffeurId; }) && DB.personne(v.chauffeurId)) {
      personnes.push(DB.personne(v.chauffeurId));   // chauffeur archivé : rester visible
    }
    var aers = DB.aeroportsVehicules();

    el.innerHTML =
      '<div class="barre"><a href="#/vehicules">← Retour aux véhicules</a>' +
      '<div class="droite"><button id="btn-suppr" class="danger">Supprimer le véhicule</button></div></div>' +
      '<div class="carte"><div class="grille-champs">' +
      champ('Immatriculation', '<input type="text" id="f-immat" value="' + U.esc(v.immatriculation) + '" style="text-transform:uppercase">') +
      champ('Type', '<input type="text" id="f-type" list="liste-types-vv" value="' + U.esc(v.type) + '">' +
        '<datalist id="liste-types-vv">' + typesConnus().map(function (t) { return '<option value="' + U.esc(t) + '">'; }).join('') + '</datalist>') +
      champ('Chauffeur', '<select id="f-chauffeur">' + U.options(personnes.map(function (p) {
        return { value: p.id, label: (p.nom + ' ' + p.prenom).trim() + (DB.nomSociete(p.societeId) ? ' — ' + DB.nomSociete(p.societeId) : '') };
      }), v.chauffeurId || '', 'Non attribué') + '</select>') +
      champ('&nbsp;', '<label><input type="checkbox" id="f-actif"' + (v.actif ? ' checked' : '') + '> Véhicule actif</label>') +
      champ('Remarque', '<input type="text" id="f-remarque" value="' + U.esc(v.remarque) + '" style="width:320px">') +
      '</div>' + (v.actif ? '' : '<p class="aide">Véhicule inactif (vendu) : il n\'apparaît plus dans les tableaux.</p>') + '</div>' +
      '<div class="carte"><h2 style="margin-top:0">Badges véhicule</h2>' +
      (aers.length ? '<table class="table-saisie"><thead><tr><th>Aéroport</th><th>N° de badge</th><th>Date de validité</th><th>Statut</th>' +
        '<th class="num">Jours de validité</th></tr></thead><tbody>' +
        aers.map(function (a) {
          var b = v.badges[a.id] || {};
          return '<tr data-aer="' + U.esc(a.id) + '"><td>' + U.esc(a.nom) + '<div class="aide">délai de demande : ' + a.delaiDemandeVehicule + ' j</div></td>' +
            '<td><input type="text" data-champ="numero" value="' + U.esc(b.numero) + '"></td>' +
            '<td><input type="date" data-champ="dateExpiration" value="' + U.esc(b.dateExpiration) + '"></td>' +
            '<td class="cellule-statut"><span data-pastille></span><div data-demande></div></td><td class="num" data-jours></td></tr>';
        }).join('') + '</tbody></table>' + legende(['valide', 'renouveler', 'demande', 'attention', 'inconnu', 'expire'])
        : '<p class="vide">Aucun aéroport n\'est coché « Badges véhicules » dans la Configuration.</p>') + '</div>';

    var maj = function (sel, fn) { el.querySelector(sel).onchange = function () { fn(this); DB.enregistrer(); }; };
    maj('#f-immat', function (i) { i.value = i.value.trim().toUpperCase(); v.immatriculation = i.value; });
    maj('#f-type', function (i) { v.type = i.value.trim(); });
    maj('#f-chauffeur', function (i) { v.chauffeurId = i.value || null; });
    maj('#f-actif', function (i) { v.actif = i.checked; });
    maj('#f-remarque', function (i) { v.remarque = i.value.trim(); });
    el.querySelector('#btn-suppr').onclick = function () {
      if (!confirm('Supprimer définitivement le véhicule ' + (v.immatriculation || '') + ' ?\n\nUn véhicule vendu peut aussi simplement être décoché « Véhicule actif ».')) return;
      DB.data.vehicules = DB.data.vehicules.filter(function (x) { return x !== v; });
      DB.enregistrer();
      App.aller('#/vehicules');
    };

    var lignes = el.querySelectorAll('tr[data-aer]');
    lignes.forEach(function (tr) { majDemande(v, tr); majLigne(v, tr); });
    var table = el.querySelector('.table-saisie');
    if (!table) return;
    table.onchange = function (e) {
      var champ = e.target.getAttribute('data-champ'), tr = e.target.closest('tr[data-aer]');
      if (!champ || !tr) return;
      var b = badge(v, tr), val = e.target.value.trim() || null, ancien = b[champ];
      b[champ] = val;
      // nouvelle date de validité plus lointaine pendant une demande = badge reçu
      if (champ === 'dateExpiration' && b.dateDemande && val && /^(19|20)\d\d-/.test(val) && (!ancien || val > ancien) && val > b.dateDemande) {
        b.dateDemande = null;
        majDemande(v, tr);
        U.toast('Nouveau badge encodé : la demande est clôturée.');
      }
      DB.enregistrer();
      majLigne(v, tr);
    };
    table.onclick = function (e) {
      var action = e.target.getAttribute('data-action'), tr = e.target.closest('tr[data-aer]');
      if (!action || !tr) return;
      var b = badge(v, tr);
      if (action === 'demande') b.dateDemande = U.aujourdhui();
      else if (action === 'recu' || action === 'annuler-demande') {
        if (action === 'annuler-demande' && !confirm('Annuler la demande en cours ?')) return;
        b.dateDemande = null;
      } else return;
      DB.enregistrer();
      majDemande(v, tr);
      majLigne(v, tr);
      if (action === 'recu') { U.toast('Demande clôturée. Encodez le nouveau numéro et la nouvelle date de validité.'); tr.querySelector('[data-champ="numero"]').focus(); }
    };
  }

  /* Légende des statuts ; pour un véhicule « valide » suffit (pas de notion d'activité). */
  function legende(codes) { return Statut.legende(codes).replace('Valide et actif', 'Valide'); }

  function champ(label, html) { return '<div class="champ"><label>' + label + '</label>' + html + '</div>'; }

  function typesConnus() {
    var t = {};
    DB.data.vehicules.forEach(function (v) { if (v.type) t[v.type] = 1; });
    return Object.keys(t).sort(U.comparer);
  }

  function badge(v, tr) {
    var a = tr.getAttribute('data-aer');
    if (!v.badges[a]) v.badges[a] = { numero: null, dateExpiration: null, dateDemande: null };
    return v.badges[a];
  }

  function majDemande(v, tr) {
    var b = v.badges[tr.getAttribute('data-aer')] || {};
    tr.querySelector('[data-demande]').innerHTML = b.dateDemande
      ? '<div class="demande">📨 demandé le <input type="date" data-champ="dateDemande" value="' + U.esc(b.dateDemande) + '">' +
        ' <span data-arrivee></span>' +
        ' <button class="icone ok" data-action="recu" title="Badge reçu : clôturer la demande">✓ Reçu</button>' +
        '<button class="icone" data-action="annuler-demande" title="Annuler la demande">✕</button></div>'
      : '<button class="lien-demande" data-action="demande" title="Une demande de badge a été introduite">📨 Demande lancée…</button>';
  }

  function majLigne(v, tr) {
    var a = DB.aeroport(tr.getAttribute('data-aer'));
    var s = statutBadge(v, a);
    tr.querySelector('[data-pastille]').innerHTML = s ? Statut.pastille(s) : '<span class="aide">pas de badge</span>';
    tr.querySelector('[data-jours]').textContent = s && s.joursValidite != null && s.joursValidite >= 0 ? s.joursValidite : '';
    var arr = tr.querySelector('[data-arrivee]');
    if (arr) arr.innerHTML = s && s.demande ? '→ arrivée prévue le <b' + (s.demande.retard ? ' class="retard"' : '') + '>' +
      U.fmtDate(s.demande.arrivee) + '</b>' : '';
  }

  App.enregistrerVue('vehicules', liste);
  App.enregistrerVue('vehicule', function (el, params) { fiche(el, params[0]); });
})();
