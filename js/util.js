'use strict';

/* Petites fonctions utilitaires partagées par toutes les vues. */
var U = (function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uid(prefixe) {
    return (prefixe || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /* Dates : toujours stockées en texte ISO « AAAA-MM-JJ ». */
  function aujourdhui() {
    // ?date=AAAA-MM-JJ dans l'URL permet de simuler un autre jour (tests)
    var force = new URLSearchParams(location.search).get('date');
    if (force && jour(force) != null) return force;
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function jour(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
  }

  function isoDepuisJour(n) {
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function ajouterJours(iso, n) {
    var j = jour(iso);
    return j == null ? null : isoDepuisJour(j + n);
  }

  /* Nombre de jours de b à a (a - b). */
  function ecart(a, b) { return jour(a) - jour(b); }

  function fmtDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function comparer(a, b) {
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'fr', { sensitivity: 'base', numeric: true });
  }

  /* Comme comparer(), mais les valeurs vides sont placées à la fin. */
  function comparerVidesFin(a, b) {
    if (!a || !b) return !a && !b ? 0 : !a ? 1 : -1;
    return comparer(a, b);
  }

  function normaliser(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function telecharger(nom, contenu, type) {
    var blob = new Blob([contenu], { type: type || 'application/octet-stream' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* CSV au format Excel belge/français : séparateur « ; » et BOM UTF-8. */
  function exporterCsv(nom, lignes) {
    var txt = lignes.map(function (l) {
      return l.map(function (v) {
        v = v == null ? '' : String(v);
        return /[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(';');
    }).join('\r\n');
    telecharger(nom, '﻿' + txt, 'text/csv;charset=utf-8');
  }

  var minuteurToast;
  function toast(message, erreur) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast' + (erreur ? ' erreur' : '');
    el.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(function () { el.hidden = true; }, erreur ? 8000 : 2500);
  }

  function options(liste, valeurSelectionnee, vide) {
    var html = vide != null ? '<option value="">' + esc(vide) + '</option>' : '';
    return html + liste.map(function (o) {
      return '<option value="' + esc(o.value) + '"' + (o.value === valeurSelectionnee ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
  }

  function pluriel(n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); }

  return {
    esc: esc, uid: uid, aujourdhui: aujourdhui, jour: jour, ajouterJours: ajouterJours, ecart: ecart,
    fmtDate: fmtDate, comparer: comparer, comparerVidesFin: comparerVidesFin, normaliser: normaliser, telecharger: telecharger,
    exporterCsv: exporterCsv, toast: toast, options: options, pluriel: pluriel
  };
})();
