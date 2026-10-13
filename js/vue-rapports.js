'use strict';

/* Rapports : par aéroport, par personne, matrice. */
(function () {
  var choix = { aeroport: '', types: null, societe: '', personne: '', matriceSocietes: '', matriceAeroports: null, archives: false };

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

  function escorteurTxt(p, a) {
    var v = p.escorteur[a.id];
    return v === true ? 'Oui' : v === false ? 'Non' : '';
  }

  /* ======================= 1. PAR AÉROPORT ======================= */
  var SECTIONS = [
    { code: 'actif', titre: 'Badge valide et actif', classe: 'st-valide', icone: '✔' },
    { code: 'inactif', titre: 'Badge valide mais plus actif', classe: 'st-inactif', icone: '🔒' },
    { code: 'invalide', titre: 'Badge non valide', classe: 'st-expire', icone: '✘' },
    { code: 'aucun', titre: 'Pas de badge', classe: 'st-aucun', icone: '–' }
  ];
  function section(code) {
    return code === 'valide' || code === 'renouveler' ? 'actif' : code === 'inactif' ? 'inactif' : 'invalide';
  }

  function calculerAeroport(a, typesIds, societeId) {
    var aujourdhui = U.aujourdhui();
    var res = { actif: [], inactif: [], invalide: [], aucun: [] };
    DB.personnesTriees(false).forEach(function (p) {
      if (societeId && p.societeId !== societeId) return;
      var docs = DB.documentsDe(p.id).filter(function (d) {
        return d.aeroportId === a.id && typesIds.indexOf(d.typeId) >= 0;
      });
      if (!docs.length) { res.aucun.push({ p: p }); return; }
      docs.forEach(function (d) {
        var s = Statut.calculer(d, aujourdhui);
        res[section(s.code)].push({ p: p, d: d, s: s });
      });
    });
    res.actif.sort(function (x, y) { return x.s.joursActifs - y.s.joursActifs; });
    res.inactif.sort(function (x, y) { return x.s.joursValidite - y.s.joursValidite; });
    return res;
  }

  function rapportAeroport(el, params) {
    var aeroports = DB.aeroportsTries();
    if (params[0]) choix.aeroport = params[0];
    if (!DB.aeroport(choix.aeroport)) choix.aeroport = aeroports.length ? aeroports[0].id : '';
    if (!choix.types) choix.types = DB.data.typesBadge.filter(function (t) { return t.comptePassage; }).map(function (t) { return t.id; });

    el.innerHTML = '<h1>Rapports</h1>' + onglets('aeroport') +
      '<div class="barre">' +
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
            '<th class="num">Jours de validité</th>' + (esc ? '<th>Escorteur</th>' : '') + '</tr></thead><tbody>' +
            lignes.map(function (l) {
              var t = DB.type(l.d.typeId);
              return '<tr class="cliquable" data-p="' + U.esc(l.p.id) + '"><td>' + U.esc(l.p.nom) + '</td><td>' + U.esc(l.p.prenom) + '</td>' +
                '<td>' + U.esc(DB.nomSociete(l.p.societeId)) + '</td><td>' + U.esc(t ? t.nom : '') + '</td>' +
                '<td>' + U.esc(l.d.numero) + '</td><td>' + U.fmtDate(l.d.dateExpiration) + '</td><td>' + U.fmtDate(l.d.dernierPassage) + '</td>' +
                '<td>' + Statut.pastille(l.s) + '</td>' +
                (sec.code === 'actif' ? '<td class="num"><b>' + joursTxt(l.s.joursActifs) + '</b></td>' : '') +
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
    el.querySelector('#r-csv').onclick = function () {
      var a = DB.aeroport(choix.aeroport);
      if (!a) return;
      var res = calculerAeroport(a, choix.types, choix.societe);
      var lignes = [['Catégorie', 'Nom', 'Prénom', 'Société', 'Type', 'Numéro', 'Expiration', 'Dernier passage', 'Statut',
        'Jours actifs restants', 'Jours de validité', 'Escorteur']];
      SECTIONS.forEach(function (sec) {
        res[sec.code].forEach(function (l) {
          var t = l.d ? DB.type(l.d.typeId) : null;
          lignes.push([sec.titre, l.p.nom, l.p.prenom, DB.nomSociete(l.p.societeId), t ? t.nom : '', l.d ? l.d.numero : '',
            l.d ? U.fmtDate(l.d.dateExpiration) : '', l.d ? U.fmtDate(l.d.dernierPassage) : '', l.s ? l.s.libelle : 'Pas de badge',
            l.s && sec.code === 'actif' ? l.s.joursActifs : '', l.s ? l.s.joursValidite : '', a.besoinEscorteur ? escorteurTxt(l.p, a) : '']);
        });
      });
      U.exporterCsv('rapport_' + (a.code || a.nom) + '_' + U.aujourdhui() + '.csv', lignes);
    };
  }

  function allerPersonne(e) {
    var tr = e.target.closest('tr[data-p]');
    if (tr) App.aller('#/personne/' + encodeURIComponent(tr.getAttribute('data-p')));
  }

  /* ======================= 2. PAR PERSONNE ======================= */
  function rapportPersonne(el, params) {
    if (params[0]) choix.personne = params[0];
    var personnes = DB.personnesTriees(true);
    if (!DB.personne(choix.personne)) choix.personne = personnes.length ? personnes[0].id : '';

    el.innerHTML = '<h1>Rapports</h1>' + onglets('personne') +
      '<div class="barre"><select id="r-pers">' + U.options(personnes.map(function (p) {
        return { value: p.id, label: nomComplet(p) + (DB.nomSociete(p.societeId) ? ' — ' + DB.nomSociete(p.societeId) : '') + (p.actif ? '' : ' (archivée)') };
      }), choix.personne) + '</select>' +
      '<div class="droite"><button class="secondaire" id="r-csv">Exporter (Excel)</button><button class="secondaire" onclick="window.print()">Imprimer</button></div>' +
      '</div><div id="r-res"></div>';

    var zone = el.querySelector('#r-res');
    function lignesPersonne(p) {
      var ordreTypes = DB.data.typesBadge.map(function (t) { return t.id; });
      return DB.documentsDe(p.id).map(function (d) {
        return { d: d, a: DB.aeroport(d.aeroportId), t: DB.type(d.typeId), s: Statut.calculer(d) };
      }).sort(function (x, y) {
        return U.comparerVidesFin(x.a && x.a.nom, y.a && y.a.nom) || ordreTypes.indexOf(x.d.typeId) - ordreTypes.indexOf(y.d.typeId);
      });
    }
    function remplir() {
      var p = DB.personne(choix.personne);
      if (!p) { zone.innerHTML = '<p class="vide">Aucune personne.</p>'; return; }
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
              '<td>' + U.fmtDate(l.d.dateExpiration) + '</td><td>' + U.fmtDate(l.d.dernierPassage) + '</td>' +
              '<td>' + Statut.pastille(l.s) + '</td><td class="aide">' + U.esc(l.s.detail) + '</td>' +
              '<td class="num">' + (l.s.joursActifs != null && l.s.joursActifs >= 0 ? l.s.joursActifs : '') + '</td>' +
              '<td>' + (l.a && l.a.besoinEscorteur ? escorteurTxt(p, l.a) : '') + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="vide">Aucun badge ni permis encodé.</p>') +
        (aerSans.length ? '<p class="aide">Pas de badge pour : ' + aerSans.map(function (a) { return U.esc(a.nom); }).join(', ') + '</p>' : '') +
        '</div>';
    }
    remplir();
    el.querySelector('#r-pers').onchange = function () { choix.personne = this.value; remplir(); };
    el.querySelector('#r-csv').onclick = function () {
      var p = DB.personne(choix.personne);
      if (!p) return;
      var lignes = [['Nom', 'Prénom', 'Société', 'Aéroport', 'Type', 'Numéro', 'Expiration', 'Dernier passage', 'Statut', 'Détail', 'Jours actifs restants', 'Escorteur']];
      lignesPersonne(p).forEach(function (l) {
        lignes.push([p.nom, p.prenom, DB.nomSociete(p.societeId), l.a ? l.a.nom : '', l.t ? l.t.nom : '', l.d.numero,
          U.fmtDate(l.d.dateExpiration), U.fmtDate(l.d.dernierPassage), l.s.libelle, l.s.detail,
          l.s.joursActifs != null && l.s.joursActifs >= 0 ? l.s.joursActifs : '', l.a && l.a.besoinEscorteur ? escorteurTxt(p, l.a) : '']);
      });
      U.exporterCsv('statut_' + p.nom + '_' + p.prenom + '_' + U.aujourdhui() + '.csv', lignes);
    };
  }

  /* ======================= 3. MATRICE ======================= */
  function colonnesMatrice() {
    var sel = choix.matriceAeroports;
    return DB.aeroportsTries().filter(function (a) { return !sel || sel.indexOf(a.id) >= 0; }).map(function (a) {
      var types = a.typesMatrice.map(DB.type).filter(Boolean);
      if (!types.length && DB.typeParDefaut()) types = [DB.typeParDefaut()];
      return { a: a, types: types };
    }).filter(function (c) { return c.types.length; });
  }

  function personnesMatrice() {
    return DB.personnesTriees(choix.archives).filter(function (p) {
      return !choix.matriceSocietes || p.societeId === choix.matriceSocietes;
    }).sort(function (x, y) {
      return U.comparerVidesFin(DB.nomSociete(x.societeId), DB.nomSociete(y.societeId)) || U.comparer(x.nom, y.nom) || U.comparer(x.prenom, y.prenom);
    });
  }

  function cellule(p, a, t, aujourdhui) {
    return Statut.meilleur(DB.data.documents.filter(function (d) {
      return d.personneId === p.id && d.aeroportId === a.id && d.typeId === t.id;
    }), aujourdhui);
  }

  function rapportMatrice(el) {
    var tous = DB.aeroportsTries();
    el.innerHTML = '<h1>Rapports</h1>' + onglets('matrice') +
      '<div class="barre">' +
      '<select id="m-soc">' + U.options(optionsSocietes(), choix.matriceSocietes, 'Toutes les sociétés') + '</select>' +
      '<label><input type="checkbox" id="m-arch"' + (choix.archives ? ' checked' : '') + '> personnes archivées</label>' +
      '<details><summary>Aéroports affichés</summary><div class="cases" id="m-aer" style="flex-direction:column;padding:6px">' +
      tous.map(function (a) {
        return '<label><input type="checkbox" value="' + U.esc(a.id) + '"' +
          (!choix.matriceAeroports || choix.matriceAeroports.indexOf(a.id) >= 0 ? ' checked' : '') + '> ' + U.esc(a.nom) + '</label>';
      }).join('') + '</div></details>' +
      '<div class="droite"><button class="secondaire" id="m-csv">Exporter (Excel)</button><button class="secondaire" onclick="window.print()">Imprimer</button></div>' +
      '</div>' + Statut.legende() + '<div id="m-res"></div>';

    var zone = el.querySelector('#m-res');
    function remplir() {
      var cols = colonnesMatrice(), pers = personnesMatrice(), aujourdhui = U.aujourdhui();
      if (!cols.length || !pers.length) { zone.innerHTML = '<p class="vide">Rien à afficher.</p>'; return; }
      var html = '<div class="titre-imprime">Matrice des badges — situation au ' + U.fmtDate(aujourdhui) + '</div>' +
        '<div class="matrice-cadre"><table class="matrice"><thead><tr>' +
        '<th class="col-fixe" rowspan="2">Nom</th><th rowspan="2">Société</th>' +
        cols.map(function (c) {
          return '<th class="aer debut-aer" colspan="' + c.types.length + '" title="' + U.esc(c.a.nom) + '">' + U.esc(c.a.nom) + '</th>';
        }).join('') + '</tr><tr>' +
        cols.map(function (c) {
          return c.types.map(function (t, i) { return '<th' + (i ? '' : ' class="debut-aer"') + '>' + U.esc(t.nom) + '</th>'; }).join('');
        }).join('') + '</tr></thead><tbody>';
      html += pers.map(function (p) {
        return '<tr class="cliquable" data-p="' + U.esc(p.id) + '"><td class="col-fixe">' + U.esc(nomComplet(p)) + '</td>' +
          '<td>' + U.esc(DB.nomSociete(p.societeId)) + '</td>' +
          cols.map(function (c) {
            return c.types.map(function (t, i) {
              var s = cellule(p, c.a, t, aujourdhui);
              var info = c.a.nom + ' — ' + t.nom + ' : ' + s.libelle + (s.detail ? ' (' + s.detail + ')' : '') +
                (s.doc && s.doc.dateExpiration ? ' — expire le ' + U.fmtDate(s.doc.dateExpiration) : '');
              return '<td class="cel ' + s.classe + (i ? '' : ' debut-aer') + '" title="' + U.esc(info) + '">' + s.icone + '</td>';
            }).join('');
          }).join('') + '</tr>';
      }).join('');
      zone.innerHTML = html + '</tbody></table></div>';
    }
    remplir();

    el.querySelector('#m-soc').onchange = function () { choix.matriceSocietes = this.value; remplir(); };
    el.querySelector('#m-arch').onchange = function () { choix.archives = this.checked; remplir(); };
    el.querySelector('#m-aer').onchange = function () {
      choix.matriceAeroports = [].map.call(this.querySelectorAll('input:checked'), function (i) { return i.value; });
      remplir();
    };
    zone.onclick = allerPersonne;
    el.querySelector('#m-csv').onclick = function () {
      var cols = colonnesMatrice(), aujourdhui = U.aujourdhui();
      var l1 = ['Nom', 'Prénom', 'Société'], l2 = ['', '', ''];
      cols.forEach(function (c) { c.types.forEach(function (t) { l1.push(c.a.nom); l2.push(t.nom); }); });
      var lignes = [l1, l2];
      personnesMatrice().forEach(function (p) {
        var l = [p.nom, p.prenom, DB.nomSociete(p.societeId)];
        cols.forEach(function (c) {
          c.types.forEach(function (t) {
            var s = cellule(p, c.a, t, aujourdhui);
            l.push(s.code === 'aucun' ? '' : s.libelle + (s.doc && s.doc.dateExpiration ? ' (' + U.fmtDate(s.doc.dateExpiration) + ')' : ''));
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
