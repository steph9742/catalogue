import tls from 'node:tls'
import { promises as dns } from 'node:dns'

// SCAN TLS — lecture du certificat effectivement présenté par un service.

export type ReleveCertificat = {
  statut: 'ok' | 'injoignable' | 'tls_erreur' | 'invalide'
  message: string
  sujet: string | null
  emetteur: string | null
  nomsAlternatifs: string[]
  numeroSerie: string | null
  empreinte: string | null
  algorithme: string | null
  dateDebut: Date | null
  dateFin: Date | null
  autoSigne: boolean | null
  chaineValide: boolean | null
  erreurValidation: string | null
}

/**
 * LES CHAMPS DU CERTIFICAT À ÉCRIRE — ou rien, s'il n\'y avait rien à lire.
 */
export function champsLisibles(rc: ReleveCertificat): Partial<Omit<ReleveCertificat, 'statut' | 'message'>> {
  if (!rc.dateFin && !rc.sujet) return {}
  return {
    sujet: rc.sujet, emetteur: rc.emetteur, nomsAlternatifs: rc.nomsAlternatifs,
    numeroSerie: rc.numeroSerie, empreinte: rc.empreinte, algorithme: rc.algorithme,
    dateDebut: rc.dateDebut, dateFin: rc.dateFin, autoSigne: rc.autoSigne,
    chaineValide: rc.chaineValide, erreurValidation: rc.erreurValidation,
  }
}

const vide = (statut: ReleveCertificat['statut'], message: string): ReleveCertificat => ({
  statut, message,
  sujet: null, emetteur: null, nomsAlternatifs: [], numeroSerie: null, empreinte: null,
  algorithme: null, dateDebut: null, dateFin: null, autoSigne: null,
  chaineValide: null, erreurValidation: null,
})

// Les dates d'un certificat sont au format « MMM DD HH:MM:SS YYYY GMT ». `Date` les
// analyse correctement, mais une valeur illisible ne doit pas devenir « 1970 ».
function dateOuNull(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function nom(o: Record<string, unknown> | undefined): string | null {
  if (!o) return null
  const parts = ['CN', 'O', 'OU'].map(k => (typeof o[k] === 'string' ? `${k}=${o[k]}` : null)).filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/**
 * Lit le certificat présenté par `hote:port`. Ne lève jamais : un hôte injoignable est un
 * RÉSULTAT, pas une panne du scanner.
 */
export function scannerCertificat(
  hote: string,
  port = 443,
  timeoutMs = 8000,
): Promise<ReleveCertificat> {
  return new Promise((resolve) => {
    let fini = false

    // SNI interdit sur une adresse IP : `tls.connect` lève alors de façon SYNCHRONE, et sans
    // cette précaution l'exception s'échappait de la promesse — le scan d'un hôte désigné par
    // son IP ne se terminait jamais.
    const estIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(hote) || hote.includes(':')

    let socket: tls.TLSSocket
    try {
      socket = tls.connect({
        host: hote,
        port,
        // Sans SNI, un hôte mutualisé présente son certificat par défaut : on relèverait
        // la date d'un tout autre service.
        ...(estIP ? {} : { servername: hote }),
        rejectUnauthorized: false,
        timeout: timeoutMs,
      })
    }
    catch (e) {
      return resolve(vide('tls_erreur', e instanceof Error ? e.message : String(e)))
    }

    const rendre = (r: ReleveCertificat) => {
      if (fini) return
      fini = true
      try {
        socket.destroy()
      }
      catch { /* déjà fermé */ }
      resolve(r)
    }

    socket.once('secureConnect', () => {
      const c = socket.getPeerCertificate(true) as unknown as Record<string, unknown> | null
      if (!c || !Object.keys(c).length) {
        return rendre(vide('tls_erreur', 'Poignée de main TLS réussie, mais aucun certificat présenté.'))
      }
      const autorise = socket.authorized
      const erreur = socket.authorizationError ? String(socket.authorizationError) : null
      const sujet = nom(c.subject as Record<string, unknown>)
      const emetteur = nom(c.issuer as Record<string, unknown>)
      const alt = typeof c.subjectaltname === 'string'
        ? c.subjectaltname.split(',').map(s => s.trim().replace(/^DNS:/, '')).filter(Boolean)
        : []
      const dateFin = dateOuNull(c.valid_to)

      // « Invalide » couvre l'auto-signé et la chaîne incomplète. Un certificat expiré reste «
      // ok » du point de vue du scan : il a bien été LU, et c'est l'échéance — pas le statut de
      // scan — qui doit alerter.
      const statut: ReleveCertificat['statut'] = autorise || erreur === 'CERT_HAS_EXPIRED' ? 'ok' : 'invalide'

      rendre({
        statut,
        message: autorise
          ? `Certificat lu, chaîne valide — expire le ${dateFin ? dateFin.toISOString().slice(0, 10) : '?'}.`
          : `Certificat lu, mais non validé : ${erreur ?? 'motif inconnu'}.`,
        sujet,
        emetteur,
        nomsAlternatifs: alt,
        numeroSerie: typeof c.serialNumber === 'string' ? c.serialNumber : null,
        empreinte: typeof c.fingerprint256 === 'string' ? c.fingerprint256 : null,
        algorithme: typeof c.asn1Curve === 'string' ? c.asn1Curve : (typeof c.bits === 'number' ? `${c.bits} bits` : null),
        dateDebut: dateOuNull(c.valid_from),
        dateFin,
        // Un certificat dont le sujet et l'émetteur sont identiques est auto-signé.
        autoSigne: !!(sujet && emetteur && sujet === emetteur),
        chaineValide: autorise,
        erreurValidation: erreur,
      })
    })

    socket.once('timeout', () => rendre(vide('injoignable', `Aucune réponse de ${hote}:${port} en ${timeoutMs / 1000} s.`)))
    socket.once('error', (e: Error & { code?: string }) => {
      // Un refus de connexion ou un DNS muet dit « injoignable » ; tout le reste vient de la
      // couche TLS.
      const reseau = ['ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET']
      const statut = reseau.includes(e.code ?? '') ? 'injoignable' : 'tls_erreur'
      rendre(vide(statut, e.message))
    })
  })
}

/**
 * Analyse une liste collée ou un fichier importé. Formats acceptés, sans configuration : une
 * entrée par ligne, sous forme `hote`, `hote:port`, ou une URL complète.
 */
export function analyserListeSites(texte: string): { entrees: { hote: string, port: number, libelle: string | null }[], rejets: string[] } {
  const entrees: { hote: string, port: number, libelle: string | null }[] = []
  const rejets: string[] = []
  const vus = new Set<string>()

  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim()
    if (!ligne || ligne.startsWith('#')) continue

    const [cible, ...reste] = ligne.split(/[;,\t]/)
    const libelle = reste.join(' ').trim() || null
    let hote = (cible ?? '').trim()
    let port = 443

    // Une URL complète : on n'exige pas de l'utilisateur qu'il la découpe lui-même.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(hote)) {
      try {
        const u = new URL(hote)
        hote = u.hostname
        port = u.port ? Number(u.port) : (u.protocol === 'http:' ? 80 : 443)
      }
      catch { rejets.push(ligne); continue }
    }
    else if (hote.includes(':')) {
      const [h, p] = hote.split(':')
      hote = (h ?? '').trim()
      port = Number(p)
    }

    // Un nom d'hôte doit au moins ressembler à un nom d'hôte : sans ce garde-fou, une
    // ligne de titre de tableur deviendrait une cible à scanner.
    if (!hote || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(hote)
      || !Number.isInteger(port) || port < 1 || port > 65535) {
      rejets.push(ligne)
      continue
    }

    const cle = `${hote.toLowerCase()}:${port}`
    // Un doublon dans le fichier source n'est pas une erreur : on l'ignore en silence
    // plutôt que de créer deux fiches pour le même service.
    if (vus.has(cle)) continue
    vus.add(cle)
    entrees.push({ hote: hote.toLowerCase(), port, libelle })
  }

  return { entrees, rejets }
}

/**
 * LES ENREGISTREMENTS CAA qui s'appliquent à un hôte. Un enregistrement CAA dit quelles
 * autorités ont le droit d'émettre pour un nom.
 */
export async function releverCaa(hote: string, timeoutMs = 5000): Promise<string[] | null> {
  // Une adresse IP n'a pas d'enregistrement CAA : la question ne se pose pas.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hote) || hote.includes(':')) return null
  const labels = hote.toLowerCase().replace(/\.$/, '').split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    const nom = labels.slice(i).join('.')
    try {
      const enregistrements = await Promise.race([
        dns.resolveCaa(nom),
        new Promise<never>((_, rejeter) => setTimeout(() => rejeter(Object.assign(new Error('délai DNS dépassé'), { code: 'ETIMEOUT' })), timeoutMs)),
      ])
      if (enregistrements.length) {
        return enregistrements.map((r) => {
          const e = r as unknown as Record<string, unknown>
          const tag = ['issue', 'issuewild', 'iodef', 'contactemail', 'contactphone'].find(t => t in e) ?? 'inconnu'
          return `${tag} "${String(e[tag] ?? '')}"`
        })
      }
    }
    catch (e) {
      const code = (e as { code?: string }).code
      // Pas d'enregistrement à ce niveau : on remonte. Toute autre erreur : on ne sait pas.
      if (code === 'ENODATA' || code === 'ENOTFOUND' || code === 'NOTFOUND' || code === 'ENOTIMP') continue
      return null
    }
  }
  return []
}
