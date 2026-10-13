#!/usr/bin/env python3
"""Migration unique du classeur Excel « Suivi des badges » vers badges.json.

Usage :  python3 import_excel.py <classeur.xlsx> <sortie.json> [rapport.md]

Le script ne sert qu'à la migration initiale (il nécessite Python + openpyxl) ;
l'application elle-même ne demande que Chrome.
"""
import collections
import datetime as dt
import json
import re
import sys
import unicodedata

import openpyxl

# ---------------------------------------------------------------- référentiel
AEROPORTS = [
    # id, code, nom, délai demande, délai passage, besoin escorteur
    ('a_bac', 'BAC', 'Brussels Airport', 90, 90, False),
    ('a_ebci', 'EBCI', 'Charleroi', 90, 90, True),
    ('a_eblg', 'EBLG', 'Liège', 90, 90, True),
    ('a_flo', 'EBFS', 'Florennes', 90, 100, False),
    ('a_lux', 'ELLX', 'Luxembourg', 150, 90, False),
    ('a_chi', 'EBCV', 'Chièvres', 40, 100, False),
    ('a_ost', 'EBOS', 'Ostende-Bruges', 40, 100, False),
    ('a_anr', 'EBAW', 'Anvers', 40, 100, False),
    ('a_bsl', 'BSL', 'Bâle-Mulhouse', 40, 100, False),
    ('a_cdg', 'CDG', 'Paris Charles de Gaulle', 40, 100, False),
    ('a_ory', 'ORY', 'Paris Orly', 40, 100, False),
    ('a_lbg', 'LBG', 'Paris Le Bourget', 40, 100, False),
]
REMARQUES_AEROPORT = {
    'a_chi': "Demande à introduire 3 semaines minimum à l'avance.",
}
TYPES = [
    # id, nom, par défaut, tenir compte du dernier passage (sinon délai d'activité ∞)
    ('t_perm', 'Badge permanent', True, True),
    ('t_temp', 'Badge temporaire', False, True),
    ('t_visit', 'Badge visiteur', False, False),
    ('t_occ', 'Accès occasionnel', False, False),
    ('t_tra', 'Permis TRA', False, False),
    ('t_rad', 'Permis RAD', False, False),
    ('t_man', 'Permis MAN', False, False),
]
TYPE_BAC = {'permanent airside': 't_perm', 'temporay landside': 't_temp',
            'temporary landside': 't_temp', 'visitor': 't_visit'}

avertissements = []


def ascii_norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().upper()


def texte(v):
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = re.sub(r'\s+', ' ', str(v).replace('\xa0', ' ')).strip()
    if not s or s == '/' or s.startswith('='):
        return None
    return s


def date(v, contexte=''):
    if isinstance(v, (dt.datetime, dt.date)):
        d = v.date() if isinstance(v, dt.datetime) else v
        if d.year < 1910:   # nombre saisi par erreur dans une cellule date
            avertissements.append(f"{contexte} : valeur « {d.isoformat()} » non plausible, ignorée")
            return None, None
        if d.year < 1950:
            corrige = d.replace(year=d.year + 100)
            avertissements.append(f"{contexte} : date {d.isoformat()} corrigée en {corrige.isoformat()}")
            return corrige.isoformat(), f"Date corrigée à l'import ({d.strftime('%d/%m/%Y')} → {corrige.strftime('%d/%m/%Y')})"
        return d.isoformat(), None
    if texte(v):
        avertissements.append(f"{contexte} : valeur de date non reconnue « {texte(v)} » ignorée")
    return None, None


def oui_non(v):
    t = (texte(v) or '').lower()
    return True if t == 'oui' else False if t == 'non' else None


# ---------------------------------------------------------------- collecte
occurrences = []     # (nom, prénom, société, feuille)
docs_bruts = []      # dict avec nom, prénom + champs du document
escorteurs = []      # (nom, prénom, aéroport, bool)


def personne(nom, prenom, societe, feuille):
    nom, prenom = texte(nom), texte(prenom)
    if not nom or not prenom:
        return None
    occurrences.append((nom, prenom, texte(societe), feuille))
    return (nom, prenom)


def doc(p, aeroport, type_id, numero=None, expiration=None, passage=None, remarque=None, feuille=''):
    ctx = f"{feuille} / {p[0]} {p[1]}"
    exp, rem1 = date(expiration, ctx) if not isinstance(expiration, tuple) else expiration
    pas, rem2 = date(passage, ctx)
    num = texte(numero)
    if not (num or exp or pas):
        return
    rem = ' '.join(r for r in (remarque, rem1, rem2) if r) or None
    docs_bruts.append(dict(p=p, aeroportId=aeroport, typeId=type_id, numero=num,
                           dateExpiration=exp, dernierPassage=pas, remarque=rem, feuille=feuille))


def lignes(wb, feuille):
    return list(wb[feuille].iter_rows(min_row=2, values_only=True))


def lire(wb):
    for r in lignes(wb, 'BAC'):
        p = personne(r[1], r[2], r[0], 'BAC')
        if not p:
            continue
        t = TYPE_BAC.get((texte(r[4]) or '').lower(), 't_perm')
        doc(p, 'a_bac', t, r[3], r[5], r[7], feuille='BAC')
        doc(p, 'a_bac', 't_rad', r[9], r[10], feuille='BAC')

    for r in lignes(wb, 'EBCI'):
        p = personne(r[1], r[2], r[0], 'EBCI')
        if not p:
            continue
        doc(p, 'a_ebci', 't_perm', r[3], r[4], r[6], feuille='EBCI')
        doc(p, 'a_ebci', 't_tra', r[8], r[9], feuille='EBCI')
        if oui_non(r[11]) is not None:
            escorteurs.append((p, 'a_ebci', oui_non(r[11])))

    for r in lignes(wb, 'EBLG'):
        p = personne(r[1], r[2], r[0], 'EBLG')
        if not p:
            continue
        obt, _ = date(r[4])
        rem = f"Obtenu le {dt.date.fromisoformat(obt).strftime('%d/%m/%Y')}" if obt else None
        doc(p, 'a_eblg', 't_perm', r[3], r[5], r[7], remarque=rem, feuille='EBLG')
        doc(p, 'a_eblg', 't_tra', None, r[9], feuille='EBLG')
        doc(p, 'a_eblg', 't_man', None, r[10], feuille='EBLG')
        if oui_non(r[13]) is not None:
            escorteurs.append((p, 'a_eblg', oui_non(r[13])))

    for r in lignes(wb, 'Florennes'):
        p = personne(r[1], r[2], r[0], 'Florennes')
        if not p:
            continue
        t = 't_occ' if (texte(r[9]) or '').lower() == 'occasionnel' else 't_perm'
        exp = r[4] if r[4] else r[8]   # validité badge JDN, sinon « actif jusqu'au »
        doc(p, 'a_flo', t, r[3], exp, r[7], feuille='Florennes')

    for r in lignes(wb, 'Florennes JDN'):
        p = personne(r[4], r[5], None, 'Florennes JDN')
        if not p:
            continue
        t = 't_occ' if (texte(r[0]) or '').lower() == 'occasionnel' else 't_perm'
        doc(p, 'a_flo', t, None, r[2], remarque='Liste JDN', feuille='Florennes JDN')

    for r in lignes(wb, 'Lux'):
        p = personne(r[1], r[2], r[0], 'Lux')
        if not p:
            continue
        doc(p, 'a_lux', 't_perm', r[3], r[4], r[6], feuille='Lux')
        doc(p, 'a_lux', 't_rad', r[8], r[9], feuille='Lux')

    for r in lignes(wb, 'Chièvres'):
        p = personne(r[1], r[2], r[0], 'Chièvres')
        if p:
            doc(p, 'a_chi', 't_perm', None, r[3], r[4], feuille='Chièvres')

    for r in lignes(wb, 'Ostende-Bruges'):
        p = personne(r[1], r[2], r[0], 'Ostende-Bruges')
        if not p:
            continue
        doc(p, 'a_ost', 't_perm', r[3], r[4], r[5], remarque=texte(r[9]), feuille='Ostende-Bruges')
        doc(p, 'a_ost', 't_rad', None, r[6], feuille='Ostende-Bruges')

    for feuille, aer in (('Anvers', 'a_anr'), ('Bâle-Mulhouse', 'a_bsl')):
        for r in lignes(wb, feuille):
            p = personne(r[1], r[2], r[0], feuille)
            if p:
                doc(p, aer, 't_perm', r[3], r[4], feuille=feuille)

    for r in lignes(wb, 'Paris CDG'):
        p = personne(r[1], r[2], r[0], 'Paris CDG')
        if p:
            doc(p, 'a_cdg', 't_perm', r[3], r[4], r[5], feuille='Paris CDG')

    for r in lignes(wb, 'FR'):
        personne(r[1], r[2], r[0], 'FR')

    # FR (1) : texte libre, ajouté seulement s'il n'existe rien pour cet aéroport
    for r in lignes(wb, 'FR (1)'):
        p = personne(r[0], r[1], None, 'FR (1)')
        if not p:
            continue
        for col, aer in ((2, 'a_ory'), (3, 'a_cdg'), (4, 'a_lbg')):
            t = texte(r[col]) or ''
            m = re.search(r'(\d{2})/(\d{2})/(\d{4})', t)
            if m:
                exp = (f"{m[3]}-{m[2]}-{m[1]}", None)
            else:
                m = re.search(r'plus valide depuis\s*(\w+)?\s*(\d{4})', t, re.I)
                if not m:
                    continue
                mois = {'janvier': 1, 'fevrier': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6, 'juillet': 7,
                        'aout': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'decembre': 12}
                mo = mois.get(ascii_norm(m[1]).lower(), 12) if m[1] else 12
                fin = dt.date(int(m[2]) + (mo == 12), mo % 12 + 1, 1) - dt.timedelta(days=1)
                exp = (fin.isoformat(), None)
            docs_bruts.append(dict(p=p, aeroportId=aer, typeId='t_perm', numero=None, dateExpiration=exp[0],
                                   dernierPassage=None, remarque=f"Source FR : « {t} »", feuille='FR (1)', faible=True))


# ---------------------------------------------------------------- personnes
def lev(a, b):
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def meme_prenom(a, b):
    if a == b:
        return True
    court, long_ = sorted((a, b), key=len)
    return (len(court) >= 4 and long_.startswith(court)) or lev(a, b) <= 1


def joli_prenom(s):
    if s.isupper() or s.islower():
        return ' '.join(w.capitalize() for w in re.split(r'[ /]+', s))
    return s.replace('/', ' ')


def construire_personnes():
    # noms de famille à une faute de frappe près, avec le même prénom → même personne
    prenoms = collections.defaultdict(set)
    for nom, prenom, _, _ in occurrences:
        prenoms[ascii_norm(nom)].add(ascii_norm(prenom))
    canon = {}
    for a in sorted(prenoms, key=lambda n: -len(prenoms[n])):
        canon.setdefault(a, a)
        for b in prenoms:
            if b not in canon and lev(a, b) <= 1 and prenoms[a] & prenoms[b]:
                canon[b] = canon[a]
    par_nom = collections.defaultdict(list)
    for nom, prenom, soc, feuille in occurrences:
        par_nom[canon[ascii_norm(nom)]].append((nom, prenom, soc, feuille))
    personnes, cle_vers_id, fusions = [], {}, []
    for nom_n in sorted(par_nom):
        groupes = []   # liste de listes d'occurrences
        for occ in par_nom[nom_n]:
            pn = ascii_norm(occ[1])
            for g in groupes:
                if any(meme_prenom(pn, ascii_norm(o[1])) for o in g):
                    g.append(occ)
                    break
            else:
                groupes.append([occ])
        for g in groupes:
            variantes = collections.Counter(o[1] for o in g)
            # le plus long (nom complet), puis le plus fréquent, puis avec accents
            prenom = max(variantes, key=lambda v: (len(ascii_norm(v)), variantes[v], v != ascii_norm(v)))
            noms = collections.Counter(o[0] for o in g)
            nom = max(noms, key=noms.get).upper()
            socs = collections.Counter(o[2] for o in g if o[2])
            soc = max(socs, key=socs.get) if socs else None
            pid = f"p{len(personnes) + 1:03d}"
            personnes.append(dict(id=pid, nom=nom, prenom=joli_prenom(prenom), societe=soc,
                                  feuilles=sorted({o[3] for o in g})))
            if len({ascii_norm(v) for v in variantes}) > 1 or len({ascii_norm(n) for n in noms}) > 1:
                fusions.append(f"{' / '.join(sorted(noms))} : {', '.join(sorted(variantes))}"
                               f" → {nom} {joli_prenom(prenom)}")
            for o in g:
                cle_vers_id[(o[0], o[1])] = pid
            if len(socs) > 1:
                avertissements.append(f"{nom} {prenom} : plusieurs sociétés {dict(socs)}, retenu {soc}")
    return personnes, cle_vers_id, fusions


# ---------------------------------------------------------------- main
def main():
    src, dst = sys.argv[1], sys.argv[2]
    rapport = sys.argv[3] if len(sys.argv) > 3 else None
    wb = openpyxl.load_workbook(src)
    lire(wb)
    personnes, cle_vers_id, fusions = construire_personnes()

    soc_noms = sorted({p['societe'] for p in personnes if p['societe']})
    societes = [dict(id=f"s{i + 1:02d}", nom=n) for i, n in enumerate(soc_noms)]
    soc_id = {s['nom']: s['id'] for s in societes}

    esc = collections.defaultdict(dict)
    for p, aer, val in escorteurs:
        esc[cle_vers_id[p]][aer] = val

    documents, vus = [], set()
    for d in docs_bruts:
        pid = cle_vers_id[d['p']]
        cle = (pid, d['aeroportId'], d['typeId'])
        if d.get('faible') and any(k[:2] == cle[:2] for k in vus):
            continue   # FR (1) : une info plus précise existe déjà
        doublon = next((x for x in documents if (x['personneId'], x['aeroportId'], x['typeId']) == cle
                        and x['numero'] == d['numero'] and x['dateExpiration'] == d['dateExpiration']), None)
        if doublon:
            continue
        vus.add(cle)
        documents.append(dict(id=f"d{len(documents) + 1:04d}", personneId=pid, aeroportId=d['aeroportId'],
                              typeId=d['typeId'], numero=d['numero'], dateExpiration=d['dateExpiration'],
                              dernierPassage=d['dernierPassage'], remarque=d['remarque']))

    types_par_aer = collections.defaultdict(set)
    for d in documents:
        types_par_aer[d['aeroportId']].add(d['typeId'])
    ordre_types = [t[0] for t in TYPES]

    data = dict(
        version=2,
        meta=dict(creeLe=dt.datetime.now().isoformat(timespec='seconds'), source=src.split('/')[-1]),
        aeroports=[dict(id=i, code=c, nom=n, delaiDemande=dd, delaiPassage=dp, besoinEscorteur=be,
                        typesMatrice=[t for t in ordre_types if t in types_par_aer[i]] or ['t_perm'],
                        delaisActivite={t: 'infini' for t, _, _, compte in TYPES if not compte},
                        remarque=REMARQUES_AEROPORT.get(i, ''))
                   for i, c, n, dd, dp, be in AEROPORTS],
        typesBadge=[dict(id=i, nom=n, parDefaut=d) for i, n, d, _ in TYPES],
        societes=societes,
        personnes=[dict(id=p['id'], nom=p['nom'], prenom=p['prenom'], societeId=soc_id.get(p['societe']),
                        actif=True, remarque='', escorteur=esc.get(p['id'], {})) for p in personnes],
        documents=documents,
    )
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    lignes_rapport = [
        '# Rapport d\'import', '',
        f"- Personnes : {len(personnes)}", f"- Sociétés : {len(societes)}", f"- Documents : {len(documents)}", '',
        '## Prénoms fusionnés (à vérifier)', *([f"- {f}" for f in fusions] or ['- aucun']), '',
        '## Avertissements', *([f"- {a}" for a in avertissements] or ['- aucun']), '',
        '## Documents sans date d\'expiration',
        *[f"- {next(p['nom'] + ' ' + p['prenom'] for p in personnes if p['id'] == d['personneId'])} — "
          f"{d['aeroportId']} — {d['typeId']} — n° {d['numero'] or '?'}"
          for d in documents if not d['dateExpiration']],
    ]
    txt = '\n'.join(lignes_rapport) + '\n'
    if rapport:
        with open(rapport, 'w', encoding='utf-8') as f:
            f.write(txt)
    print(txt)


if __name__ == '__main__':
    main()
