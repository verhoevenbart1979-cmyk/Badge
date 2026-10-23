'use strict';

/*
 * Export Excel de secours : SuiviBadges_export.xlsx dans le dossier de la base.
 *
 * Écrit automatiquement à la première ouverture (en modification) de chaque jour,
 * donc avec toutes les données enregistrées jusqu'à la veille ; le fichier est
 * remplacé chaque jour. Il se lit sans l'application : une feuille par aéroport
 * (comme l'ancien classeur), plus la liste complète des badges, des véhicules, etc.
 * Les statuts sont calculés à la date de l'export.
 */
var ExportExcel = (function () {
  var NOM_FICHIER = 'SuiviBadges_export.xlsx';
  var FORMAT_DATE = 'dd/mm/yyyy';

  /* Date ISO → numéro de série Excel (pas de décalage de fuseau horaire). */
  function serie(iso) {
    var j = U.jour(iso);
    return j == null ? null : j + 25569;
  }

  function nomPersonne(p) { return p ? (p.nom + ' ' + p.prenom).trim() : ''; }

  /*
   * Feuille à partir de lignes : en-tête en ligne 1, dates (ISO) converties en vraies
   * dates Excel dans les colonnes indiquées, largeurs de colonnes ajustées.
   */
  function feuille(entete, lignes, colonnesDates) {
    colonnesDates = colonnesDates || [];
    var donnees = [entete].concat(lignes.map(function (l) {
      return l.map(function (v, c) { return colonnesDates.indexOf(c) >= 0 && v ? serie(v) : v == null ? '' : v; });
    }));
    var ws = XLSX.utils.aoa_to_sheet(donnees);
    for (var r = 1; r < donnees.length; r++) {
      colonnesDates.forEach(function (c) {
        var cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
        if (cell && typeof cell.v === 'number') cell.z = FORMAT_DATE;
      });
    }
    ws['!cols'] = entete.map(function (h, c) {
      var max = String(h).length;
      donnees.forEach(function (l) { if (colonnesDates.indexOf(c) < 0) max = Math.max(max, String(l[c] == null ? '' : l[c]).length); });
      return { wch: Math.min(colonnesDates.indexOf(c) >= 0 ? 12 : 45, Math.max(8, max + 2)) };
    });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, donnees.length - 1), c: entete.length - 1 } }) };
    return ws;
  }

  /* Nom de feuille Excel valide et unique (31 caractères, sans : \ / ? * [ ]). */
  function nomFeuille(nom, pris) {
    var base = String(nom).replace(/[:\\\/\?\*\[\]]/g, ' ').trim().slice(0, 31) || 'Feuille';
    var n = base, i = 2;
    while (pris[n.toLowerCase()]) n = base.slice(0, 28) + ' ' + i++;
    pris[n.toLowerCase()] = true;
    return n;
  }

  function construire(utilisateur) {
    var d = DB.data, aujourdhui = U.aujourdhui();
    var wb = XLSX.utils.book_new(), pris = {};
    var ajouter = function (nom, ws) { XLSX.utils.book_append_sheet(wb, ws, nomFeuille(nom, pris)); };
    var personnes = DB.personnesTriees(true).sort(function (a, b) {
      return U.comparerVidesFin(DB.nomSociete(a.societeId), DB.nomSociete(b.societeId)) || U.comparer(a.nom, b.nom) || U.comparer(a.prenom, b.prenom);
    });
    var types = d.typesBadge;
    var oui = function (v) { return v === true ? 'Oui' : v === false ? 'Non' : ''; };
    var maintenant = new Date();

    // ---------- Lisez-moi ----------
    var info = [
      ['Suivi des badges – export de secours'],
      [''],
      ['Créé le', serie(aujourdhui)],
      ['Heure', maintenant.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })],
      ['Par', utilisateur || ''],
      ['Dernière modification de la base', d.meta.modifieLe ? new Date(d.meta.modifieLe).toLocaleString('fr-BE') : ''],
      [''],
      ['Ce fichier est créé automatiquement à la première ouverture de l\'application chaque jour.'],
      ['Il contient toutes les données enregistrées jusqu\'à ce moment, donc jusqu\'à la veille.'],
      ['Les statuts (valide, à renouveler, expiré…) sont calculés à la date de création ci-dessus.'],
      ['Il est remplacé chaque jour : en cas de panne de l\'application, faites-en d\'abord une copie, puis travaillez dans la copie.'],
      [''],
      ['Feuilles', 'Contenu'],
      ['Une feuille par aéroport (ex. « EBLG Liège »)', 'Comme l\'ancien classeur : personnes, badges et permis, dernier passage, escorteur'],
      ['Badges et permis', 'Tous les badges et permis, une ligne chacun'],
      ['Dernier passage', 'Date du dernier passage par personne et par aéroport'],
      ['Personnes', 'Liste des personnes'],
      ['Véhicules', 'Véhicules et leurs badges'],
      ['Aéroports', 'Délais configurés'],
      ['Projets', 'Codes projet du planning'],
      ['Suivi planning ISO', 'Historique des imports du planning']
    ];
    var wsInfo = XLSX.utils.aoa_to_sheet(info);
    wsInfo.B3.z = FORMAT_DATE;
    wsInfo['!cols'] = [{ wch: 34 }, { wch: 80 }];
    ajouter('Lisez-moi', wsInfo);

    // ---------- une feuille par aéroport ----------
    DB.aeroportsTries().forEach(function (a) {
      var typesAer = types.filter(function (t) { return d.documents.some(function (doc) { return doc.aeroportId === a.id && doc.typeId === t.id; }); });
      var gens = personnes.filter(function (p) {
        return p.passages[a.id] || d.documents.some(function (doc) { return doc.personneId === p.id && doc.aeroportId === a.id; });
      });
      if (!gens.length) return;
      var entete = ['Société', 'Nom', 'Prénom', 'Active', 'Dernier passage'], dates = [4];
      if (a.besoinEscorteur) entete.push('Escorteur');
      typesAer.forEach(function (t) {
        entete.push(t.nom + ' – N°', t.nom + ' – Expiration', t.nom + ' – Statut', t.nom + ' – Demande lancée le');
        dates.push(entete.length - 3, entete.length - 1);
      });
      var lignes = gens.map(function (p) {
        var l = [DB.nomSociete(p.societeId), p.nom, p.prenom, p.actif ? 'Oui' : 'Non', p.passages[a.id] || null];
        if (a.besoinEscorteur) l.push(oui(p.escorteur[a.id]));
        typesAer.forEach(function (t) {
          var docs = d.documents.filter(function (doc) { return doc.personneId === p.id && doc.aeroportId === a.id && doc.typeId === t.id; });
          var s = Statut.meilleur(docs, aujourdhui), doc = s.doc;
          l.push(doc ? doc.numero : '', doc ? doc.dateExpiration : null, doc ? s.libelle : '', doc ? doc.dateDemande : null);
        });
        return l;
      });
      ajouter(a.code && a.code !== a.nom ? a.code + ' ' + a.nom : a.nom, feuille(entete, lignes, dates));
    });

    // ---------- badges et permis ----------
    var lignesDocs = [];
    personnes.forEach(function (p) {
      DB.documentsDe(p.id).forEach(function (doc) {
        var a = DB.aeroport(doc.aeroportId), t = DB.type(doc.typeId), s = Statut.calculer(doc, aujourdhui);
        lignesDocs.push([DB.nomSociete(p.societeId), p.nom, p.prenom, p.actif ? 'Oui' : 'Non', a ? a.nom : '', t ? t.nom : '',
          doc.numero, doc.dateExpiration, s.passage || null, s.libelle, s.joursValidite, s.joursActifs != null && s.joursActifs >= 0 ? s.joursActifs : '',
          doc.dateDemande, s.demande ? s.demande.arrivee : null, doc.remarque]);
      });
    });
    ajouter('Badges et permis', feuille(['Société', 'Nom', 'Prénom', 'Active', 'Aéroport', 'Type', 'N°', 'Expiration', 'Dernier passage',
      'Statut', 'Jours de validité', 'Jours actifs restants', 'Demande lancée le', 'Arrivée prévue', 'Remarque'], lignesDocs, [7, 8, 12, 13]));

    // ---------- dernier passage ----------
    var aers = DB.aeroportsTries();
    ajouter('Dernier passage', feuille(['Société', 'Nom', 'Prénom'].concat(aers.map(function (a) { return a.nom; })),
      personnes.map(function (p) { return [DB.nomSociete(p.societeId), p.nom, p.prenom].concat(aers.map(function (a) { return p.passages[a.id] || null; })); }),
      aers.map(function (a, i) { return i + 3; })));

    // ---------- personnes ----------
    var aerEsc = aers.filter(function (a) { return a.besoinEscorteur; });
    ajouter('Personnes', feuille(['Société', 'Nom', 'Prénom', 'Active', 'Remarque'].concat(aerEsc.map(function (a) { return 'Escorteur ' + a.nom; })),
      personnes.map(function (p) {
        return [DB.nomSociete(p.societeId), p.nom, p.prenom, p.actif ? 'Oui' : 'Non', p.remarque].concat(aerEsc.map(function (a) { return oui(p.escorteur[a.id]); }));
      })));

    // ---------- véhicules ----------
    var aerV = DB.aeroportsVehicules(), enteteV = ['Immatriculation', 'Type', 'Société', 'Chauffeur', 'Actif', 'Remarque'], datesV = [];
    aerV.forEach(function (a) { enteteV.push(a.nom + ' – N°', a.nom + ' – Validité', a.nom + ' – Statut', a.nom + ' – Demande lancée le'); datesV.push(enteteV.length - 3, enteteV.length - 1); });
    ajouter('Véhicules', feuille(enteteV, d.vehicules.slice().sort(function (x, y) { return U.comparerVidesFin(x.immatriculation, y.immatriculation); }).map(function (v) {
      var l = [v.immatriculation, v.type, DB.nomSociete(v.societeId), v.chauffeurId ? nomPersonne(DB.personne(v.chauffeurId)) : 'non attribué', v.actif ? 'Oui' : 'Non', v.remarque];
      aerV.forEach(function (a) {
        var b = v.badges[a.id];
        var s = b && (b.numero || b.dateExpiration || b.dateDemande) ? Statut.calculerVehicule(b, a, aujourdhui) : null;
        l.push(b ? b.numero : '', b ? b.dateExpiration : null, s ? s.libelle : '', b ? b.dateDemande : null);
      });
      return l;
    }), datesV));

    // ---------- configuration, projets, ISO ----------
    ajouter('Aéroports', feuille(['Code', 'Nom', 'Délai demande badge (j)', 'Délai dernier passage (j)', 'Besoin escorteur', 'Badges véhicules', 'Délai demande véhicule (j)', 'Remarque'],
      aers.map(function (a) { return [a.code, a.nom, a.delaiDemande, a.delaiPassage, a.besoinEscorteur ? 'Oui' : 'Non', a.badgesVehicules ? 'Oui' : 'Non', a.delaiDemandeVehicule, a.remarque]; })));
    ajouter('Projets', feuille(['N° projet', 'Aéroport', 'Commentaire'], d.projets.slice().sort(function (x, y) { return U.comparer(x.numero, y.numero); }).map(function (pr) {
      var a = DB.aeroport(pr.aeroportId); return [pr.numero, a ? a.nom : '', pr.commentaire];
    })));
    ajouter('Suivi planning ISO', feuille(['Date', 'Heure', 'Par', 'Fichier', 'Période du planning', 'Dates mises à jour'],
      d.historiquePlanning.slice().sort(function (x, y) { return (y.jour + y.heure) < (x.jour + x.heure) ? -1 : 1; }).map(function (h) {
        return [h.jour, h.heure, h.utilisateur, h.fichier, String(h.periode || '').split(' → ').map(U.fmtDate).join(' → '), h.misesAJour];
      }), [0]));

    return wb;
  }

  function octets(utilisateur) {
    return XLSX.write(construire(utilisateur), { type: 'array', bookType: 'xlsx', compression: true });
  }

  /* Écrit (remplace) l'export dans le dossier. */
  function ecrire(dossier, utilisateur) {
    var contenu = octets(utilisateur);
    return dossier.getFileHandle(NOM_FICHIER, { create: true }).then(function (h) {
      return h.createWritable().then(function (w) { return w.write(contenu).then(function () { return w.close(); }); });
    });
  }

  /* Date (locale, ISO) de la dernière écriture de l'export, ou null s'il n'existe pas. */
  function dateExport(dossier) {
    return dossier.getFileHandle(NOM_FICHIER).then(function (h) { return h.getFile(); }).then(function (f) {
      var d = new Date(f.lastModified);
      return { jour: d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2), date: d };
    }, function () { return null; });
  }

  /* Une fois par jour : si l'export n'a pas encore été écrit aujourd'hui, l'écrire. */
  function exportDuJour(dossier, utilisateur) {
    if (typeof XLSX === 'undefined') return Promise.resolve(false);
    return dateExport(dossier).then(function (e) {
      if (e && e.jour >= U.aujourdhui()) return false;
      return ecrire(dossier, utilisateur).then(function () { return true; });
    });
  }

  return { NOM_FICHIER: NOM_FICHIER, construire: construire, octets: octets, ecrire: ecrire, dateExport: dateExport, exportDuJour: exportDuJour };
})();
