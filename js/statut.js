'use strict';

/*
 * Calcul du statut d'un document (badge / permis). Rien n'est stocké : tout
 * est recalculé à partir des dates et des délais de la configuration.
 *
 *   expiré       date d'expiration dépassée                              ✘ rouge
 *   inactif      valide mais dernier passage > délai « dernier passage »  🔒 jaune
 *                (uniquement pour les types où le passage compte)
 *   à renouveler valide, actif, mais expire dans moins que le délai
 *                « demande de badge »                                     ✔ orange
 *   valide       valide et actif                                          ✔ vert
 *   inconnu      pas de date d'expiration encodée                         ? gris
 */
var Statut = (function () {
  var DEF = {
    valide:     { code: 'valide',     libelle: 'Valide et actif',      icone: '✔', classe: 'st-valide',     rang: 1 },
    renouveler: { code: 'renouveler', libelle: 'À renouveler',         icone: '✔', classe: 'st-renouveler', rang: 2 },
    inactif:    { code: 'inactif',    libelle: 'Valide mais inactif',  icone: '🔒', classe: 'st-inactif',    rang: 3 },
    inconnu:    { code: 'inconnu',    libelle: 'Date inconnue',        icone: '?', classe: 'st-inconnu',    rang: 4 },
    expire:     { code: 'expire',     libelle: 'Expiré',               icone: '✘', classe: 'st-expire',     rang: 5 },
    aucun:      { code: 'aucun',      libelle: 'Pas de badge',         icone: '–', classe: 'st-aucun',      rang: 6 }
  };
  var ORDRE = ['valide', 'renouveler', 'inactif', 'inconnu', 'expire', 'aucun'];

  /*
   * Renvoie { code, libelle, icone, classe, rang,
   *           joursValidite   : jours avant expiration (négatif si expiré),
   *           joursActifs     : jours d'activité restants (passage + délai, borné par l'expiration),
   *           finActivite     : date ISO de fin d'activité,
   *           detail          : explication en clair }
   */
  function calculer(doc, aujourdhui) {
    aujourdhui = aujourdhui || U.aujourdhui();
    var aer = doc.aeroportId ? DB.aeroport(doc.aeroportId) : null;
    var type = doc.typeId ? DB.type(doc.typeId) : null;
    var delaiDemande = aer ? +aer.delaiDemande || 0 : 40;
    var delaiPassage = aer ? +aer.delaiPassage || 0 : 100;
    var comptePassage = type ? type.comptePassage : true;

    var r = { joursValidite: null, joursActifs: null, finActivite: null, detail: '' };
    if (doc.dateExpiration) r.joursValidite = U.ecart(doc.dateExpiration, aujourdhui);

    if (comptePassage && doc.dernierPassage) {
      r.finActivite = U.ajouterJours(doc.dernierPassage, delaiPassage);
      if (doc.dateExpiration && doc.dateExpiration < r.finActivite) r.finActivite = doc.dateExpiration;
      r.joursActifs = U.ecart(r.finActivite, aujourdhui);
    } else if (!comptePassage && doc.dateExpiration) {
      r.finActivite = doc.dateExpiration;
      r.joursActifs = r.joursValidite;
    }

    var code;
    if (!doc.dateExpiration) {
      code = 'inconnu';
      r.detail = "Aucune date d'expiration encodée";
    } else if (r.joursValidite < 0) {
      code = 'expire';
      r.detail = 'Expiré depuis ' + U.pluriel(-r.joursValidite, 'jour');
    } else if (comptePassage && !doc.dernierPassage) {
      code = 'inactif';
      r.detail = 'Aucun dernier passage encodé';
    } else if (comptePassage && r.joursActifs < 0) {
      code = 'inactif';
      r.detail = 'Dernier passage il y a ' + U.pluriel(U.ecart(aujourdhui, doc.dernierPassage), 'jour') +
        ' (délai : ' + delaiPassage + ' j)';
    } else if (r.joursValidite <= delaiDemande) {
      code = 'renouveler';
      r.detail = 'Expire dans ' + U.pluriel(r.joursValidite, 'jour') + ' : introduire la demande (délai : ' + delaiDemande + ' j)';
    } else {
      code = 'valide';
      r.detail = comptePassage ? 'Encore ' + U.pluriel(r.joursActifs, 'jour') + ' actif' : 'Valide encore ' + U.pluriel(r.joursValidite, 'jour');
    }
    return Object.assign({}, DEF[code], r);
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
    return best || Object.assign({ doc: null, joursValidite: null, joursActifs: null, detail: '' }, DEF.aucun);
  }

  function pastille(s, texte) {
    return '<span class="pastille ' + s.classe + '" title="' + U.esc(s.detail || s.libelle) + '">' +
      U.esc(s.icone) + ' ' + U.esc(texte || s.libelle) + '</span>';
  }

  function legende(codes) {
    return '<div class="legende">' + (codes || ORDRE).map(function (c) {
      var d = DEF[c];
      return '<span><span class="pastille ' + d.classe + '">' + d.icone + '</span>' + U.esc(d.libelle) + '</span>';
    }).join('') + '</div>';
  }

  return { DEF: DEF, ORDRE: ORDRE, calculer: calculer, meilleur: meilleur, pastille: pastille, legende: legende };
})();
