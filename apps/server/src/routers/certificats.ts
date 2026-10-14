import { Elysia, t } from 'elysia'
import { and, asc, count, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { certificat } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { analyserListeSites } from '../utils/certificatScan'
import { scannerCertificats } from '../utils/certificatsReleve'
import { AUTORITES, autoriteDe, type Autorite, type CertificatLu } from '../utils/autoriteCertificat'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'
import { partitionSql } from '../utils/partition'
import { certificatSource, certificatStatut } from '@catalogue/database/tables'

// CERTIFICATS TLS — inventaire et surveillance des échéances. C'était le trou du moteur
// d'échéances : la seule catégorie dont l'expiration n'entraîne pas une dégradation mais un
// ARRÊT franc du service.

// Jours restants, calculés par la base. Jamais stockés : une colonne serait fausse le lendemain
// du calcul. ⚠️ La soustraction de deux `timestamp` donne un INTERVAL, que PostgreSQL refuse de
// convertir en entier — la requête échouait donc dès qu'un certificat existait, et la page
// affichait l'état vide…
const joursSql = sql<number>`case when ${certificat.dateFin} is null then null
  else (${certificat.dateFin}::date - current_date) end`

/**
 * L'AUTORITÉ DE CHAQUE CERTIFICAT, calculée à la lecture (utils/autoriteCertificat.ts).
 */
function avecAutorite<R extends CertificatLu>(rows: R[]): (R & { autorite: Autorite | null })[] {
  return rows.map(r => ({ ...r, autorite: autoriteDe(r) }))
}

export const certificatsRouter = new Elysia({ name: 'certificats', prefix: '/api/certificats' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Sécurité'] } })

  /** Inventaire des certificats surveillés, échéance la plus proche en tête. */
  .get('/', async ({ query }) => {
    const conditions = []
    if (query.surveille !== 'tous') conditions.push(eq(certificat.surveille, true))
    if (query.statut) conditions.push(eq(certificat.dernierStatut, query.statut as never))
    if (query.expireAvant) conditions.push(sql`${certificat.dateFin} < ${query.expireAvant}::timestamp`)
    // « Ce qui appelle une décision maintenant » : expiré, ou invalide.
    if (query.probleme === 'true') {
      conditions.push(sql`(${certificat.dateFin} < now()
        or ${certificat.chaineValide} is false
        or ${certificat.dernierStatut} in ('injoignable', 'tls_erreur'))`)
    }
    const where = conditions.length ? and(...conditions) : undefined

    const total = (await db.select({ total: count() }).from(certificat).where(where))[0]?.total ?? 0
    // Cette route rendait déjà un total compté par la base, mais aucune page : au-delà de
    // quelques centaines de certificats, la seule option était la table entière.
    const b = bornes(query)
    const requete = db
      .select({
        id: certificat.id, hote: certificat.hote, port: certificat.port,
        libelle: certificat.libelle, proprietaire: certificat.proprietaire,
        source: certificat.source, surveille: certificat.surveille,
        sujet: certificat.sujet, emetteur: certificat.emetteur,
        nomsAlternatifs: certificat.nomsAlternatifs, empreinte: certificat.empreinte,
        dateDebut: certificat.dateDebut, dateFin: certificat.dateFin,
        autoSigne: certificat.autoSigne, chaineValide: certificat.chaineValide,
        erreurValidation: certificat.erreurValidation, caa: certificat.caa,
        dernierScanAt: certificat.dernierScanAt, dernierStatut: certificat.dernierStatut,
        dernierMessage: certificat.dernierMessage, notes: certificat.notes,
        updatedAt: certificat.updatedAt,
        joursRestants: joursSql,
      })
      .from(certificat).where(where)
      // Les certificats jamais scannés (date nulle) EN TÊTE et non en fin : un
      // certificat dont on ne sait rien est plus inquiétant qu'un certificat lointain.
      .orderBy(sql`${certificat.dateFin} asc nulls first`, asc(certificat.hote))

    const tri = 'date de fin croissante (jamais scanné en tête), puis hôte'
    if (pagineDemandee(query)) {
      // Le total vient du même `where` que la page — jamais de `rows.length`.
      return { ...enveloppe(avecAutorite(await requete.limit(b.limit).offset(b.offset)), total, b), tri }
    }
    return { total, tri, resultats: avecAutorite(await requete) }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({
      ...SCHEMA_PAGINATION,
      surveille: t.Optional(t.String()),
      statut: t.Optional(t.String()),
      expireAvant: t.Optional(t.String()),
      probleme: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Certificats TLS surveillés et leur échéance.',
      description: '`page`/`pageSize` (l\'un des deux suffit) rendent `{ rows, total, page, pageSize }` ; '
        + 'sans eux, la forme historique `{ total, tri, resultats }` est conservée. Le total vient '
        + 'toujours de la base, jamais du nombre de lignes rendues.',
    },
  })

  /** Compteurs de l'inventaire. */
  .get('/resume', async () => {
    const [r] = await db.select({
      total: count(),
      expires: sql<number>`count(*) filter (where ${certificat.dateFin} < now())::int`,
      sous30: sql<number>`count(*) filter (where ${certificat.dateFin} >= now() and ${certificat.dateFin} < now() + interval '30 days')::int`,
      invalides: sql<number>`count(*) filter (where ${certificat.chaineValide} is false)::int`,
      injoignables: sql<number>`count(*) filter (where ${certificat.dernierStatut} in ('injoignable', 'tls_erreur'))::int`,
      jamaisScannes: sql<number>`count(*) filter (where ${certificat.dernierStatut} = 'jamais')::int`,
      // Les compteurs ci-dessus SE RECOUPENT — un certificat peut être expiré ET injoignable —
      // donc leur somme ne veut rien dire.
      parStatut: { ...partitionSql(certificat.dernierStatut, certificatStatut.enumValues) },
      parSource: { ...partitionSql(certificat.source, certificatSource.enumValues) },
    }).from(certificat).where(eq(certificat.surveille, true))
    // LE TRI PAR AUTORITÉ, sur les champs relevés : une PARTITION des certificats lus.
    const lus = await db.select({
      emetteur: certificat.emetteur, autoSigne: certificat.autoSigne,
      chaineValide: certificat.chaineValide, dateFin: certificat.dateFin,
    }).from(certificat).where(eq(certificat.surveille, true))
    const parAutorite = Object.fromEntries(AUTORITES.map(a => [a, 0])) as Record<Autorite, number>
    let sansAutorite = 0
    for (const c of lus) {
      const a = autoriteDe(c)
      if (a) parAutorite[a]++
      else sansAutorite++
    }
    return r
      ? { ...r, parAutorite, sansAutorite }
      : { total: 0, expires: 0, sous30: 0, invalides: 0, injoignables: 0, jamaisScannes: 0, parAutorite, sansAutorite }
  }, { auth: ['user', 'admin', 'svc'], detail: { summary: 'Compteurs des certificats : expirés, sous 30 jours, invalides.' } })

  /** Ajout à l'unité. */
  .post('/', async ({ body, status }) => {
    const { entrees, rejets } = analyserListeSites(`${body.hote}${body.port ? ':' + body.port : ''}`)
    const e = entrees[0]
    if (!e) return status(400, { message: `Nom d'hôte invalide : ${rejets[0] ?? body.hote}` })

    const [existant] = await db.select().from(certificat)
      .where(and(eq(certificat.hote, e.hote), eq(certificat.port, e.port))).limit(1)
    if (existant) return status(409, { message: `${e.hote}:${e.port} est déjà dans l'inventaire.` })

    const [cree] = await db.insert(certificat).values({
      hote: e.hote, port: e.port, libelle: body.libelle ?? null,
      proprietaire: body.proprietaire ?? null, notes: body.notes ?? null, source: 'manuel',
    }).returning()
    return cree
  }, {
    auth: ['user', 'admin'],
    body: t.Object({
      hote: t.String(),
      port: t.Optional(t.Number()),
      libelle: t.Optional(t.String()),
      proprietaire: t.Optional(t.String()),
      notes: t.Optional(t.String()),
    }),
    detail: { summary: 'Ajoute un certificat à surveiller.' },
  })

  /**
   * Import d'une liste de sites. SIMULATION PAR DÉFAUT, comme les autres imports du Catalogue :
   * coller 300 lignes sans savoir ce qu'elles vont produire est le meilleur moyen de polluer
   * l'inventaire — et ici, de lancer 300 connexions sortantes.
   */
  .post('/import', async ({ body }) => {
    const { entrees, rejets } = analyserListeSites(body.texte)

    const cles = entrees.map(e => `${e.hote}:${e.port}`)
    const existantes = cles.length
      ? await db.select({ hote: certificat.hote, port: certificat.port }).from(certificat)
        .where(inArray(sql`${certificat.hote} || ':' || ${certificat.port}`, cles))
      : []
    const deja = new Set(existantes.map(x => `${x.hote}:${x.port}`))
    const nouveaux = entrees.filter(e => !deja.has(`${e.hote}:${e.port}`))

    if (body.simulation !== false) {
      return {
        simulation: true,
        aCreer: nouveaux.length, dejaPresents: deja.size, rejets,
        apercu: nouveaux.slice(0, 20),
      }
    }

    if (nouveaux.length) {
      await db.insert(certificat).values(nouveaux.map(e => ({
        hote: e.hote, port: e.port, libelle: e.libelle, source: 'import' as const,
      })))
    }
    return { simulation: false, crees: nouveaux.length, dejaPresents: deja.size, rejets }
  }, {
    auth: ['user', 'admin'],
    body: t.Object({ texte: t.String(), simulation: t.Optional(t.Boolean()) }),
    detail: { summary: 'Importe une liste de sites à surveiller (simulation par défaut).' },
  })

  .patch('/:id', async ({ params, body, status }) => {
    const [row] = await db.update(certificat)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(certificat.id, params.id)).returning()
    if (!row) return status(404, { message: 'Certificat inconnu.' })
    return row
  }, {
    auth: ['user', 'admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({
      libelle: t.Optional(t.String()),
      proprietaire: t.Optional(t.String()),
      notes: t.Optional(t.String()),
      surveille: t.Optional(t.Boolean()),
    }),
    detail: { summary: 'Modifie la fiche d\'un certificat (jamais son relevé).' },
  })

  .delete('/:id', async ({ params }) => {
    await db.delete(certificat).where(eq(certificat.id, params.id))
    return { ok: true }
  }, { auth: ['admin'], params: t.Object({ id: t.String() }), detail: { summary: 'Retire un certificat de l\'inventaire.' } })

  /**
   * Scan : un certificat, ou tous ceux qui sont surveillés. Les scans sont menés par petits
   * paquets et non tous à la fois : quelques centaines de connexions TLS simultanées
   * ressemblent à un balayage et se font jeter par les pare-feu — y compris ceux de
   * l'établissement.
   */
  .post('/scan', async ({ body }) => scannerCertificats({ id: body.id }), {
    auth: ['user', 'admin'],
    body: t.Object({ id: t.Optional(t.String()) }),
    detail: { summary: 'Relève le certificat présenté par un service, ou par tous ceux surveillés.' },
  })

  /** Les certificats dont l'échéance approche — utilisé par le moteur d\'alertes. */
  .get('/echeances', async ({ query }) => {
    const jours = Math.min(365, Math.max(1, Number(query.jours) || 30))
    const resultats = await db.select({
      id: certificat.id, hote: certificat.hote, port: certificat.port,
      libelle: certificat.libelle, dateFin: certificat.dateFin, joursRestants: joursSql,
    }).from(certificat)
      .where(and(
        eq(certificat.surveille, true),
        isNotNull(certificat.dateFin),
        sql`${certificat.dateFin} < now() + (${jours} || ' days')::interval`,
      ))
      .orderBy(asc(certificat.dateFin))
    return { total: resultats.length, jours, resultats }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ jours: t.Optional(t.String()) }),
    detail: { summary: 'Certificats qui expirent dans les N prochains jours.' },
  })
