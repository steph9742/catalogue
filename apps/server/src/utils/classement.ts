// CLASSEMENT ET EXPOSITION D'UN SERVICE — règles pures. Ce qu'il déclenche — surveillance
// d'intégrité des scripts, revue plus fréquente — ne doit pas dépendre d'une proposition non
// relue.

export const CLASSEMENTS = ['paiement', 'sensible', 'standard'] as const
export type Classement = typeof CLASSEMENTS[number]

/**
 * Le classement que propose un constat `classement` du moteur — ou `null`. ⚠️ Le format §9 ne
 * dit pas où le moteur porte la valeur proposée.
 */
export function classementDuConstat(c: { reference: string | null, titre: string }): Classement | null {
  const ref = c.reference?.trim().toLowerCase()
  const exact = CLASSEMENTS.find(x => x === ref)
  if (exact) return exact
  const mots = CLASSEMENTS.filter(x => new RegExp(`\\b${x}\\b`, 'i').test(c.titre))
  return mots.length === 1 ? mots[0]! : null
}

export type Exposition = {
  proprietaireId: string | null
  classement: Classement | null
  classementPropose: Classement | null
  /** `null` : non renseigné. Ce n'est pas « non ». */
  paiementEnLigne: boolean | null
  donneesPersonnelles: boolean | null
  justificationExposition: string | null
  /** `YYYY-MM-DD` */
  dateRevue: string | null
}

export const SIGNALEMENTS = [
  'sensible_sans_proprietaire',
  'sans_proprietaire',
  'paiement_sans_surveillance_integrite',
  'sensible_sans_justification',
  'revue_echue',
  'revue_non_planifiee',
  'classement_a_valider',
] as const
export type Signalement = typeof SIGNALEMENTS[number]

/**
 * SENSIBLE si le classement VALIDÉ le dit, ou si un marqueur est posé. Une proposition du
 * moteur non validée ne compte pas : elle n'a été relue par personne.
 */
export function estSensible(e: Pick<Exposition, 'classement' | 'paiementEnLigne' | 'donneesPersonnelles'>): boolean {
  return e.classement === 'paiement' || e.classement === 'sensible' || e.paiementEnLigne === true || e.donneesPersonnelles === true
}

export function signalements(e: Exposition, ctx: { pagesCibles: number, aujourdhui: string }): Signalement[] {
  const s: Signalement[] = []
  const sensible = estSensible(e)
  // UN SEUL des deux : le même manque ne se compte pas deux fois, il se dit plus fort.
  if (!e.proprietaireId) s.push(sensible ? 'sensible_sans_proprietaire' : 'sans_proprietaire')
  if ((e.classement === 'paiement' || e.paiementEnLigne === true) && ctx.pagesCibles === 0) s.push('paiement_sans_surveillance_integrite')
  if (sensible && !e.justificationExposition?.trim()) s.push('sensible_sans_justification')
  if (e.dateRevue && e.dateRevue < ctx.aujourdhui) s.push('revue_echue')
  else if (!e.dateRevue && sensible) s.push('revue_non_planifiee')
  if (e.classementPropose && e.classementPropose !== e.classement) s.push('classement_a_valider')
  return s
}

/** Six mois pour ce qui est sensible, un an sinon. */
export function moisDeRevue(e: Pick<Exposition, 'classement' | 'paiementEnLigne' | 'donneesPersonnelles'>): 6 | 12 {
  return estSensible(e) ? 6 : 12
}

export function prochaineRevue(e: Pick<Exposition, 'classement' | 'paiementEnLigne' | 'donneesPersonnelles'>, depuis: Date): string {
  const d = new Date(Date.UTC(depuis.getUTCFullYear(), depuis.getUTCMonth(), 1))
  d.setUTCMonth(d.getUTCMonth() + moisDeRevue(e))
  // Le même jour du mois quand il existe, le dernier sinon : le 31 août + 6 mois donne
  // le 28 février, pas le 3 mars.
  const dernierJour = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(depuis.getUTCDate(), dernierJour))
  return d.toISOString().slice(0, 10)
}
