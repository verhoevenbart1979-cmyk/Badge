'use strict';

/*
 * Stockage des données.
 *
 * Mode « fichier » (normal) : un fichier badges.json, par ex. sur un lecteur
 * réseau, lu et écrit directement par Chrome (File System Access API).
 * Le dernier fichier utilisé est mémorisé : au démarrage un clic suffit pour
 * le rouvrir.
 *
 * Mode « navigateur » (secours) : les données restent dans le stockage local
 * de Chrome. À n'utiliser que si l'accès aux fichiers est bloqué.
 *
 * Dans les deux modes une copie de sécurité est gardée dans le navigateur.
 */
var DB = (function () {
  var CLE_LOCAL = 'suivi-badges:donnees';
  var CLE_COPIE = 'suivi-badges:copie-securite';
  var data = null;
  var poignee = null;          // FileSystemFileHandle
  var mode = null;             // 'fichier' | 'navigateur'
  var derniereModif = null;    // lastModified du fichier au dernier chargement/écriture
  var fileEcriture = Promise.resolve();
  var etat = { enregistreLe: null, erreur: null };
  var ecouteurs = [];

  var fichiersSupportes = typeof window.showOpenFilePicker === 'function';
  var TYPES_FICHIER = [{ description: 'Base de données badges (JSON)', accept: { 'application/json': ['.json'] } }];

  /* ---------- IndexedDB (mémorise la poignée du dernier fichier) ---------- */
  function idb() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open('suivi-badges', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
  }
  function idbOp(modeTx, fn) {
    return idb().then(function (db) {
      return new Promise(function (ok, ko) {
        var req = fn(db.transaction('kv', modeTx).objectStore('kv'));
        req.onsuccess = function () { ok(req.result); };
        req.onerror = function () { ko(req.error); };
      });
    });
  }
  function idbGet(k) { return idbOp('readonly', function (s) { return s.get(k); }).catch(function () { return null; }); }
  function idbSet(k, v) { return idbOp('readwrite', function (s) { return s.put(v, k); }).catch(function () {}); }

  /* ---------- structure ---------- */
  function vide() {
    return {
      version: 1,
      meta: { creeLe: new Date().toISOString() },
      aeroports: [],
      typesBadge: [
        { id: 't_perm', nom: 'Badge permanent', parDefaut: true, comptePassage: true },
        { id: 't_temp', nom: 'Badge temporaire', parDefaut: false, comptePassage: true },
        { id: 't_tra', nom: 'Permis TRA', parDefaut: false, comptePassage: false },
        { id: 't_rad', nom: 'Permis RAD', parDefaut: false, comptePassage: false }
      ],
      societes: [],
      personnes: [],
      documents: []
    };
  }

  /* Complète les champs manquants (fichiers d'anciennes versions, saisies manuelles…) */
  function normaliser(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.personnes)) {
      throw new Error("Ce fichier n'est pas une base de données de badges valide.");
    }
    d.version = d.version || 1;
    d.meta = d.meta || {};
    ['aeroports', 'typesBadge', 'societes', 'personnes', 'documents'].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    d.aeroports.forEach(function (a) {
      if (a.delaiDemande == null) a.delaiDemande = 40;
      if (a.delaiPassage == null) a.delaiPassage = 100;
      a.besoinEscorteur = !!a.besoinEscorteur;
      if (!Array.isArray(a.typesMatrice)) a.typesMatrice = [];
      if (a.remarque == null) a.remarque = '';
    });
    d.typesBadge.forEach(function (t) { t.parDefaut = !!t.parDefaut; t.comptePassage = t.comptePassage !== false; });
    d.personnes.forEach(function (p) {
      if (p.actif == null) p.actif = true;
      if (!p.escorteur || typeof p.escorteur !== 'object') p.escorteur = {};
      if (p.remarque == null) p.remarque = '';
    });
    return d;
  }

  function copieSecurite() {
    try { localStorage.setItem(CLE_COPIE, JSON.stringify(data)); } catch (e) { /* quota : sans gravité */ }
  }

  function notifier() { ecouteurs.forEach(function (f) { f(); }); }

  /* ---------- ouverture ---------- */
  function charger(d, nouveauMode, nouvellePoignee, modif) {
    data = normaliser(d);
    mode = nouveauMode;
    poignee = nouvellePoignee || null;
    derniereModif = modif || null;
    etat = { enregistreLe: null, erreur: null };
    copieSecurite();
    notifier();
  }

  function lireFichier(h) {
    return h.getFile().then(function (f) {
      return f.text().then(function (txt) {
        var d;
        try { d = JSON.parse(txt); } catch (e) { throw new Error('Le fichier « ' + f.name + ' » est illisible (JSON invalide).'); }
        charger(d, 'fichier', h, f.lastModified);
        return idbSet('poignee', h);
      });
    });
  }

  function demanderAcces(h) {
    var opts = { mode: 'readwrite' };
    return h.queryPermission(opts).then(function (p) {
      return p === 'granted' ? p : h.requestPermission(opts);
    }).then(function (p) {
      if (p !== 'granted') throw new Error("L'accès au fichier a été refusé.");
    });
  }

  function dernierFichier() { return fichiersSupportes ? idbGet('poignee') : Promise.resolve(null); }

  function rouvrir(h) { return demanderAcces(h).then(function () { return lireFichier(h); }); }

  function ouvrirFichier() {
    return window.showOpenFilePicker({ types: TYPES_FICHIER, multiple: false }).then(function (l) {
      return rouvrir(l[0]);
    });
  }

  function creerFichier(contenuInitial) {
    return window.showSaveFilePicker({ suggestedName: 'badges.json', types: TYPES_FICHIER }).then(function (h) {
      charger(contenuInitial || vide(), 'fichier', h, null);
      return ecrire(true).then(function () { return idbSet('poignee', h); });
    });
  }

  function ouvrirNavigateur() {
    var txt = localStorage.getItem(CLE_LOCAL);
    charger(txt ? JSON.parse(txt) : vide(), 'navigateur');
    return Promise.resolve();
  }

  /* ---------- écriture ---------- */
  function ecrire(forcer) {
    var verif = forcer || derniereModif == null ? Promise.resolve() : poignee.getFile().then(function (f) {
      if (f.lastModified !== derniereModif) {
        var ok = confirm("Le fichier « " + f.name + " » a été modifié ailleurs depuis son ouverture " +
          "(autre PC ou autre onglet).\n\nOK = écraser avec mes données\nAnnuler = ne pas enregistrer (rechargez ensuite le fichier)");
        if (!ok) throw new Error('Enregistrement annulé : rechargez le fichier (menu Base de données).');
      }
    });
    return verif.then(function () { return poignee.createWritable(); }).then(function (w) {
      return w.write(JSON.stringify(data, null, 1)).then(function () { return w.close(); });
    }).then(function () { return poignee.getFile(); }).then(function (f) { derniereModif = f.lastModified; });
  }

  /* À appeler après chaque modification de `data`. Les écritures sont mises en file. */
  function enregistrer() {
    data.meta.modifieLe = new Date().toISOString();
    copieSecurite();
    fileEcriture = fileEcriture.catch(function () {}).then(function () {
      if (mode === 'navigateur') {
        localStorage.setItem(CLE_LOCAL, JSON.stringify(data));
      } else {
        return ecrire(false);
      }
    }).then(function () {
      etat = { enregistreLe: new Date(), erreur: null };
      notifier();
    }, function (e) {
      etat = { enregistreLe: etat.enregistreLe, erreur: e.message || String(e) };
      U.toast('Erreur d\'enregistrement : ' + etat.erreur, true);
      notifier();
    });
    return fileEcriture;
  }

  function remplacer(d) { charger(d, mode, poignee, derniereModif); return enregistrer(); }

  function exporter() {
    U.telecharger('badges_sauvegarde_' + U.aujourdhui() + '.json', JSON.stringify(data, null, 1), 'application/json');
  }

  function copieDisponible() {
    try { return localStorage.getItem(CLE_COPIE); } catch (e) { return null; }
  }

  /* ---------- accès pratiques ---------- */
  function parId(liste, id) {
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
    return null;
  }

  return {
    get data() { return data; },
    get mode() { return mode; },
    get nomFichier() { return poignee ? poignee.name : null; },
    get etat() { return etat; },
    fichiersSupportes: fichiersSupportes,
    surChangement: function (f) { ecouteurs.push(f); },
    dernierFichier: dernierFichier,
    rouvrir: rouvrir,
    ouvrirFichier: ouvrirFichier,
    creerFichier: creerFichier,
    ouvrirNavigateur: ouvrirNavigateur,
    normaliser: normaliser,
    enregistrer: enregistrer,
    remplacer: remplacer,
    exporter: exporter,
    copieDisponible: copieDisponible,
    vide: vide,

    aeroport: function (id) { return parId(data.aeroports, id); },
    type: function (id) { return parId(data.typesBadge, id); },
    societe: function (id) { return parId(data.societes, id); },
    personne: function (id) { return parId(data.personnes, id); },
    typeParDefaut: function () {
      return data.typesBadge.filter(function (t) { return t.parDefaut; })[0] || data.typesBadge[0] || null;
    },
    documentsDe: function (personneId) {
      return data.documents.filter(function (d) { return d.personneId === personneId; });
    },
    aeroportsTries: function () {
      return data.aeroports.slice().sort(function (a, b) { return U.comparer(a.nom, b.nom); });
    },
    personnesTriees: function (inclureArchives) {
      return data.personnes.filter(function (p) { return inclureArchives || p.actif; }).sort(function (a, b) {
        return U.comparer(a.nom, b.nom) || U.comparer(a.prenom, b.prenom);
      });
    },
    nomSociete: function (id) { var s = id && parId(data.societes, id); return s ? s.nom : ''; }
  };
})();
