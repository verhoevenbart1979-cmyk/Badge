'use strict';

/*
 * Véhicules : vue d'ensemble (sert aussi de rapport) et fiche d'un véhicule.
 * Un véhicule a au plus un badge par aéroport (aéroports cochés « Badges véhicules »).
 * Statuts comme pour les personnes, sans « inactif » ; délai de demande propre aux véhicules.
 */
(function () {
  var filtres = { texte: '', societe: '', aeroport: '', statut: '', inactifs: false };
  var filtresInitialises = false;
  var A_TRAITER = ['renouveler', 'attention', 'expire', 'inconnu', 'demande'];

  function nomChauffeur(v) {
    var p = v.chauffeurId && DB.personne(v.chauffeurId);
    return p ? (p.nom + ' ' + p.prenom).trim() : '';
  }

  function statutBadge(v, a, aujourdhui) {
    var b = v.badges[a.id];
    return b && (b.numero || b.dateExpiration || b.dateDemande) ? Statut.calculerVehicule(b, a, aujourdhui) : null;
  }

  function vehiculesFiltres(sansMasques) {
    var q = U.normaliser(filtres.texte), aujourdhui = U.aujourdhui();
    var aers = DB.aeroportsVehicules().filter(function (a) { return !filtres.aeroport || a.id === filtres.aeroport; });
    return DB.data.vehicules.filter(function (v) {
      if (!filtres.inactifs && !v.actif) return false;
      if (sansMasques && masques().vehiculesMasques.indexOf(v.id) >= 0) return false;
      if (filtres.societe && v.societeId !== filtres.societe) return false;
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

  /*
   * Colonnes et lignes à cocher (comme la matrice) : décoché = grisé à l'écran,
   * absent de l'impression et de l'export. Choix gardé dans la base.
   */
  function masques() { return DB.data.parametres.vehicules; }
  function colMasquee(cle) { return masques().colonnesMasquees.indexOf(cle) >= 0; }
  function basculer(liste, cle, masquer) {
    var i = liste.indexOf(cle);
    if (masquer && i < 0) liste.push(cle);
    if (!masquer && i >= 0) liste.splice(i, 1);
  }
  function memoriser() { if (!DB.lectureSeule) DB.enregistrer(); }

  /* Colonnes du tableau : [{ cle, titre, cellule(v), csv(v) → [valeurs], entetesCsv }] */
  function colonnes(aujourdhui) {
    var cols = [
      { cle: 'type', titre: 'Type', cellule: function (v) { return U.esc(v.type); }, entetesCsv: ['Type'], csv: function (v) { return [v.type]; } },
      { cle: 'societe', titre: 'Société', cellule: function (v) { return U.esc(DB.nomSociete(v.societeId)); }, entetesCsv: ['Société'], csv: function (v) { return [DB.nomSociete(v.societeId)]; } },
      { cle: 'chauffeur', titre: 'Chauffeur', entetesCsv: ['Chauffeur'], csv: function (v) { return [nomChauffeur(v) || 'non attribué']; },
        cellule: function (v) {
          return v.chauffeurId ? '<a href="#/personne/' + encodeURIComponent(v.chauffeurId) + '">' + U.esc(nomChauffeur(v)) + '</a>' : '<span class="aide">non attribué</span>';
        } }
    ];
    DB.aeroportsVehicules().filter(function (a) { return !filtres.aeroport || a.id === filtres.aeroport; }).forEach(function (a) {
      cols.push({
        cle: a.id, titre: a.nom, aeroport: true,
        entetesCsv: [a.nom + ' n°', a.nom + ' validité', a.nom + ' statut'],
        csv: function (v) { var s = statutBadge(v, a, aujourdhui), b = v.badges[a.id] || {}; return [b.numero || '', U.fmtDate(b.dateExpiration), s ? s.libelle : '']; },
        cellule: function (v) {
          var s = statutBadge(v, a, aujourdhui), b = v.badges[a.id];
          if (!s) return '<span class="aide">–</span>';
          return '<span class="pastille ' + s.classe + '" title="' + U.esc(s.detail) + '">' + U.esc(s.icone) +
            (b.dateExpiration ? ' ' + U.fmtDate(b.dateExpiration) : ' ' + U.esc(s.libelle)) + '</span>' +
            (b.numero ? '<span class="aide"> n° ' + U.esc(b.numero) + '</span>' : '');
        }
      });
    });
    return cols;
  }

  /* ======================= VUE D'ENSEMBLE ======================= */
  function liste(el) {
    var aers = DB.aeroportsVehicules();
    if (!filtresInitialises) {
      filtresInitialises = true;
      var def = DB.data.parametres.societeDefaut;
      if (def && DB.societe(def)) filtres.societe = def;
    }
    el.innerHTML =
      '<h1>Véhicules</h1>' +
      '<div class="barre filtre">' +
      '<input type="search" id="v-texte" placeholder="Immatriculation, type, chauffeur…" value="' + U.esc(filtres.texte) + '">' +
      '<select id="v-soc">' + U.options(DB.data.societes.slice().sort(function (a, b) { return U.comparer(a.nom, b.nom); })
        .map(function (s) { return { value: s.id, label: s.nom }; }), filtres.societe, 'Toutes les sociétés') + '</select>' +
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
      '</div>' +
      '<div class="barre filtre no-print"><span class="aide">Colonnes :</span><button class="secondaire petit" data-tout="col-on">tout cocher</button>' +
      '<button class="secondaire petit" data-tout="col-off">tout décocher</button>' +
      '<span class="aide">Véhicules :</span><button class="secondaire petit" data-tout="lig-on">tout cocher</button>' +
      '<button class="secondaire petit" data-tout="lig-off">tout décocher</button>' +
      '<span class="aide">Décochez une colonne ou un véhicule pour le retirer de l\'impression et de l\'export.</span></div>' +
      legende(['valide', 'renouveler', 'demande', 'attention', 'inconnu', 'expire', 'aucun']) +
      '<div id="v-res" class="filtre"></div>';

    var zone = el.querySelector('#v-res');
    function remplir(impression) {
      var aujourdhui = U.aujourdhui();
      if (!aers.length) { zone.innerHTML = '<p class="vide">Aucun badge véhicule pour l\'instant : ouvrez un véhicule et ajoutez-lui un badge.</p>'; return; }
      var cols = colonnes(aujourdhui).filter(function (c) { return !impression || !colMasquee(c.cle); });
      var vs = vehiculesFiltres(impression);
      var coche = function (attr, ok, titre) {
        return impression ? '' : '<input type="checkbox" class="no-print" ' + attr + (ok ? ' checked' : '') + ' title="' + U.esc(titre) + '"> ';
      };
      zone.innerHTML = '<div class="titre-imprime">Badges véhicules — situation au ' + U.fmtDate(aujourdhui) +
        (filtres.societe ? ' — ' + U.esc(DB.nomSociete(filtres.societe)) : '') + '</div>' +
        '<div class="carte" style="padding:0;overflow-x:auto"><table class="table-vehicules"><thead><tr>' +
        '<th>Immatriculation</th>' +
        cols.map(function (c) {
          var m = colMasquee(c.cle);
          return '<th class="' + (m ? 'masque' : '') + '">' + coche('data-col="' + U.esc(c.cle) + '"', !m, 'Afficher / masquer cette colonne') + U.esc(c.titre) + '</th>';
        }).join('') + '</tr></thead><tbody>' +
        (vs.length ? vs.map(function (v) {
          var vm = masques().vehiculesMasques.indexOf(v.id) >= 0;
          return '<tr class="cliquable' + (v.actif ? '' : ' archive') + (vm ? ' masque' : '') + '" data-v="' + U.esc(v.id) + '">' +
            '<td>' + coche('data-lig="' + U.esc(v.id) + '"', !vm, 'Afficher / masquer ce véhicule') +
            '<b>' + U.esc(v.immatriculation || '(sans immatriculation)') + '</b>' + (v.actif ? '' : ' <span class="aide">inactif</span>') + '</td>' +
            cols.map(function (c) {
              return '<td class="' + (c.aeroport ? 'cel-vehicule' : '') + (colMasquee(c.cle) ? ' masque' : '') + '">' + c.cellule(v) + '</td>';
            }).join('') + '</tr>';
        }).join('') : '<tr><td colspan="' + (1 + cols.length) + '" class="vide">Aucun véhicule.</td></tr>') +
        '</tbody></table></div><p class="aide no-print">' + U.pluriel(vs.length, 'véhicule') + '</p>';
    }
    remplir(false);
    window.onbeforeprint = function () { remplir(true); };
    window.onafterprint = function () { remplir(false); };

    el.querySelector('#v-texte').oninput = function () { filtres.texte = this.value; remplir(false); };
    el.querySelector('#v-soc').onchange = function () { filtres.societe = this.value; remplir(false); };
    el.querySelector('#v-aer').onchange = function () { filtres.aeroport = this.value; remplir(false); };
    el.querySelector('#v-statut').onchange = function () { filtres.statut = this.value; remplir(false); };
    el.querySelector('#v-inactifs').onchange = function () { filtres.inactifs = this.checked; remplir(false); };
    zone.onchange = function (e) {
      var t = e.target, m = masques();
      if (t.hasAttribute('data-col')) basculer(m.colonnesMasquees, t.getAttribute('data-col'), !t.checked);
      else if (t.hasAttribute('data-lig')) basculer(m.vehiculesMasques, t.getAttribute('data-lig'), !t.checked);
      else return;
      memoriser();
      remplir(false);
    };
    el.addEventListener('click', function (e) {
      var tout = e.target.getAttribute('data-tout');
      if (!tout) return;
      var m = masques();
      if (tout === 'col-on') m.colonnesMasquees = [];
      if (tout === 'col-off') m.colonnesMasquees = colonnes(U.aujourdhui()).map(function (c) { return c.cle; });
      if (tout === 'lig-on' || tout === 'lig-off') vehiculesFiltres(false).forEach(function (v) { basculer(m.vehiculesMasques, v.id, tout === 'lig-off'); });
      memoriser();
      remplir(false);
    });
    zone.onclick = function (e) {
      if (e.target.closest('a, input')) return;
      var tr = e.target.closest('tr[data-v]');
      if (tr) App.aller('#/vehicule/' + encodeURIComponent(tr.getAttribute('data-v')));
    };
    el.querySelector('#v-nouveau').onclick = function () {
      var v = { id: U.uid('v'), type: '', immatriculation: '', societeId: filtres.societe || DB.data.parametres.societeDefaut || null,
        chauffeurId: null, actif: true, remarque: '', badges: {} };
      DB.data.vehicules.push(v);
      DB.enregistrer();
      App.aller('#/vehicule/' + v.id);
    };
    el.querySelector('#v-csv').onclick = function () {
      var aujourdhui = U.aujourdhui();
      var cols = colonnes(aujourdhui).filter(function (c) { return !colMasquee(c.cle); });
      var lignes = [[].concat.apply(['Immatriculation'], cols.map(function (c) { return c.entetesCsv; })).concat(['Actif'])];
      vehiculesFiltres(true).forEach(function (v) {
        lignes.push([].concat.apply([v.immatriculation], cols.map(function (c) { return c.csv(v); })).concat([v.actif ? 'oui' : 'non']));
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
        var pc = src.chauffeur ? DB.trouverPersonne(src.chauffeur) : null;
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
          societeId: (p && p.societeId) || DB.data.parametres.societeDefaut || null,
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

  /* ======================= FICHE ======================= */
  function fiche(el, id) {
    var v = DB.vehicule(id);
    if (!v) { el.innerHTML = '<p>Véhicule introuvable. <a href="#/vehicules">Retour à la liste</a></p>'; return; }
    var personnes = DB.personnesTriees(false);
    if (v.chauffeurId && !personnes.some(function (p) { return p.id === v.chauffeurId; }) && DB.personne(v.chauffeurId)) {
      personnes.push(DB.personne(v.chauffeurId));   // chauffeur archivé : rester visible
    }
    el.innerHTML =
      '<div class="barre"><a href="#/vehicules">← Retour aux véhicules</a>' +
      '<div class="droite"><button id="btn-suppr" class="danger">Supprimer le véhicule</button></div></div>' +
      '<div class="carte"><div class="grille-champs">' +
      champ('Immatriculation', '<input type="text" id="f-immat" value="' + U.esc(v.immatriculation) + '" style="text-transform:uppercase">') +
      champ('Type', '<input type="text" id="f-type" list="liste-types-vv" value="' + U.esc(v.type) + '">' +
        '<datalist id="liste-types-vv">' + typesConnus().map(function (t) { return '<option value="' + U.esc(t) + '">'; }).join('') + '</datalist>') +
      champ('Société', '<select id="f-societe">' + U.options(DB.data.societes.slice().sort(function (a, b) { return U.comparer(a.nom, b.nom); })
        .map(function (s) { return { value: s.id, label: s.nom }; }), v.societeId || '', '—') + '</select>') +
      champ('Chauffeur', '<select id="f-chauffeur">' + U.options(personnes.map(function (p) {
        return { value: p.id, label: (p.nom + ' ' + p.prenom).trim() + (DB.nomSociete(p.societeId) ? ' — ' + DB.nomSociete(p.societeId) : '') };
      }), v.chauffeurId || '', 'Non attribué') + '</select>') +
      champ('&nbsp;', '<label><input type="checkbox" id="f-actif"' + (v.actif ? ' checked' : '') + '> Véhicule actif</label>') +
      champ('Remarque', '<input type="text" id="f-remarque" value="' + U.esc(v.remarque) + '" style="width:320px">') +
      '</div>' + (v.actif ? '' : '<p class="aide">Véhicule inactif (vendu) : il n\'apparaît plus dans les tableaux.</p>') + '</div>' +
      '<div class="carte"><div class="barre"><h2 style="margin:0">Badges véhicule</h2>' +
      '<div class="droite"><select id="f-aer-ajout"></select><button id="btn-ajout-badge">+ Ajouter un badge véhicule</button></div></div>' +
      '<div id="badges-v"></div>' + legende(['valide', 'renouveler', 'demande', 'attention', 'inconnu', 'expire']) + '</div>';

    var maj = function (sel, fn) { el.querySelector(sel).onchange = function () { fn(this); DB.enregistrer(); }; };
    maj('#f-immat', function (i) { i.value = i.value.trim().toUpperCase(); v.immatriculation = i.value; });
    maj('#f-type', function (i) { v.type = i.value.trim(); });
    maj('#f-societe', function (i) { v.societeId = i.value || null; });
    maj('#f-chauffeur', function (i) {
      v.chauffeurId = i.value || null;
      // nouveau chauffeur d'une autre société : proposer sa société
      var p = v.chauffeurId && DB.personne(v.chauffeurId);
      if (p && p.societeId && p.societeId !== v.societeId) {
        v.societeId = p.societeId;
        el.querySelector('#f-societe').value = p.societeId;
        U.toast('Société du véhicule : ' + DB.nomSociete(p.societeId));
      }
    });
    maj('#f-actif', function (i) { v.actif = i.checked; });
    maj('#f-remarque', function (i) { v.remarque = i.value.trim(); });
    el.querySelector('#btn-suppr').onclick = function () {
      if (!confirm('Supprimer définitivement le véhicule ' + (v.immatriculation || '') + ' ?\n\nUn véhicule vendu peut aussi simplement être décoché « Véhicule actif ».')) return;
      DB.data.vehicules = DB.data.vehicules.filter(function (x) { return x !== v; });
      DB.enregistrer();
      App.aller('#/vehicules');
    };

    var zone = el.querySelector('#badges-v');
    tableBadges(zone, el, v);
    el.querySelector('#btn-ajout-badge').onclick = function () {
      var aid = el.querySelector('#f-aer-ajout').value;
      if (!aid) { U.toast('Choisissez d\'abord un aéroport.', true); return; }
      v.badges[aid] = { numero: null, dateExpiration: null, dateDemande: null, remarque: null };
      DB.enregistrer();
      tableBadges(zone, el, v);
      var champ = zone.querySelector('tr[data-aer="' + aid + '"] [data-champ="numero"]');
      if (champ) champ.focus();
    };
  }

  /* Un badge par aéroport ; on ajoute un aéroport avec la liste + « Ajouter », comme pour les personnes. */
  function tableBadges(zone, el, v) {
    var ids = Object.keys(v.badges).filter(function (k) { return DB.aeroport(k); }).sort(function (x, y) {
      return U.comparer(DB.aeroport(x).nom, DB.aeroport(y).nom);
    });
    var libres = DB.aeroportsTries().filter(function (a) { return ids.indexOf(a.id) < 0; });
    el.querySelector('#f-aer-ajout').innerHTML = U.options(libres.map(function (a) { return { value: a.id, label: a.nom }; }), '', '— aéroport —');
    el.querySelector('#btn-ajout-badge').disabled = !libres.length || DB.lectureSeule;
    if (!ids.length) {
      zone.innerHTML = '<p class="vide">Aucun badge véhicule. Choisissez un aéroport à droite puis cliquez sur « + Ajouter un badge véhicule ».</p>';
      return;
    }
    zone.innerHTML = '<table class="table-saisie"><thead><tr><th>Aéroport</th><th>N° de badge</th><th>Date de validité</th><th>Statut</th>' +
      '<th class="num">Jours de validité</th><th>Remarque</th><th></th></tr></thead><tbody>' +
      ids.map(function (id) {
        var a = DB.aeroport(id), b = v.badges[id];
        return '<tr data-aer="' + U.esc(id) + '"><td>' + U.esc(a.nom) + '<div class="aide">délai de demande : ' + a.delaiDemandeVehicule + ' j</div></td>' +
          '<td><input type="text" data-champ="numero" value="' + U.esc(b.numero) + '"></td>' +
          '<td><input type="date" data-champ="dateExpiration" value="' + U.esc(b.dateExpiration) + '"></td>' +
          '<td class="cellule-statut"><span data-pastille></span><div data-demande></div></td><td class="num" data-jours></td>' +
          '<td><input type="text" data-champ="remarque" value="' + U.esc(b.remarque) + '"></td>' +
          '<td><button class="icone" data-action="suppr" title="Supprimer ce badge">🗑</button></td></tr>';
      }).join('') + '</tbody></table>';
    zone.querySelectorAll('tr[data-aer]').forEach(function (tr) { majDemande(v, tr); majLigne(v, tr); });

    zone.onchange = function (e) {
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
    zone.onclick = function (e) {
      var action = e.target.getAttribute('data-action'), tr = e.target.closest('tr[data-aer]');
      if (!action || !tr) return;
      var b = badge(v, tr);
      if (action === 'suppr') {
        if (!confirm('Supprimer le badge véhicule de ' + DB.aeroport(tr.getAttribute('data-aer')).nom + ' ?')) return;
        delete v.badges[tr.getAttribute('data-aer')];
        DB.enregistrer();
        tableBadges(zone, el, v);
        return;
      }
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
    if (!v.badges[a]) v.badges[a] = { numero: null, dateExpiration: null, dateDemande: null, remarque: null };
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
