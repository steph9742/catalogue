import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Référentiel NIS 2 / ReCyF — chargé depuis le CSV OFFICIEL de l'ANSSI, pas depuis des données
// recopiées à la main.

export type ExigenceReCyF = {
  reference: string
  contenu: string
  objectifNumero: number
  objectifIntitule: string
  thematique: string
  attenduEi: boolean
  attenduEe: boolean
  // Renseigné quand la source se contredit (voir 13.5) — tracé dans les notes.
  anomalieSource: string | null
}

const FICHIER = 'nis2-recyf.csv'

/**
 * Chemins où chercher un référentiel embarqué, du plus spécifique au plus général.
 */
export function cheminReferentiel(fichier: string, racine?: string): string[] {
  return [
    racine && join(racine, fichier),
    join(process.cwd(), 'referentiels', fichier),
    join(process.cwd(), 'packages/database/src/referentiels', fichier),
    join(import.meta.dir, '../../../../packages/database/src/referentiels', fichier),
  ].filter(Boolean) as string[]
}

/** Analyseur CSV minimal gérant les guillemets et les retours à la ligne dans un champ. */
export function analyserCsv(texte: string, separateur = ';'): string[][] {
  const lignes: string[][] = []
  let champ = ''
  let ligne: string[] = []
  let dansGuillemets = false

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]!
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++ } // guillemet échappé
        else dansGuillemets = false
      }
      else champ += c
      continue
    }
    if (c === '"') { dansGuillemets = true; continue }
    if (c === separateur) { ligne.push(champ); champ = ''; continue }
    if (c === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; continue }
    if (c === '\r') continue
    champ += c
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne) }
  return lignes.filter(l => l.some(x => x.trim()))
}

/**
 * Détermine à qui s'applique l\'exigence. La colonne « Cibles » fait foi.
 */
function applicabilite(reference: string, cibles: string): { ei: boolean, ee: boolean, anomalie: string | null } {
  const c = cibles.trim()
  const suffixe = reference.includes('-') ? reference.split('-').pop()!.trim() : ''
  const parSuffixe = { ei: suffixe === 'EI/EE', ee: true }

  if (!c) {
    return { ...parSuffixe, anomalie: 'Colonne « Cibles » vide dans le référentiel officiel : applicabilité déduite du suffixe de la référence.' }
  }
  const parColonne = c === 'EntiteImportante, EntiteEssentielle'
    ? { ei: true, ee: true }
    : c === 'EntiteEssentielle' ? { ei: false, ee: true } : parSuffixe

  const contradiction = parColonne.ei !== parSuffixe.ei
  return {
    ...parColonne,
    anomalie: contradiction
      ? `Le référentiel officiel se contredit : la référence indique « ${suffixe} » mais la colonne Cibles indique « ${c} ». La colonne Cibles fait foi ici.`
      : null,
  }
}

/** Lit et analyse le référentiel officiel embarqué. */
export function chargerReferentielNis2(racine?: string): ExigenceReCyF[] {
  // Le CSV est copié à côté du binaire dans l'image (cf. Dockerfile) ; en développement
  // il est lu depuis le paquet database.
  const chemins = cheminReferentiel(FICHIER, racine)

  let texte: string | null = null
  for (const p of chemins) {
    try { texte = readFileSync(p, 'utf8'); break }
    catch { /* chemin suivant */ }
  }
  if (!texte) throw new Error(`Référentiel NIS 2 introuvable (cherché dans : ${chemins.join(', ')})`)

  const lignes = analyserCsv(texte.replace(/^\uFEFF/, ''))
  const entete = lignes.shift()
  if (!entete) throw new Error('Référentiel NIS 2 vide.')

  const idx = (nom: string) => entete.findIndex(h => h.trim().toLowerCase().replace(/^\uFEFF/, '') === nom.toLowerCase())
  const iRef = idx('Référence'); const iCont = idx('Contenu')
  const iObj = idx('Objectif'); const iThem = idx('Thématique'); const iCib = idx('Cibles')
  if (iRef < 0 || iCont < 0 || iObj < 0) throw new Error(`Colonnes inattendues : ${entete.join(' | ')}`)

  return lignes.map((l) => {
    const reference = (l[iRef] ?? '').trim()
    const objBrut = (l[iObj] ?? '').trim()
    const m = objBrut.match(/Objectif de sécurité\s*(\d+)\s*:\s*(.+)/s)
    const app = applicabilite(reference, l[iCib] ?? '')
    return {
      reference,
      contenu: (l[iCont] ?? '').trim(),
      objectifNumero: m ? Number(m[1]) : 0,
      objectifIntitule: m ? m[2]!.trim() : objBrut,
      thematique: (l[iThem] ?? '').trim(),
      attenduEi: app.ei,
      attenduEe: app.ee,
      anomalieSource: app.anomalie,
    }
  }).filter(e => e.reference && e.objectifNumero > 0)
}

/** Objectifs déduits des exigences (numéro + intitulé officiels, sans doublon). */
export function objectifsDuReferentiel(exigences: ExigenceReCyF[]): { numero: number, intitule: string, applicabilite: 'ei_ee' | 'ee' }[] {
  const parNumero = new Map<number, { intitule: string, ei: boolean }>()
  for (const e of exigences) {
    const deja = parNumero.get(e.objectifNumero)
    // Un objectif concerne les entités importantes dès qu'UNE de ses exigences les vise :
    // 13 objectifs sur 20 ont des exigences de portées différentes.
    parNumero.set(e.objectifNumero, {
      intitule: deja?.intitule ?? e.objectifIntitule,
      ei: (deja?.ei ?? false) || e.attenduEi,
    })
  }
  return [...parNumero.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, v]) => ({ numero, intitule: v.intitule, applicabilite: v.ei ? 'ei_ee' as const : 'ee' as const }))
}
