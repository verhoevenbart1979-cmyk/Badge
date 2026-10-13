'use strict';

/* Navigation (#/vue/param) et en-tête. */
var App = (function () {
  var vues = {};

  function enregistrerVue(nom, fn) { vues[nom] = fn; }

  function afficher() {
    var morceaux = location.hash.replace(/^#\/?/, '').split('/');
    var nom = morceaux[0] || 'personnes';
    if (!DB.data) nom = 'fichier';
    var vue = vues[nom] || vues.personnes;
    document.querySelectorAll('#menu a').forEach(function (a) {
      a.classList.toggle('actif', a.getAttribute('data-menu') === (nom === 'personne' ? 'personnes' : nom));
    });
    var conteneur = document.getElementById('vue');
    conteneur.innerHTML = '';
    vue(conteneur, morceaux.slice(1).map(decodeURIComponent));
    majEtat();
  }

  function majEtat() {
    var el = document.getElementById('etat-fichier');
    if (!DB.data) { el.textContent = 'Aucune base ouverte'; return; }
    var e = DB.etat;
    var source = DB.mode === 'fichier' ? '📄 ' + DB.nomFichier : '⚠ stockage du navigateur';
    var info = e.erreur ? '<span class="erreur">non enregistré !</span>'
      : e.enregistreLe ? 'enregistré à ' + e.enregistreLe.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
    el.innerHTML = U.esc(source) + (info ? ' · ' + info : '');
  }

  function aller(hash) {
    if (location.hash === hash) afficher(); else location.hash = hash;
  }

  window.addEventListener('hashchange', afficher);
  window.addEventListener('DOMContentLoaded', function () {
    DB.surChangement(majEtat);
    afficher();
  });
  window.addEventListener('beforeunload', function (e) {
    if (DB.etat && DB.etat.erreur) { e.preventDefault(); e.returnValue = ''; }
  });

  return { enregistrerVue: enregistrerVue, afficher: afficher, aller: aller };
})();
