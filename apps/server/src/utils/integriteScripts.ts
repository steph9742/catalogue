import { createHash } from 'node:crypto'

// INTÉGRITÉ DES SCRIPTS SERVIS — lecture du relevé, comparaison à la référence, CSP.

export type ScriptRef = { src: string | null, domaine: string | null, externe: boolean, sha256: string }
export type ScriptVu = ScriptRef & { integrity: boolean }
export type PageRelevee = { url: string, releveLe: Date, csp: string | null, scripts: ScriptVu[] }

const SCRIPTS_MAX = 500
const MOTIF_SHA = /^[a-f0-9]{64}$/
const TOLERANCE_FUTUR_MS = 24 * 60 * 60 * 1000

/**
 * Le domaine « racine » d'un hôte : les deux derniers libellés. Approximation suffisante pour
 * des domaines en .fr ; un suffixe à deux niveaux (co.uk) serait compté trop large,
 * c'est-à-dire sans fausse alerte.
 */
export function domaineRacine(hote: string): string {
  const h = hote.toLowerCase().replace(/\.$/, '')
  if (/^[\d.]+$/.test(h) || h.includes(':')) return h
  return h.split('.').slice(-2).join('.')
}

/** Un script se reconnaît à son chemin, pas à sa chaîne de requête : `?ver=` change à chaque mise à jour. */
const cleSrc = (src: string): string => {
  try {
    const u = new URL(src)
    return u.protocol === 'https:' || u.protocol === 'http:' ? `${u.origin}${u.pathname}` : src
  }
  catch { return src }
}

/** Une page relevée, ou le motif précis de son refus. */
export function lirePage(brut: unknown, maintenant = new Date()): { ok: true, page: PageRelevee } | { ok: false, motif: string } {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, motif: 'page illisible (pas un objet)' }
  const o = brut as Record<string, unknown>

  let u: URL
  try { u = new URL(String(o.url ?? '')) }
  catch { return { ok: false, motif: 'page : url illisible' } }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, motif: `page : url non http (${u.protocol})` }
  u.hash = ''
  const url = u.toString()

  const releveLe = typeof o.releve_le === 'string' ? new Date(o.releve_le) : null
  if (!releveLe || Number.isNaN(releveLe.getTime())) return { ok: false, motif: `page ${url} : releve_le illisible` }
  if (releveLe.getTime() > maintenant.getTime() + TOLERANCE_FUTUR_MS) return { ok: false, motif: `page ${url} : releve_le dans le futur` }

  const csp = typeof o.csp === 'string' ? o.csp.trim().slice(0, 4000) : null

  if (!Array.isArray(o.scripts)) return { ok: false, motif: `page ${url} : liste de scripts absente` }
  // UNE LISTE TRONQUÉE MENTIRAIT : chaque script coupé se lirait comme « retiré ». On refuse
  // la page entière plutôt que d'en garder une partie.
  if (o.scripts.length > SCRIPTS_MAX) return { ok: false, motif: `page ${url} : plus de ${SCRIPTS_MAX} scripts` }

  const racinePage = domaineRacine(u.hostname)
  const scripts: ScriptVu[] = []
  for (const x of o.scripts) {
    const s = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const sha256 = typeof s.sha256 === 'string' ? s.sha256.trim().toLowerCase() : ''
    // Même raison : un script écarté pour empreinte illisible se lirait comme retiré.
    if (!MOTIF_SHA.test(sha256)) return { ok: false, motif: `page ${url} : empreinte de script invalide` }

    let src: string | null = null
    let domaine: string | null = null
    if (typeof s.src === 'string' && s.src.trim()) {
      try {
        const su = new URL(s.src.trim(), url)
        src = su.toString().slice(0, 2000)
        // Un script `data:` ou `blob:` n'a pas de domaine : il reste listé, sans origine.
        domaine = su.protocol === 'https:' || su.protocol === 'http:' ? su.hostname : null
      }
      catch { return { ok: false, motif: `page ${url} : src de script illisible` } }
    }
    scripts.push({ src, domaine, externe: !!domaine && domaineRacine(domaine) !== racinePage, sha256, integrity: s.integrity === true })
  }
  return { ok: true, page: { url, releveLe, csp, scripts } }
}

export type NatureEcart = 'script_modifie' | 'script_ajoute' | 'script_retire' | 'nouveau_domaine_tiers'
export type Ecart = { nature: NatureEcart, src: string | null, domaine: string | null, avant: string | null, apres: string | null }

/**
 * Les écarts entre la référence validée et le relevé. Un script à `src` se compare par son
 * chemin : même chemin, autre empreinte = modifié.
 */
export function comparerScripts(reference: readonly ScriptRef[], observes: readonly ScriptRef[]): Ecart[] {
  const grouper = (l: readonly ScriptRef[]) => {
    const m = new Map<string, ScriptRef[]>()
    for (const s of l) {
      const k = s.src ? cleSrc(s.src) : `inline:${s.sha256}`
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return m
  }
  const ref = grouper(reference)
  const obs = grouper(observes)
  const ecarts: Ecart[] = []

  for (const [k, vus] of obs) {
    const connus = ref.get(k)
    const premier = vus[0]!
    if (!connus) {
      ecarts.push({ nature: 'script_ajoute', src: premier.src, domaine: premier.domaine, avant: null, apres: premier.sha256 })
      continue
    }
    const empreintes = new Set(connus.map(x => x.sha256))
    const change = vus.find(x => !empreintes.has(x.sha256))
    if (change) ecarts.push({ nature: 'script_modifie', src: change.src, domaine: change.domaine, avant: connus[0]!.sha256, apres: change.sha256 })
  }
  for (const [k, connus] of ref) {
    if (obs.has(k)) continue
    const s = connus[0]!
    ecarts.push({ nature: 'script_retire', src: s.src, domaine: s.domaine, avant: s.sha256, apres: null })
  }

  const domainesConnus = new Set(reference.filter(s => s.externe && s.domaine).map(s => domaineRacine(s.domaine!)))
  const nouveaux = new Map<string, ScriptRef>()
  for (const s of observes) {
    if (!s.externe || !s.domaine) continue
    const r = domaineRacine(s.domaine)
    if (!domainesConnus.has(r) && !nouveaux.has(r)) nouveaux.set(r, s)
  }
  for (const [r, s] of nouveaux) ecarts.push({ nature: 'nouveau_domaine_tiers', src: s.src, domaine: r, avant: null, apres: s.sha256 })
  return ecarts
}

/** L'état d\'un script relevé face à la référence, pour l\'affichage. */
export function etatDuScript(s: ScriptRef, reference: readonly ScriptRef[], referenceValidee: boolean): 'sans_reference' | 'conforme' | 'modifie' | 'nouveau' {
  if (!referenceValidee) return 'sans_reference'
  const k = s.src ? cleSrc(s.src) : null
  const memes = reference.filter(r => (k ? !!r.src && cleSrc(r.src) === k : !r.src))
  if (memes.some(r => r.sha256 === s.sha256)) return 'conforme'
  return k && memes.length ? 'modifie' : 'nouveau'
}

const GRAVITE_ECART: Record<NatureEcart, 'critique' | 'elevee' | 'moyenne'> = {
  nouveau_domaine_tiers: 'critique',
  script_modifie: 'elevee',
  script_ajoute: 'moyenne',
  script_retire: 'moyenne',
}

const nomCourt = (src: string | null): string =>
  src ? ((src.split('?')[0]!.split('/').pop() || src).slice(0, 80)) : 'script en ligne'

/**
 * Le constat `integrite_script` d'un écart. LA CLÉ STABLE porte la page, la nature, le script
 * et l'empreinte servie : le même écart relevé chaque nuit reste UN constat, mais une nouvelle
 * modification du même script en ouvre un autre — elle n'est pas la même chose.
 */
export function constatDEcart(page: { id: string, url: string }, e: Ecart) {
  const brut = [page.id, e.nature, e.src ? cleSrc(e.src) : 'inline', e.nature === 'nouveau_domaine_tiers' ? e.domaine : (e.apres ?? e.avant)].join('|')
  const court = (h: string | null) => (h ? `${h.slice(0, 12)}…` : '—')
  const titres: Record<NatureEcart, string> = {
    script_modifie: `Script modifié : ${nomCourt(e.src)}`,
    script_ajoute: e.src ? `Script ajouté : ${nomCourt(e.src)}` : 'Script en ligne ajouté',
    script_retire: e.src ? `Script retiré : ${nomCourt(e.src)}` : 'Script en ligne retiré',
    nouveau_domaine_tiers: `Nouveau domaine tiers chargé : ${e.domaine}`,
  }
  const details: Record<NatureEcart, string> = {
    script_modifie: `Sur ${page.url}, le contenu servi ne correspond plus à la référence validée (référence ${court(e.avant)}, servi ${court(e.apres)}).`,
    script_ajoute: `Sur ${page.url}, un script absent de la référence validée est servi (${court(e.apres)}).`,
    script_retire: `Sur ${page.url}, un script de la référence validée n'est plus servi (${court(e.avant)}).`,
    nouveau_domaine_tiers: `Sur ${page.url}, un script est chargé depuis ${e.domaine}, domaine absent de la référence validée.`,
  }
  return {
    cleStable: `catalogue:integrite:${createHash('sha256').update(brut).digest('hex').slice(0, 40)}`,
    categorie: 'integrite_script' as const,
    gravite: GRAVITE_ECART[e.nature],
    titre: titres[e.nature],
    detail: details[e.nature],
    preuve: (e.src ?? `sha256:${e.apres ?? e.avant}`).slice(0, 2000),
    reference: null,
  }
}

export type EtatCsp = { etat: 'non_relevee' | 'absente' | 'inoperante' | 'faible' | 'effective', raisons: string[] }

/**
 * LA CSP EFFECTIVE, pas seulement présente. `Content-Security-Policy: frame-ancestors 'self'`
 * est une CSP présente qui n'empêche aucun script de s\'exécuter.
 */
export function evaluerCsp(valeur: string | null): EtatCsp {
  if (valeur === null) return { etat: 'non_relevee', raisons: [] }
  if (!valeur.trim()) return { etat: 'absente', raisons: [] }

  const directives = new Map<string, string[]>()
  for (const d of valeur.split(';')) {
    const [nom, ...sources] = d.trim().split(/\s+/)
    // Une directive répétée : la première l'emporte, comme dans le navigateur.
    if (nom && !directives.has(nom.toLowerCase())) directives.set(nom.toLowerCase(), sources.map(x => x.toLowerCase()))
  }
  const sources = directives.get('script-src') ?? directives.get('default-src')
  if (!sources) return { etat: 'inoperante', raisons: ['ni script-src ni default-src : les scripts ne sont pas restreints'] }

  const raisons: string[] = []
  const nonceOuEmpreinte = sources.some(s => /^'(nonce-|sha(256|384|512)-)/.test(s))
  if (sources.includes('\'unsafe-inline\'') && !nonceOuEmpreinte) raisons.push('\'unsafe-inline\' : un script injecté dans la page s\'exécute')
  for (const s of sources) {
    if (s === '*' || s === 'https:' || s === 'http:' || s === 'data:') raisons.push(`source « ${s} » : n'importe quelle origine peut servir un script`)
  }
  if (sources.includes('\'unsafe-eval\'')) raisons.push('\'unsafe-eval\' : du code construit à l\'exécution s\'exécute')
  return { etat: raisons.length ? 'faible' : 'effective', raisons }
}
