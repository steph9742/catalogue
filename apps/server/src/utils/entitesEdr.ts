import { normaliser } from './glpiSync'
import type { UniteResolue } from './couvertureParUnite'

// RATTACHEMENT DES AGENTS EDR À UNE UNITÉ, par leur entité HarfangLab. Texte libre, écritures
// variables.

export const CIBLES_EDR = ['composante', 'service', 'departement', 'pole', 'etablissement'] as const
export type CibleEdr = { type: typeof CIBLES_EDR[number], id: string }

export type ReferentielsEdr = {
  /** L'établissement (entité GLPI de premier niveau), cible des machines laissées sans composante. */
  entites?: readonly { id: string, nom: string }[]
  composantes: readonly { id: string, nom: string, sigle?: string | null }[]
  services: readonly { id: string, nom: string, composanteId: string | null }[]
  departements: readonly { id: string, nom: string, composanteId: string | null }[]
  poles: readonly { id: string, nom: string, serviceId: string }[]
}

/**
 * LA CLÉ D'UNE DÉCLARATION : la valeur normalisée (casse, accents, ponctuation).
 */
export function cleEntiteEdr(valeur: string | null | undefined): string {
  return normaliser(valeur ?? '')
}

export type MotifRattachement = 'declaree' | 'exact' | 'ambigu' | 'aucun' | 'vide' | 'cible_disparue'

/**
 * La proposition automatique pour une valeur d'entité EDR. Jamais un nom de pôle seul : «
 * Réseau » existe dans plusieurs services.
 */
export function proposerRattachement(valeur: string | null | undefined, refs: ReferentielsEdr): { cible: CibleEdr | null, motif: 'exact' | 'ambigu' | 'aucun' | 'vide' } {
  const cle = normaliser(valeur ?? '')
  if (!cle) return { cible: null, motif: 'vide' }

  const candidats = new Map<string, CibleEdr>()
  const essayer = (nom: string | null | undefined, cible: CibleEdr) => {
    if (nom && normaliser(nom) === cle) candidats.set(`${cible.type}:${cible.id}`, cible)
  }
  const composantes = new Map(refs.composantes.map(c => [c.id, c]))
  const services = new Map(refs.services.map(s => [s.id, s]))

  for (const c of refs.composantes) {
    essayer(c.nom, { type: 'composante', id: c.id })
    essayer(c.sigle, { type: 'composante', id: c.id })
  }
  for (const [liste, type] of [[refs.services, 'service'], [refs.departements, 'departement']] as const) {
    for (const u of liste) {
      const cible: CibleEdr = { type, id: u.id }
      essayer(u.nom, cible)
      const c = u.composanteId ? composantes.get(u.composanteId) : undefined
      if (c) {
        essayer(`${c.nom}${u.nom}`, cible)
        if (c.sigle) essayer(`${c.sigle}${u.nom}`, cible)
      }
    }
  }
  for (const p of refs.poles) {
    const s = services.get(p.serviceId)
    if (s) essayer(`${s.nom}${p.nom}`, { type: 'pole', id: p.id })
  }

  if (candidats.size === 1) return { cible: [...candidats.values()][0]!, motif: 'exact' }
  return { cible: null, motif: candidats.size > 1 ? 'ambigu' : 'aucun' }
}

/** L'unité d\'une cible, parents DÉDUITS des référentiels. `null` si la cible n\'existe plus. */
export function resoudreUnite(cible: CibleEdr, refs: ReferentielsEdr): UniteResolue | null {
  // L'ÉTABLISSEMENT SANS COMPOSANTE rejoint la ligne où GLPI range ses machines racine : une
  // unité sans composante, ni service, ni pôle.
  if (cible.type === 'etablissement') {
    return !refs.entites || refs.entites.some(e => e.id === cible.id) ? { composanteId: null, sousUnite: null, poleId: null } : null
  }
  if (cible.type === 'composante') {
    return refs.composantes.some(c => c.id === cible.id) ? { composanteId: cible.id, sousUnite: null, poleId: null } : null
  }
  if (cible.type === 'service' || cible.type === 'departement') {
    const u = (cible.type === 'service' ? refs.services : refs.departements).find(x => x.id === cible.id)
    return u ? { composanteId: u.composanteId, sousUnite: { niveau: cible.type, id: u.id }, poleId: null } : null
  }
  const p = refs.poles.find(x => x.id === cible.id)
  const s = p ? refs.services.find(x => x.id === p.serviceId) : undefined
  return p && s ? { composanteId: s.composanteId, sousUnite: { niveau: 'service', id: s.id }, poleId: p.id } : null
}

/** Le rattachement retenu : la déclaration d'abord, l\'automatique à défaut. */
export function rattachementEffectif(
  valeur: string | null | undefined,
  /** Clés : `cleEntiteEdr(valeur)`. */
  declarations: ReadonlyMap<string, CibleEdr>,
  refs: ReferentielsEdr,
): { cible: CibleEdr | null, source: 'declaree' | 'automatique' | null, motif: MotifRattachement } {
  const declaree = valeur ? declarations.get(cleEntiteEdr(valeur)) : undefined
  if (declaree) {
    // UNE DÉCLARATION DONT L'UNITÉ A DISPARU ne retombe pas sur l'automatique : elle a été
    // posée parce que l'automatique ne convenait pas.
    return resoudreUnite(declaree, refs)
      ? { cible: declaree, source: 'declaree', motif: 'declaree' }
      : { cible: null, source: 'declaree', motif: 'cible_disparue' }
  }
  const p = proposerRattachement(valeur, refs)
  return { cible: p.cible, source: p.cible ? 'automatique' : null, motif: p.motif }
}

/** « IUT NFC › CRI › Réseau » : l'unité avec ses parents, pour la lire sans ambiguïté. */
export function libelleCible(cible: CibleEdr, refs: ReferentielsEdr): string | null {
  const c = (id: string | null) => (id ? refs.composantes.find(x => x.id === id)?.nom ?? '?' : '(sans composante)')
  if (cible.type === 'etablissement') {
    const e = refs.entites?.find(x => x.id === cible.id)
    return e ? `${e.nom} — sans composante` : null
  }
  if (cible.type === 'composante') return refs.composantes.find(x => x.id === cible.id)?.nom ?? null
  if (cible.type === 'service' || cible.type === 'departement') {
    const u = (cible.type === 'service' ? refs.services : refs.departements).find(x => x.id === cible.id)
    return u ? `${c(u.composanteId)} › ${u.nom}` : null
  }
  const p = refs.poles.find(x => x.id === cible.id)
  const s = p ? refs.services.find(x => x.id === p.serviceId) : undefined
  return p && s ? `${c(s.composanteId)} › ${s.nom} › ${p.nom}` : null
}
