import { describe, expect, it } from 'bun:test'
import { estDepartement, nomCanonique, typeDeLieu, estFauxLieu } from './glpiSync'

// Règles de rattachement dérivées de l'arborescence GLPI. Elles décident où atterrissent

describe('nomCanonique (établissement renommé)', () => {
  it('ramène un ancien nom vers le nom canonique', () => {
    expect(nomCanonique('UFC')).toBe('UMLP')
    expect(nomCanonique('ufc')).toBe('UMLP')
    expect(nomCanonique('UMLP')).toBe('UMLP')
  })
  it('laisse les autres noms intacts', () => {
    expect(nomCanonique('IUT NFC')).toBe('IUT NFC')
    expect(nomCanonique('FEMTO-ST')).toBe('FEMTO-ST')
  })
})

describe('estDepartement (3e niveau : département ou service)', () => {
  it('reconnaît les départements réels de l\'instance', () => {
    for (const n of ['Dept-INFO', 'Dept-GC', 'Dept-GEII', 'Dept-RT', 'DeptMut-GC-GEII', 'Dpt_RT', 'Département Informatique']) {
      expect(estDepartement(n)).toBe(true)
    }
  })
  it('laisse les services en service', () => {
    for (const n of ['Dnum', 'CRI-IUTNFC', 'Administration', 'Scolarité']) {
      expect(estDepartement(n)).toBe(false)
    }
  })
})

describe('typeDeLieu (type déduit du nom, sinon de la profondeur)', () => {
  it('détecte le type par le nom', () => {
    expect(typeDeLieu('Baie Serveur Bat C', 6)).toBe('baie')
    expect(typeDeLieu('BatimentE', 4)).toBe('batiment')
    expect(typeDeLieu('Bat.C', 4)).toBe('batiment')
    expect(typeDeLieu('1er Etage', 5)).toBe('salle')
    expect(typeDeLieu('E005', 5)).toBe('salle')
    expect(typeDeLieu('T207', 5)).toBe('salle')
  })
  it('retombe sur la profondeur quand le nom ne dit rien', () => {
    expect(typeDeLieu('l\'établissement', 1)).toBe('site')
    expect(typeDeLieu('IUT-NFC', 2)).toBe('site')
    expect(typeDeLieu('IUT-NFC-Belfort', 3)).toBe('site')
    expect(typeDeLieu('Zone X', 4)).toBe('batiment')
    expect(typeDeLieu('Coin Y', 5)).toBe('salle')
  })
})

describe('estFauxLieu (fourre-tout GLPI déguisés en emplacements)', () => {
  it('rejette les pseudo-lieux', () => {
    expect(estFauxLieu('l\'établissement > STGI > mobile_personnel')).toBe(true)
    expect(estFauxLieu('l\'établissement > X > Inconnu')).toBe(true)
    expect(estFauxLieu('l\'établissement > X > Stock')).toBe(true)
  })
  it('accepte les vrais emplacements', () => {
    expect(estFauxLieu('l\'établissement > IUT-NFC > IUT-NFC-Belfort > BatimentE > E005')).toBe(false)
    expect(estFauxLieu('Labo Thema CNRS')).toBe(false)
  })
})
