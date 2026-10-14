import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurAudit, constat, pageCible, scriptPage, serviceExpose } from '@catalogue/database/tables'
import { dechiffrer } from './secrets'
import { envoyerPerimetre, recupererResultats, type Perimetre } from './auditClient'
import { traduireResultats } from './artemis'
import { dateDeRetest, integrer, lireConstat, lireResultats, type ConstatRecu } from './constatCycle'
import { comparerScripts, constatDEcart, lirePage } from './integriteScripts'
import { classementDuConstat } from './classement'

// SYNCHRONISATION AVEC LE MOTEUR D'AUDIT — sur le modèle de harfanglabSync.

export const SINGLETON_AUDIT = 'connecteur-audit-singleton'

/**
 * Les résultats d'Artemis, rendus sous la forme que produit `lireResultats` — de sorte que la
 * suite de la synchronisation ignore d'où ils viennent.
 */
function lireArtemis(corps: unknown, curseur: Date | null) {
  const t = traduireResultats(corps, curseur)
  return {
    constats: t.constats,
    actifsReleves: t.actifsReleves.map(a => ({ hote: a.hote, port: a.port, releveLe: new Date(a.releve_le) })),
    jusquA: null,
    pagesBrutes: null,
    modulesInconnus: t.modulesInconnus,
  }
}

export async function lireConfigAudit() {
  const [c] = await db.select().from(connecteurAudit).where(eq(connecteurAudit.id, SINGLETON_AUDIT)).limit(1)
  if (c) return c
  await db.insert(connecteurAudit).values({ id: SINGLETON_AUDIT }).onConflictDoNothing()
  const [cree] = await db.select().from(connecteurAudit).where(eq(connecteurAudit.id, SINGLETON_AUDIT)).limit(1)
  return cree ?? null
}

/**
 * Le périmètre envoyé au moteur : domaines et plages DÉCLARÉS, actifs inventoriés et
 * surveillés, avec leurs pages cibles.
 */
export async function construirePerimetre(cfg: { domaines: string[] | null, plages: string[] | null }): Promise<Perimetre> {
  const [services, pages] = await Promise.all([
    db.select({ id: serviceExpose.id, hote: serviceExpose.hote, port: serviceExpose.port, classement: serviceExpose.classement })
      .from(serviceExpose).where(eq(serviceExpose.surveille, true)),
    db.select({ serviceId: pageCible.serviceId, url: pageCible.url }).from(pageCible),
  ])
  const parService = new Map<string, string[]>()
  for (const p of pages) parService.set(p.serviceId, [...(parService.get(p.serviceId) ?? []), p.url])
  return {
    version: 1,
    genere_le: new Date().toISOString(),
    domaines: cfg.domaines ?? [],
    plages: cfg.plages ?? [],
    actifs: services.map(s => ({ hote: s.hote.toLowerCase(), port: s.port, url: null, classement: s.classement ?? null, pages: parService.get(s.id) ?? [] })),
  }
}

export type CompteursAudit = {
  actifsEnvoyes: number
  recus: number
  crees: number
  misAJour: number
  dejaIntegres: number
  /** Refusés à la lecture. Les dix premiers motifs sont gardés : un refus sans motif ne se corrige pas. */
  rejetes: number
  motifsRejet: string[]
  reouverts: number
  retestes: number
  decouvertesAValider: number
  decouvertesDejaInventoriees: number
  pagesRelevees: number
  pagesRejetees: number
  /** Pages rendues par le moteur sans être déclarées ici : rien à quoi les comparer. */
  pagesInconnues: number
  ecartsIntegrite: number
  /** Propositions de classement reçues et posées sur la fiche, à valider. */
  classementsProposes: number
}

export async function synchroniserAudit(): Promise<CompteursAudit> {
  const cfg = await lireConfigAudit()
  const jeton = dechiffrer(cfg?.jeton)
  if (!cfg?.url || !jeton) throw new Error('Moteur d\'audit non configuré (adresse et jeton requis).')

  await db.update(connecteurAudit).set({ dernierStatut: 'en_cours' }).where(eq(connecteurAudit.id, SINGLETON_AUDIT))
  const comptes: CompteursAudit = {
    actifsEnvoyes: 0, recus: 0, crees: 0, misAJour: 0, dejaIntegres: 0, rejetes: 0, motifsRejet: [],
    reouverts: 0, retestes: 0, decouvertesAValider: 0, decouvertesDejaInventoriees: 0,
    pagesRelevees: 0, pagesRejetees: 0, pagesInconnues: 0, ecartsIntegrite: 0, classementsProposes: 0,
  }
  const noterRejet = (motif: string) => {
    if (comptes.motifsRejet.length < 10) comptes.motifsRejet.push(motif)
  }

  try {
    const acces = { url: cfg.url, jeton, dialecte: cfg.dialecte }
    const perimetre = await construirePerimetre(cfg)
    comptes.actifsEnvoyes = perimetre.actifs.length
    await envoyerPerimetre(acces, perimetre)

    const corps = await recupererResultats(acces, cfg.curseur)
    // DEUX DIALECTES, UNE SEULE VALIDATION. Qu'ils viennent d'un moteur qui porte le contrat ou
    // d'Artemis traduit, les constats passent ensuite par le même `lireConstat` : la traduction
    // n'a pas le droit de contourner les contrôles de format.
    const res: {
      constats: unknown[]
      actifsReleves: { hote: string, port: number | null, releveLe: Date }[] | null
      jusquA: Date | null
      pagesBrutes: unknown[] | null
      modulesInconnus?: Record<string, number>
    } = cfg.dialecte === 'artemis' ? lireArtemis(corps, cfg.curseur) : lireResultats(corps)
    comptes.recus = res.constats.length
    // Un module qu'on ne sait pas ranger est COMPTÉ ET NOMMÉ, jamais rangé au mieux : le
    // classer d'office ferait entrer dans l'inventaire des constats qu'on ne retrouverait plus.
    for (const [module, n] of Object.entries(res.modulesInconnus ?? {})) {
      noterRejet(`module Artemis non rangé : ${module} (${n})`)
    }
    const lus: ConstatRecu[] = []
    for (const brut of res.constats) {
      const l = lireConstat(brut)
      if (l.ok) {
        lus.push(l.constat)
        continue
      }
      comptes.rejetes++
      noterRejet(l.motif)
    }
    // Dans l'ordre des relevés : deux passages du même constat dans une réponse s'intègrent
    // comme deux observations successives, pas dans le désordre.
    lus.sort((a, b) => a.releveLe.getTime() - b.releveLe.getTime())

    const services = await db.select({ id: serviceExpose.id, hote: serviceExpose.hote, port: serviceExpose.port }).from(serviceExpose)
    const parId = new Map(services.map(s => [s.id, s]))
    const parHotePort = new Map(services.map(s => [`${s.hote.toLowerCase()}|${s.port}`, s.id]))
    const parHote = new Map<string, string>()
    for (const s of services) if (!parHote.has(s.hote.toLowerCase())) parHote.set(s.hote.toLowerCase(), s.id)
    // Sans port, le constat porte sur l'hôte : il se rattache au premier service de cet hôte.
    const serviceDe = (a: ConstatRecu['actif']) =>
      (a.port === null ? parHote.get(a.hote) : parHotePort.get(`${a.hote}|${a.port}`)) ?? null

    const cles = [...new Set(lus.map(c => c.cleStable))]
    const existants = new Map<string, typeof constat.$inferSelect>()
    for (let i = 0; i < cles.length; i += 500) {
      for (const e of await db.select().from(constat).where(inArray(constat.cleStable, cles.slice(i, i + 500)))) {
        existants.set(e.cleStable, e)
      }
    }

    const aujourdhui = new Date().toISOString().slice(0, 10)
    const vues = new Set<string>()

    /**
     * RANGE UN CONSTAT — création, ou intégration à l'existant. Écrit une fois pour les
     * constats du moteur ET les écarts d'intégrité calculés ici : deux chemins d'écriture
     * auraient deux règles d'idempotence, et l'un doublonnerait.
     */
    const ranger = async (c: ConstatRecu, serviceId: string | null) => {
      vues.add(c.cleStable)
      const e = existants.get(c.cleStable)
        ?? (await db.select().from(constat).where(eq(constat.cleStable, c.cleStable)).limit(1))[0]

      if (!e) {
        // UNE DÉCOUVERTE N'EST JAMAIS INSCRITE D'OFFICE. Elle attend une décision — sauf si
        // l'hôte est déjà inventorié, auquel cas il n'y a rien à découvrir.
        const traitement = c.categorie !== 'decouverte' ? null : serviceId ? 'deja_inventorie' as const : 'a_valider' as const
        const [cree] = await db.insert(constat).values({
          cleStable: c.cleStable, actifHote: c.actif.hote, actifPort: c.actif.port, actifUrl: c.actif.url, serviceId,
          categorie: c.categorie, gravite: c.gravite, titre: c.titre, detail: c.detail, preuve: c.preuve, reference: c.reference,
          premierReleveLe: c.releveLe, dernierReleveLe: c.releveLe,
          traitement,
          traitementMotif: traitement === 'deja_inventorie' ? 'Hôte déjà inscrit dans les sites et services.' : null,
        }).onConflictDoNothing().returning()
        if (!cree) return
        existants.set(c.cleStable, cree)
        comptes.crees++
        if (traitement === 'a_valider') comptes.decouvertesAValider++
        if (traitement === 'deja_inventorie') comptes.decouvertesDejaInventoriees++
        return
      }

      const i = integrer({
        statut: e.statut, dernierReleveLe: e.dernierReleveLe, corrigeLe: e.corrigeLe,
        retesteLe: e.retesteLe, acceptationEcheance: e.acceptationEcheance, observations: e.observations,
      }, c, aujourdhui)
      if (i.action === 'ignorer') {
        comptes.dejaIntegres++
        return
      }
      const [maj] = await db.update(constat)
        .set({ ...i.patch, serviceId: serviceId ?? e.serviceId, updatedAt: new Date() } as never)
        .where(eq(constat.id, e.id)).returning()
      if (maj) existants.set(c.cleStable, maj)
      comptes.misAJour++
      if (i.reouvert) comptes.reouverts++
    }

    /**
     * LA PROPOSITION DE CLASSEMENT se pose sur la fiche, À CÔTÉ du classement validé : elle ne
     * le remplace pas et ne déclenche rien.
     */
    const proposerClassement = async (serviceId: string, c: ConstatRecu) => {
      const propose = classementDuConstat(c)
      if (!propose) {
        noterRejet(`classement illisible dans le constat ${c.cleStable}`)
        return
      }
      const maj = await db.update(serviceExpose).set({
        classementPropose: propose, classementPreuve: c.preuve ?? c.detail, classementProposeLe: c.releveLe, updatedAt: new Date(),
      }).where(and(
        eq(serviceExpose.id, serviceId),
        or(isNull(serviceExpose.classementProposeLe), lt(serviceExpose.classementProposeLe, c.releveLe)),
      )).returning({ id: serviceExpose.id })
      if (maj.length) comptes.classementsProposes++
    }

    for (const c of lus) {
      const serviceId = serviceDe(c.actif)
      await ranger(c, serviceId)
      if (c.categorie === 'classement' && serviceId) await proposerClassement(serviceId, c)
    }

    // --- PAGES CIBLES : scripts servis, comparés à la référence validée ------------------
    if (res.pagesBrutes?.length) {
      const cibles = await db.select().from(pageCible)
      const parUrl = new Map(cibles.map(p => [p.url, p]))
      for (const brut of res.pagesBrutes) {
        const l = lirePage(brut)
        if (!l.ok) {
          comptes.pagesRejetees++
          noterRejet(l.motif)
          continue
        }
        const page = l.page
        const cible = parUrl.get(page.url)
        if (!cible) {
          comptes.pagesInconnues++
          continue
        }
        // Idempotent, comme les constats : un relevé déjà intégré ne se rejoue pas.
        if (cible.dernierReleveLe && page.releveLe.getTime() <= cible.dernierReleveLe.getTime()) continue

        await db.transaction(async (tx) => {
          await tx.delete(scriptPage).where(and(eq(scriptPage.pageId, cible.id), eq(scriptPage.role, 'observe')))
          if (page.scripts.length) {
            await tx.insert(scriptPage).values(page.scripts.map(s => ({
              pageId: cible.id, role: 'observe' as const, src: s.src, domaine: s.domaine,
              externe: s.externe, sha256: s.sha256, integrity: s.integrity, releveLe: page.releveLe,
            })))
          }
          // `''` et non `null` : la page a été relevée, et l'en-tête y était absent.
          await tx.update(pageCible).set({ dernierReleveLe: page.releveLe, csp: page.csp ?? '', updatedAt: new Date() })
            .where(eq(pageCible.id, cible.id))
        })
        comptes.pagesRelevees++

        // SANS RÉFÉRENCE VALIDÉE, AUCUN ÉCART. Comparer au premier relevé reviendrait à
        // valider d'office ce qui était servi ce jour-là — y compris un skimmer déjà en place.
        if (!cible.referenceValideeLe) continue
        const reference = await db.select().from(scriptPage).where(and(eq(scriptPage.pageId, cible.id), eq(scriptPage.role, 'reference')))
        const svc = parId.get(cible.serviceId)
        for (const ecart of comparerScripts(reference, page.scripts)) {
          const d = constatDEcart(cible, ecart)
          await ranger({
            ...d,
            actif: { hote: (svc?.hote ?? new URL(cible.url).hostname).toLowerCase(), port: svc?.port ?? null, url: cible.url },
            releveLe: page.releveLe,
          }, cible.serviceId)
          comptes.ecartsIntegrite++
        }
      }
    }

    // CONFIRMATION DES CORRECTIONS. Seulement si le moteur dit quels actifs il a relevés :
    // l'absence d'un constat dans une réponse ne prouve pas qu'on l'a cherché.
    if (res.actifsReleves?.length) {
      for (const c of await db.select().from(constat).where(eq(constat.statut, 'corrige'))) {
        const d = dateDeRetest(c, res.actifsReleves, vues)
        if (!d) continue
        await db.update(constat).set({ statut: 'reteste', retesteLe: d, updatedAt: new Date() }).where(eq(constat.id, c.id))
        comptes.retestes++
      }
    }

    // LE CURSEUR N'AVANCE PAS SUR UN REJET. Des constats ou des pages refusés à la lecture
    // (format d'une autre version) seraient sinon perdus : la période sauterait, et ils ne
    // seraient jamais redemandés.
    const dernier = lus.length ? lus[lus.length - 1]!.releveLe : null
    const curseur = comptes.rejetes || comptes.pagesRejetees ? cfg.curseur : (res.jusquA ?? dernier ?? cfg.curseur)
    const rejetsTotal = comptes.rejetes + comptes.pagesRejetees
    const message = `${comptes.actifsEnvoyes} actif(s) envoyé(s) ; ${comptes.recus} constat(s) reçu(s) — `
      + `${comptes.crees} nouveau(x), ${comptes.misAJour} mis à jour, ${comptes.reouverts} rouvert(s), `
      + `${comptes.retestes} correction(s) confirmée(s) ; `
      + `${comptes.pagesRelevees} page(s) cible(s) relevée(s), ${comptes.ecartsIntegrite} écart(s) d'intégrité`
      + `${rejetsTotal ? ` ; ${rejetsTotal} REJETÉ(S) à la lecture` : ''} ; `
      + `${comptes.decouvertesAValider} découverte(s) à valider, ${comptes.classementsProposes} classement(s) proposé(s).`
    await db.update(connecteurAudit).set({
      dernierSyncAt: new Date(), dernierStatut: 'ok', dernierMessage: message,
      dernierComptes: comptes, curseur, updatedAt: new Date(),
    }).where(eq(connecteurAudit.id, SINGLETON_AUDIT))
    return comptes
  }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.update(connecteurAudit).set({
      dernierStatut: 'erreur', dernierMessage: message, updatedAt: new Date(),
    }).where(eq(connecteurAudit.id, SINGLETON_AUDIT))
    throw e
  }
}
