import { Elysia, t } from 'elysia'
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  application, certificat, pageCible, personne, releveActif, serveur, serviceExpose, serviceTechnologie, serviceType, technologie, tiers,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { scanner } from '../utils/scanWeb'
import { analyserListeSites, champsLisibles, releverCaa, scannerCertificat } from '../utils/certificatScan'
import { autoriteDe } from '../utils/autoriteCertificat'
import { creerBalayage } from '../utils/balayage'
import { evolution } from '../utils/evolutionReleves'
import { CLASSEMENTS, moisDeRevue, SIGNALEMENTS, signalements } from '../utils/classement'
import { categorieDe, enrichirTechnologie } from '../utils/eolTechnologie'
import { etatCertificat } from '../utils/certificatEtat'
import { ETATS_MISE_A_JOUR, etatDuService, etatMiseAJour, type EtatMiseAJour } from '../utils/versions'
import { bornes as bornesEol, pireStatutEol, statutEol, STATUTS_EOL, type StatutEol } from './eol'
import { paginerEnMemoire, SCHEMA_PAGINATION } from '../utils/pagination'
import { partitionEnMemoire } from '../utils/partition'
import { cleTechnologie } from '../utils/eolApi'

// SITES ET SERVICES — la fiche, le scan, et l'état d'ensemble. MONTÉ SUR LE MÊME PRÉFIXE QUE LE
// CATALOGUE GÉNÉRIQUE, mais sur des chemins qui ne se recoupent pas.

/** L'état de support d\'une technologie, avec sa réserve. */
function etatsDe(
  t2: { finDeVie: unknown, finDeVieEtendue: unknown, sourceEol: string | null,
    derniereVersionBranche: string | null, brancheMaintenue: boolean | null } | null,
  versionInstallee: string | null,
  aujourdhui: string,
  dansUnAn: string,
): { support: StatutEol | null, miseAJour: EtatMiseAJour } {
  if (!t2) {
    // La technologie n'est pas au référentiel : ni support ni retard ne se constatent.
    // `null` et non `inconnu` — la nuance compte, `inconnu` signifie « rapproché, sans date ».
    return { support: null, miseAJour: 'version_inconnue' }
  }
  return {
    support: statutEol({
      finDeVie: t2.finDeVie ? String(t2.finDeVie) : null,
      finDeVieEtendue: t2.finDeVieEtendue ? String(t2.finDeVieEtendue) : null,
      sourceEol: t2.sourceEol,
    }, aujourdhui, dansUnAn),
    miseAJour: etatMiseAJour(versionInstallee, t2.derniereVersionBranche, t2.brancheMaintenue),
  }
}

/**
 * Relève le certificat d'un service et le tient à jour. Le certificat se rattache par (hote,
 * port) — la clé fonctionnelle des deux tables.
 */
async function releverCertificat(service: { hote: string, port: number }) {
  const [rc, caa] = await Promise.all([scannerCertificat(service.hote, service.port), releverCaa(service.hote)])
  // RIEN À LIRE, RIEN À ÉCRIRE. Un hôte injoignable rend un relevé vide : l'écrire tel quel
  // effaçait la date d'expiration connue, et l'échéance avec.
  const champs = { statut: rc.statut, ...champsLisibles(rc), ...(caa !== null ? { caa } : {}) }

  const [existant] = await db.select({ id: certificat.id }).from(certificat)
    .where(and(eq(certificat.hote, service.hote), eq(certificat.port, service.port))).limit(1)

  if (existant) {
    await db.update(certificat).set({
      ...champs, dernierStatut: rc.statut, dernierMessage: rc.message,
      dernierScanAt: new Date(), updatedAt: new Date(),
    } as never).where(eq(certificat.id, existant.id))
  }
  else {
    await db.insert(certificat).values({
      hote: service.hote, port: service.port, source: 'scan', surveille: true,
      ...champs, dernierStatut: rc.statut, dernierMessage: rc.message,
      dernierScanAt: new Date(),
    } as never).onConflictDoNothing()
  }
  return { statut: rc.statut, dateFin: rc.dateFin, empreinte: rc.empreinte }
}

/**
 * RELÈVE UN SERVICE ET ENREGISTRE LE RÉSULTAT — écrite UNE FOIS. Les deux routes de scan — un
 * service, tous les services — faisaient ce travail chacune de leur côté, et la seconde
 * OUBLIAIT les détections : elle enregistrait la date et les en-têtes, puis jetait les
 * technologies.
 */
async function releverEtEnregistrer(service: { id: string, hote: string, port: number }) {
  const r = await scanner(service.hote, service.port)

  // LE CERTIFICAT DANS LE MÊME PASSAGE. Le relever séparément obligeait à lancer deux actions
  // pour connaître l'état d'un service, et laissait la fiche à moitié remplie entre les deux.
  const certificat = service.port === 80 || service.port === 8080
    ? null
    : await releverCertificat(service)

  await db.update(serviceExpose).set({
    dernierScanAt: new Date(),
    dernierStatut: r.ok ? 'ok' : 'echec',
    dernierMessage: r.message,
    codeHttp: r.codeHttp,
    // ÉCHEC : les en-têtes repassent à `null`, pas à `false`. Un relevé qui n'a pas abouti
    // ne dit pas que les en-têtes sont absents.
    hsts: r.enTetes ? r.enTetes.hsts : null,
    csp: r.enTetes ? r.enTetes.csp : null,
    xFrameOptions: r.enTetes ? r.enTetes.xFrameOptions : null,
    referrerPolicy: r.enTetes ? r.enTetes.referrerPolicy : null,
    updatedAt: new Date(),
  }).where(eq(serviceExpose.id, service.id))

  // L'HISTORIQUE, à chaque passage, échec compris. L'état courant ci-dessus s'écrase ; cette
  // ligne-ci reste, et c'est elle qui permet de dire ce qui a changé.
  await db.insert(releveActif).values({
    serviceId: service.id,
    statut: r.ok ? 'ok' : 'echec',
    message: r.message,
    codeHttp: r.codeHttp,
    technologies: r.ok ? r.detections.map(d => ({ produit: d.produit, version: d.version, certitude: d.certitude })) : null,
    enTetes: r.ok && r.enTetes ? r.enTetes : null,
    certificatStatut: certificat?.statut ?? null,
    certificatEmpreinte: certificat?.empreinte ?? null,
    certificatDateFin: certificat?.dateFin ?? null,
  })

  // Un relevé en échec NE VIDE PAS les détections précédentes : elles vieillissent avec leur
  // date, comme le miroir Sniff.
  if (!r.ok) return { ok: false as const, message: r.message, detections: 0, certificat }

  for (const d of r.detections) {
    const cle = d.technologieCle ?? (d.version ? cleTechnologie(d.produit, d.version) : null)

    // ENRICHISSEMENT IMMÉDIAT. Détecter « WordPress 6.4.2 » sans aller chercher sa fin de
    // support laisserait la fiche avec un « support inconnu » qui n'est pas la vérité :
    // l'information existe, elle n'a simplement pas été demandée.
    const technologieId = cle
      ? await enrichirTechnologie(cle, d.produit, d.version, categorieDe(d.produit))
      : null

    await db.insert(serviceTechnologie).values({
      serviceId: service.id, produit: d.produit, version: d.version,
      technologieCle: cle, technologieId,
      certitude: d.certitude, source: d.source, detecteLe: new Date(),
    }).onConflictDoUpdate({
      target: [serviceTechnologie.serviceId, serviceTechnologie.produit],
      set: {
        version: d.version, technologieCle: cle, technologieId,
        certitude: d.certitude, source: d.source, detecteLe: new Date(), updatedAt: new Date(),
      },
    })
  }
  return { ok: true as const, message: null, detections: r.detections.length, certificat }
}

// LE BALAYAGE DE TOUS LES SERVICES. Quatre à la fois : chaque service coûte jusqu'à sept
// requêtes HTTP et une poignée de main TLS, et un balayage plus large ressemble à une attaque
// pour les pare-feu — ceux de l'établissement compris.
const PAQUET_BALAYAGE = 4
const PLAFOND_BALAYAGE = 600
const BALAYAGE = creerBalayage({ paquet: PAQUET_BALAYAGE, plafond: PLAFOND_BALAYAGE })

/**
 * Lance le balayage SI quelque chose est à relever : un service surveillé jamais relevé, ou
 * relevé il y a plus de `ageMs`.
 */
export async function balayerSiDu(ageMs: number): Promise<{ lance: boolean, aRelever: number }> {
  const services = await db.select({ id: serviceExpose.id, hote: serviceExpose.hote, port: serviceExpose.port, dernierScanAt: serviceExpose.dernierScanAt })
    .from(serviceExpose).where(eq(serviceExpose.surveille, true))
    .orderBy(sql`${serviceExpose.dernierScanAt} asc nulls first`, serviceExpose.hote)
  const seuil = Date.now() - ageMs
  const aRelever = services.filter(s => !s.dernierScanAt || new Date(s.dernierScanAt).getTime() < seuil).length
  if (!aRelever) return { lance: false, aRelever: 0 }
  // Tout le parc est passé, les plus anciens d'abord : le plafond du balayage borne le passage.
  const { demarre } = BALAYAGE.lancer(services, s2 => releverEtEnregistrer(s2))
  return { lance: demarre, aRelever }
}

/** Nombre de pages cibles par service : ce qui dit si l'intégrité des scripts est surveillée. */
async function pagesParService(): Promise<Map<string, number>> {
  const lignes = await db.select({ serviceId: pageCible.serviceId, n: sql<number>`count(*)::int` })
    .from(pageCible).groupBy(pageCible.serviceId)
  return new Map(lignes.map(l => [l.serviceId, l.n]))
}

/**
 * L'ÉTAT DE MISE À JOUR ET DE SUPPORT DE CHAQUE SERVICE SURVEILLÉ — pour le moteur d\'alertes.
 */
export async function etatsDesServices() {
  const { aujourdhui, dansUnAn } = bornesEol()
  const services = await db.select({
    id: serviceExpose.id, hote: serviceExpose.hote, port: serviceExpose.port, libelle: serviceExpose.libelle,
    dernierStatut: serviceExpose.dernierStatut, dernierMessage: serviceExpose.dernierMessage,
    dateRevue: serviceExpose.dateRevue,
  }).from(serviceExpose).where(eq(serviceExpose.surveille, true))
  const techs = await db.select({
    serviceId: serviceTechnologie.serviceId,
    version: serviceTechnologie.version,
    finDeVie: technologie.finDeVie, finDeVieEtendue: technologie.finDeVieEtendue,
    sourceEol: technologie.sourceEol,
    derniereVersionBranche: technologie.derniereVersionBranche,
    brancheMaintenue: technologie.brancheMaintenue,
  }).from(serviceTechnologie)
    .leftJoin(technologie, eq(technologie.id, serviceTechnologie.technologieId))

  const miseAJour = new Map<string, EtatMiseAJour[]>()
  const supports = new Map<string, StatutEol[]>()
  for (const t2 of techs) {
    const e = etatsDe(t2.finDeVie === undefined ? null : t2 as never, t2.version, aujourdhui, dansUnAn)
    miseAJour.set(t2.serviceId, [...(miseAJour.get(t2.serviceId) ?? []), e.miseAJour])
    if (e.support) supports.set(t2.serviceId, [...(supports.get(t2.serviceId) ?? []), e.support])
  }
  return services.map(sv => ({
    ...sv,
    miseAJour: etatDuService(miseAJour.get(sv.id) ?? []),
    support: pireStatutEol(supports.get(sv.id) ?? []),
  }))
}

/**
 * CE QUI A CHANGÉ SUR LE PARC depuis N jours — pour la route `/evolution` et pour les alertes.
 */
export async function changementsDepuis(joursDemandes: number) {
  const jours = Math.min(90, Math.max(1, Math.round(joursDemandes) || 7))
  const depuis = new Date(Date.now() - jours * 24 * 60 * 60 * 1000)

  const fenetre = await db.select().from(releveActif)
    .where(gte(releveActif.releveLe, depuis))
    .orderBy(asc(releveActif.serviceId), asc(releveActif.releveLe))
  if (!fenetre.length) return { depuis: depuis.toISOString(), jours, servicesReleves: 0, changements: [] }

  const ids = [...new Set(fenetre.map(r => r.serviceId))]
  // La base : le dernier relevé LU avant la fenêtre, et le dernier tout court (pour la
  // joignabilité). Deux requêtes `distinct on` plutôt qu'un historique entier en mémoire.
  const [baseLue, baseToute, services] = await Promise.all([
    db.selectDistinctOn([releveActif.serviceId]).from(releveActif)
      .where(and(inArray(releveActif.serviceId, ids), lt(releveActif.releveLe, depuis), eq(releveActif.statut, 'ok')))
      .orderBy(releveActif.serviceId, desc(releveActif.releveLe)),
    db.selectDistinctOn([releveActif.serviceId]).from(releveActif)
      .where(and(inArray(releveActif.serviceId, ids), lt(releveActif.releveLe, depuis)))
      .orderBy(releveActif.serviceId, desc(releveActif.releveLe)),
    db.select({ id: serviceExpose.id, hote: serviceExpose.hote, port: serviceExpose.port, libelle: serviceExpose.libelle })
      .from(serviceExpose).where(inArray(serviceExpose.id, ids)),
  ])
  const parId = new Map(services.map(x => [x.id, x]))
  const lue = new Map(baseLue.map(x => [x.serviceId, x]))
  const toute = new Map(baseToute.map(x => [x.serviceId, x]))

  const changements = []
  for (const id of ids) {
    const base = [lue.get(id), toute.get(id)].filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.releveLe.getTime() - b.releveLe.getTime())
    const uniques = base.filter((x, i) => i === 0 || x.id !== base[i - 1]!.id)
    const releves = evolution([...uniques, ...fenetre.filter(r => r.serviceId === id)])
    const svc = parId.get(id)
    for (const r of releves) {
      if (r.releveLe < depuis) continue
      for (const c of r.changements) {
        changements.push({ serviceId: id, hote: svc?.hote ?? null, port: svc?.port ?? null, libelle: svc?.libelle ?? null, releveLe: r.releveLe, ...c })
      }
    }
  }
  changements.sort((a, b) => b.releveLe.getTime() - a.releveLe.getTime())
  return { depuis: depuis.toISOString(), jours, servicesReleves: ids.length, changements }
}

/**
 * LA TECHNOLOGIE PRINCIPALE d'un service — celle qui nomme le site. Un site rend « nginx, PHP,
 * WordPress ».
 */
const RANG_CATEGORIE = { framework: 0, langage: 1, serveur_web: 2, autre: 3 } as const

export function principale(
  detectees: Array<{ produit: string, version: string | null }>,
): { produit: string, version: string | null } | null {
  if (!detectees.length) return null
  return [...detectees].sort((a, b) =>
    RANG_CATEGORIE[categorieDe(a.produit)] - RANG_CATEGORIE[categorieDe(b.produit)]
    || a.produit.localeCompare(b.produit))[0] ?? null
}

export const servicesExposesRouter = new Elysia({ name: 'services-exposes', prefix: '/api/sites-services' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Catalogues'] } })

  /**
   * ÉTAT D'ENSEMBLE. Les partitions que l\'appelant cite au lieu de les calculer.
   */
  .get('/etat', async () => {
    const { aujourdhui, dansUnAn } = bornesEol()

    const services = await db.select({
      id: serviceExpose.id, hote: serviceExpose.hote, port: serviceExpose.port,
      type: serviceExpose.type, dernierScanAt: serviceExpose.dernierScanAt,
      applicationId: serviceExpose.applicationId,
      hsts: serviceExpose.hsts, csp: serviceExpose.csp,
      xFrameOptions: serviceExpose.xFrameOptions, referrerPolicy: serviceExpose.referrerPolicy,
      proprietaireId: serviceExpose.proprietaireId, classement: serviceExpose.classement,
      classementPropose: serviceExpose.classementPropose, paiementEnLigne: serviceExpose.paiementEnLigne,
      donneesPersonnelles: serviceExpose.donneesPersonnelles, justificationExposition: serviceExpose.justificationExposition,
      dateRevue: serviceExpose.dateRevue,
    }).from(serviceExpose).where(eq(serviceExpose.surveille, true))
    const pages = await pagesParService()

    const techs = await db.select({
      serviceId: serviceTechnologie.serviceId,
      version: serviceTechnologie.version,
      finDeVie: technologie.finDeVie, finDeVieEtendue: technologie.finDeVieEtendue,
      sourceEol: technologie.sourceEol,
      derniereVersionBranche: technologie.derniereVersionBranche,
      brancheMaintenue: technologie.brancheMaintenue,
    }).from(serviceTechnologie)
      .leftJoin(technologie, eq(technologie.id, serviceTechnologie.technologieId))

    const parService = new Map<string, EtatMiseAJour[]>()
    const supports = new Map<string, StatutEol[]>()
    for (const t2 of techs) {
      const e = etatsDe(t2.finDeVie === undefined ? null : t2 as never, t2.version, aujourdhui, dansUnAn)
      parService.set(t2.serviceId, [...(parService.get(t2.serviceId) ?? []), e.miseAJour])
      if (e.support) supports.set(t2.serviceId, [...(supports.get(t2.serviceId) ?? []), e.support])
    }

    const lignes = services.map(s => ({
      ...s,
      miseAJour: etatDuService(parService.get(s.id) ?? []),
      supports: supports.get(s.id) ?? [],
    }))

    // Un service JAMAIS SCANNÉ ne peut rien affirmer. Le compter parmi les sains ferait
    // exactement la réponse rassurante et fausse que ce point d'entrée existe pour éviter.
    const jamaisScanne = lignes.filter(l => !l.dernierScanAt).length

    return {
      total: lignes.length,
      jamaisScanne,
      sansApplication: lignes.filter(l => !l.applicationId).length,
      // PROPRIÉTÉ ET EXPOSITION. Chaque service compte une fois par signalement qu'il porte :
      // les compteurs ne s'additionnent pas entre eux, et `sansProprietaire` les regroupe tous.
      sansProprietaire: lignes.filter(l => !l.proprietaireId).length,
      nonClasses: lignes.filter(l => !l.classement).length,
      parClassement: partitionEnMemoire(lignes.filter(l => l.classement), CLASSEMENTS, l => l.classement!),
      aSignaler: Object.fromEntries(SIGNALEMENTS.map((k) => {
        const n = lignes.filter(l => signalements(l, { pagesCibles: pages.get(l.id) ?? 0, aujourdhui }).includes(k)).length
        return [k, n]
      })),
      parType: partitionEnMemoire(lignes, serviceType.enumValues, l => l.type),
      parEtatMiseAJour: partitionEnMemoire(lignes, ETATS_MISE_A_JOUR, l => l.miseAJour.etat),
      // Le pire statut de support parmi les technologies du service. Un service sans
      // technologie rapprochée n'entre dans aucune case et se compte dans `sansSupportConnu`.
      parStatutSupport: partitionEnMemoire(
        lignes.filter(l => l.supports.length), STATUTS_EOL,
        l => l.supports.includes('depasse') ? 'depasse'
          : l.supports.includes('etendu') ? 'etendu'
            : l.supports.includes('bientot') ? 'bientot'
              : l.supports.includes('inconnu') ? 'inconnu' : 'ok',
      ),
      sansSupportConnu: lignes.filter(l => !l.supports.length).length,
      // En-têtes de sécurité : `null` = jamais relevé, distinct de `false` = relevé et absent.
      enTetes: {
        hsts: lignes.filter(l => l.hsts === true).length,
        csp: lignes.filter(l => l.csp === true).length,
        xFrameOptions: lignes.filter(l => l.xFrameOptions === true).length,
        referrerPolicy: lignes.filter(l => l.referrerPolicy === true).length,
        jamaisReleves: lignes.filter(l => l.hsts === null).length,
      },
      avertissement: jamaisScanne
        ? `${jamaisScanne} service(s) n'ont jamais été scannés. Leurs états valent « inconnu » `
          + 'et ne doivent être comptés ni parmi les sains ni parmi les défaillants.'
        : null,
    }
  }, {
    can: { category: 'sites-services', level: 'read' },
    detail: {
      summary: 'Sites et services : état de mise à jour, support et en-têtes de sécurité.',
      description: 'Distinct de `/resume`, qui partitionne les COLONNES. Celui-ci porte les états '
        + 'CALCULÉS. `jamaisScanne` et `sansSupportConnu` sont hors des partitions : un service dont on '
        + 'ne sait rien n\'est ni sain ni défaillant, et l\'agrégation retient le PIRE état sans jamais '
        + 'compter l\'inconnu comme bon.',
    },
  })

  /**
   * LA LISTE AVEC SES ÉTATS. Le catalogue générique rend les colonnes ; les états viennent
   * d'une jointure entre les détections, le référentiel et le certificat.
   */
  .get('/liste', async ({ query }) => {
    const { aujourdhui, dansUnAn } = bornesEol()
    const maintenant = new Date()

    const services = await db.select().from(serviceExpose).orderBy(serviceExpose.hote)
    const techs = await db.select({
      serviceId: serviceTechnologie.serviceId,
      produit: serviceTechnologie.produit,
      version: serviceTechnologie.version,
      finDeVie: technologie.finDeVie,
      finDeVieEtendue: technologie.finDeVieEtendue,
      sourceEol: technologie.sourceEol,
      derniereVersionBranche: technologie.derniereVersionBranche,
      brancheMaintenue: technologie.brancheMaintenue,
    }).from(serviceTechnologie)
      .leftJoin(technologie, eq(technologie.id, serviceTechnologie.technologieId))
    const certs = await db.select({
      hote: certificat.hote, port: certificat.port,
      dernierStatut: certificat.dernierStatut, dateFin: certificat.dateFin,
      chaineValide: certificat.chaineValide,
    }).from(certificat)
    const parCle = new Map(certs.map(c => [`${c.hote}:${c.port}`, c]))
    const pages = await pagesParService()

    const parService = new Map<string, typeof techs>()
    for (const t2 of techs) parService.set(t2.serviceId, [...(parService.get(t2.serviceId) ?? []), t2])

    let lignes = services.map((s2) => {
      const detectees = parService.get(s2.id) ?? []
      const etats = detectees.map(t2 => etatsDe(t2.finDeVie === undefined ? null : t2 as never, t2.version, aujourdhui, dansUnAn))
      return {
        ...s2,
        miseAJour: etatDuService(etats.map(e => e.miseAJour)),
        support: pireStatutEol(etats.map(e => e.support).filter(Boolean) as StatutEol[]),
        certificat: etatCertificat(parCle.get(`${s2.hote}:${s2.port}`) ?? null, maintenant),
        technologiePrincipale: principale(detectees),
        technologies: detectees.map(t2 => t2.produit),
        signalements: signalements(s2, { pagesCibles: pages.get(s2.id) ?? 0, aujourdhui }),
      }
    })

    // FILTRES ET RECHERCHE, sur les états CALCULÉS autant que sur les colonnes.
    const q = (query.q ?? '').trim().toLowerCase()
    if (q) {
      lignes = lignes.filter(l => [l.hote, l.libelle ?? '', ...l.technologies].some(x => x.toLowerCase().includes(q)))
    }
    if (query.type) lignes = lignes.filter(l => l.type === query.type)
    if (query.miseAJour) lignes = lignes.filter(l => l.miseAJour.etat === query.miseAJour)
    // `?support=aucun` : les services dont AUCUNE technologie n'est rapprochée.
    if (query.support) {
      lignes = query.support === 'aucun'
        ? lignes.filter(l => l.support === null)
        : lignes.filter(l => l.support === query.support)
    }
    if (query.certificat) lignes = lignes.filter(l => l.certificat === query.certificat)
    // `?classement=aucun` et `?proprietaire=aucun` : les manques se filtrent, sinon ils ne
    // sont dans aucune réponse — alors que ce sont eux qu'il faut compléter.
    if (query.classement) {
      lignes = query.classement === 'aucun' ? lignes.filter(l => !l.classement) : lignes.filter(l => l.classement === query.classement)
    }
    if (query.proprietaire === 'aucun') lignes = lignes.filter(l => !l.proprietaireId)
    if (query.applicationId) lignes = lignes.filter(l => l.applicationId === query.applicationId)
    if (query.signalement) lignes = lignes.filter(l => (l.signalements as string[]).includes(query.signalement!))
    if (query.technologie) {
      const t2 = query.technologie.toLowerCase()
      lignes = lignes.filter(l => l.technologies.some(x => x.toLowerCase() === t2))
    }

    const page = paginerEnMemoire(query, lignes)
    return Array.isArray(page)
      ? { total: lignes.length, resultats: page }
      : { total: page.total, page: page.page, pageSize: page.pageSize, resultats: page.rows }
  }, {
    can: { category: 'sites-services', level: 'read' },
    query: t.Object({
      ...SCHEMA_PAGINATION,
      q: t.Optional(t.String()),
      type: t.Optional(t.String()),
      miseAJour: t.Optional(t.String()),
      support: t.Optional(t.String()),
      certificat: t.Optional(t.String()),
      technologie: t.Optional(t.String()),
      classement: t.Optional(t.String()),
      proprietaire: t.Optional(t.String()),
      applicationId: t.Optional(t.String()),
      signalement: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Liste des services avec leurs états calculés, filtrable.',
      description: 'Les états viennent d\'une jointure entre les détections, le référentiel de '
        + 'technologies et le certificat : le catalogue générique ne rend que les colonnes. '
        + 'Filtres : `type` (vocabulaire `service.type`), `miseAJour` (`service.etatMiseAJour`), '
        + '`support` (`technologie.eolStatut`, plus la valeur `aucun` pour les services dont aucune '
        + 'technologie n\'est rapprochée), `certificat` (`service.certificat`), `technologie` '
        + '(nom exact d\'un produit détecté), et `q` sur l\'hôte, le libellé et les produits détectés. '
        + '`support: null` signifie qu\'aucune technologie n\'est rapprochée du référentiel, ce qui '
        + 'n\'est pas « supporté ».',
    },
  })

  /** La fiche : certificat, technologies, états. Ce que le générique ne peut pas rendre. */
  .get('/:id/fiche', async ({ params, status }) => {
    const [s] = await db.select().from(serviceExpose).where(eq(serviceExpose.id, params.id)).limit(1)
    if (!s) return status(404, 'Service introuvable')

    const { aujourdhui, dansUnAn } = bornesEol()
    const [cert] = await db.select().from(certificat)
      .where(and(eq(certificat.hote, s.hote), eq(certificat.port, s.port))).limit(1)
    const app = s.applicationId
      ? (await db.select({ id: application.id, nom: application.nom })
          .from(application).where(eq(application.id, s.applicationId)).limit(1))[0]
      : null

    // Qui répond de ce service, qui l'héberge, où il tourne. Un lien rompu (personne ou
    // prestataire supprimé) rend `null`, pas une erreur : la fiche reste lisible.
    const personneDe = async (pid: string | null) => (pid
      ? (await db.select({ id: personne.id, nom: personne.nom, prenom: personne.prenom }).from(personne).where(eq(personne.id, pid)).limit(1))[0] ?? null
      : null)
    const [proprietaire, contactTechnique, prestataire, serveurLie, nbPages] = await Promise.all([
      personneDe(s.proprietaireId),
      personneDe(s.contactTechniqueId),
      s.tiersId ? db.select({ id: tiers.id, nom: tiers.nom }).from(tiers).where(eq(tiers.id, s.tiersId)).limit(1).then(r => r[0] ?? null) : null,
      s.serveurId ? db.select({ id: serveur.id, hostname: serveur.hostname }).from(serveur).where(eq(serveur.id, s.serveurId)).limit(1).then(r => r[0] ?? null) : null,
      db.select({ n: sql<number>`count(*)::int` }).from(pageCible).where(eq(pageCible.serviceId, s.id)).then(r => r[0]?.n ?? 0),
    ])

    const techs = await db.select({
      id: serviceTechnologie.id, produit: serviceTechnologie.produit,
      version: serviceTechnologie.version, certitude: serviceTechnologie.certitude,
      source: serviceTechnologie.source, technologieCle: serviceTechnologie.technologieCle,
      finDeVie: technologie.finDeVie, finDeVieEtendue: technologie.finDeVieEtendue,
      sourceEol: technologie.sourceEol,
      derniereVersionBranche: technologie.derniereVersionBranche,
      derniereVersionGenerale: technologie.derniereVersionGenerale,
      brancheMaintenue: technologie.brancheMaintenue,
    }).from(serviceTechnologie)
      .leftJoin(technologie, eq(technologie.id, serviceTechnologie.technologieId))
      .where(eq(serviceTechnologie.serviceId, s.id))

    const technologies = techs.map((t2) => {
      const e = etatsDe(t2.finDeVie === undefined ? null : t2 as never, t2.version, aujourdhui, dansUnAn)
      return {
        ...t2,
        eolStatut: e.support,
        etatMiseAJour: e.miseAJour,
      }
    })

    return {
      service: { ...s, application: app, proprietaire, contactTechnique, prestataire, serveur: serveurLie },
      exposition: {
        signalements: signalements(s, { pagesCibles: nbPages, aujourdhui }),
        moisDeRevue: moisDeRevue(s),
        pagesCibles: nbPages,
      },
      // L'autorité est calculée, comme sur la page des certificats : même fonction, même tri.
      certificat: cert ? { ...cert, autorite: autoriteDe(cert) } : null,
      technologies,
      // L'AGRÉGATION EST RENDUE AVEC SON DÉNOMINATEUR. « À jour » sur deux technologies
      // détectées ne dit rien des autres, et l'afficher seul serait la réponse rassurante et
      // fausse que tout ce point d'entrée existe pour empêcher.
      etat: {
        ...etatDuService(technologies.map(x => x.etatMiseAJour)),
        // L'état LISIBLE, pas l'état du relevé : `ok` signifie « lu », et un certificat
        // expiré est lu parfaitement.
        certificat: etatCertificat(cert ?? null),
        jamaisScanne: !s.dernierScanAt,
      },
      regleAgregation: 'Le pire état l\'emporte, et « inconnu » ne compte jamais comme bon. '
        + '`surTechnologies` donne le nombre de technologies détectées : un état « à jour » ne vaut '
        + 'que pour elles.',
    }
  }, {
    can: { category: 'sites-services', level: 'read' },
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Fiche d\'un service : certificat, technologies détectées, états.' },
  })

  /**
   * L'HISTORIQUE D\'UN SERVICE — chaque relevé, avec ce qui a changé depuis le précédent.
   */
  .get('/:id/historique', async ({ params, query, status }) => {
    const [s] = await db.select({ id: serviceExpose.id }).from(serviceExpose).where(eq(serviceExpose.id, params.id)).limit(1)
    if (!s) return status(404, 'Service introuvable')
    const limite = Math.min(200, Math.max(1, Number(query.limite) || 30))
    const lignes = await db.select().from(releveActif)
      .where(eq(releveActif.serviceId, params.id))
      .orderBy(desc(releveActif.releveLe))
      .limit(limite + 1)
    const chrono = evolution([...lignes].reverse())
    const releves = chrono.reverse().slice(0, limite)
    return { releves, plusAnciens: lignes.length > limite }
  }, {
    can: { category: 'sites-services', level: 'read' },
    params: t.Object({ id: t.String() }),
    query: t.Object({ limite: t.Optional(t.Numeric()) }),
    detail: {
      summary: 'Historique des relevés d\'un service, avec les changements de chacun.',
      description: 'Du plus récent au plus ancien. Technologies, en-têtes et certificat sont comparés au dernier '
        + 'relevé qui les a LUS : un relevé en échec n\'annonce que la perte de joignabilité, et son retour ne '
        + 'recrée rien. Une version devenue inconnue n\'est pas une version changée. Le premier relevé d\'un '
        + 'service n\'annonce aucun changement.',
    },
  })

  /**
   * CE QUI A CHANGÉ SUR LE PARC depuis N jours. Chaque service est comparé à son dernier relevé
   * ANTÉRIEUR à la fenêtre : sans cette base, le premier relevé de la semaine n'aurait rien à
   * quoi se comparer, et une montée de version faite lundi n'apparaîtrait jamais.
   */
  .get('/evolution', async ({ query }) => changementsDepuis(Number(query.jours) || 7), {
    can: { category: 'sites-services', level: 'read' },
    query: t.Object({ jours: t.Optional(t.Numeric()) }),
    detail: {
      summary: 'Ce qui a changé sur les services exposés depuis N jours (7 par défaut, 90 au plus).',
      description: 'Chaque service est comparé à son dernier relevé antérieur à la fenêtre. Mêmes règles que '
        + '/:id/historique : un échec n\'efface rien, une version devenue inconnue n\'est pas un changement. '
        + '`servicesReleves` compte les services relevés dans la fenêtre — un service jamais relevé n\'a pas '
        + 'pu changer, ce qui ne veut pas dire qu\'il est stable.',
    },
  })

  /**
   * IMPORT D'UNE LISTE DE SITES. L\'analyseur est celui des certificats — il gère déjà les URL
   * complètes, les ports explicites, les libellés en seconde colonne, les commentaires et les
   * doublons.
   */
  .post('/import', async ({ body }) => {
    const { entrees, rejets } = analyserListeSites(body.texte ?? '')
    const existants = await db.select({ hote: serviceExpose.hote, port: serviceExpose.port })
      .from(serviceExpose)
    const deja = new Set(existants.map(e => `${e.hote}:${e.port}`))

    const nouveaux = entrees.filter(e => !deja.has(`${e.hote}:${e.port}`))
    const dejaPresents = entrees.length - nouveaux.length

    if (body.dryRun !== false) {
      return {
        simulation: true as const,
        aCreer: nouveaux.length,
        dejaPresents,
        rejets,
        apercu: nouveaux.slice(0, 20),
      }
    }

    for (const e of nouveaux) {
      await db.insert(serviceExpose).values({
        hote: e.hote,
        port: e.port,
        libelle: e.libelle,
        // Le TYPE est déduit du port, présomption raisonnable et corrigeable à la main.
        type: [443, 80, 8443, 8080].includes(e.port)
          ? 'web'
          : [636, 389, 3269, 3268].includes(e.port)
            ? 'annuaire'
            : [465, 587, 993, 995, 25, 143, 110].includes(e.port)
              ? 'messagerie'
              : 'autre',
      }).onConflictDoNothing()
    }
    return { simulation: false as const, crees: nouveaux.length, dejaPresents, rejets }
  }, {
    can: { category: 'sites-services', level: 'write' },
    body: t.Object({ texte: t.String(), dryRun: t.Optional(t.Boolean()) }),
    detail: {
      summary: 'Importer une liste de sites et services.',
      description: 'Une entrée par ligne : `hote`, `hote:port`, ou une URL complète. Une seconde '
        + 'colonne séparée par une virgule, un point-virgule ou une tabulation devient le libellé. '
        + 'Les lignes vides et celles commençant par `#` sont ignorées. Le rapprochement se fait sur '
        + '(hote, port) : deux ports du même hôte sont deux services distincts. Le type est déduit du '
        + 'port et se corrige à la main. `dryRun: true` par défaut.',
    },
  })

  /** Relève un service. Écriture : le scan modifie l'inventaire. */
  .post('/:id/scan', async ({ params, status }) => {
    const [s2] = await db.select().from(serviceExpose).where(eq(serviceExpose.id, params.id)).limit(1)
    if (!s2) return status(404, 'Service introuvable')
    return releverEtEnregistrer(s2)
  }, {
    can: { category: 'sites-services', level: 'write' },
    params: t.Object({ id: t.String() }),
    detail: {
      summary: 'Relève un service : technologies annoncées et en-têtes de sécurité.',
      description: 'Une requête GET sur la racine, rien d\'authentifié, aucun chemin sensible sondé. '
        + 'Un relevé en échec ne vide pas les détections précédentes : elles vieillissent avec leur date.',
    },
  })

  /**
   * Relève tous les services surveillés — EN ARRIÈRE-PLAN, par paquets, avec plafond.
   */
  .post('/scan', async () => {
    // LES PLUS ANCIENNEMENT RELEVÉS D'ABORD, jamais relevés en tête. Sous le plafond, c'est ce
    // qui garantit que des passages successifs finissent par couvrir tout le parc au lieu de
    // relever toujours les mêmes.
    const services = await db.select({ id: serviceExpose.id, hote: serviceExpose.hote, port: serviceExpose.port })
      .from(serviceExpose).where(eq(serviceExpose.surveille, true))
      .orderBy(sql`${serviceExpose.dernierScanAt} asc nulls first`, serviceExpose.hote)
    // MÊME FONCTION que le relevé unitaire : c'est ce qui garantit que le balayage
    // enregistre les technologies, ce qu'il oubliait de faire.
    const { demarre } = BALAYAGE.lancer(services, s2 => releverEtEnregistrer(s2))
    return { demarre, ...BALAYAGE.etat() }
  }, {
    can: { category: 'sites-services', level: 'write' },
    detail: {
      summary: 'Lance le relevé de tous les services surveillés, en arrière-plan.',
      description: `Rend la main immédiatement ; l'avancement se lit sur GET /scan/etat. Par paquets de ${PAQUET_BALAYAGE} `
        + `services, plafonné à ${PLAFOND_BALAYAGE} par passage : au-delà, \`tronque\` vaut vrai et \`ecartes\` compte `
        + 'les services non relevés. Les plus anciennement relevés passent en premier, si bien que des passages '
        + 'successifs couvrent tout le parc. Un seul balayage à la fois : `demarre: false` signale qu\'un passage '
        + 'est déjà en cours, et l\'état rendu est le sien.',
    },
  })

  .get('/scan/etat', () => BALAYAGE.etat(), {
    can: { category: 'sites-services', level: 'read' },
    detail: { summary: 'Avancement du relevé de tous les services.' },
  })

