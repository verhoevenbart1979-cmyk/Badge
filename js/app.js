'use strict';

/* Navigation (#/vue/param), en-tête et mode lecture seule. */
var App = (function () {
  var vues = {};

  function enregistrerVue(nom, fn) { vues[nom] = fn; }

  function afficher() {
    var morceaux = location.hash.replace(/^#\/?/, '').split('/');
    var nom = morceaux[0] || 'personnes';
    if (!DB.data) nom = 'fichier';
    var vue = vues[nom] || vues.personnes;
    document.querySelectorAll('#menu a').forEach(function (a) {
      a.classList.toggle('actif', a.getAttribute('data-menu') === ({ personne: 'personnes', vehicule: 'vehicules' }[nom] || nom));
    });
    // une vue peut préparer l'impression ; on oublie celle de la vue précédente
    window.onbeforeprint = null;
    window.onafterprint = null;
    var conteneur = document.getElementById('vue');
    conteneur.innerHTML = '';
    vue(conteneur, morceaux.slice(1).map(decodeURIComponent));
    majEtat();
  }

  function majEtat() {
    var el = document.getElementById('etat-fichier');
    var bandeau = document.getElementById('bandeau');
    document.body.classList.toggle('lecture-seule', !!(DB.data && DB.lectureSeule));
    if (!DB.data) { el.textContent = 'Aucune base ouverte'; bandeau.hidden = true; document.getElementById('alerte-planning').hidden = true; return; }
    var e = DB.etat;
    var source = DB.mode === 'dossier' ? '📁 ' + DB.nomDossier : '⚠ stockage du navigateur';
    var info = DB.lectureSeule ? '<b>lecture seule</b>'
      : e.erreur ? '<span class="erreur">non enregistré !</span>'
      : e.enregistreLe ? 'enregistré à ' + e.enregistreLe.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
    el.innerHTML = U.esc(source) + (DB.utilisateur() && DB.mode === 'dossier' ? ' · ' + U.esc(DB.utilisateur()) : '') + (info ? ' · ' + info : '');

    majAlertePlanning();

    if (DB.enVeille) {
      bandeau.hidden = false;
      bandeau.innerHTML = '⏸ <b>En veille</b> : 30 minutes sans activité, la base a été libérée pour vos collègues. ' +
        'Cliquez n\'importe où pour reprendre. <button class="secondaire" id="btn-reprendre">Reprendre</button>';
      bandeau.querySelector('#btn-reprendre').onclick = function () { DB.reprendre(); };
      desactiverSaisies(document.getElementById('vue'));
    } else if (DB.lectureSeule && DB.verrouAutre && DB.verrouAutre.poste && DB.verrouAutre.poste === DB.poste) {
      bandeau.hidden = false;
      bandeau.innerHTML = '🔒 <b>L\'application est déjà ouverte dans un autre onglet</b> de ce navigateur. ' +
        'Fermez cet onglet-ci et utilisez l\'autre (ou fermez l\'autre puis cliquez sur « Réessayer »). ' +
        '<button class="secondaire" id="btn-reessayer">Réessayer</button>';
      bandeau.querySelector('#btn-reessayer').onclick = function () {
        DB.reessayer().then(afficher, function (e) { U.toast(e.message, true); });
      };
      desactiverSaisies(document.getElementById('vue'));
    } else if (DB.lectureSeule) {
      var v = DB.verrouAutre;
      bandeau.hidden = false;
      bandeau.innerHTML = '🔒 <b>Lecture seule</b> : ' + (v
        ? 'la base est en cours de modification par <b>' + U.esc(v.utilisateur) + '</b> depuis ' +
          new Date(v.depuis).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) + '.'
        : 'la base est libre à nouveau.') +
        ' Vous pouvez consulter et imprimer, pas modifier. ' +
        '<button class="secondaire" id="btn-reessayer">' + (v ? 'Réessayer' : 'Passer en modification') + '</button> ' +
        (v ? '<button class="danger" id="btn-forcer">Forcer la modification</button>' : '');
      bandeau.querySelector('#btn-reessayer').onclick = function () {
        DB.reessayer().then(function () {
          U.toast(DB.lectureSeule ? 'La base est toujours utilisée.' : 'Vous pouvez modifier la base.', DB.lectureSeule);
          afficher();
        }, function (e) { U.toast(e.message, true); });
      };
      var f = bandeau.querySelector('#btn-forcer');
      if (f) f.onclick = function () {
        if (!confirm('Forcer la modification ?\n\nÀ n\'utiliser que si ' + v.utilisateur + ' a fermé la base (PC éteint, Chrome planté…). ' +
          'Sinon ses modifications en cours risquent d\'être perdues.')) return;
        DB.forcerModification().then(afficher, function (e) { U.toast(e.message, true); });
      };
      desactiverSaisies(document.getElementById('vue'));
    } else {
      bandeau.hidden = true;
    }
  }

  /* ISO : planning à importer au moins une fois par mois ; alerte après N jours (Configuration). */
  function majAlertePlanning() {
    var el = document.getElementById('alerte-planning');
    var seuil = +DB.data.parametres.alertePlanningJours || 20;
    var dernier = DB.dernierImportPlanning();
    var jours = dernier ? U.ecart(U.aujourdhui(), dernier.jour) : null;
    if (dernier && jours <= seuil) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '⚠ ' + (dernier
      ? 'Le planning n\'a plus été importé depuis <b>' + U.pluriel(jours, 'jour') + '</b> (dernier import le ' +
        U.fmtDate(dernier.jour) + (dernier.utilisateur ? ' par ' + U.esc(dernier.utilisateur) : '') + ').'
      : 'Le planning n\'a encore <b>jamais</b> été importé.') +
      ' Procédure ISO : au moins un import par mois.' +
      (DB.lectureSeule ? '' : ' <label class="bouton petit">Importer le planning…<input type="file" accept=".xlsx,.xlsm,.xls" hidden></label>');
    var input = el.querySelector('input[type=file]');
    if (input) input.onchange = function () {
      Planning.lancer(input.files[0]).catch(function (e) { U.toast(e.message || String(e), true); })
        .then(function () { input.value = ''; });
    };
  }

  /* En lecture seule : tout champ est désactivé, sauf dans les zones « filtre » (hors boutons « edition »). */
  function desactiverSaisies(racine) {
    if (!DB.lectureSeule) return;
    racine.querySelectorAll('input, select, textarea, button').forEach(function (c) {
      if (c.closest('.filtre') && !c.classList.contains('edition')) return;
      c.disabled = true;
    });
  }

  function aller(hash) {
    if (location.hash === hash) afficher(); else location.hash = hash;
  }

  window.addEventListener('hashchange', afficher);
  window.addEventListener('DOMContentLoaded', function () {
    DB.surChangement(majEtat);
    new MutationObserver(function () { desactiverSaisies(document.getElementById('vue')); })
      .observe(document.getElementById('vue'), { childList: true, subtree: true });
    afficher();
  });
  window.addEventListener('beforeunload', function (e) {
    if (DB.etat && DB.etat.erreur) { e.preventDefault(); e.returnValue = ''; }
  });

  return { enregistrerVue: enregistrerVue, afficher: afficher, aller: aller };
})();
