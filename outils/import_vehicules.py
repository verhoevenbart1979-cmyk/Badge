#!/usr/bin/env python3
"""Extrait l'onglet « Véhicules » du classeur Excel vers vehicules.json.

Usage :  python3 import_vehicules.py <classeur.xlsx> <vehicules.json>

Le fichier produit s'importe dans l'application (menu Véhicules → Importer) ;
les chauffeurs y sont reliés aux personnes de la base par leur nom.
"""
import datetime as dt
import json
import re
import sys

import openpyxl

# colonnes : (aéroport, colonne numéro ou None, colonne validité)
AEROPORTS = [('a_bac', None, 3), ('a_ebci', 5, 6), ('a_eblg', 8, 9), ('a_lux', 11, 12)]
NON_ATTRIBUE = {'', 'NA', 'SA'}


def texte(v):
    if v is None:
        return ''
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = re.sub(r'\s+', ' ', str(v).replace('\xa0', ' ')).strip()
    return '' if s.startswith('=') or s == '/' else s


def date(v):
    return v.date().isoformat() if isinstance(v, dt.datetime) else None


def plaque(s):
    return re.sub(r'[^A-Z0-9]', '', s.upper())


def main():
    ws = openpyxl.load_workbook(sys.argv[1])['Véhicules']
    vehicules, remarques = [], []
    for r in ws.iter_rows(min_row=2, values_only=True):
        type_, immat, attribution = texte(r[0]), texte(r[1]), texte(r[2])
        if not (type_ or immat or attribution):
            continue
        badges = {}
        for aer, c_num, c_val in AEROPORTS:
            num, val = texte(r[c_num]) if c_num is not None else '', date(r[c_val])
            if num or val:
                badges[aer] = {'numero': num or None, 'dateExpiration': val, 'dateDemande': None}
        v = {'type': type_, 'immatriculation': immat,
             'chauffeur': '' if attribution.upper() in NON_ATTRIBUE else attribution,
             'actif': True, 'remarque': '', 'badges': badges}
        # même type et mêmes caractères dans un autre ordre = faute de frappe : on fusionne
        jumeau = next((x for x in vehicules if immat and x['type'] == type_ and x['immatriculation']
                       and sorted(plaque(x['immatriculation'])) == sorted(plaque(immat))), None)
        if jumeau:
            for aer, b in badges.items():
                anc = jumeau['badges'].get(aer)
                if not anc or (b['dateExpiration'] or '') > (anc['dateExpiration'] or ''):
                    jumeau['badges'][aer] = b
            jumeau['remarque'] = f"Immatriculation à vérifier ({jumeau['immatriculation']} / {immat} dans l'ancien fichier)"
            remarques.append(f"{jumeau['immatriculation']} et {immat} fusionnés (faute de frappe)")
            continue
        if not immat:
            v['remarque'] = 'Immatriculation manquante dans l\'ancien fichier'
            remarques.append(f"{type_} ({attribution}) : pas d'immatriculation")
        vehicules.append(v)
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump({'format': 'suivi-badges-vehicules', 'version': 1, 'vehicules': vehicules}, f, ensure_ascii=False, indent=1)
    print(len(vehicules), 'véhicules')
    for x in remarques:
        print(' -', x)


if __name__ == '__main__':
    main()
