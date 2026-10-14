import { promises as dns } from 'node:dns'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { constat, domaineSurveille, serviceExpose } from '@catalogue/database/tables'
import { adressePrivee, certificatExpire, nomsDuReleve, resoutParJoker, type NomCt } from './ctDecouverte'
import { lireZone, nomsDeLaZone } from './zoneDns'
import { transfererZone } from './axfr'
import { dechiffrer } from './secrets'

// RELEVÉ D'UN DOMAINE — Certificate Transparency, zone DNS, puis la file des découvertes.

const DELAI_CT_MS = 180_000
const DELAI_DNS_MS = 5_000
const PAQUET_DNS = 16

export const cleDecouverte = (hote: string) => `catalogue:ct:${hote}`

export type ComptesSource = {
  noms: number
  proposes: number
  nonResolus: number
  prives: number
  /** Dernier certificat connu expiré : sites probablement oubliés. */
  expires: number
  /** Répondent à l'adresse du joker DNS : proposés, existence à confirmer. */
  parJoker: number
  /** Enregistrements joker `*` de la zone : comptés, pas proposés. */
  jokers: number
  /** CNAME de la zone dont la cible ne résout pas : risque de prise de contrôle du nom. */
  cnamePendants: number
  nouveaux: number
  aValider: number
  dejaInventories: number
}

const vide = (): ComptesSource => ({
  noms: 0, proposes: 0, nonResolus: 0, prives: 0, expires: 0, parJoker: 0, jokers: 0, cnamePendants: 0, nouveaux: 0, aValider: 0, dejaInventories: 0,
})

type Candidat = { hote: string, detail: string, reference: string, preuve: string | null }

export async function lireCertificateTransparency(domaine: string): Promise<unknown[]> {
  // TOUT L'HISTORIQUE, certificats expirés compris : un site encore en DNS dont le dernier
  // certificat a expiré est précisément un site oublié. Le tri se fait ensuite par le DNS.
  const url = `https://crt.sh/?q=${encodeURIComponent(`%.${domaine}`)}&output=json&deduplicate=Y`
  let r: Response
  try {
    r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Catalogue-DSI/1.0 (inventaire interne)' },
      signal: AbortSignal.timeout(DELAI_CT_MS),
      redirect: 'error',
    })
  }
  catch (e) {
    throw new Error(`crt.sh injoignable pour ${domaine} — ${e instanceof Error ? e.message : String(e)}. Le service est souvent surchargé : relancer plus tard.`, { cause: e })
  }
  if (!r.ok) throw new Error(`crt.sh a répondu HTTP ${r.status} pour ${domaine}. Le service est souvent surchargé : relancer plus tard.`)
  const texte = await r.text()
  try {
    const j = JSON.parse(texte) as unknown
    if (Array.isArray(j)) return j
  }
  catch { /* réponse non JSON, traitée ci-dessous */ }
  throw new Error(`crt.sh a rendu une réponse illisible pour ${domaine} : ${texte.slice(0, 80)}`)
}

/** Les adresses d'un nom, ou `null` s\'il ne résout pas. */
async function resoudre(hote: string): Promise<string[] | null> {
  try {
    const r = await Promise.race([
      dns.lookup(hote, { all: true }),
      new Promise<never>((_, rejeter) => setTimeout(() => rejeter(new Error('délai DNS')), DELAI_DNS_MS)),
    ])
    return r.length ? r.map(x => x.address) : null
  }
  catch { return null }
}

/** Range les candidats dans la file des découvertes. Écrit une fois pour toutes les sources. */
async function rangerCandidats(candidats: readonly Candidat[], comptes: ComptesSource, maintenant: Date): Promise<void> {
  const services = await db.select({ id: serviceExpose.id, hote: serviceExpose.hote }).from(serviceExpose)
  const parHote = new Map(services.map(s => [s.hote.toLowerCase(), s.id]))
  for (const c of candidats) {
    comptes.proposes++
    const serviceId = parHote.get(c.hote) ?? null
    const cleStable = cleDecouverte(c.hote)
    const [e] = await db.select({ id: constat.id, traitement: constat.traitement }).from(constat)
      .where(eq(constat.cleStable, cleStable)).limit(1)
    if (!e) {
      await db.insert(constat).values({
        cleStable, actifHote: c.hote, actifPort: null, actifUrl: null, serviceId,
        categorie: 'decouverte', gravite: 'info',
        titre: `Site découvert : ${c.hote}`,
        detail: c.detail, preuve: c.preuve, reference: c.reference,
        premierReleveLe: maintenant, dernierReleveLe: maintenant,
        traitement: serviceId ? 'deja_inventorie' : 'a_valider',
        traitementMotif: serviceId ? 'Hôte déjà inscrit dans les sites et services.' : null,
      }).onConflictDoNothing()
      comptes.nouveaux++
      if (serviceId) comptes.dejaInventories++
      else comptes.aValider++
      continue
    }
    // UNE DÉCOUVERTE ÉCARTÉE LE RESTE : elle a été décidée. Une découverte encore à valider
    // dont l'hôte a été inscrit entre-temps passe en « déjà inventoriée ».
    await db.update(constat).set({
      detail: c.detail, reference: c.reference, dernierReleveLe: maintenant, observations: sql`${constat.observations} + 1`,
      ...(serviceId ? { serviceId } : {}),
      ...(e.traitement === 'a_valider' && serviceId
        ? { traitement: 'deja_inventorie' as const, traitementMotif: 'Hôte inscrit dans les sites et services depuis sa découverte.' }
        : {}),
      updatedAt: maintenant,
    }).where(eq(constat.id, e.id))
  }
}

async function candidatsCt(domaine: string, comptes: ComptesSource): Promise<Candidat[]> {
  const noms: NomCt[] = nomsDuReleve(await lireCertificateTransparency(domaine), domaine)
  // Le domaine lui-même, même sans certificat à son nom : c'est souvent le site principal.
  if (!noms.some(n => n.hote === domaine)) noms.unshift({ hote: domaine, emetteurs: [], finValidite: null, certificats: 0 })
  comptes.noms = noms.length
  // LE JOKER DNS, mesuré avant de trier : ce que résout un nom que personne n'a créé.
  const joker = await resoudre(`catalogue-verification-joker-${crypto.randomUUID().slice(0, 8)}.${domaine}`)
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const candidats: Candidat[] = []

  for (let i = 0; i < noms.length; i += PAQUET_DNS) {
    const lot = await Promise.all(noms.slice(i, i + PAQUET_DNS).map(async n => ({ ...n, adresses: await resoudre(n.hote) })))
    for (const n of lot) {
      // SEULS LES NOMS QUI RÉSOLVENT sont proposés : un certificat peut couvrir un nom retiré
      // du DNS depuis. Ils sont comptés.
      if (!n.adresses) {
        comptes.nonResolus++
        continue
      }
      const parJoker = n.hote !== domaine && resoutParJoker(n.adresses, joker)
      if (parJoker) comptes.parJoker++
      const expire = certificatExpire(n.finValidite, aujourdhui)
      if (expire) comptes.expires++
      const prive = n.adresses.every(adressePrivee)
      if (prive) comptes.prives++
      candidats.push({
        hote: n.hote,
        reference: 'crt.sh',
        preuve: `https://crt.sh/?q=${encodeURIComponent(n.hote)}`,
        detail: [
          n.certificats ? `${n.certificats} certificat(s) dans Certificate Transparency` : 'Nom du domaine lui-même',
          n.finValidite ? (expire ? `DERNIER CERTIFICAT EXPIRÉ le ${n.finValidite} — site probablement oublié` : `valide jusqu'au ${n.finValidite}`) : null,
          n.emetteurs.length ? `émis par ${n.emetteurs.join(', ')}` : null,
        ].filter(Boolean).join(', ')
          + `. Résout vers ${n.adresses.slice(0, 4).join(', ')}${prive ? ' — adresse privée : nom interne publié, invisible depuis Internet' : ''}.`
          + (parJoker ? ' Même adresse que le joker DNS du domaine : le DNS seul ne prouve pas que ce site existe encore, à confirmer.' : ''),
      })
    }
  }
  return candidats
}

async function candidatsZone(domaine: string, texte: string, comptes: ComptesSource, origine: 'transfert' | 'import'): Promise<Candidat[]> {
  const { enregistrements, jokers } = lireZone(texte, domaine)
  comptes.jokers = jokers
  const noms = nomsDeLaZone(enregistrements)
  comptes.noms = noms.length
  const source = origine === 'transfert' ? 'transfert de zone' : 'fichier de zone importé'
  const candidats: Candidat[] = []
  for (let i = 0; i < noms.length; i += PAQUET_DNS) {
    const lot = await Promise.all(noms.slice(i, i + PAQUET_DNS).map(async (n) => {
      // Un nom sans adresse propre, seulement un alias : on suit l'alias par le DNS.
      const suivies = !n.adresses.length && n.cnames.length ? await resoudre(n.hote) : null
      return { ...n, suivies }
    }))
    for (const n of lot) {
      const adresses = n.adresses.length ? n.adresses : (n.suivies ?? [])
      // UN CNAME PENDANT reste proposé : un nom qui pointe vers un service disparu peut être
      // repris par qui recrée ce service. C'est un site à retirer, pas un nom à oublier.
      const pendant = !adresses.length && n.cnames.length > 0
      if (pendant) comptes.cnamePendants++
      const prive = adresses.length > 0 && adresses.every(adressePrivee)
      if (prive) comptes.prives++
      candidats.push({
        hote: n.hote,
        reference: 'zone DNS',
        preuve: null,
        detail: `Présent dans la zone DNS (${source})`
          + (n.adresses.length ? ` : ${n.adresses.slice(0, 4).join(', ')}` : '')
          + (n.cnames.length ? ` ; alias vers ${n.cnames.slice(0, 2).join(', ')}` : '')
          + (pendant ? ' — la cible de l\'alias ne résout pas : CNAME PENDANT, risque de prise de contrôle du nom' : '')
          + (prive ? ' — adresse privée : nom interne' : '')
          + '.',
      })
    }
  }
  return candidats
}

const messageCt = (c: ComptesSource) => `Certificate Transparency : ${c.noms} nom(s), ${c.proposes} proposé(s)`
  + `${c.prives ? ` (dont ${c.prives} en adresse privée)` : ''}`
  + `${c.expires ? `, dont ${c.expires} avec un dernier certificat expiré` : ''}`
  + `${c.parJoker ? `, ${c.parJoker} à l'adresse du joker DNS (à confirmer)` : ''}, ${c.nonResolus} ne résolvent plus ; `
  + `${c.nouveaux} nouvelle(s) découverte(s) (${c.aValider} à valider, ${c.dejaInventories} déjà inventoriée(s)).`

const messageZone = (c: ComptesSource, origine: 'transfert' | 'import') => `Zone DNS (${origine === 'transfert' ? 'transfert' : 'fichier importé'}) : ${c.noms} nom(s)`
  + `${c.jokers ? `, ${c.jokers} enregistrement(s) joker` : ''}`
  + `${c.cnamePendants ? `, ${c.cnamePendants} CNAME PENDANT(S)` : ''}`
  + `${c.prives ? `, ${c.prives} en adresse privée` : ''} ; `
  + `${c.nouveaux} nouvelle(s) découverte(s) (${c.aValider} à valider, ${c.dejaInventories} déjà inventoriée(s)).`

/**
 * Relève un domaine : Certificate Transparency, puis le transfert de zone s'il est configuré.
 */
export async function releverDomaine(id: string): Promise<{ ct: ComptesSource | null, zone: ComptesSource | null }> {
  const [d] = await db.select().from(domaineSurveille).where(eq(domaineSurveille.id, id)).limit(1)
  if (!d) throw new Error('Domaine introuvable.')
  await db.update(domaineSurveille).set({ dernierStatut: 'en_cours', updatedAt: new Date() }).where(eq(domaineSurveille.id, id))

  const maintenant = new Date()
  const messages: string[] = []
  const comptes: { ct: ComptesSource | null, zone: ComptesSource | null } = { ct: null, zone: null }
  let reussites = 0

  try {
    const c = vide()
    await rangerCandidats(await candidatsCt(d.nom, c), c, maintenant)
    comptes.ct = c
    messages.push(messageCt(c))
    reussites++
  }
  catch (e) {
    messages.push(`Certificate Transparency en échec : ${e instanceof Error ? e.message : String(e)}`)
  }

  if (d.serveurDns) {
    try {
      const secret = dechiffrer(d.tsigSecret)
      const tsig = d.tsigNom && secret ? { nom: d.tsigNom, algorithme: d.tsigAlgorithme ?? 'hmac-sha256', secret } : undefined
      const texte = await transfererZone(d.nom, d.serveurDns, tsig)
      const c = vide()
      await rangerCandidats(await candidatsZone(d.nom, texte, c, 'transfert'), c, maintenant)
      comptes.zone = c
      messages.push(messageZone(c, 'transfert'))
      reussites++
    }
    catch (e) {
      messages.push(`Transfert de zone en échec : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const message = messages.join('\n')
  await db.update(domaineSurveille).set({
    ...(reussites ? { dernierReleveLe: maintenant } : {}),
    dernierStatut: reussites ? 'ok' : 'erreur', dernierMessage: message, dernierComptes: comptes, updatedAt: new Date(),
  }).where(eq(domaineSurveille.id, id))
  if (!reussites) throw new Error(message)
  return comptes
}

/** Importe un fichier de zone (format BIND) pour un domaine. */
export async function importerZone(id: string, texte: string): Promise<{ comptes: ComptesSource, message: string }> {
  const [d] = await db.select().from(domaineSurveille).where(eq(domaineSurveille.id, id)).limit(1)
  if (!d) throw new Error('Domaine introuvable.')
  const c = vide()
  const candidats = await candidatsZone(d.nom, texte, c, 'import')
  if (!c.noms) throw new Error(`Aucun enregistrement A, AAAA ou CNAME de ${d.nom} dans ce fichier : est-ce la bonne zone ?`)
  await rangerCandidats(candidats, c, new Date())
  const message = messageZone(c, 'import')
  const precedents = (d.dernierComptes && typeof d.dernierComptes === 'object' ? d.dernierComptes : {}) as Record<string, unknown>
  await db.update(domaineSurveille).set({
    dernierMessage: `${message}\n${d.dernierMessage ?? ''}`.trim(),
    dernierComptes: { ...precedents, zoneImportee: c },
    updatedAt: new Date(),
  }).where(eq(domaineSurveille.id, id))
  return { comptes: c, message }
}

const EN_COURS_MORT_MS = 30 * 60 * 1000
export const estEnCours = (d: { dernierStatut: string, updatedAt: Date | null }) =>
  d.dernierStatut === 'en_cours' && !!d.updatedAt && Date.now() - new Date(d.updatedAt).getTime() < EN_COURS_MORT_MS

/**
 * Relève, UN À LA FOIS, les domaines actifs dont le dernier relevé date de plus de `ageMs`.
 */
export async function releverDomainesEchus(ageMs: number): Promise<{ releves: number, echecs: number }> {
  const domaines = await db.select().from(domaineSurveille).where(and(eq(domaineSurveille.actif, true)))
  let releves = 0
  let echecs = 0
  for (const d of domaines) {
    if (estEnCours(d)) continue
    if (d.dernierReleveLe && Date.now() - new Date(d.dernierReleveLe).getTime() < ageMs) continue
    try {
      await releverDomaine(d.id)
      releves++
    }
    catch {
      echecs++
    }
  }
  return { releves, echecs }
}
