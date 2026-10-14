// TABLEAU DE BORD ET RAPPORT DE L'AUDIT DE SURFACE — agrégation pure. Trois lectures des mêmes
// constats ouverts : par composante, par propriétaire, par classement.

export const GRAVITES_RAPPORT = ['critique', 'elevee', 'moyenne', 'faible', 'info'] as const
export const HORS_INVENTAIRE = '(hors inventaire)'
export const SANS_PROPRIETAIRE = '(sans propriétaire désigné)'
export const PROPRIETAIRE_SANS_COMPOSANTE = '(propriétaire sans composante)'
export const NON_CLASSE = '(non classé)'
const ETIQUETTES = new Set([HORS_INVENTAIRE, SANS_PROPRIETAIRE, PROPRIETAIRE_SANS_COMPOSANTE, NON_CLASSE])

export type Axe = 'composante' | 'proprietaire' | 'classement'

export type ConstatRapport = {
  id: string
  gravite: string
  categorie: string
  titre: string
  statut: string
  hote: string
  port: number | null
  serviceId: string | null
  classement: string | null
  proprietaireId: string | null
  proprietaire: string | null
  composante: string | null
  premierReleveLe: Date
  dernierReleveLe: Date
  acceptationEcheance: string | null
  sniffIncidentId: string | null
  verificationInterieureLe: Date | null
}

export function libelleAxe(c: ConstatRapport, axe: Axe): string {
  if (!c.serviceId) return HORS_INVENTAIRE
  if (axe === 'classement') return c.classement ?? NON_CLASSE
  if (!c.proprietaireId) return SANS_PROPRIETAIRE
  if (axe === 'proprietaire') return c.proprietaire ?? SANS_PROPRIETAIRE
  return c.composante ?? PROPRIETAIRE_SANS_COMPOSANTE
}

const rang = (g: string) => {
  const i = (GRAVITES_RAPPORT as readonly string[]).indexOf(g)
  return i < 0 ? GRAVITES_RAPPORT.length : i
}

export type LigneMatrice = { libelle: string, parGravite: Record<string, number>, total: number }

/**
 * Les constats par valeur d'axe et par gravité. LES PLUS GRAVES EN TÊTE, et les lignes nommées
 * (hors inventaire, sans propriétaire) triées comme les autres : placées d'office en fin de
 * tableau, un constat critique hors inventaire passerait sous la ligne de flottaison.
 */
export function matrice(constats: readonly ConstatRapport[], axe: Axe): LigneMatrice[] {
  const lignes = new Map<string, LigneMatrice>()
  for (const c of constats) {
    const libelle = libelleAxe(c, axe)
    const l = lignes.get(libelle) ?? { libelle, parGravite: Object.fromEntries(GRAVITES_RAPPORT.map(g => [g, 0])), total: 0 }
    l.parGravite[c.gravite] = (l.parGravite[c.gravite] ?? 0) + 1
    l.total++
    lignes.set(libelle, l)
  }
  return [...lignes.values()].sort((a, b) =>
    GRAVITES_RAPPORT.reduce((ecart, g) => ecart || ((b.parGravite[g] ?? 0) - (a.parGravite[g] ?? 0)), 0)
    || b.total - a.total
    || Number(ETIQUETTES.has(a.libelle)) - Number(ETIQUETTES.has(b.libelle))
    || a.libelle.localeCompare(b.libelle))
}

/**
 * Les lignes du rapport exportable, regroupées. Dans un rapport qu'on transmet, les groupes
 * nommés viennent en FIN : on lit d'abord les interlocuteurs identifiés, puis ce qui n\'en a
 * pas.
 */
export function lignesRapport(constats: readonly ConstatRapport[], par: 'composante' | 'proprietaire') {
  return constats
    .map(c => ({ groupe: libelleAxe(c, par), ...c }))
    .sort((a, b) =>
      Number(ETIQUETTES.has(a.groupe)) - Number(ETIQUETTES.has(b.groupe))
      || a.groupe.localeCompare(b.groupe)
      || rang(a.gravite) - rang(b.gravite)
      || a.hote.localeCompare(b.hote))
}
