import { createHash } from 'node:crypto'

// Pur. POURQUOI ICI, ET PAS DANS UN ADAPTATEUR.

/** Ce qu'on lit d'un résultat Artemis. Tout le reste est ignoré. */
export type ResultatArtemis = {
  status?: unknown
  receiver?: unknown
  status_reason?: unknown
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

/** Les CVE citées par un résultat, dédoublonnées et triées — l'ordre du texte n'est pas stable. */
export function cvesDe(raison: string): string[] {
  return [...new Set([...raison.matchAll(MOTIF_CVE)].map(m => m[0].toUpperCase()))].sort()
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
 * La cible d'un résultat : l'hôte, et le port quand il est dit. `payload.domain` est renseigné
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
 * CE QUI, DANS UN CONSTAT, NE DOIT PAS BOUGER D'UN RELEVÉ À L'AUTRE. `status_reason` porte le
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
export function traduireResultats(corps: unknown, depuis: Date | null): Traduction {
  const t: Traduction = { constats: [], actifsReleves: [], sansInteret: 0, modulesInconnus: {} }
  const lignes = Array.isArray(corps) ? corps : Array.isArray((corps as { results?: unknown[] })?.results) ? (corps as { results: unknown[] }).results : null
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
    const regle = REGLES[receiver]
    if (!regle) {
      t.modulesInconnus[receiver] = (t.modulesInconnus[receiver] ?? 0) + 1
      continue
    }
    const raison = texte(r.status_reason) ?? regle.categorie
    const fait = faitStable(receiver, raison)
    const cves = cvesDe(raison)
    t.constats.push({
      cle_stable: cleStable(receiver, cible.hote, cible.port, fait),
      actif: { hote: cible.hote, port: cible.port, url: cible.url },
      releve_le: releveLe.toISOString(),
      categorie: regle.categorie,
      gravite: graviteDuScore(raison) ?? regle.gravite,
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

/** Les modules rangés, pour l'écran de réglages : ce qui sera traduit, et comment. */
export function modulesConnus(): { module: string, categorie: string, gravite: string }[] {
  return Object.entries(REGLES).map(([module, r]) => ({ module, ...r }))
}
