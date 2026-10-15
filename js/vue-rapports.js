'use strict';

/* Rapports : par aéroport, par personne, matrice. */
(function () {
  var choix = { aeroport: '', types: null, societe: '', personne: '', societePersonne: '', matriceSocietes: '', archives: false };
  var societeInitialisee = false;

  /* Première ouverture d'un rapport : société présélectionnée (Configuration → paramètres). */
  function initSociete() {
    if (societeInitialisee) return;
    societeInitialisee = true;
    var def = DB.data.parametres.societeDefaut;
    if (def && DB.societe(def)) choix.societe = choix.societePersonne = choix.matriceSocietes = def;
  }

  /* Types « badge » (pas jamais-inactifs partout, comme les permis) : cochés par défaut. */
  function typesParDefaut() {
    return DB.data.typesBadge.filter(function (t) {
      return !DB.data.aeroports.length || DB.data.aeroports.some(function (a) { return Statut.delaiActivite(a, t.id) !== Infinity; });
    }).map(function (t) { return t.id; });
  }

  function onglets(actif) {
    return '<div class="sous-onglets">' + [
      ['aeroport', 'Par aéroport'], ['personne', 'Par personne'], ['matrice', 'Matrice']
    ].map(function (o) {
      return '<a href="#/rapports/' + o[0] + '"' + (o[0] === actif ? ' class="actif"' : '') + '>' + o[1] + '</a>';
    }).join('') + '</div>';
  }

  function optionsSocietes() {
    return DB.data.societes.slice().sort(function (a, b) { return U.comparer(a.nom, b.nom); })
      .map(function (s) { return { value: s.id, label: s.nom }; });
  }

  function nomComplet(p) { return (p.nom + ' ' + p.prenom).trim(); }

  function joursTxt(n) { return n == null ? '' : String(n); }

  /* Cellule « dernier passage » modifiable directement dans le rapport. */
  function champPassage(d) {
    var passage = DB.passage(d.personneId, d.aeroportId);
    if (Statut.delaiActivite(DB.aeroport(d.aeroportId), d.typeId) === Infinity && !passage) return '';
    return '<span class="passage"><input type="date" data-passage="' + U.esc(d.id) + '" value="' + U.esc(passage) + '"' +
      ' title="Cliquer pour modifier la date du dernier passage">' +
      '<button class="icone no-print" data-passage-auj="' + U.esc(d.id) + '" title="Passage aujourd\'hui">↻</button></span>';
  }

  /* Enregistre les modifications de « dernier passage » faites dans `zone`, puis appelle `rafraichir`. */
  function brancherPassage(zone, rafraichir) {
    function maj(id, valeur) {
      var d = DB.data.documents.filter(function (x) { return x.id === id; })[0];
      if (!d) return;
      DB.definirPassage(d.personneId, d.aeroportId, valeur || null);   // vaut pour tous ses badges de cet aéroport
      DB.enregistrer();
      U.toast('Dernier passage enregistré');
      rafraichir();
    }
    zone.addEventListener('change', function (e) {
      var id = e.target.getAttribute('data-passage');
      if (!id) return;
      var v = e.target.value;
      // pendant la saisie au clavier l'année passe par 0002, 0020… : on attend une date complète
      if (v && !/^(19|20)\d\d-/.test(v)) return;
      maj(id, v);
    });
    zone.addEventListener('click', function (e) {
      var id = e.target.getAttribute('data-passage-auj');
      if (id) { maj(id, U.aujourdhui()); return; }
      if (e.target.hasAttribute('data-passage') && e.target.showPicker) {
        try { e.target.showPicker(); } catch (err) { /* déjà ouvert */ }
      }
    });
  }

  function escorteurTxt(p, a) {
    var v = p.escorteur[a.id];
    return v === true ? 'Oui' : v === false ? 'Non' : '';
  }

  /* ======================= 1. PAR AÉROPORT ======================= */
  var SECTIONS = [
    { code: 'actif', titre: 'Badge valide et actif', classe: 'st-valide', icone: '✔' },
    { code: 'inactif', titre: 'Badge valide mais plus actif', classe: 'st-inactif', icone: '🔒' },
    { code: 'demande', titre: 'Demande lancée', classe: 'st-demande', icone: '⏳' },
    { code: 'invalide', titre: 'Badge non valide', classe: 'st-expire', icone: '✘' },
    { code: 'aucun', titre: 'Pas de badge', classe: 'st-aucun', icone: '–' }
  ];
  function section(s) {
    if (s.code === 'demande') return 'demande';
    return s.actif ? 'actif' : s.valide ? 'inactif' : 'invalide';
  }

  function calculerAeroport(a, typesIds, societeId) {
    var aujourdhui = U.aujourdhui();
    var res = { actif: [], inactif: [], demande: [], invalide: [], aucun: [] };
    DB.personnesTriees(false).forEach(function (p) {
      if (societeId && p.societeId !== societeId) return;
      var docs = DB.documentsDe(p.id).filter(function (d) {
        return d.aeroportId === a.id && typesIds.indexOf(d.typeId) >= 0;
      });
      if (!docs.length) { res.aucun.push({ p: p }); return; }
      docs.forEach(function (d) {
        var s = Statut.calculer(d, aujourdhui);
        res[section(s)].push({ p: p, d: d, s: s });
      });
    });
    res.actif.sort(function (x, y) { return x.s.joursActifs - y.s.joursActifs; });
    res.inactif.sort(function (x, y) { return x.s.joursValidite - y.s.joursValidite; });
    res.demande.sort(function (x, y) { return U.comparer(x.s.demande.arrivee, y.s.demande.arrivee); });
    return res;
  }

  function rapportAeroport(el, params) {
    var aeroports = DB.aeroportsTries();
    if (params[0]) choix.aeroport = params[0];
    if (!DB.aeroport(choix.aeroport)) choix.aeroport = aeroports.length ? aeroports[0].id : '';
    if (!choix.types) choix.types = typesParDefaut();
    initSociete();

    el.innerHTML = '<h1>Rapports</h1>' + onglets('aeroport') +
      '<div class="barre filtre">' +
      '<select id="r-aer">' + U.options(aeroports.map(function (a) { return { value: a.id, label: a.nom }; }), choix.aeroport) + '</select>' +
      '<select id="r-soc">' + U.options(optionsSocietes(), choix.societe, 'Toutes les sociétés') + '</select>' +
      '<div class="cases" id="r-types">' + DB.data.typesBadge.map(function (t) {
        return '<label><input type="checkbox" value="' + U.esc(t.id) + '"' + (choix.types.indexOf(t.id) >= 0 ? ' checked' : '') + '> ' + U.esc(t.nom) + '</label>';
      }).join('') + '</div>' +
      '<div class="droite"><button class="secondaire" id="r-csv">Exporter (Excel)</button><button class="secondaire" onclick="window.print()">Imprimer</button></div>' +
      '</div><div id="r-res"></div>';

    var zone = el.querySelector('#r-res');
    function remplir() {
      var a = DB.aeroport(choix.aeroport);
      if (!a) { zone.innerHTML = '<p class="vide">Aucun aéroport configuré.</p>'; return; }
      var res = calculerAeroport(a, choix.types, choix.societe);
      var esc = a.besoinEscorteur;
      zone.innerHTML = '<div class="carte">' +
        '<div class="titre-imprime">' + U.esc(a.nom) + ' — situation au ' + U.fmtDate(U.aujourdhui()) + '</div>' +
        '<p class="aide">Délai demande de badge : ' + a.delaiDemande + ' j · délai dernier passage : ' + a.delaiPassage + ' j' +
        (a.remarque ? ' · ' + U.esc(a.remarque) : '') + '</p>' +
        SECTIONS.map(function (sec) {
          var lignes = res[sec.code];
          var html = '<div class="section-rapport"><h2><span class="pastille ' + sec.classe + '">' + sec.icone + '</span>' +
            U.esc(sec.titre) + ' <span class="nb">(' + lignes.length + ')</span></h2>';
          if (!lignes.length) return html + '<p class="vide">Personne.</p></div>';
          if (sec.code === 'aucun') {
            return html + '<table><thead><tr><th>Nom</th><th>Prénom</th><th>Société</th></tr></thead><tbody>' +
              lignes.map(function (l) {
                return '<tr class="cliquable" data-p="' + U.esc(l.p.id) + '"><td>' + U.esc(l.p.nom) + '</td><td>' + U.esc(l.p.prenom) +
                  '</td><td>' + U.esc(DB.nomSociete(l.p.societeId)) + '</td></tr>';
              }).join('') + '</tbody></table></div>';
          }
          return html + '<table><thead><tr><th>Nom</th><th>Prénom</th><th>Société</th><th>Type</th><th>Numéro</th>' +
            '<th>Expiration</th><th>Dernier passage</th><th>Statut</th>' +
            (sec.code === 'actif' ? '<th class="num">Jours actifs restants</th>' : '') +
            (sec.code === 'demande' ? '<th>Demandé le</th><th>Arrivée prévue</th>' : '') +
            '<th class="num">Jours de validité</th>' + (esc ? '<th>Escorteur</th>' : '') + '</tr></thead><tbody>' +
            lignes.map(function (l) {
              var t = DB.type(l.d.typeId);
              return '<tr class="cliquable" data-p="' + U.esc(l.p.id) + '"><td>' + U.esc(l.p.nom) + '</td><td>' + U.esc(l.p.prenom) + '</td>' +
                '<td>' + U.esc(DB.nomSociete(l.p.societeId)) + '</td><td>' + U.esc(t ? t.nom : '') + '</td>' +
                '<td>' + U.esc(l.d.numero) + '</td><td>' + U.fmtDate(l.d.dateExpiration) + '</td><td>' + champPassage(l.d) + '</td>' +
                '<td>' + Statut.pastille(l.s) + '</td>' +
                (sec.code === 'actif' ? '<td class="num"><b>' + joursTxt(l.s.joursActifs) + '</b></td>' : '') +
                (sec.code === 'demande' ? '<td>' + U.fmtDate(l.s.demande.date) + '</td><td' + (l.s.demande.retard ? ' class="retard"' : '') + '>' +
                  U.fmtDate(l.s.demande.arrivee) + '</td>' : '') +
                '<td class="num">' + joursTxt(l.s.joursValidite) + '</td>' +
                (esc ? '<td>' + escorteurTxt(l.p, a) + '</td>' : '') + '</tr>';
            }).join('') + '</tbody></table></div>';
        }).join('') + '</div>';
    }
    remplir();

    el.querySelector('#r-aer').onchange = function () { choix.aeroport = this.value; remplir(); };
    el.querySelector('#r-soc').onchange = function () { choix.societe = this.value; remplir(); };
    el.querySelector('#r-types').onchange = function () {
      choix.types = [].map.call(this.querySelectorAll('input:checked'), function (i) { return i.value; });
      remplir();
    };
    zone.onclick = allerPersonne;
    brancherPassage(zone, remplir);
    el.querySelector('#r-csv').onclick = function () {
      var a = DB.aeroport(choix.aeroport);
      if (!a) return;
      var res = calculerAeroport(a, choix.types, choix.societe);
      var lignes = [['Catégorie', 'Nom', 'Prénom', 'Société', 'Type', 'Numéro', 'Expiration', 'Dernier passage', 'Statut',
        'Jours actifs restants', 'Jours de validité', 'Escorteur', 'Demandé le', 'Arrivée prévue']];
      SECTIONS.forEach(function (sec) {
        res[sec.code].forEach(function (l) {
          var t = l.d ? DB.type(l.d.typeId) : null;
          lignes.push([sec.titre, l.p.nom, l.p.prenom, DB.nomSociete(l.p.societeId), t ? t.nom : '', l.d ? l.d.numero : '',
            l.d ? U.fmtDate(l.d.dateExpiration) : '', l.d ? U.fmtDate(DB.passage(l.p.id, l.d.aeroportId)) : '', l.s ? l.s.libelle : 'Pas de badge',
            l.s && sec.code === 'actif' ? l.s.joursActifs : '', l.s ? l.s.joursValidite : '', a.besoinEscorteur ? escorteurTxt(l.p, a) : '',
            l.s && l.s.demande ? U.fmtDate(l.s.demande.date) : '', l.s && l.s.demande ? U.fmtDate(l.s.demande.arrivee) : '']);
        });
      });
      U.exporterCsv('rapport_' + (a.code || a.nom) + '_' + U.aujourdhui() + '.csv', lignes);
    };
  }

  function allerPersonne(e) {
    if (e.target.closest('input, button, select, .passage')) return;
    var tr = e.target.closest('tr[data-p]');
    if (tr) App.aller('#/personne/' + encodeURIComponent(tr.getAttribute('data-p')));
  }

  /* ======================= 2. PAR PERSONNE ======================= */
  function rapportPersonne(el, params) {
    initSociete();
    if (params[0] && DB.personne(params[0])) {
      choix.personne = params[0];
      choix.societePersonne = DB.personne(params[0]).societeId || '';
    }

    el.innerHTML = '<h1>Rapports</h1>' + onglets('personne') +
      '<div class="barre filtre">' +
      '<select id="r-soc">' + U.options(optionsSocietes(), choix.societePersonne || '', 'Toutes les sociétés') + '</select>' +
      '<select id="r-pers"></select>' +
      '<div class="droite"><button class="secondaire" id="r-csv">Exporter (Excel)</button><button class="secondaire" onclick="window.print()">Imprimer</button></div>' +
      '</div><div id="r-res"></div>';

    var zone = el.querySelector('#r-res');
    var selPers = el.querySelector('#r-pers');
    function remplirPersonnes() {
      var personnes = DB.personnesTriees(true).filter(function (p) {
        return !choix.societePersonne || p.societeId === choix.societePersonne;
      });
      if (!personnes.some(function (p) { return p.id === choix.personne; })) choix.personne = personnes.length ? personnes[0].id : '';
      selPers.innerHTML = U.options(personnes.map(function (p) {
        return { value: p.id, label: nomComplet(p) + (choix.societePersonne || !DB.nomSociete(p.societeId) ? '' : ' — ' + DB.nomSociete(p.societeId)) + (p.actif ? '' : ' (archivée)') };
      }), choix.personne);
    }
    remplirPersonnes();
    function lignesPersonne(p) {
      var ordreTypes = DB.data.typesBadge.map(function (t) { return t.id; });
      return DB.documentsDe(p.id).map(function (d) {
        return { d: d, a: DB.aeroport(d.aeroportId), t: DB.type(d.typeId), s: Statut.calculer(d) };
      }).sort(function (x, y) {
        return U.comparerVidesFin(x.a && x.a.nom, y.a && y.a.nom) || ordreTypes.indexOf(x.d.typeId) - ordreTypes.indexOf(y.d.typeId);
      });
    }
    function remplir() {
      var p = choix.personne && DB.personne(choix.personne);
      if (!p) { zone.innerHTML = '<p class="vide">Aucune personne pour cette société.</p>'; return; }
      var lignes = lignesPersonne(p);
      var resume = {};
      lignes.forEach(function (l) { resume[l.s.code] = (resume[l.s.code] || 0) + 1; });
      var aerSans = DB.aeroportsTries().filter(function (a) { return !lignes.some(function (l) { return l.a === a; }); });
      zone.innerHTML = '<div class="carte">' +
        '<div class="titre-imprime">Statut des documents — situation au ' + U.fmtDate(U.aujourdhui()) + '</div>' +
        '<h2 style="margin-top:0">' + U.esc(nomComplet(p)) + ' <span class="aide">' + U.esc(DB.nomSociete(p.societeId)) +
        (p.actif ? '' : ' · archivée') + '</span></h2>' +
        '<p>' + Statut.ORDRE.filter(function (c) { return resume[c]; }).map(function (c) {
          return Statut.pastille(Statut.DEF[c], resume[c] + ' × ' + Statut.DEF[c].libelle);
        }).join(' ') + '</p>' +
        (lignes.length ? '<table><thead><tr><th>Aéroport</th><th>Type</th><th>Numéro</th><th>Expiration</th><th>Dernier passage</th>' +
          '<th>Statut</th><th>Détail</th><th class="num">Jours actifs restants</th><th>Escorteur</th></tr></thead><tbody>' +
          lignes.map(function (l) {
            return '<tr><td>' + U.esc(l.a ? l.a.nom : '?') + '</td><td>' + U.esc(l.t ? l.t.nom : '') + '</td><td>' + U.esc(l.d.numero) + '</td>' +
              '<td>' + U.fmtDate(l.d.dateExpiration) + '</td><td>' + champPassage(l.d) + '</td>' +
              '<td>' + Statut.pastille(l.s) + '</td><td class="aide">' + U.esc(l.s.detail) + '</td>' +
              '<td class="num">' + (l.s.joursActifs != null && l.s.joursActifs >= 0 ? l.s.joursActifs : '') + '</td>' +
              '<td>' + (l.a && l.a.besoinEscorteur ? escorteurTxt(p, l.a) : '') + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="vide">Aucun badge ni permis encodé.</p>') +
        (aerSans.length ? '<p class="aide">Pas de badge pour : ' + aerSans.map(function (a) { return U.esc(a.nom); }).join(', ') + '</p>' : '') +
        '</div>';
    }
    remplir();
    selPers.onchange = function () { choix.personne = this.value; remplir(); };
    el.querySelector('#r-soc').onchange = function () { choix.societePersonne = this.value; remplirPersonnes(); remplir(); };
    brancherPassage(zone, remplir);
    el.querySelector('#r-csv').onclick = function () {
      var p = DB.personne(choix.personne);
      if (!p) return;
      var lignes = [['Nom', 'Prénom', 'Société', 'Aéroport', 'Type', 'Numéro', 'Expiration', 'Dernier passage', 'Statut', 'Détail', 'Jours actifs restants', 'Escorteur']];
      lignesPersonne(p).forEach(function (l) {
        lignes.push([p.nom, p.prenom, DB.nomSociete(p.societeId), l.a ? l.a.nom : '', l.t ? l.t.nom : '', l.d.numero,
          U.fmtDate(l.d.dateExpiration), U.fmtDate(DB.passage(p.id, l.d.aeroportId)), l.s.libelle, l.s.detail,
          l.s.joursActifs != null && l.s.joursActifs >= 0 ? l.s.joursActifs : '', l.a && l.a.besoinEscorteur ? escorteurTxt(p, l.a) : '']);
      });
      U.exporterCsv('statut_' + p.nom + '_' + p.prenom + '_' + U.aujourdhui() + '.csv', lignes);
    };
  }

  /* ======================= 3. MATRICE ======================= */
  /*
   * Chaque colonne (aéroport × type) et chaque personne a une case à cocher.
   * Décoché = grisé à l'écran, absent de l'impression et de l'export.
   * Le choix est gardé dans la base (parametres.matrice).
   */
  function masques() { return DB.data.parametres.matrice; }
  function cleCol(a, t) { return a.id + '|' + t.id; }
  function colMasquee(a, t) { return masques().colonnesMasquees.indexOf(cleCol(a, t)) >= 0; }
  function persMasquee(p) { return masques().personnesMasquees.indexOf(p.id) >= 0; }

  function basculer(liste, cle, masquer) {
    var i = liste.indexOf(cle);
    if (masquer && i < 0) liste.push(cle);
    if (!masquer && i >= 0) liste.splice(i, 1);
  }

  /* Enregistre le choix (sauf en lecture seule : il reste alors en mémoire). */
  function memoriserMasques() { if (!DB.lectureSeule) DB.enregistrer(); }

  function colonnesMatrice(sansMasquees) {
    return DB.aeroportsTries().map(function (a) {
      var types = a.typesMatrice.map(DB.type).filter(Boolean);
      if (!types.length && DB.typeParDefaut()) types = [DB.typeParDefaut()];
      if (sansMasquees) types = types.filter(function (t) { return !colMasquee(a, t); });
      return { a: a, types: types };
    }).filter(function (c) { return c.types.length; });
  }

  function personnesMatrice(sansMasquees) {
    return DB.personnesTriees(choix.archives).filter(function (p) {
      if (sansMasquees && persMasquee(p)) return false;
      return !choix.matriceSocietes || p.societeId === choix.matriceSocietes;
    }).sort(function (x, y) {
      return U.comparerVidesFin(DB.nomSociete(x.societeId), DB.nomSociete(y.societeId)) || U.comparer(x.nom, y.nom) || U.comparer(x.prenom, y.prenom);
    });
  }

  /*
   * Escorteur : la petite « E » se met dans les colonnes « badge » de l'aéroport
   * (types qui peuvent devenir inactifs ; les permis ∞ sont exclus), sinon dans la 1re colonne.
   * Verte si le badge est valide ET actif, grise barrée sinon (escorteur qui ne peut pas escorter).
   */
  function colonnesEscorte(c) {
    if (!c.a.besoinEscorteur) return [];
    var badges = c.types.filter(function (t) { return Statut.delaiActivite(c.a, t.id) !== Infinity; });
    return (badges.length ? badges : c.types.slice(0, 1)).map(function (t) { return t.id; });
  }

  function marqueEscorte(p, c, t, s) {
    if (p.escorteur[c.a.id] !== true || colonnesEscorte(c).indexOf(t.id) < 0) return '';
    return s.actif
      ? '<span class="esc esc-ok" title="Escorteur">E</span>'
      : '<span class="esc esc-ko" title="Escorteur, mais badge non valide ou inactif : ne peut pas escorter">E</span>';
  }

  function iconeAeroportEscorte(a) {
    return a.besoinEscorteur ? ' <span class="esc esc-ok" title="Escorteur nécessaire">E</span>' : '';
  }

  function cellule(p, a, t, aujourdhui) {
    return Statut.meilleur(DB.data.documents.filter(function (d) {
      return d.personneId === p.id && d.aeroportId === a.id && d.typeId === t.id;
    }), aujourdhui);
  }

  function rapportMatrice(el) {
    initSociete();
    el.innerHTML = '<h1>Rapports</h1>' + onglets('matrice') +
      '<div class="barre filtre">' +
      '<select id="m-soc">' + U.options(optionsSocietes(), choix.matriceSocietes, 'Toutes les sociétés') + '</select>' +
      '<label><input type="checkbox" id="m-arch"' + (choix.archives ? ' checked' : '') + '> personnes archivées</label>' +
      '<span class="aide">Colonnes :</span><button class="secondaire petit" data-tout="col-on">tout cocher</button>' +
      '<button class="secondaire petit" data-tout="col-off">tout décocher</button>' +
      '<span class="aide">Noms :</span><button class="secondaire petit" data-tout="pers-on">tout cocher</button>' +
      '<button class="secondaire petit" data-tout="pers-off">tout décocher</button>' +
      '<div class="droite"><button class="secondaire" id="m-csv">Exporter (Excel)</button><button class="secondaire" onclick="window.print()">Imprimer</button></div>' +
      '</div>' + Statut.legende().replace(/<\/div>$/,
        '<span><span class="esc esc-ok">E</span>Escorteur (badge valide et actif)</span>' +
        '<span><span class="esc esc-ko">E</span>Escorteur, mais badge non valide ou inactif</span></div>') +
      '<p class="aide no-print">Décochez une colonne ou un nom pour le retirer de l\'impression et de l\'export.</p>' +
      '<div id="m-res" class="filtre"></div>';

    var zone = el.querySelector('#m-res');
    function remplir(impression) {
      var cols = colonnesMatrice(impression), pers = personnesMatrice(impression), aujourdhui = U.aujourdhui();
      if (!cols.length || !pers.length) { zone.innerHTML = '<p class="vide">Rien à afficher.</p>'; return; }
      var caseCoche = function (attr, coche, titre) {
        return impression ? '' : '<input type="checkbox" class="no-print" ' + attr + (coche ? ' checked' : '') + ' title="' + U.esc(titre) + '"> ';
      };
      var html = '<div class="titre-imprime">Matrice des badges — situation au ' + U.fmtDate(aujourdhui) +
        (choix.matriceSocietes ? ' — ' + U.esc(DB.nomSociete(choix.matriceSocietes)) : '') + '</div>' +
        '<div class="matrice-cadre"><table class="matrice"><thead><tr>' +
        '<th class="col-fixe" rowspan="2">Nom</th><th rowspan="2">Société</th>' +
        cols.map(function (c) {
          var visibles = c.types.filter(function (t) { return !colMasquee(c.a, t); }).length;
          return '<th class="aer debut-aer' + (visibles ? '' : ' masque') + '" colspan="' + c.types.length + '">' +
            caseCoche('data-col-aer="' + U.esc(c.a.id) + '"' + (visibles && visibles < c.types.length ? ' data-partiel' : ''), visibles > 0,
              'Afficher / masquer toutes les colonnes de ' + c.a.nom) + U.esc(c.a.nom) + iconeAeroportEscorte(c.a) + '</th>';
        }).join('') + '</tr><tr>' +
        cols.map(function (c) {
          return c.types.map(function (t, i) {
            var m = colMasquee(c.a, t);
            return '<th class="' + (i ? '' : 'debut-aer') + (m ? ' masque' : '') + '">' +
              caseCoche('data-col="' + U.esc(cleCol(c.a, t)) + '"', !m, 'Afficher / masquer cette colonne') + U.esc(t.nom) + '</th>';
          }).join('');
        }).join('') + '</tr></thead><tbody>';
      html += pers.map(function (p) {
        var pm = persMasquee(p);
        return '<tr class="cliquable' + (pm ? ' masque' : '') + '" data-p="' + U.esc(p.id) + '"><td class="col-fixe">' +
          caseCoche('data-pers="' + U.esc(p.id) + '"', !pm, 'Afficher / masquer cette personne') + U.esc(nomComplet(p)) + '</td>' +
          '<td>' + U.esc(DB.nomSociete(p.societeId)) + '</td>' +
          cols.map(function (c) {
            return c.types.map(function (t, i) {
              var s = cellule(p, c.a, t, aujourdhui);
              var esc = marqueEscorte(p, c, t, s);
              var info = c.a.nom + ' — ' + t.nom + ' : ' + s.libelle + (s.detail ? ' (' + s.detail + ')' : '') +
                (s.doc && s.doc.dateExpiration ? ' — expire le ' + U.fmtDate(s.doc.dateExpiration) : '') +
                (esc ? (s.actif ? ' — escorteur' : ' — escorteur, mais ne peut pas escorter') : '');
              return '<td class="cel ' + s.classe + (i ? '' : ' debut-aer') + (colMasquee(c.a, t) ? ' masque' : '') +
                '" title="' + U.esc(info) + '">' + Statut.icone(s) + esc + '</td>';
            }).join('');
          }).join('') + '</tr>';
      }).join('');
      zone.innerHTML = html + '</tbody></table></div>';
      zone.querySelectorAll('[data-partiel]').forEach(function (c) { c.indeterminate = true; });
    }
    remplir(false);
    // impression (bouton ou Ctrl+P) : sans colonnes ni noms décochés
    window.onbeforeprint = function () { remplir(true); };
    window.onafterprint = function () { remplir(false); };

    el.querySelector('#m-soc').onchange = function () { choix.matriceSocietes = this.value; remplir(false); };
    el.querySelector('#m-arch').onchange = function () { choix.archives = this.checked; remplir(false); };
    zone.onchange = function (e) {
      var t = e.target, m = masques();
      if (t.hasAttribute('data-col')) basculer(m.colonnesMasquees, t.getAttribute('data-col'), !t.checked);
      else if (t.hasAttribute('data-pers')) basculer(m.personnesMasquees, t.getAttribute('data-pers'), !t.checked);
      else if (t.hasAttribute('data-col-aer')) {
        var a = DB.aeroport(t.getAttribute('data-col-aer'));
        colonnesMatrice(false).filter(function (c) { return c.a === a; })[0].types.forEach(function (ty) {
          basculer(m.colonnesMasquees, cleCol(a, ty), !t.checked);
        });
      } else return;
      memoriserMasques();
      remplir(false);
    };
    el.querySelector('.barre').addEventListener('click', function (e) {
      var tout = e.target.getAttribute('data-tout');
      if (!tout) return;
      var m = masques();
      if (tout === 'col-on') m.colonnesMasquees = [];
      if (tout === 'col-off') m.colonnesMasquees = [].concat.apply([], colonnesMatrice(false).map(function (c) {
        return c.types.map(function (t) { return cleCol(c.a, t); });
      }));
      if (tout === 'pers-on' || tout === 'pers-off') {
        personnesMatrice(false).forEach(function (p) { basculer(m.personnesMasquees, p.id, tout === 'pers-off'); });
      }
      memoriserMasques();
      remplir(false);
    });
    zone.onclick = allerPersonne;
    el.querySelector('#m-csv').onclick = function () {
      var cols = colonnesMatrice(true), aujourdhui = U.aujourdhui();
      var l1 = ['Nom', 'Prénom', 'Société'], l2 = ['', '', ''];
      cols.forEach(function (c) { c.types.forEach(function (t) { l1.push(c.a.nom); l2.push(t.nom); }); });
      var lignes = [l1, l2];
      personnesMatrice(true).forEach(function (p) {
        var l = [p.nom, p.prenom, DB.nomSociete(p.societeId)];
        cols.forEach(function (c) {
          c.types.forEach(function (t) {
            var s = cellule(p, c.a, t, aujourdhui);
            var esc = p.escorteur[c.a.id] === true && colonnesEscorte(c).indexOf(t.id) >= 0
              ? (s.actif ? ' + escorteur' : ' + escorteur (ne peut pas escorter)') : '';
            l.push((s.code === 'aucun' ? (esc ? 'Pas de badge' : '') : s.libelle +
              (s.doc && s.doc.dateExpiration ? ' (' + U.fmtDate(s.doc.dateExpiration) + ')' : '')) + esc);
          });
        });
        lignes.push(l);
      });
      U.exporterCsv('matrice_badges_' + aujourdhui + '.csv', lignes);
    };
  }

  App.enregistrerVue('rapports', function (el, params) {
    var sous = params[0] || 'aeroport';
    if (sous === 'personne') rapportPersonne(el, params.slice(1));
    else if (sous === 'matrice') rapportMatrice(el);
    else rapportAeroport(el, params.slice(1));
  });
})();
