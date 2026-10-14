import { createHash } from 'node:crypto'

// Pur. POURQUOI ICI, ET PAS DANS UN ADAPTATEUR.

/** Ce qu'on lit d\'un résultat Artemis. Tout le reste est ignoré. */
export type ResultatArtemis = {
  status?: unknown
  receiver?: unknown
  status_reason?: unknown
  /**
   * CE QUE LE RÉSUMÉ NE DIT PAS. `status_reason` annonce « 2 CVE(s) found across 2 technologies
   * » — sans le moindre identifiant.
   */
  result?: unknown
  additional_info?: unknown
  created_at?: unknown
  task?: { payload?: { domain?: unknown, url?: unknown }, payload_persistent?: { original_target?: unknown } }
}

export type Traduction = {
  constats: unknown[]
  /** Cibles vues dans la fenêtre : c'est ce qui permet de confirmer une correction. */
  actifsReleves: { hote: string, port: number | null, releve_le: string }[]
  /** Modules rencontrés et non rangés, avec leur nombre. Rendus, jamais tus. */
  modulesInconnus: Record<string, number>
  /** Résultats écartés parce qu'Artemis ne les tient pas pour intéressants. */
  sansInteret: number
}

type Regle = { categorie: string, gravite: string }

// LE RANGEMENT ET LA GRAVITÉ, PAR MODULE. Les noms de modules sont ceux d'Artemis.
const REGLES: Record<string, Regle> = {
  // Ce qui est exposé et ne devrait pas l'être.
  bruter: { categorie: 'fichier_expose', gravite: 'elevee' },
  directory_index: { categorie: 'fichier_expose', gravite: 'moyenne' },
  exposed_ftp: { categorie: 'outil_expose', gravite: 'elevee' },
  ftp_bruter: { categorie: 'outil_expose', gravite: 'elevee' },
  admin_panel_login_bruter: { categorie: 'outil_expose', gravite: 'elevee' },
  humble: { categorie: 'entete', gravite: 'faible' },
  // Détection de vulnérabilités. La gravité écrite ici est un DÉFAUT : quand le résultat
  // porte un score CVSS, c'est lui qui tranche (voir `graviteDuScore`).
  nuclei: { categorie: 'vulnerabilite', gravite: 'elevee' },
  // Le nom porté par les résultats est « nuclei-module », pas « nuclei » : relevé sur une
  // instance, et c'est exactement le genre d'écart qui fait qu'un module n'est pas traduit sans
  // que rien ne casse.
  'nuclei-module': { categorie: 'vulnerabilite', gravite: 'elevee' },
  cve_lookup: { categorie: 'vulnerabilite', gravite: 'elevee' },
  cve_finder: { categorie: 'vulnerabilite', gravite: 'elevee' },
  vcs: { categorie: 'fichier_expose', gravite: 'elevee' },
  // Versions et produits.
  wordpress_plugins: { categorie: 'version', gravite: 'moyenne' },
  wp_scanner: { categorie: 'version', gravite: 'moyenne' },
  joomla_scanner: { categorie: 'version', gravite: 'moyenne' },
  drupal_scanner: { categorie: 'version', gravite: 'moyenne' },
  version_scanner: { categorie: 'version', gravite: 'moyenne' },
  // Noms, certificats, courrier.
  ssl_checks: { categorie: 'tls', gravite: 'moyenne' },
  mail_dns_scanner: { categorie: 'dns', gravite: 'moyenne' },
  dns_scanner: { categorie: 'dns', gravite: 'moyenne' },
  dangling_dns_detector: { categorie: 'dns', gravite: 'elevee' },
  domain_expiration_scanner: { categorie: 'dns', gravite: 'elevee' },
  // Scripts servis par un domaine non enregistré : c'est le chemin d'un détournement.
  scripts_unregistered_domains: { categorie: 'integrite_script', gravite: 'critique' },
  // Ports ouverts : un FAIT, pas un écart. La gravité se juge sur le service, pas sur le port.
  port_scanner: { categorie: 'port', gravite: 'info' },
  // Noms trouvés : ils vont dans la file des découvertes, à valider.
  subdomain_enumeration: { categorie: 'decouverte', gravite: 'info' },
  crtsh: { categorie: 'decouverte', gravite: 'info' },
  gau: { categorie: 'decouverte', gravite: 'info' },
}

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

const MOTIF_CVE = /CVE-\d{4}-\d{4,7}/gi

/** Les CVE citées par un texte, dédoublonnées et triées — l'ordre de citation n\'est pas stable. */
export function cvesDe(raison: string): string[] {
  return [...new Set([...raison.matchAll(MOTIF_CVE)].map(m => m[0].toUpperCase()))].sort()
}

/**
 * Tout ce qu'un résultat porte de lisible, résumé ET détail. `additional_info` n\'a pas de forme
 * fixe d'un module à l\'autre : liste, objet, texte.
 */
export function texteComplet(r: ResultatArtemis): string {
  const morceaux = [texte(r.status_reason) ?? '']
  for (const bloc of [r.result, r.additional_info]) {
    if (bloc === null || bloc === undefined) continue
    try { morceaux.push(typeof bloc === 'string' ? bloc : JSON.stringify(bloc)) }
    catch { /* un bloc impossible à sérialiser ne doit pas emporter le reste */ }
  }
  // Borné : un détail de plusieurs mégaoctets n'apporte rien de plus et coûte à chaque ligne.
  return morceaux.filter(Boolean).join(' ').slice(0, 20000)
}

/**
 * LA GRAVITÉ VIENT DU SCORE QUAND IL Y EN A UN. Une CVE sans son score serait rangée comme
 * toutes les autres : « élevée », y compris pour une faille mineure, et le compteur de
 * critiques cesserait de vouloir dire quelque chose.
 */
export function graviteDuScore(raison: string): string | null {
  const m = /\bcvss[^0-9]{0,12}(\d{1,2}(?:[.,]\d)?)/i.exec(raison)
  if (!m) return null
  const score = Number(m[1]!.replace(',', '.'))
  if (!Number.isFinite(score) || score < 0 || score > 10) return null
  if (score >= 9) return 'critique'
  if (score >= 7) return 'elevee'
  if (score >= 4) return 'moyenne'
  return score > 0 ? 'faible' : 'info'
}

/**
 * La cible d'un résultat : l\'hôte, et le port quand il est dit. `payload.domain` est renseigné
 * par le classificateur ; `payload_persistent.original_target` garde ce qui a été demandé.
 */
export function cibleDe(r: ResultatArtemis): { hote: string, port: number | null, url: string | null } | null {
  const url = texte(r.task?.payload?.url)
  const brut = texte(r.task?.payload?.domain) ?? texte(r.task?.payload_persistent?.original_target) ?? null
  let hote = brut
  let port: number | null = null
  if (url) {
    try {
      const u = new URL(url)
      hote = u.hostname
      port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80)
    }
    catch { /* une URL illisible ne disqualifie pas le domaine */ }
  }
  else if (brut?.includes(':')) {
    const [h, p] = brut.split(':')
    if (h && p && /^\d+$/.test(p)) { hote = h; port = Number(p) }
  }
  if (!hote) return null
  return { hote: hote.toLowerCase().replace(/\.$/, ''), port, url }
}

/**
 * CE QUI, DANS UN CONSTAT, NE DOIT PAS BOUGER D'UN RELEVÉ À L\'AUTRE. `status_reason` porte le
 * fait ET des détails volatils : une version de serveur, une durée, un horodatage.
 */
export function faitStable(receiver: string, raison: string): string {
  // Des CVE citées : ELLES sont le fait. Le texte autour nomme des versions qui changeront au
  // premier correctif partiel, et le constat se dédoublerait à chaque passage.
  const cves = cvesDe(raison)
  if (cves.length) return `cve:${cves.join(',')}`
  if (receiver === 'port_scanner') {
    const ports = [...raison.matchAll(/\b(\d{1,5})\b(?=\s*\()/g)].map(m => Number(m[1]))
    if (ports.length) return `ports:${[...new Set(ports)].sort((a, b) => a - b).join(',')}`
  }
  return raison
    .toLowerCase()
    // Versions, durées, dates : ce qui change sans que le fait change.
    .replace(/\b\d+(\.\d+)+\b/g, '#')
    .replace(/\b\d{4}-\d{2}-\d{2}([t ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?z?)?/g, '#')
    .replace(/\b\d+([.,]\d+)?\s*(seconds?|secondes?|ms|minutes?)\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

/** La clé stable : module, cible, fait. Déterministe, et indépendante de l'ordre de lecture. */
export function cleStable(receiver: string, hote: string, port: number | null, fait: string): string {
  return createHash('sha256').update(`${receiver}|${hote}|${port ?? ''}|${fait}`).digest('hex')
}

const dateDe = (v: unknown): Date | null => {
  const s = texte(v)
  if (!s) return null
  // Artemis date sans fuseau : c'est de l'UTC, et le lire en heure locale décalerait le curseur.
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Traduit une page de résultats Artemis. Un filtre côté serveur qu'on croit actif est pire
 * qu'une absence de filtre.
 */
/**
 * LA LISTE, QUELLE QUE SOIT SON ENVELOPPE. `/api/task-results` rend un tableau nu sur
 * l'instance mesurée.
 */
export function listeDeResultats(corps: unknown): unknown[] | null {
  if (Array.isArray(corps)) return corps
  if (!corps || typeof corps !== 'object') return null
  for (const cle of ['data', 'results', 'items', 'task_results']) {
    const v = (corps as Record<string, unknown>)[cle]
    if (Array.isArray(v)) return v
  }
  return null
}

export function traduireResultats(corps: unknown, depuis: Date | null): Traduction {
  const t: Traduction = { constats: [], actifsReleves: [], sansInteret: 0, modulesInconnus: {} }
  const lignes = listeDeResultats(corps)
  if (!lignes) throw new Error('Artemis n\'a pas rendu une liste de résultats.')

  const vus = new Set<string>()
  for (const brut of lignes) {
    const r = (brut ?? {}) as ResultatArtemis
    const releveLe = dateDe(r.created_at)
    if (!releveLe) continue
    if (depuis && releveLe.getTime() <= depuis.getTime()) continue

    const cible = cibleDe(r)
    const receiver = texte(r.receiver)
    if (!cible || !receiver) continue

    // L'actif est compté comme RELEVÉ même quand rien n'y a été trouvé : c'est ce qui permet
    // de confirmer une correction. Un constat absent d'une réponse ne prouve rien sans cela.
    const cleActif = `${cible.hote}|${cible.port ?? ''}`
    if (!vus.has(cleActif)) {
      vus.add(cleActif)
      t.actifsReleves.push({ hote: cible.hote, port: cible.port, releve_le: releveLe.toISOString() })
    }

    if (texte(r.status)?.toUpperCase() !== 'INTERESTING') { t.sansInteret++; continue }
    // `cve_lookup` rend une structure, pas une phrase : on la lit comme telle, et chaque CVE
    // devient son propre constat avec son propre score.
    if (receiver === 'cve_lookup') {
      const detaillees = constatsDeCveLookup(r, cible, releveLe)
      if (detaillees) { t.constats.push(...detaillees); continue }
    }
    const regle = REGLES[receiver]
    if (!regle) {
      t.modulesInconnus[receiver] = (t.modulesInconnus[receiver] ?? 0) + 1
      continue
    }
    const raison = texte(r.status_reason) ?? regle.categorie
    // Le détail porte les identifiants que le résumé tait ; le résumé porte souvent le score.
    const complet = texteComplet(r)
    const fait = faitStable(receiver, complet === raison ? raison : `${raison} ${cvesDe(complet).join(',')}`)
    const cves = cvesDe(complet)
    t.constats.push({
      cle_stable: cleStable(receiver, cible.hote, cible.port, fait),
      actif: { hote: cible.hote, port: cible.port, url: cible.url },
      releve_le: releveLe.toISOString(),
      categorie: regle.categorie,
      gravite: graviteDuScore(complet) ?? regle.gravite,
      titre: `${receiver} — ${raison}`.slice(0, 300),
      detail: raison,
      preuve: null,
      // LA RÉFÉRENCE PORTE LES CVE quand il y en a : c'est ce qu'on cherche pour décider, et ce
      // qui se recopie dans un ticket.
      reference: (cves.length ? `${cves.join(' ')} (artemis:${receiver})` : `artemis:${receiver}`).slice(0, 300),
    })
  }
  return t
}

/**
 * LE CAS `cve_lookup` : UN CONSTAT PAR CVE, et non un constat par relevé.
 */
type CveTrouvee = { id?: unknown, description?: unknown, cvss_score?: unknown }
type TechnologieTrouvee = { technology_name?: unknown, technology_version?: unknown, cpe?: unknown, cves?: unknown }

function constatsDeCveLookup(r: ResultatArtemis, cible: { hote: string, port: number | null, url: string | null }, releveLe: Date): unknown[] | null {
  const res = (r.result ?? null) as { url?: unknown, findings?: unknown } | null
  if (!res || typeof res !== 'object' || !Array.isArray(res.findings)) return null

  // L'URL du relevé porte le port, que la charge utile de la tâche ne donne pas toujours.
  let hote = cible.hote
  let port = cible.port
  const url = texte(res.url) ?? cible.url
  if (url) {
    try {
      const u = new URL(url)
      hote = u.hostname.toLowerCase()
      port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80)
    }
    catch { /* une URL illisible laisse la cible de la tâche */ }
  }

  const constats: unknown[] = []
  for (const brut of res.findings as TechnologieTrouvee[]) {
    const techno = texte(brut?.technology_name)
    const version = texte(brut?.technology_version)
    if (!Array.isArray(brut?.cves)) continue
    for (const c of brut.cves as CveTrouvee[]) {
      const id = texte(c?.id)?.toUpperCase()
      if (!id || !MOTIF_CVE.test(id)) continue
      MOTIF_CVE.lastIndex = 0
      const score = typeof c?.cvss_score === 'number' ? c.cvss_score : Number(texte(c?.cvss_score) ?? NaN)
      const produit = [techno, version].filter(Boolean).join(' ') || 'technologie non nommée'
      constats.push({
        cle_stable: cleStable('cve_lookup', hote, port, `cve:${techno ?? ''}:${id}`),
        actif: { hote, port, url },
        releve_le: releveLe.toISOString(),
        categorie: 'vulnerabilite',
        gravite: graviteDuScore(`cvss ${Number.isFinite(score) ? score : ''}`) ?? 'elevee',
        titre: `${produit} — ${id}`.slice(0, 300),
        detail: texte(c?.description),
        // La preuve, c'est le CPE : il dit SUR QUOI la correspondance a été faite, donc ce
        // qu'il faut vérifier quand on conteste le constat.
        preuve: texte(brut?.cpe),
        reference: `${id} (artemis:cve_lookup)`,
      })
    }
  }
  return constats.length ? constats : null
}

/** Les modules rangés, pour l'écran de réglages : ce qui sera traduit, et comment. */
export function modulesConnus(): { module: string, categorie: string, gravite: string }[] {
  return Object.entries(REGLES).map(([module, r]) => ({ module, ...r }))
}
