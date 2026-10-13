'use strict';

/*
 * Calcul du statut d'un document (badge / permis). Rien n'est stocké : tout
 * est recalculé à partir des dates et des délais de la configuration.
 *
 * Délais utilisés :
 *   délai demande  : délai de l'aéroport (temps pour obtenir un nouveau badge)
 *   délai activité : par aéroport × type (Configuration) ; par défaut le
 *                    « délai dernier passage » de l'aéroport ; ∞ = jamais inactif
 *   marge          : alerte orange « à renouveler » commence délai demande + marge
 *                    jours avant l'expiration (paramètre général, 30 j par défaut)
 *
 * Statut de base (par ordre de priorité) :
 *   inconnu      pas de date d'expiration                                    ? gris
 *   expiré       date d'expiration dépassée                                  ✘ rouge
 *   attention    trop tard pour une demande : expire dans moins que le délai ⚠ magenta
 *   inactif      dernier passage plus vieux que le délai activité            🔒 jaune
 *   à renouveler expire dans moins que délai demande + marge                 ✔ orange
 *   valide                                                                   ✔ vert
 *
 * Demande lancée (doc.dateDemande) : arrivée prévue = date demande + délai demande.
 *   - arrivée prévue après l'expiration (badge encore valide) → attention
 *   - sinon remplace à renouveler / attention / expiré / inconnu → ⏳ violet
 *   - sinon (valide, inactif) le statut reste, avec ⏳ en plus
 */
var Statut = (function () {
  var DEF = {
    valide:     { code: 'valide',     libelle: 'Valide et actif',       icone: '✔', classe: 'st-valide',     rang: 1 },
    renouveler: { code: 'renouveler', libelle: 'À renouveler',          icone: '✔', classe: 'st-renouveler', rang: 2 },
    demande:    { code: 'demande',    libelle: 'Demande lancée',        icone: '⏳', classe: 'st-demande',    rang: 3 },
    inactif:    { code: 'inactif',    libelle: 'Valide mais inactif',   icone: '🔒', classe: 'st-inactif',    rang: 4 },
    attention:  { code: 'attention',  libelle: '!!! Attention !!!',     icone: '⚠', classe: 'st-attention',  rang: 5 },
    inconnu:    { code: 'inconnu',    libelle: 'Date inconnue',         icone: '?', classe: 'st-inconnu',    rang: 6 },
    expire:     { code: 'expire',     libelle: 'Expiré',                icone: '✘', classe: 'st-expire',     rang: 7 },
    aucun:      { code: 'aucun',      libelle: 'Pas de badge',          icone: '–', classe: 'st-aucun',      rang: 8 }
  };
  var ORDRE = ['valide', 'renouveler', 'demande', 'inactif', 'attention', 'inconnu', 'expire', 'aucun'];
  var INFINI = 'infini';

  /* Délai d'activité (jours) pour un aéroport et un type ; Infinity = jamais inactif. */
  function delaiActivite(aer, typeId) {
    if (!aer) return 100;
    var v = aer.delaisActivite && aer.delaisActivite[typeId];
    if (v === INFINI) return Infinity;
    if (typeof v === 'number') return v;
    return +aer.delaiPassage || 0;
  }

  function marge() {
    var p = DB.data && DB.data.parametres;
    return p && p.margeRenouvellement != null ? +p.margeRenouvellement : 30;
  }

  /*
   * Renvoie { code, libelle, icone, classe, rang,
   *           joursValidite : jours avant expiration (négatif si expiré),
   *           joursActifs   : jours d'activité restants (borné par l'expiration),
   *           valide, actif : booléens (badge valide / actif, hors demande),
   *           demande       : null ou { date, arrivee, retard },
   *           detail        : explication en clair }
   */
  function calculer(doc, aujourdhui) {
    aujourdhui = aujourdhui || U.aujourdhui();
    var aer = doc.aeroportId ? DB.aeroport(doc.aeroportId) : null;
    var delaiDemande = aer ? +aer.delaiDemande || 0 : 40;
    var delaiAct = delaiActivite(aer, doc.typeId);
    var infini = delaiAct === Infinity;

    var r = { joursValidite: null, joursActifs: null, finActivite: null, detail: '', demande: null, valide: false, actif: false };
    if (doc.dateExpiration) r.joursValidite = U.ecart(doc.dateExpiration, aujourdhui);
    r.valide = r.joursValidite != null && r.joursValidite >= 0;

    if (infini) {
      r.finActivite = doc.dateExpiration;
      r.joursActifs = r.joursValidite;
    } else if (doc.dernierPassage) {
      r.finActivite = U.ajouterJours(doc.dernierPassage, delaiAct);
      if (doc.dateExpiration && doc.dateExpiration < r.finActivite) r.finActivite = doc.dateExpiration;
      r.joursActifs = U.ecart(r.finActivite, aujourdhui);
    }
    r.actif = r.valide && r.joursActifs != null && r.joursActifs >= 0;

    // ---------- statut de base ----------
    var code;
    if (!doc.dateExpiration) {
      code = 'inconnu';
      r.detail = "Aucune date d'expiration encodée";
    } else if (r.joursValidite < 0) {
      code = 'expire';
      r.detail = 'Expiré depuis ' + U.pluriel(-r.joursValidite, 'jour');
    } else if (r.joursValidite < delaiDemande) {
      code = 'attention';
      r.detail = 'Expire dans ' + U.pluriel(r.joursValidite, 'jour') + ' : plus assez de temps pour une demande (délai : ' + delaiDemande + ' j)';
    } else if (!r.actif) {
      code = 'inactif';
      r.detail = doc.dernierPassage
        ? 'Dernier passage il y a ' + U.pluriel(U.ecart(aujourdhui, doc.dernierPassage), 'jour') + ' (délai : ' + delaiAct + ' j)'
        : 'Aucun dernier passage encodé';
    } else if (r.joursValidite < delaiDemande + marge()) {
      code = 'renouveler';
      r.detail = 'Expire dans ' + U.pluriel(r.joursValidite, 'jour') + ' : introduire la demande (délai : ' + delaiDemande + ' j)';
    } else {
      code = 'valide';
      r.detail = infini ? 'Valide encore ' + U.pluriel(r.joursValidite, 'jour') : 'Encore ' + U.pluriel(r.joursActifs, 'jour') + ' actif';
    }

    // ---------- demande en cours ----------
    if (doc.dateDemande) {
      var arrivee = U.ajouterJours(doc.dateDemande, delaiDemande);
      r.demande = { date: doc.dateDemande, arrivee: arrivee, retard: arrivee < aujourdhui };
      var txt = 'Demande lancée le ' + U.fmtDate(doc.dateDemande) + ', arrivée prévue le ' + U.fmtDate(arrivee) +
        (r.demande.retard ? ' (en retard)' : '');
      if (r.valide && arrivee > doc.dateExpiration) {
        code = 'attention';
        r.detail = txt + ' : après l\'expiration du badge actuel (' + U.fmtDate(doc.dateExpiration) + ')';
      } else if (code === 'valide' || code === 'inactif') {
        r.detail += ' · ' + txt;
      } else {
        code = 'demande';
        r.detail = txt;
      }
    }

    var res = Object.assign({}, DEF[code], r);
    if (code === 'demande' && r.demande.retard) res.libelle = 'Demande en retard';
    return res;
  }

  /* Le meilleur document d'une liste (statut le plus favorable, puis expiration la plus lointaine). */
  function meilleur(docs, aujourdhui) {
    var best = null;
    docs.forEach(function (d) {
      var s = calculer(d, aujourdhui);
      s.doc = d;
      if (!best || s.rang < best.rang ||
          (s.rang === best.rang && (d.dateExpiration || '') > (best.doc.dateExpiration || ''))) best = s;
    });
    return best || Object.assign({ doc: null, joursValidite: null, joursActifs: null, detail: '', demande: null }, DEF.aucun);
  }

  /* Icône seule (matrice) : ⏳ ajouté quand une demande est en cours sur un badge encore bon. */
  function icone(s) {
    return s.icone + (s.demande && s.code !== 'demande' && s.code !== 'attention' ? '⏳' : '');
  }

  function pastille(s, texte) {
    return '<span class="pastille ' + s.classe + '" title="' + U.esc(s.detail || s.libelle) + '">' +
      U.esc(texte ? s.icone : icone(s)) + ' ' + U.esc(texte || s.libelle) + '</span>';
  }

  function legende(codes) {
    return '<div class="legende">' + (codes || ORDRE).map(function (c) {
      var d = DEF[c];
      return '<span><span class="pastille ' + d.classe + '">' + d.icone + '</span>' + U.esc(d.libelle) + '</span>';
    }).join('') + '</div>';
  }

  return {
    DEF: DEF, ORDRE: ORDRE, INFINI: INFINI, calculer: calculer, meilleur: meilleur, icone: icone,
    pastille: pastille, legende: legende, delaiActivite: delaiActivite
  };
})();
