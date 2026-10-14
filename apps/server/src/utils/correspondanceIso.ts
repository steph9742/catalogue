import { readFileSync } from 'node:fs'
import { analyserCsv, cheminReferentiel } from './referentielNis2'

// CORRESPONDANCE OFFICIELLE ReCyF ↔ ISO 27001/27002 — table publiée par l'ANSSI.

const FICHIER = 'nis2-iso-correspondance.csv'
const NB_COLONNES_ISO = 7 // « Référence ISO (1) » … « (7) » dans la source

export type RenvoiIso = {
  norme: string // « 27002:2022 »
  reference: string // « 5.9 »
  intitule: string
  ordre: number
}

export type CorrespondanceExigence = {
  reference: string // référence ReCyF, ex. « 1.1-EI/EE »
  correspondance: 'elevee' | 'moyenne' | 'faible' | null
  observations: string | null
  renvois: RenvoiIso[]
}

/** « élevé » / « moyen » / « faible » → valeurs d'énumération. */
function niveau(v: string): CorrespondanceExigence['correspondance'] {
  const n = v.trim().toLowerCase()
  if (n.startsWith('élev') || n.startsWith('elev')) return 'elevee'
  if (n.startsWith('moy')) return 'moyenne'
  if (n.startsWith('faib')) return 'faible'
  return null
}

/**
 * Découpe « 27002:2022-5.9 » en norme + référence. La séparation se fait sur le PREMIER tiret,
 * et non sur le dernier : les références de clause en contiennent (« 6.1.2 » non, mais la
 * prudence coûte peu), et la partie norme comporte déjà un deux-points qu'il ne faut pas
 * confondre.
 */
function decouper(v: string): { norme: string, reference: string } | null {
  const t = v.trim()
  const i = t.indexOf('-')
  if (i <= 0) return null
  const norme = t.slice(0, i).trim()
  const reference = t.slice(i + 1).trim()
  return norme && reference ? { norme, reference } : null
}

export function chargerCorrespondanceIso(): CorrespondanceExigence[] {
  const chemins = cheminReferentiel(FICHIER)
  let texte: string | null = null
  for (const p of chemins) {
    try { texte = readFileSync(p, 'utf8'); break }
    catch { /* chemin suivant */ }
  }
  if (!texte) {
    throw new Error(`Table de correspondance ReCyF ↔ ISO introuvable (${FICHIER}). Chemins essayés : ${chemins.join(', ')}`)
  }

  const lignes = analyserCsv(texte.replace(/^\uFEFF/, ''), ';')
  const entete = lignes[0] ?? []
  const idx = (nom: string) => entete.findIndex(c => c.trim() === nom)

  const iRef = idx('Référence')
  const iCorr = idx('Correspondance')
  const iObs = idx('Observations')
  if (iRef < 0) throw new Error('Colonne « Référence » absente de la table de correspondance.')

  return lignes.slice(1).map((l) => {
    const renvois: RenvoiIso[] = []
    for (let n = 1; n <= NB_COLONNES_ISO; n++) {
      const iR = idx(`Référence ISO (${n})`)
      const iI = idx(`Contenu ISO (${n})`)
      const brut = iR >= 0 ? (l[iR] ?? '').trim() : ''
      if (!brut) continue
      const d = decouper(brut)
      if (!d) continue
      renvois.push({
        norme: d.norme,
        reference: d.reference,
        intitule: (iI >= 0 ? (l[iI] ?? '') : '').trim(),
        ordre: n,
      })
    }
    return {
      reference: (l[iRef] ?? '').trim(),
      correspondance: iCorr >= 0 ? niveau(l[iCorr] ?? '') : null,
      observations: (iObs >= 0 ? (l[iObs] ?? '') : '').trim() || null,
      renvois,
    }
  }).filter(c => c.reference)
}

/**
 * Référence ISO 27002 de la source → référence de la déclaration d'applicabilité.
 */
export function referenceSoa(renvoi: RenvoiIso): string | null {
  if (!renvoi.norme.startsWith('27002')) return null
  return `A.${renvoi.reference}`
}

/**
 * Rapproche une référence de la table de comparaison d'une exigence en base.
 */
export function rapprocher(
  reference: string,
  parReference: Map<string, string>,
): { id: string, viaNumero: boolean } | null {
  const exact = parReference.get(reference)
  if (exact) return { id: exact, viaNumero: false }

  const numero = reference.split('-')[0]?.trim()
  if (!numero) return null
  for (const [ref, id] of parReference) {
    if (ref.split('-')[0]?.trim() === numero) return { id, viaNumero: true }
  }
  return null
}
