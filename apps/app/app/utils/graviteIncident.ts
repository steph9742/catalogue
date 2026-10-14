// GRAVITÉ D'UN INCIDENT IMPORTÉ — correspondance avec la grille de priorité.
export const GRAVITES = {
  critical: { priorite: 'P1', libelle: 'Critique', ton: 'red' },
  high: { priorite: 'P2', libelle: 'Majeur', ton: 'orange' },
  medium: { priorite: 'P3', libelle: 'Modéré', ton: 'amber' },
  low: { priorite: 'P4', libelle: 'Mineur', ton: 'blue' },
} as const

export type CleGravite = keyof typeof GRAVITES

/** « P1 — Critique ». Renvoie la valeur brute si elle n'est pas connue, plutôt que de la masquer. */
export function libelleGravite(v: string | null | undefined): string {
  if (!v) return '—'
  const g = GRAVITES[v as CleGravite]
  return g ? `${g.priorite} — ${g.libelle}` : v
}

/** « P1 » seul, pour les affichages contraints (listes denses, pastilles). */
export function prioriteGravite(v: string | null | undefined): string | null {
  return v ? (GRAVITES[v as CleGravite]?.priorite ?? null) : null
}

export function tonGravite(v: string | null | undefined): string {
  return (v && GRAVITES[v as CleGravite]?.ton) || 'gray'
}

/** Options d'un sélecteur, dans l\'ordre décroissant de gravité. */
export const OPTIONS_GRAVITE = (['critical', 'high', 'medium', 'low'] as const)
  .map(v => ({ value: v, label: `${GRAVITES[v].priorite} — ${GRAVITES[v].libelle}` }))

// ORIGINE DE LA DATE DE PRISE DE CONNAISSANCE (voir nis2_incidents.ts côté base).
export const ORIGINES_DATE: Record<string, { libelle: string, aide: string }> = {
  connaissance: {
    libelle: 'Prise de connaissance',
    aide: 'Date à laquelle l\'établissement a eu connaissance de l\'incident, telle qu\'enregistrée dans Sniff.',
  },
  detection: {
    libelle: 'Date de constat',
    aide: 'Date du constat technique, reprise du détail de l\'incident faute de date de connaissance.',
  },
  creation: {
    libelle: 'Saisie dans Sniff',
    aide: 'Date de création de la fiche dans Sniff. L\'incident a pu être connu plus tôt : les délais réels commencent peut-être avant.',
  },
  saisie: {
    libelle: 'Saisie manuelle',
    aide: 'Date renseignée à la main lors de la création du suivi.',
  },
}
