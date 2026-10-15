'use strict';

/* Liste des personnes et fiche d'une personne. */
(function () {
  var filtres = { texte: '', societe: '', archives: false };

  /* ======================= LISTE ======================= */
  function liste(el) {
    var d = DB.data;
    el.innerHTML =
      '<h1>Personnes</h1>' +
      '<div class="barre filtre">' +
      '<input type="search" id="f-texte" placeholder="Rechercher un nom…" value="' + U.esc(filtres.texte) + '" autofocus>' +
      '<select id="f-societe">' + U.options(societesOptions(), filtres.societe, 'Toutes les sociétés') + '</select>' +
      '<label><input type="checkbox" id="f-archives"' + (filtres.archives ? ' checked' : '') + '> afficher les personnes archivées</label>' +
      '<div class="droite"><label class="bouton secondaire edition" title="Met à jour les dates de dernier passage à partir du planning Excel">Importer le planning…<input id="f-planning" class="edition" type="file" accept=".xlsx,.xlsm,.xls" hidden></label>' +
      '<button id="btn-nouveau" class="edition">+ Nouvelle personne</button></div>' +
      '</div>' +
      '<div class="carte" style="padding:0"><table><thead><tr>' +
      '<th>Nom</th><th>Prénom</th><th>Société</th><th class="num">Documents</th><th>Points d\'attention</th>' +
      '</tr></thead><tbody id="corps"></tbody></table></div>';

    var corps = el.querySelector('#corps');
    function remplir() {
      var q = U.normaliser(filtres.texte);
      var aujourdhui = U.aujourdhui();
      var lignes = DB.personnesTriees(filtres.archives).filter(function (p) {
        if (filtres.societe && p.societeId !== filtres.societe) return false;
        return !q || U.normaliser(p.nom + ' ' + p.prenom + ' ' + p.prenom + ' ' + p.nom).indexOf(q) >= 0;
      });
      corps.innerHTML = lignes.length ? lignes.map(function (p) {
        var docs = DB.documentsDe(p.id);
        var n = { attention: 0, expire: 0, inactif: 0, renouveler: 0, demande: 0, inconnu: 0 };
        docs.forEach(function (doc) { var c = Statut.calculer(doc, aujourdhui).code; if (c in n) n[c]++; });
        var alertes = Object.keys(n).filter(function (c) { return n[c]; }).map(function (c) {
          var s = Statut.DEF[c];
          return '<span class="pastille ' + s.classe + '" title="' + U.esc(s.libelle) + '">' + s.icone + ' ' + n[c] + '</span>';
        }).join(' ');
        return '<tr class="cliquable' + (p.actif ? '' : ' archive') + '" data-id="' + U.esc(p.id) + '">' +
          '<td><b>' + U.esc(p.nom || '(sans nom)') + '</b></td><td>' + U.esc(p.prenom) + '</td>' +
          '<td>' + U.esc(DB.nomSociete(p.societeId)) + '</td><td class="num">' + docs.length + '</td>' +
          '<td>' + (p.actif ? alertes : '<span class="aide">archivée</span>') + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="vide">Aucune personne trouvée.</td></tr>';
    }
    remplir();

    el.querySelector('#f-texte').oninput = function () { filtres.texte = this.value; remplir(); };
    el.querySelector('#f-societe').onchange = function () { filtres.societe = this.value; remplir(); };
    el.querySelector('#f-archives').onchange = function () { filtres.archives = this.checked; remplir(); };
    corps.onclick = function (e) {
      var tr = e.target.closest('tr[data-id]');
      if (tr) App.aller('#/personne/' + encodeURIComponent(tr.getAttribute('data-id')));
    };
    el.querySelector('#f-planning').onchange = function () {
      var input = this;
      Planning.lancer(input.files[0]).catch(function (e) { U.toast(e.message || String(e), true); })
        .then(function () { input.value = ''; });
    };
    el.querySelector('#btn-nouveau').onclick = function () {
      var p = { id: U.uid('p'), nom: '', prenom: '', societeId: filtres.societe || null, actif: true, remarque: '', escorteur: {} };
      d.personnes.push(p);
      DB.enregistrer();
      App.aller('#/personne/' + p.id);
    };
  }

  function societesOptions() {
    return DB.data.societes.slice().sort(function (a, b) { return U.comparer(a.nom, b.nom); })
      .map(function (s) { return { value: s.id, label: s.nom }; });
  }

  /* ======================= FICHE ======================= */
  function fiche(el, id) {
    var p = DB.personne(id);
    if (!p) {
      el.innerHTML = '<p>Personne introuvable. <a href="#/personnes">Retour à la liste</a></p>';
      return;
    }
    var aerEscorte = DB.aeroportsTries().filter(function (a) { return a.besoinEscorteur; });

    el.innerHTML =
      '<div class="barre no-print"><a href="#/personnes">← Retour à la liste</a>' +
      '<div class="droite"><a class="bouton secondaire" href="#/rapports/personne/' + encodeURIComponent(p.id) + '">Rapport de statut</a>' +
      '<button id="btn-suppr" class="danger">Supprimer la personne</button></div></div>' +

      '<div class="carte"><div class="grille-champs">' +
      champ('Nom', '<input type="text" id="p-nom" value="' + U.esc(p.nom) + '" style="text-transform:uppercase">') +
      champ('Prénom', '<input type="text" id="p-prenom" value="' + U.esc(p.prenom) + '">') +
      champ('Société', '<input type="text" id="p-societe" list="liste-societes" value="' + U.esc(DB.nomSociete(p.societeId)) + '">' +
        '<datalist id="liste-societes">' + DB.data.societes.map(function (s) { return '<option value="' + U.esc(s.nom) + '">'; }).join('') + '</datalist>') +
      champ('&nbsp;', '<label><input type="checkbox" id="p-actif"' + (p.actif ? ' checked' : '') + '> Personne active</label>') +
      champ('Remarque', '<input type="text" id="p-remarque" value="' + U.esc(p.remarque) + '" style="width:320px">') +
      '</div>' +
      (p.actif ? '' : '<p class="aide">Personne archivée : elle n\'apparaît plus dans les rapports.</p>') +
      (DB.vehiculesDe(p.id).length ? '<p class="vehicules-personne">Véhicule : ' + DB.vehiculesDe(p.id).map(function (v) {
        return '<a href="#/vehicule/' + encodeURIComponent(v.id) + '">' + U.esc(v.immatriculation || '(sans immatriculation)') +
          (v.type ? ' – ' + U.esc(v.type) : '') + '</a>';
      }).join(', ') + '</p>' : '') +
      '</div>' +

      (aerEscorte.length ? '<div class="carte"><h2 style="margin-top:0">Escorteur</h2><div class="grille-champs">' +
        aerEscorte.map(function (a) {
          var v = p.escorteur[a.id];
          return champ(U.esc(a.nom), '<select data-escorteur="' + U.esc(a.id) + '">' +
            U.options([{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }], v === true ? 'oui' : v === false ? 'non' : '', '—') + '</select>');
        }).join('') + '</div></div>' : '') +

      '<div class="carte"><h2 style="margin-top:0">Dernier passage par aéroport</h2>' +
      '<p class="aide">Une seule date par aéroport : elle vaut pour tous les badges et permis de cet aéroport.</p>' +
      '<div id="passages"></div></div>' +
      '<div class="carte"><div class="barre"><h2 style="margin:0">Badges et permis</h2>' +
      '<div class="droite"><button id="btn-ajout">+ Ajouter un badge / permis</button></div></div>' +
      '<div id="docs"></div>' + Statut.legende(['valide', 'renouveler', 'demande', 'inactif', 'attention', 'inconnu', 'expire']) + '</div>';

    // --- identité ---
    var majChamp = function (sel, fn) { el.querySelector(sel).onchange = function () { fn(this); DB.enregistrer(); }; };
    majChamp('#p-nom', function (i) { i.value = i.value.trim().toUpperCase(); p.nom = i.value; });
    majChamp('#p-prenom', function (i) { i.value = i.value.trim(); p.prenom = i.value; });
    majChamp('#p-remarque', function (i) { p.remarque = i.value.trim(); });
    majChamp('#p-actif', function (i) { p.actif = i.checked; });
    majChamp('#p-societe', function (i) { p.societeId = societeParNom(i.value); });
    el.querySelectorAll('[data-escorteur]').forEach(function (s) {
      s.onchange = function () {
        var a = s.getAttribute('data-escorteur');
        if (s.value) p.escorteur[a] = s.value === 'oui'; else delete p.escorteur[a];
        DB.enregistrer();
      };
    });
    el.querySelector('#btn-suppr').onclick = function () {
      var n = DB.documentsDe(p.id).length;
      if (!confirm('Supprimer définitivement ' + (p.nom + ' ' + p.prenom).trim() + (n ? ' et ses ' + U.pluriel(n, 'document') : '') +
        ' ?\n\nPour garder l\'historique, décochez plutôt « Personne active ».')) return;
      DB.data.documents = DB.data.documents.filter(function (x) { return x.personneId !== p.id; });
      DB.data.personnes = DB.data.personnes.filter(function (x) { return x !== p; });
      DB.enregistrer();
      App.aller('#/personnes');
    };

    // --- documents ---
    var zone = el.querySelector('#docs');
    var zoneP = el.querySelector('#passages');
    var rafraichirStatuts = function () { zone.querySelectorAll('tr[data-doc]').forEach(majStatutLigne); };
    var rafraichirPassages = function () { blocPassages(zoneP, p, rafraichirStatuts); };
    zone.addEventListener('change', function (e) { if (e.target.getAttribute('data-champ') === 'aeroportId') rafraichirPassages(); });
    tableDocuments(zone, p);
    rafraichirPassages();
    el.querySelector('#btn-ajout').onclick = function () {
      var t = DB.typeParDefaut();
      // sans aéroport : la nouvelle ligne reste en bas du tableau jusqu'au choix
      DB.data.documents.push({
        id: U.uid('d'), personneId: p.id, aeroportId: null,
        typeId: t ? t.id : null, numero: null, dateExpiration: null, dateDemande: null, remarque: null
      });
      DB.enregistrer();
      tableDocuments(zone, p);
      var sel = zone.querySelectorAll('select[data-champ="aeroportId"]');
      if (sel.length) sel[sel.length - 1].focus();
    };

    if (!p.nom) el.querySelector('#p-nom').focus();
  }

  function champ(label, html) { return '<div class="champ"><label>' + label + '</label>' + html + '</div>'; }

  /* Renvoie l'id de la société portant ce nom ; la crée si nécessaire. */
  function societeParNom(nom) {
    nom = (nom || '').trim();
    if (!nom) return null;
    var s = DB.data.societes.filter(function (x) { return U.normaliser(x.nom) === U.normaliser(nom); })[0];
    if (!s) {
      s = { id: U.uid('s'), nom: nom };
      DB.data.societes.push(s);
      U.toast('Nouvelle société créée : ' + nom);
    }
    return s.id;
  }

  function tableDocuments(zone, p) {
    var ordreTypes = DB.data.typesBadge.map(function (t) { return t.id; });
    var docs = DB.documentsDe(p.id).sort(function (a, b) {
      var aa = DB.aeroport(a.aeroportId), ab = DB.aeroport(b.aeroportId);
      return U.comparerVidesFin(aa && aa.nom, ab && ab.nom) || ordreTypes.indexOf(a.typeId) - ordreTypes.indexOf(b.typeId);
    });
    if (!docs.length) {
      zone.innerHTML = '<p class="vide">Aucun badge ni permis encodé pour cette personne.</p>';
      return;
    }
    var optAer = DB.aeroportsTries().map(function (a) { return { value: a.id, label: a.nom }; });
    var optType = DB.data.typesBadge.map(function (t) { return { value: t.id, label: t.nom }; });

    zone.innerHTML = '<table class="table-saisie"><thead><tr>' +
      '<th>Aéroport</th><th>Type de badge</th><th>Numéro de badge</th><th>Date d\'expiration</th>' +
      '<th>Statut</th><th class="num">Jours actifs restants</th><th>Remarque</th><th></th>' +
      '</tr></thead><tbody>' + docs.map(function (doc) {
        return '<tr data-doc="' + U.esc(doc.id) + '">' +
          '<td><select data-champ="aeroportId">' + U.options(optAer, doc.aeroportId, '— choisir —') + '</select></td>' +
          '<td><select data-champ="typeId">' + U.options(optType, doc.typeId, '— choisir —') + '</select></td>' +
          '<td><input type="text" data-champ="numero" value="' + U.esc(doc.numero) + '"></td>' +
          '<td><input type="date" data-champ="dateExpiration" value="' + U.esc(doc.dateExpiration) + '"></td>' +
          '<td class="cellule-statut"><span data-pastille></span><div data-demande></div></td><td class="num" data-jours></td>' +
          '<td><input type="text" data-champ="remarque" value="' + U.esc(doc.remarque) + '"></td>' +
          '<td><button class="icone" data-action="suppr" title="Supprimer">🗑</button></td></tr>';
      }).join('') + '</tbody></table>';

    zone.querySelectorAll('tr[data-doc]').forEach(function (tr) { majDemande(tr); majStatutLigne(tr); });

    zone.onchange = function (e) {
      var champ = e.target.getAttribute('data-champ');
      var tr = e.target.closest('tr[data-doc]');
      if (!champ || !tr) return;
      var doc = docParId(tr.getAttribute('data-doc'));
      var v = e.target.value.trim();
      var ancien = doc[champ];
      doc[champ] = v || null;
      // nouvelle date d'expiration plus lointaine pendant une demande = badge reçu
      if (champ === 'dateExpiration' && doc.dateDemande && v && /^(19|20)\d\d-/.test(v) &&
          (!ancien || v > ancien) && v > doc.dateDemande) {
        doc.dateDemande = null;
        majDemande(tr);
        U.toast('Nouveau badge encodé : la demande est clôturée.');
      }
      DB.enregistrer();
      majStatutLigne(tr);
    };
    zone.onclick = function (e) {
      var action = e.target.getAttribute('data-action');
      var tr = e.target.closest('tr[data-doc]');
      if (!action || !tr) return;
      var doc = docParId(tr.getAttribute('data-doc'));
      if (action === 'demande') {
        doc.dateDemande = U.aujourdhui();
        DB.enregistrer();
        majDemande(tr);
        majStatutLigne(tr);
        U.toast('Demande lancée aujourd\'hui : modifiez la date si nécessaire.');
      } else if (action === 'recu' || action === 'annuler-demande') {
        if (action === 'annuler-demande' && !confirm('Annuler la demande en cours ?')) return;
        doc.dateDemande = null;
        DB.enregistrer();
        majDemande(tr);
        majStatutLigne(tr);
        if (action === 'recu') {
          U.toast('Demande clôturée. Encodez le nouveau numéro et la nouvelle date d\'expiration.');
          tr.querySelector('[data-champ="numero"]').focus();
        }
      } else if (action === 'suppr') {
        if (!confirm('Supprimer ce document ?')) return;
        DB.data.documents = DB.data.documents.filter(function (x) { return x !== doc; });
        DB.enregistrer();
        tableDocuments(zone, p);
      }
    };
  }

  /* Dernier passage : une date par aéroport où la personne a un badge / permis (ou déjà une date). */
  function blocPassages(zone, p, apresChangement) {
    var ids = {};
    DB.documentsDe(p.id).forEach(function (d) { if (d.aeroportId) ids[d.aeroportId] = true; });
    Object.keys(p.passages).forEach(function (a) { ids[a] = true; });
    var aers = DB.aeroportsTries().filter(function (a) { return ids[a.id]; });
    if (!aers.length) { zone.innerHTML = '<p class="vide">Ajoutez d\'abord un badge ou un permis.</p>'; return; }
    var aujourdhui = U.aujourdhui();
    zone.innerHTML = '<div class="grille-passages">' + aers.map(function (a) {
      var d = p.passages[a.id];
      return '<div class="passage-aer" data-aer="' + U.esc(a.id) + '"><label>' + U.esc(a.nom) + '</label>' +
        '<span class="ligne"><input type="date" value="' + U.esc(d) + '">' +
        '<button class="icone" data-auj title="Passage aujourd\'hui">↻</button></span>' +
        '<span class="aide">' + (!d ? 'aucun passage' : d >= aujourdhui ? 'aujourd\'hui' : 'il y a ' + U.pluriel(U.ecart(aujourdhui, d), 'jour')) + '</span></div>';
    }).join('') + '</div>';
    function maj(bloc, valeur) {
      DB.definirPassage(p.id, bloc.getAttribute('data-aer'), valeur || null);
      DB.enregistrer();
      blocPassages(zone, p, apresChangement);
      apresChangement();
    }
    zone.onchange = function (e) {
      var bloc = e.target.closest('[data-aer]');
      if (!bloc || e.target.type !== 'date') return;
      var v = e.target.value;
      if (v && !/^(19|20)\d\d-/.test(v)) return;   // saisie au clavier en cours (année 0002…)
      maj(bloc, v);
    };
    zone.onclick = function (e) {
      var bloc = e.target.closest('[data-aer]');
      if (bloc && e.target.hasAttribute('data-auj')) maj(bloc, aujourdhui);
    };
  }

  function docParId(id) { return DB.data.documents.filter(function (x) { return x.id === id; })[0]; }

  /* Zone « demande » sous le statut : bouton 📨, ou date de demande + arrivée prévue. */
  function majDemande(tr) {
    var doc = docParId(tr.getAttribute('data-doc'));
    tr.querySelector('[data-demande]').innerHTML = doc.dateDemande
      ? '<div class="demande">📨 demandé le <input type="date" data-champ="dateDemande" value="' + U.esc(doc.dateDemande) + '">' +
        ' <span data-arrivee></span>' +
        ' <button class="icone ok" data-action="recu" title="Badge reçu : clôturer la demande">✓ Reçu</button>' +
        '<button class="icone" data-action="annuler-demande" title="Annuler la demande">✕</button></div>'
      : '<button class="lien-demande" data-action="demande" title="Une demande de badge a été introduite">📨 Demande lancée…</button>';
  }

  function majStatutLigne(tr) {
    var doc = docParId(tr.getAttribute('data-doc'));
    var s = Statut.calculer(doc);
    tr.querySelector('[data-pastille]').innerHTML = doc.aeroportId ? Statut.pastille(s) : '<span class="aide">choisir un aéroport</span>';
    tr.querySelector('[data-jours]').textContent = s.joursActifs != null && s.joursActifs >= 0 ? s.joursActifs : '';
    var arr = tr.querySelector('[data-arrivee]');
    if (arr) arr.innerHTML = s.demande ? '→ arrivée prévue le <b' + (s.demande.retard ? ' class="retard"' : '') + '>' +
      U.fmtDate(s.demande.arrivee) + '</b>' : '';
  }

  App.enregistrerVue('personnes', liste);
  App.enregistrerVue('personne', function (el, params) { fiche(el, params[0]); });
})();
