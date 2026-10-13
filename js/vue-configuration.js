'use strict';

/* Configuration : paramètres généraux, aéroports, délais d'activité, types de badge, sociétés. */
(function () {
  function compter(liste, champ, id) {
    return liste.filter(function (x) { return x[champ] === id; }).length;
  }

  /* Texte affiché pour un délai d'activité spécifique. */
  function texteDelai(v) { return v === Statut.INFINI ? '∞' : typeof v === 'number' ? String(v) : ''; }

  /* '' → défaut (undefined), 'inf' / '∞' → infini, nombre → nombre ; null si invalide. */
  function lireDelai(txt) {
    txt = String(txt || '').trim().toLowerCase();
    if (!txt) return undefined;
    if (/^(∞|inf|infini|oo)$/.test(txt)) return Statut.INFINI;
    if (/^\d+$/.test(txt)) return parseInt(txt, 10);
    return null;
  }

  function vue(el) {
    var d = DB.data;
    var p = d.parametres;
    var aeroports = DB.aeroportsTries();
    var societes = d.societes.slice().sort(function (a, b) { return U.comparer(a.nom, b.nom); });

    el.innerHTML =
      '<h1>Configuration</h1>' +

      '<div class="carte" data-parametres><h2 style="margin-top:0">Paramètres généraux</h2><div class="grille-champs">' +
      '<div class="champ"><label>Société présélectionnée dans les rapports</label><select data-param="societeDefaut">' +
      U.options(societes.map(function (s) { return { value: s.id, label: s.nom }; }), p.societeDefaut, 'Toutes les sociétés') + '</select></div>' +
      '<div class="champ"><label>Alerte orange « à renouveler » : jours avant le délai de demande</label>' +
      '<input type="number" min="0" data-param="margeRenouvellement" value="' + U.esc(p.margeRenouvellement) + '"></div>' +
      '</div><p class="aide">Exemple : délai de demande 90 j et marge 30 j → orange à partir de 120 jours avant l\'expiration, ' +
      '⚠ Attention à partir de 90 jours (plus assez de temps pour obtenir un nouveau badge).</p></div>' +

      '<div class="carte"><div class="barre"><h2 style="margin:0">Aéroports</h2>' +
      '<div class="droite"><button data-ajout="aeroport">+ Ajouter un aéroport</button></div></div>' +
      '<table class="table-saisie"><thead><tr><th>Code</th><th>Nom</th>' +
      '<th class="num" title="Temps nécessaire pour obtenir un nouveau badge">Délai demande de badge (jours)</th>' +
      '<th class="num" title="Après combien de jours sans passage le badge n\'est plus actif (valeur par défaut pour tous les types)">Délai dernier passage (jours)</th>' +
      '<th>Besoin escorteur</th><th>Colonnes dans la matrice</th><th>Remarque</th><th></th></tr></thead><tbody>' +
      (aeroports.length ? aeroports.map(function (a) {
        return '<tr data-liste="aeroports" data-id="' + U.esc(a.id) + '">' +
          '<td><input type="text" data-champ="code" value="' + U.esc(a.code) + '" style="width:70px;min-width:0"></td>' +
          '<td><input type="text" data-champ="nom" value="' + U.esc(a.nom) + '"></td>' +
          '<td class="num"><input type="number" min="0" data-champ="delaiDemande" data-nombre value="' + U.esc(a.delaiDemande) + '"></td>' +
          '<td class="num"><input type="number" min="0" data-champ="delaiPassage" data-nombre value="' + U.esc(a.delaiPassage) + '"></td>' +
          '<td style="text-align:center"><input type="checkbox" data-champ="besoinEscorteur"' + (a.besoinEscorteur ? ' checked' : '') + '></td>' +
          '<td><div class="cases">' + d.typesBadge.map(function (t) {
            return '<label><input type="checkbox" data-matrice="' + U.esc(t.id) + '"' +
              (a.typesMatrice.indexOf(t.id) >= 0 ? ' checked' : '') + '> ' + U.esc(t.nom) + '</label>';
          }).join('') + '</div></td>' +
          '<td><input type="text" data-champ="remarque" value="' + U.esc(a.remarque) + '"></td>' +
          '<td><button class="icone" data-suppr title="Supprimer">🗑</button></td></tr>';
      }).join('') : '<tr><td colspan="8" class="vide">Aucun aéroport. Ajoutez-en un pour commencer.</td></tr>') +
      '</tbody></table>' +
      '<p class="aide">« Colonnes dans la matrice » : les types de badge affichés sous cet aéroport dans le rapport matrice.</p></div>' +

      '<div class="carte"><h2 style="margin-top:0">Délai d\'activité par aéroport et type de badge (jours)</h2>' +
      '<p class="aide">Case vide = délai dernier passage de l\'aéroport (affiché en gris). ' +
      'Tapez un nombre pour un délai spécifique, ou <b>inf</b> (∞) si le badge ne devient jamais inactif : il reste actif tant qu\'il est valide.</p>' +
      '<div style="overflow:auto"><table class="table-saisie table-delais"><thead><tr><th>Aéroport</th>' +
      d.typesBadge.map(function (t) { return '<th class="num">' + U.esc(t.nom) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      aeroports.map(function (a) {
        return '<tr data-liste="aeroports" data-id="' + U.esc(a.id) + '"><td>' + U.esc(a.nom) + '</td>' +
          d.typesBadge.map(function (t) {
            var v = a.delaisActivite[t.id];
            return '<td class="num"><input type="text" data-delai="' + U.esc(t.id) + '" value="' + U.esc(texteDelai(v)) + '"' +
              ' placeholder="' + U.esc(a.delaiPassage) + '" class="' + (v === Statut.INFINI ? 'infini' : '') + '"></td>';
          }).join('') + '</tr>';
      }).join('') + '</tbody></table></div></div>' +

      '<div class="carte"><div class="barre"><h2 style="margin:0">Types de badge</h2>' +
      '<div class="droite"><button data-ajout="type">+ Ajouter un type</button></div></div>' +
      '<table class="table-saisie" style="max-width:640px"><thead><tr><th>Nom</th><th>Par défaut</th>' +
      '<th class="num">Documents</th><th></th></tr></thead><tbody>' +
      d.typesBadge.map(function (t) {
        return '<tr data-liste="typesBadge" data-id="' + U.esc(t.id) + '">' +
          '<td><input type="text" data-champ="nom" value="' + U.esc(t.nom) + '"></td>' +
          '<td style="text-align:center"><input type="radio" name="defaut" data-defaut' + (t.parDefaut ? ' checked' : '') + '></td>' +
          '<td class="num">' + compter(d.documents, 'typeId', t.id) + '</td>' +
          '<td><button class="icone" data-suppr title="Supprimer">🗑</button></td></tr>';
      }).join('') + '</tbody></table></div>' +

      '<div class="carte"><div class="barre"><h2 style="margin:0">Sociétés</h2>' +
      '<div class="droite"><button data-ajout="societe">+ Ajouter une société</button></div></div>' +
      '<table class="table-saisie" style="max-width:500px"><thead><tr><th>Nom</th><th class="num">Personnes</th><th></th></tr></thead><tbody>' +
      societes.map(function (s) {
        return '<tr data-liste="societes" data-id="' + U.esc(s.id) + '">' +
          '<td><input type="text" data-champ="nom" value="' + U.esc(s.nom) + '"></td>' +
          '<td class="num">' + compter(d.personnes, 'societeId', s.id) + '</td>' +
          '<td><button class="icone" data-suppr title="Supprimer">🗑</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    function element(tr) {
      var l = d[tr.getAttribute('data-liste')], id = tr.getAttribute('data-id');
      return { liste: tr.getAttribute('data-liste'), obj: l.filter(function (x) { return x.id === id; })[0] };
    }

    el.onchange = function (e) {
      var t = e.target;
      var param = t.getAttribute('data-param');
      if (param) {
        p[param] = t.type === 'number' ? Math.max(0, parseInt(t.value, 10) || 0) : t.value;
        DB.enregistrer();
        return;
      }
      var tr = t.closest('tr[data-liste]');
      if (!tr) return;
      var o = element(tr).obj;
      var champ = t.getAttribute('data-champ');
      var delai = t.getAttribute('data-delai');
      if (champ) {
        if (t.type === 'checkbox') o[champ] = t.checked;
        else if (t.hasAttribute('data-nombre')) o[champ] = Math.max(0, parseInt(t.value, 10) || 0);
        else o[champ] = t.value.trim();
        // tenir à jour le tableau des délais d'activité (sans tout redessiner : garde le focus)
        var ligne = el.querySelector('.table-delais tr[data-id="' + o.id + '"]');
        if (ligne && champ === 'delaiPassage') ligne.querySelectorAll('input').forEach(function (i) { i.placeholder = o.delaiPassage; });
        if (ligne && champ === 'nom' && tr.getAttribute('data-liste') === 'aeroports') ligne.cells[0].textContent = o.nom;
      } else if (delai) {
        var v = lireDelai(t.value);
        if (v === null) { U.toast('Valeur non valide : un nombre de jours, « inf » ou vide.', true); t.value = texteDelai(o.delaisActivite[delai]); return; }
        if (v === undefined) delete o.delaisActivite[delai]; else o.delaisActivite[delai] = v;
        t.value = texteDelai(v);
        t.classList.toggle('infini', v === Statut.INFINI);
      } else if (t.hasAttribute('data-matrice')) {
        var tid = t.getAttribute('data-matrice');
        o.typesMatrice = o.typesMatrice.filter(function (x) { return x !== tid; });
        if (t.checked) o.typesMatrice.push(tid);
        var ordre = d.typesBadge.map(function (x) { return x.id; });
        o.typesMatrice.sort(function (a, b) { return ordre.indexOf(a) - ordre.indexOf(b); });
      } else if (t.hasAttribute('data-defaut')) {
        d.typesBadge.forEach(function (x) { x.parDefaut = x === o; });
      }
      DB.enregistrer();
    };

    el.onclick = function (e) {
      var t = e.target;
      var ajout = t.getAttribute('data-ajout');
      if (ajout === 'aeroport') {
        var dt = DB.typeParDefaut();
        d.aeroports.push({ id: U.uid('a'), code: '', nom: 'Nouvel aéroport', delaiDemande: 40, delaiPassage: 100,
          besoinEscorteur: false, typesMatrice: dt ? [dt.id] : [], delaisActivite: {}, remarque: '' });
      } else if (ajout === 'type') {
        d.typesBadge.push({ id: U.uid('t'), nom: 'Nouveau type', parDefaut: !d.typesBadge.length });
      } else if (ajout === 'societe') {
        d.societes.push({ id: U.uid('s'), nom: 'Nouvelle société' });
      } else if (t.hasAttribute('data-suppr')) {
        var el2 = element(t.closest('tr[data-liste]')), o = el2.obj, n = 0;
        if (el2.liste === 'aeroports') n = compter(d.documents, 'aeroportId', o.id);
        if (el2.liste === 'typesBadge') n = compter(d.documents, 'typeId', o.id);
        if (el2.liste === 'societes') n = compter(d.personnes, 'societeId', o.id);
        if (n) { U.toast('Impossible : encore utilisé par ' + n + ' élément(s).', true); return; }
        if (!confirm('Supprimer « ' + (o.nom || o.code) + ' » ?')) return;
        d[el2.liste] = d[el2.liste].filter(function (x) { return x !== o; });
        if (el2.liste === 'typesBadge') d.aeroports.forEach(function (a) {
          a.typesMatrice = a.typesMatrice.filter(function (x) { return x !== o.id; });
          delete a.delaisActivite[o.id];
        });
        if (el2.liste === 'aeroports') d.personnes.forEach(function (pp) { delete pp.escorteur[o.id]; });
        if (el2.liste === 'societes' && p.societeDefaut === o.id) p.societeDefaut = '';
      } else {
        return;
      }
      DB.enregistrer();
      vue(el);
      if (ajout) {
        var champs = el.querySelectorAll('tr[data-liste="' + { aeroport: 'aeroports', type: 'typesBadge', societe: 'societes' }[ajout] + '"] input[data-champ="nom"]');
        // le nouvel élément porte le nom par défaut « Nouv… »
        for (var i = 0; i < champs.length; i++) if (/^Nouv/.test(champs[i].value)) { champs[i].select(); champs[i].focus(); break; }
      }
    };
  }

  App.enregistrerVue('configuration', vue);
})();
