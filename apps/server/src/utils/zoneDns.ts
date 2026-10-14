// LECTURE D'UNE ZONE DNS — fichier BIND ou sortie de `dig AXFR`, le même format.

export type EnregistrementZone = { nom: string, type: 'A' | 'AAAA' | 'CNAME', valeur: string }
export type NomZone = { hote: string, adresses: string[], cnames: string[] }

const TYPES_GARDES = new Set(['A', 'AAAA', 'CNAME'])
const CLASSES = new Set(['IN', 'CH', 'HS'])
const MOTIF_TTL = /^\d+[smhdw]?$/i
const MOTIF_IPV4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const MOTIF_IPV6 = /^[0-9a-f:.]{2,45}$/i
const MOTIF_NOM = /^(?=.{1,253}$)[a-z0-9_](?:[a-z0-9_-]{0,62})(?:\.[a-z0-9_](?:[a-z0-9_-]{0,62}))*$/

/** Retire un commentaire `;` hors des chaînes entre guillemets (un TXT peut contenir « ; »). */
function sansCommentaire(ligne: string): string {
  let guillemets = false
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i]
    if (c === '"' && ligne[i - 1] !== '\\') guillemets = !guillemets
    else if (c === ';' && !guillemets) return ligne.slice(0, i)
  }
  return ligne
}

/** Un nom de la zone rendu absolu, en minuscules, sans point final. */
function absolu(nom: string, origine: string): string {
  const n = nom.toLowerCase()
  if (n === '@') return origine
  return n.endsWith('.') ? n.slice(0, -1) : `${n}.${origine}`
}

export function lireZone(texte: string, domaine: string): { enregistrements: EnregistrementZone[], jokers: number } {
  const racine = domaine.trim().toLowerCase().replace(/\.$/, '')
  let origine = racine
  let precedent: string | null = null
  const enregistrements: EnregistrementZone[] = []
  let jokers = 0
  const lignes = texte.split(/\r?\n/)

  for (let i = 0; i < lignes.length; i++) {
    let l = sansCommentaire(lignes[i]!)
    if (!l.trim()) continue
    // Une ligne ouverte par « ( » se poursuit jusqu'à « ) » : le SOA, le plus souvent.
    while (l.includes('(') && !l.includes(')') && i + 1 < lignes.length) {
      i++
      l += ` ${sansCommentaire(lignes[i]!)}`
    }
    l = l.replace(/[()]/g, ' ')

    const directive = l.trim().match(/^\$(ORIGIN|TTL|INCLUDE)\s+(\S+)/i)
    if (directive) {
      if (directive[1]!.toUpperCase() === 'ORIGIN') origine = absolu(directive[2]!.endsWith('.') ? directive[2]! : `${directive[2]}.`, racine)
      continue
    }

    // Une ligne qui commence par un blanc reprend le nom de la précédente.
    const heritee = /^\s/.test(l)
    const t = l.trim().split(/\s+/)
    let k = 0
    let nom: string | null
    if (heritee) nom = precedent
    else {
      nom = absolu(t[0]!, origine)
      k = 1
    }
    while (k < t.length && (MOTIF_TTL.test(t[k]!) || CLASSES.has(t[k]!.toUpperCase()))) k++
    const type = t[k]?.toUpperCase()
    const valeur = t[k + 1]
    if (!nom || !type) continue
    precedent = nom

    if (!TYPES_GARDES.has(type) || !valeur) continue
    if (nom !== racine && !nom.endsWith(`.${racine}`)) continue
    if (nom.startsWith('*.') || nom === '*') {
      jokers++
      continue
    }
    if (!MOTIF_NOM.test(nom)) continue

    if (type === 'A' && MOTIF_IPV4.test(valeur)) enregistrements.push({ nom, type, valeur })
    else if (type === 'AAAA' && valeur.includes(':') && MOTIF_IPV6.test(valeur)) enregistrements.push({ nom, type, valeur: valeur.toLowerCase() })
    else if (type === 'CNAME') enregistrements.push({ nom, type, valeur: absolu(valeur, origine) })
  }
  return { enregistrements, jokers }
}

/** Les enregistrements regroupés par nom : adresses d'un côté, alias de l\'autre. */
export function nomsDeLaZone(enregistrements: readonly EnregistrementZone[]): NomZone[] {
  const parNom = new Map<string, { adresses: Set<string>, cnames: Set<string> }>()
  for (const e of enregistrements) {
    const x = parNom.get(e.nom) ?? { adresses: new Set<string>(), cnames: new Set<string>() }
    if (e.type === 'CNAME') x.cnames.add(e.valeur)
    else x.adresses.add(e.valeur)
    parNom.set(e.nom, x)
  }
  return [...parNom]
    .map(([hote, x]) => ({ hote, adresses: [...x.adresses].sort(), cnames: [...x.cnames].sort() }))
    .sort((a, b) => a.hote.localeCompare(b.hote))
}
