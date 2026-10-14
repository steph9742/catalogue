// ÉCHÉANCE D'UNE LISTE BLANCHE — et surtout, pourquoi certaines n'en ont pas.

/**
 * POURQUOI une liste blanche n'a pas d\'échéance — ou `null` si elle en a une.
 */
export const MOTIFS_SANS_ECHEANCE = [
  'editeur',
  'technique',
  'disparue',
  'sans_date',
  'portee_par_sniff',
] as const

export type SansEcheance = typeof MOTIFS_SANS_ECHEANCE[number]

export type EtatEcheance = {
  echeance: Date | null
  /** `null` quand la règle a bien une échéance calculée ici. */
  sansEcheance: SansEcheance | null
}

export type ContexteEcheance = {
  dateCreation: Date | null
  dateRevision: Date | null
  technique?: boolean
  fourniParEditeur?: boolean
  presente?: boolean
  /** Échéance portée par Sniff quand la règle est appariée à une exclusion. */
  echeanceSniff?: Date | null
}

/**
 * Échéance d'une liste blanche : un an à compter de sa dernière révision, ou de sa CRÉATION si
 * elle n'a jamais été revue.
 */
export function etatEcheance(c: ContexteEcheance): EtatEcheance {
  // Ordre volontaire : le motif rendu est celui qui prime, pas le premier trouvé au hasard.
  if (c.fourniParEditeur) return { echeance: null, sansEcheance: 'editeur' }
  if (c.presente === false) return { echeance: null, sansEcheance: 'disparue' }
  if (c.technique) return { echeance: null, sansEcheance: 'technique' }
  // L'échéance de Sniff prime dès que la règle est appariée — y compris si elle l'a été APRÈS
  // coup, ce que l'appariement manuel rend possible.
  if (c.echeanceSniff) return { echeance: c.echeanceSniff, sansEcheance: 'portee_par_sniff' }
  if (!c.dateCreation) return { echeance: null, sansEcheance: 'sans_date' }

  const depart = c.dateRevision ?? c.dateCreation
  const echeance = new Date(depart)
  echeance.setFullYear(echeance.getFullYear() + 1)
  return { echeance, sansEcheance: null }
}

/** Le Catalogue entretient-il lui-même cette échéance — donc, peut-il la prolonger ? */
export function prolongeableParCatalogue(c: ContexteEcheance): boolean {
  return etatEcheance(c).sansEcheance === null
}

/**
 * Une règle est TECHNIQUE si l'une de ses étiquettes figure parmi les marqueurs déclarés dans
 * les réglages du connecteur.
 */
export function estTechnique(tags: string[], marqueurs: string[]): boolean {
  if (!marqueurs.length || !tags.length) return false
  const normes = new Set(marqueurs.map(m => m.trim().toLowerCase()).filter(Boolean))
  return tags.some(t => normes.has(t.trim().toLowerCase()))
}



/**
 * QUI PORTE L'ÉCHÉANCE D\'UNE RÈGLE — l\'arbitrage de Sniff, repris tel quel.
 */
export function echeanceDeSniff(
  exclusion: { reviewDate?: string | null, motif?: string | null } | null | undefined,
  revue: { echeance?: string | null, motif?: string | null, id?: string } | null | undefined,
): { echeance: Date | null, motif: string | null, revueId: string | null, origine: 'exclusion' | 'revue' | null } {
  const date = (v: string | null | undefined) => {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const parExclusion = date(exclusion?.reviewDate)
  if (parExclusion) return { echeance: parExclusion, motif: exclusion?.motif ?? null, revueId: null, origine: 'exclusion' }
  const parRevue = date(revue?.echeance)
  if (parRevue) return { echeance: parRevue, motif: revue?.motif ?? exclusion?.motif ?? null, revueId: revue?.id ?? null, origine: 'revue' }
  return { echeance: null, motif: exclusion?.motif ?? null, revueId: null, origine: null }
}
