'use strict';

/*
 * Stockage des données.
 *
 * Mode « dossier » (normal) : l'utilisateur choisit le DOSSIER qui contient
 * badges.json (par ex. sur un lecteur réseau). Chrome y lit et écrit
 * directement (File System Access API). Le dossier permet aussi :
 *   - badges.lock : verrou. Une seule personne à la fois peut modifier ;
 *     les autres ouvrent la base en lecture seule. Le verrou est rafraîchi
 *     chaque minute et expire après 5 minutes (Chrome fermé, plantage…).
 *   - sauvegardes/badges_AAAA-MM-JJ.json : copie automatique chaque jour,
 *     les 30 dernières sont gardées.
 *
 * Mode « navigateur » (secours) : les données restent dans le stockage local
 * de Chrome. À n'utiliser que si l'accès aux fichiers est bloqué.
 */
var DB = (function () {
  var NOM_FICHIER = 'badges.json';
  var NOM_VERROU = 'badges.lock';
  var DOSSIER_SAUVEGARDES = 'sauvegardes';
  var NB_SAUVEGARDES = 30;
  var BATTEMENT_MS = 60 * 1000;          // rafraîchissement du verrou
  var EXPIRATION_VERROU_MS = 5 * 60 * 1000;

  var CLE_LOCAL = 'suivi-badges:donnees';
  var CLE_COPIE = 'suivi-badges:copie-securite';
  var CLE_UTILISATEUR = 'suivi-badges:utilisateur';
  var CLE_POSTE = 'suivi-badges:poste';

  var data = null;
  var dossier = null;          // FileSystemDirectoryHandle
  var mode = null;             // 'dossier' | 'navigateur'
  var lectureSeule = false;
  var verrouAutre = null;      // contenu du verrou d'un autre utilisateur
  var derniereModif = null;    // lastModified de badges.json au dernier chargement/écriture
  var fileEcriture = Promise.resolve();
  var minuteur = null;
  var etat = { enregistreLe: null, erreur: null };
  var ecouteurs = [];
  var session = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var PREFIXE_ONGLET = 'suivi-badges-onglet-';

  /* Chaque onglet ouvert tient un « Web Lock » à son nom tant qu'il vit : on peut ainsi
     savoir si la session qui a posé un verrou est encore ouverte dans ce navigateur. */
  if (navigator.locks) navigator.locks.request(PREFIXE_ONGLET + session, function () { return new Promise(function () {}); });

  /* Identifiant de ce navigateur sur ce PC (pour reconnaître ses propres anciens verrous). */
  function poste() {
    try {
      var id = localStorage.getItem(CLE_POSTE);
      if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(CLE_POSTE, id); }
      return id;
    } catch (e) { return ''; }
  }

  /* Le verrou vient-il de ce navigateur, d'un onglet qui n'est plus ouvert ? (Chrome fermé sans libérer le verrou) */
  function verrouOrphelin(v) {
    if (!v) return Promise.resolve(false);
    // verrous de la version 3 sans « poste » : reconnus au nom d'utilisateur
    var deMoi = v.poste ? v.poste === poste() : (!!utilisateur() && v.utilisateur === utilisateur());
    if (!deMoi) return Promise.resolve(false);
    if (!navigator.locks || !navigator.locks.query) return Promise.resolve(true);
    return navigator.locks.query().then(function (etat) {
      return !etat.held.some(function (l) { return l.name === PREFIXE_ONGLET + v.session; });
    }, function () { return true; });
  }

  var dossiersSupportes = typeof window.showDirectoryPicker === 'function';

  /* ---------- IndexedDB (mémorise le dernier dossier) ---------- */
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

  /* ---------- utilisateur ---------- */
  function utilisateur() {
    try { return localStorage.getItem(CLE_UTILISATEUR) || ''; } catch (e) { return ''; }
  }
  function definirUtilisateur(nom) {
    try { localStorage.setItem(CLE_UTILISATEUR, nom); } catch (e) { /* sans gravité */ }
  }
  function demanderUtilisateur(force) {
    var nom = utilisateur();
    if (nom && !force) return nom;
    nom = (prompt('Votre nom (affiché aux autres utilisateurs quand vous modifiez la base) :', nom) || '').trim();
    if (nom) definirUtilisateur(nom);
    return nom || utilisateur() || 'Utilisateur inconnu';
  }

  /* ---------- structure ---------- */
  function vide() {
    return normaliser({
      version: 2,
      meta: { creeLe: new Date().toISOString() },
      parametres: {},
      aeroports: [],
      typesBadge: [
        { id: 't_perm', nom: 'Badge permanent', parDefaut: true },
        { id: 't_temp', nom: 'Badge temporaire', parDefaut: false },
        { id: 't_tra', nom: 'Permis TRA', parDefaut: false },
        { id: 't_rad', nom: 'Permis RAD', parDefaut: false }
      ],
      societes: [],
      personnes: [],
      documents: []
    });
  }

  /* Complète les champs manquants et migre les anciennes versions. */
  function normaliser(d) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.personnes)) {
      throw new Error("Ce fichier n'est pas une base de données de badges valide.");
    }
    d.meta = d.meta || {};
    ['aeroports', 'typesBadge', 'societes', 'personnes', 'documents'].forEach(function (k) {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    d.aeroports.forEach(function (a) {
      if (a.delaiDemande == null) a.delaiDemande = 40;
      if (a.delaiPassage == null) a.delaiPassage = 100;
      a.besoinEscorteur = !!a.besoinEscorteur;
      if (!Array.isArray(a.typesMatrice)) a.typesMatrice = [];
      if (!a.delaisActivite || typeof a.delaisActivite !== 'object') a.delaisActivite = {};
      if (a.remarque == null) a.remarque = '';
    });
    // v1 → v2 : « tenir compte du dernier passage » par type devient ∞ par aéroport × type
    d.typesBadge.forEach(function (t) {
      t.parDefaut = !!t.parDefaut;
      if (t.comptePassage === false) {
        d.aeroports.forEach(function (a) {
          if (!(t.id in a.delaisActivite)) a.delaisActivite[t.id] = 'infini';
        });
      }
      delete t.comptePassage;
    });
    d.personnes.forEach(function (p) {
      if (p.actif == null) p.actif = true;
      if (!p.escorteur || typeof p.escorteur !== 'object') p.escorteur = {};
      if (p.remarque == null) p.remarque = '';
    });
    d.documents.forEach(function (doc) { if (doc.dateDemande === undefined) doc.dateDemande = null; });
    var p = d.parametres = d.parametres || {};
    if (p.margeRenouvellement == null) p.margeRenouvellement = 30;
    if (p.societeDefaut === undefined) {
      var jdc = d.societes.filter(function (s) { return String(s.nom).trim().toUpperCase() === 'JDC'; })[0];
      p.societeDefaut = jdc ? jdc.id : '';
    }
    p.matrice = p.matrice || {};
    if (!Array.isArray(p.matrice.colonnesMasquees)) p.matrice.colonnesMasquees = [];
    if (!Array.isArray(p.matrice.personnesMasquees)) p.matrice.personnesMasquees = [];
    d.version = 2;
    return d;
  }

  function copieSecurite() {
    try { localStorage.setItem(CLE_COPIE, JSON.stringify(data)); } catch (e) { /* quota : sans gravité */ }
  }

  function notifier() { ecouteurs.forEach(function (f) { f(); }); }

  /* ---------- fichiers du dossier ---------- */
  function lireJson(h) {
    return h.getFile().then(function (f) {
      return f.text().then(function (txt) {
        try { return { json: JSON.parse(txt), modif: f.lastModified }; } catch (e) { throw new Error('Le fichier « ' + f.name + ' » est illisible (JSON invalide).'); }
      });
    });
  }

  function ecrireFichier(h, texte) {
    return h.createWritable().then(function (w) {
      return w.write(texte).then(function () { return w.close(); });
    });
  }

  function fichier(creer) { return dossier.getFileHandle(NOM_FICHIER, { create: !!creer }); }

  /* ---------- verrou ---------- */
  function lireVerrou() {
    return dossier.getFileHandle(NOM_VERROU).then(lireJson).then(function (r) { return r.json; }, function () { return null; });
  }

  function verrouValide(v) {
    return v && v.session !== session && (Date.now() - new Date(v.battement).getTime()) < EXPIRATION_VERROU_MS;
  }

  function ecrireVerrou(depuis) {
    var v = { utilisateur: utilisateur() || 'Utilisateur inconnu', poste: poste(), session: session, depuis: depuis || new Date().toISOString(), battement: new Date().toISOString() };
    return dossier.getFileHandle(NOM_VERROU, { create: true }).then(function (h) { return ecrireFichier(h, JSON.stringify(v)); }).then(function () { return v; });
  }

  /* Tente de prendre le verrou. Renvoie true si on peut modifier. */
  function prendreVerrou(forcer) {
    return lireVerrou().then(function (v) {
      return (forcer || !verrouValide(v) ? Promise.resolve(true) : verrouOrphelin(v)).then(function (libre) {
        if (!libre) { verrouAutre = v; return false; }
        return ecrireVerrou().then(function () {
          // deux ouvertures simultanées : on relit pour vérifier qui a gagné
          return new Promise(function (ok) { setTimeout(ok, 400); });
        }).then(lireVerrou).then(function (v2) {
          if (v2 && v2.session !== session) { verrouAutre = v2; return false; }
          verrouAutre = null;
          return true;
        });
      });
    });
  }

  /* À la fermeture : un seul appel direct, pour avoir une chance d'aboutir avant la fin de la page.
     S'il n'aboutit pas, le verrou expire de lui-même après 5 minutes. */
  function libererVerrou() {
    if (mode !== 'dossier' || lectureSeule || !dossier) return;
    dossier.removeEntry(NOM_VERROU).catch(function () {});
  }

  /* Toutes les minutes : garder le verrou (ou suivre les changements en lecture seule). */
  function battement() {
    if (mode !== 'dossier') return;
    if (!lectureSeule) {
      lireVerrou().then(function (v) {
        if (v && v.session !== session) {
          // quelqu'un a forcé l'ouverture : on passe en lecture seule
          lectureSeule = true;
          verrouAutre = v;
          U.toast('La base a été reprise par ' + v.utilisateur + '. Vous êtes maintenant en lecture seule.', true);
          notifier();
          return;
        }
        return ecrireVerrou(v && v.depuis);
      }).catch(function () {});
    } else {
      // lecture seule : recharger si le fichier a changé
      fichier().then(function (h) { return h.getFile(); }).then(function (f) {
        if (f.lastModified !== derniereModif) {
          return lireJson({ getFile: function () { return Promise.resolve(f); } }).then(function (r) {
            data = normaliser(r.json);
            derniereModif = r.modif;
            notifier();
            if (!document.activeElement || !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) App.afficher();
          });
        }
      }).catch(function () {});
      lireVerrou().then(function (v) { verrouAutre = verrouValide(v) ? v : null; notifier(); });
    }
  }

  /* ---------- sauvegarde quotidienne ---------- */
  function sauvegardeDuJour() {
    var nom = 'badges_' + U.aujourdhui() + '.json';
    return dossier.getDirectoryHandle(DOSSIER_SAUVEGARDES, { create: true }).then(function (sd) {
      return sd.getFileHandle(nom).then(function () { return sd; }, function () {
        return sd.getFileHandle(nom, { create: true }).then(function (h) {
          return ecrireFichier(h, JSON.stringify(data, null, 1));
        }).then(function () { return sd; });
      });
    }).then(function (sd) {
      return listerSauvegardes().then(function (noms) {
        return Promise.all(noms.slice(NB_SAUVEGARDES).map(function (n) { return sd.removeEntry(n); }));
      });
    }).catch(function (e) { console.warn('Sauvegarde quotidienne impossible', e); });
  }

  /* Noms des sauvegardes, la plus récente d'abord. */
  function listerSauvegardes() {
    if (mode !== 'dossier') return Promise.resolve([]);
    return dossier.getDirectoryHandle(DOSSIER_SAUVEGARDES).then(function (sd) {
      var noms = [];
      var it = sd.keys();
      function suivant() {
        return it.next().then(function (r) {
          if (r.done) return noms;
          if (/^badges_.*\.json$/.test(r.value)) noms.push(r.value);
          return suivant();
        });
      }
      return suivant();
    }).then(function (noms) { return noms.sort().reverse(); }, function () { return []; });
  }

  function lireSauvegarde(nom) {
    return dossier.getDirectoryHandle(DOSSIER_SAUVEGARDES).then(function (sd) { return sd.getFileHandle(nom); })
      .then(lireJson).then(function (r) { return normaliser(r.json); });
  }

  /* ---------- ouverture ---------- */
  function demanderAcces(h) {
    var opts = { mode: 'readwrite' };
    return h.queryPermission(opts).then(function (p) {
      return p === 'granted' ? p : h.requestPermission(opts);
    }).then(function (p) {
      if (p !== 'granted') throw new Error("L'accès au dossier a été refusé.");
    });
  }

  function chargerDossier(h, forcerVerrou) {
    dossier = h;
    mode = 'dossier';
    return fichier().then(lireJson).then(function (r) {
      data = normaliser(r.json);
      derniereModif = r.modif;
      etat = { enregistreLe: null, erreur: null };
      demanderUtilisateur(false);
      return prendreVerrou(forcerVerrou);
    }).then(function (peutModifier) {
      lectureSeule = !peutModifier;
      copieSecurite();
      clearInterval(minuteur);
      minuteur = setInterval(battement, BATTEMENT_MS);
      return idbSet('dossier', h).then(function () {
        if (!lectureSeule) return sauvegardeDuJour();
      });
    }).then(notifier);
  }

  function dernierDossier() { return dossiersSupportes ? idbGet('dossier') : Promise.resolve(null); }

  function rouvrir(h) { return demanderAcces(h).then(function () { return chargerDossier(h); }); }

  function choisirDossier() {
    return window.showDirectoryPicker({ id: 'suivi-badges', mode: 'readwrite' }).then(function (h) {
      return demanderAcces(h).then(function () { return h; });
    });
  }

  function ouvrirDossier() {
    return choisirDossier().then(function (h) {
      return h.getFileHandle(NOM_FICHIER).then(function () { return chargerDossier(h); }, function () {
        throw new Error('Pas de fichier « ' + NOM_FICHIER + ' » dans le dossier « ' + h.name +
          ' ». Choisissez le dossier qui le contient, ou créez une nouvelle base.');
      });
    });
  }

  function creerBase(contenuInitial) {
    return choisirDossier().then(function (h) {
      return h.getFileHandle(NOM_FICHIER).then(function () {
        throw new Error('Ce dossier contient déjà un fichier ' + NOM_FICHIER + ' : utilisez « Ouvrir ».');
      }, function () {
        return h.getFileHandle(NOM_FICHIER, { create: true }).then(function (f) {
          return ecrireFichier(f, JSON.stringify(normaliser(contenuInitial || vide()), null, 1));
        });
      }).then(function () { return chargerDossier(h); });
    });
  }

  function forcerModification() {
    return chargerDossier(dossier, true).then(function () { U.toast('Vous pouvez à nouveau modifier la base.'); });
  }

  function reessayer() { return chargerDossier(dossier, false); }

  function ouvrirNavigateur() {
    var txt = localStorage.getItem(CLE_LOCAL);
    data = normaliser(txt ? JSON.parse(txt) : vide());
    mode = 'navigateur';
    dossier = null;
    lectureSeule = false;
    etat = { enregistreLe: null, erreur: null };
    copieSecurite();
    notifier();
    return Promise.resolve();
  }

  /* ---------- écriture ---------- */
  function ecrire() {
    return fichier(true).then(function (h) {
      return h.getFile().then(function (f) {
        if (derniereModif != null && f.lastModified !== derniereModif) {
          var ok = confirm("Le fichier « " + NOM_FICHIER + " » a été modifié ailleurs depuis son ouverture.\n\n" +
            "OK = écraser avec mes données\nAnnuler = ne pas enregistrer (rechargez ensuite la base)");
          if (!ok) throw new Error('Enregistrement annulé : rechargez la base (menu Base de données).');
        }
        return ecrireFichier(h, JSON.stringify(data, null, 1));
      }).then(function () { return h.getFile(); }).then(function (f) { derniereModif = f.lastModified; });
    });
  }

  /* À appeler après chaque modification de `data`. Les écritures sont mises en file. */
  function enregistrer() {
    if (lectureSeule) {
      U.toast('Base en lecture seule' + (verrouAutre ? ' (utilisée par ' + verrouAutre.utilisateur + ')' : '') +
        ' : modification NON enregistrée.', true);
      // revenir aux données du fichier
      return fichier().then(lireJson).then(function (r) { data = normaliser(r.json); derniereModif = r.modif; App.afficher(); });
    }
    data.meta.modifieLe = new Date().toISOString();
    data.meta.modifiePar = utilisateur() || undefined;
    copieSecurite();
    fileEcriture = fileEcriture.catch(function () {}).then(function () {
      if (mode === 'navigateur') localStorage.setItem(CLE_LOCAL, JSON.stringify(data));
      else return ecrire();
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

  function remplacer(d) {
    data = normaliser(d);
    return enregistrer();
  }

  function exporter() {
    U.telecharger('badges_sauvegarde_' + U.aujourdhui() + '.json', JSON.stringify(data, null, 1), 'application/json');
  }

  function copieDisponible() {
    try { return localStorage.getItem(CLE_COPIE); } catch (e) { return null; }
  }

  window.addEventListener('pagehide', libererVerrou);

  /* ---------- accès pratiques ---------- */
  function parId(liste, id) {
    for (var i = 0; i < liste.length; i++) if (liste[i].id === id) return liste[i];
    return null;
  }

  return {
    get data() { return data; },
    get mode() { return mode; },
    get nomDossier() { return dossier ? dossier.name : null; },
    get lectureSeule() { return lectureSeule; },
    get verrouAutre() { return verrouAutre; },
    get etat() { return etat; },
    NOM_FICHIER: NOM_FICHIER,
    dossiersSupportes: dossiersSupportes,
    surChangement: function (f) { ecouteurs.push(f); },
    utilisateur: utilisateur,
    changerUtilisateur: function () { demanderUtilisateur(true); if (!lectureSeule && mode === 'dossier') ecrireVerrou(); notifier(); },
    dernierDossier: dernierDossier,
    rouvrir: rouvrir,
    ouvrirDossier: ouvrirDossier,
    creerBase: creerBase,
    forcerModification: forcerModification,
    reessayer: reessayer,
    ouvrirNavigateur: ouvrirNavigateur,
    listerSauvegardes: listerSauvegardes,
    lireSauvegarde: lireSauvegarde,
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
