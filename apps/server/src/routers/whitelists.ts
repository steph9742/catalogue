import { Elysia, t } from 'elysia'
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { whitelist } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { beforeSnapshot } from '../utils/audit'
import { urlPublique } from '../utils/urlPublique'
import { SCHEMA_PAGINATION, bornes, enveloppe, pagineDemandee } from '../utils/pagination'
import { partitionSql } from '../utils/partition'
import { whitelistSource } from '@catalogue/database/tables'
import { MOTIFS_SANS_ECHEANCE } from '../utils/whitelistsEcheance'

// INVENTAIRE DES LISTES BLANCHES — l'inverse d'un détail administratif. Chaque ligne est un
// angle mort volontaire.

// Échéance : un an après la dernière révision, ou après la CRÉATION si jamais revue.
const sansEcheanceSql = sql<string | null>`case
  when ${whitelist.fourniParEditeur} then 'editeur'
  when not ${whitelist.presente} then 'disparue'
  when ${whitelist.technique} then 'technique'
  when ${whitelist.echeanceSniff} is not null then 'portee_par_sniff'
  when ${whitelist.dateCreation} is null then 'sans_date'
  else null end`

const echeanceSql = sql<string | null>`case
  when ${whitelist.fourniParEditeur} then null
  when not ${whitelist.presente} then null
  when ${whitelist.technique} then null
  when ${whitelist.echeanceSniff} is not null then to_char(${whitelist.echeanceSniff}, 'YYYY-MM-DD')
  when ${whitelist.dateCreation} is null then null
  else to_char(coalesce(${whitelist.dateRevision}, ${whitelist.dateCreation}) + interval '1 year', 'YYYY-MM-DD') end`

export const whitelistsRouter = new Elysia({ name: 'whitelists', prefix: '/api/whitelists' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Conformité'] } })

  /**
   * LES ÉCHÉANCES QUE LE CATALOGUE PORTE ENCORE — de quoi les reprendre chez Sniff.
   */
  .get('/revues-a-reprendre', async () => {
    const lignes = await db.select({
      regleRef: whitelist.harfanglabId,
      libelle: whitelist.libelle,
      motif: whitelist.motif,
      echeance: echeanceSql,
      creeeLe: whitelist.dateCreation,
      derniereRevue: whitelist.dateRevision,
    }).from(whitelist)
      .where(and(
        eq(whitelist.active, true),
        eq(whitelist.technique, false),
        eq(whitelist.fourniParEditeur, false),
        eq(whitelist.presente, true),
        // Ce que Sniff porte déjà n'est pas à reprendre.
        isNull(whitelist.echeanceSniff),
        isNotNull(whitelist.harfanglabId),
        isNotNull(whitelist.dateCreation),
      ))
      .orderBy(echeanceSql)
    return {
      total: lignes.length,
      // La forme exacte de `POST /api/exclusions/revues` chez Sniff.
      revues: lignes.map(l => ({ regleRef: l.regleRef, libelle: l.libelle, motif: l.motif, echeance: l.echeance, tool: 'harfanglab' })),
      detail: lignes,
      note: 'Échéances encore portées par le Catalogue : un an après la dernière revue, ou après la création. '
        + 'Une règle sans motif en sort sans motif — Sniff l\'exige à la création, et c\'est une information en soi.',
    }
  }, {
    can: { category: 'whitelists', level: 'read' },
    detail: {
      summary: 'Règles dont le Catalogue porte encore l\'échéance, au format des revues de Sniff.',
      description: 'Sont exclues les règles déjà portées par Sniff (exclusion ou revue), les techniques, celles '
        + 'fournies par l\'éditeur, celles disparues de l\'EDR et celles sans date de création — aucune n\'a '
        + 'd\'échéance à reprendre.',
    },
  })

  .get('/', async ({ query }) => {
    const conditions = []
    if (query.source) conditions.push(eq(whitelist.source, query.source as never))
    if (query.active !== undefined) conditions.push(eq(whitelist.active, query.active === 'true'))
    // `echues` : ce qui appelle une décision maintenant.
    if (query.echues === 'true') {
      conditions.push(eq(whitelist.active, true))
      conditions.push(sql`${echeanceSql} < to_char(now(), 'YYYY-MM-DD')`)
    }
    // Voir ou masquer les règles techniques. Elles restent INVENTORIÉES par défaut : ne
    // pas les dater n'est pas les cacher.
    if (query.technique === 'oui') conditions.push(eq(whitelist.technique, true))
    if (query.technique === 'non') conditions.push(eq(whitelist.technique, false))
    // L'ORIGINE est le filtre qui compte en pratique : sur 4797 règles relevées, quelques
    // dizaines seulement sont écrites par l'établissement.
    if (query.origine === 'etablissement') conditions.push(eq(whitelist.fourniParEditeur, false))
    if (query.origine === 'editeur') conditions.push(eq(whitelist.fourniParEditeur, true))
    if (query.avecEcheance === 'oui') conditions.push(sql`${echeanceSql} is not null`)
    if (query.avecEcheance === 'non') conditions.push(sql`${echeanceSql} is null`)
    if (query.disparues === 'true') conditions.push(eq(whitelist.presente, false))
    if (query.sansMotif === 'true') {
      conditions.push(eq(whitelist.fourniParEditeur, false))
      conditions.push(sql`coalesce(trim(${whitelist.motif}), '') = ''`)
    }

    const where = conditions.length ? and(...conditions) : undefined

    // PLAFOND REMPLACÉ PAR UNE PAGE. Un `.limit(1000)` fixe rendait les règles au-delà du
    // millième inatteignables : le total les annonçait sans qu'aucun appel puisse les lire.
    const b = bornes(query)
    const requete = db
      .select({ ...getColonnes(), echeance: echeanceSql, sansEcheance: sansEcheanceSql })
      .from(whitelist)
      .where(where)
      // L'échéance la plus proche en tête : c'est l'ordre dans lequel on veut traiter.
      .orderBy(asc(echeanceSql), asc(whitelist.libelle))

    // Le TOTAL est compté par la base, SÉPARÉMENT de la page. Un appelant qui annonce « 7
    // listes blanches expirent ce mois-ci » ne doit jamais avoir eu à compter les lignes reçues
    // : au-delà de la limite, il annoncerait le plafond pour le total.
    const total = (await db.select({ total: sql<number>`count(*)::int` }).from(whitelist).where(where))[0]?.total ?? 0

    // La décoration s'applique à la page rendue, jamais à la table entière.
    const decorer = (lignes: Awaited<typeof requete>) => lignes.map(r => ({
      ...r,
      // URL absolues : l'appelant n'est pas forcément servi à la même origine.
      url: urlPublique(`/whitelists?id=${r.id}`),
      // OÙ CORRIGER — l'outil et l'écran où agir sur CETTE règle. La logique existait déjà,
      // mais seulement dans l'écran : un appelant qui signalait une liste blanche sans motif ne
      // savait pas où l'écrire.
      ouCorriger: ouCorrigerWhitelist(r),
    }))

    const tri = 'échéance croissante, puis libellé'
    if (pagineDemandee(query)) {
      const page = await requete.limit(b.limit).offset(b.offset)
      return { ...enveloppe(decorer(page), total, b), tri }
    }
    return { total, tri, resultats: decorer(await requete.limit(1000)) }
  }, {
    can: { category: 'whitelists', level: 'read' },
    query: t.Object({
      ...SCHEMA_PAGINATION,
      source: t.Optional(t.String()),
      active: t.Optional(t.String()),
      echues: t.Optional(t.String()),
      sansMotif: t.Optional(t.String()),
      technique: t.Optional(t.String()),
      origine: t.Optional(t.String()),
      avecEcheance: t.Optional(t.String()),
      disparues: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Listes blanches : ce que les outils ne regardent plus, pourquoi, et jusqu\'à quand.',
      description: 'Répond à « pourquoi cette alerte ne remonte plus ? ». Chaque ligne porte son motif, '
        + 'l\'incident Sniff qui la justifie quand il est connu, sa date de revue et son échéance calculée. '
        + 'Chaque ligne porte `ouCorriger` : l\'outil et l\'écran où agir sur cette règle précise. '
        + 'Filtres : source, active, echues, sansMotif, technique (oui|non), origine '
        + '(etablissement|editeur), avecEcheance (oui|non), disparues. '
        + '`page`/`pageSize` (l\'un des deux suffit) rendent `{ rows, total, page, pageSize }` ; sans eux, '
        + 'les 1000 premières lignes dans `resultats`, avec le total réel. Le total vient toujours de la base. '
        + '`sansEcheance` donne le MOTIF quand `echeance` est nulle : `editeur` (livrée avec le produit), '
        + '`disparue` (retirée de l\'EDR), `technique`, `portee_par_sniff` (appariée à un incident, '
        + 'c\'est Sniff qui porte la date), `sans_date` (l\'EDR n\'a pas rendu de date de création). '
        + 'UNE RÈGLE TECHNIQUE N\'A PAS D\'ÉCHÉANCE (`echeance: null`) : c\'est une pièce de la '
        + 'configuration de l\'EDR, pas une dérogation. Elle reste inventoriée. Le critère est le TAG '
        + 'déclaré dans les réglages, PAS l\'absence d\'incident : une règle sans tag et sans incident '
        + 'garde son échéance. Tri par défaut : échéance croissante, puis libellé.',
    },
  })

  .get('/resume', async () => {
    const [r] = await db.select({
      total: sql<number>`count(*)::int`,
      actives: sql<number>`count(*) filter (where ${whitelist.active})::int`,
      echues: sql<number>`count(*) filter (where ${whitelist.active} and ${echeanceSql} < to_char(now(), 'YYYY-MM-DD'))::int`,
      sousUnMois: sql<number>`count(*) filter (where ${whitelist.active} and ${echeanceSql} between to_char(now(), 'YYYY-MM-DD') and to_char(now() + interval '30 days', 'YYYY-MM-DD'))::int`,
      // Ne compte QUE les règles écrites par l'établissement.
      sansMotif: sql<number>`count(*) filter (where not ${whitelist.fourniParEditeur} and coalesce(trim(${whitelist.motif}), '') = '')::int`,
      // Rapprochées avec Sniff : celles dont on connaît l'incident qui les justifie.
      avecIncident: sql<number>`count(*) filter (where ${whitelist.sniffIncidentId} is not null)::int`,
      probables: sql<number>`count(*) filter (where ${whitelist.certitudeRapprochement} = 'probable')::int`,
      prolongeesPlusieursFois: sql<number>`count(*) filter (where ${whitelist.prolongations} >= 2)::int`,
      // Les règles techniques, comptées à part : sans échéance, mais jamais masquées.
      techniques: sql<number>`count(*) filter (where ${whitelist.technique})::int`,
      editeur: sql<number>`count(*) filter (where ${whitelist.fourniParEditeur})::int`,
      // Les compteurs ci-dessus se recoupent (une règle peut être échue ET sans motif).
      // Ces deux blocs sont des PARTITIONS : la somme de chacun fait `total`.
      parSource: { ...partitionSql(whitelist.source, whitelistSource.enumValues) },
      // `sansEcheance` est CALCULÉ à la lecture : la partition passe donc par l'expression et
      // non par une colonne, mais elle couvre le même vocabulaire, motif par motif.
      parMotifSansEcheance: {
        ...Object.fromEntries(MOTIFS_SANS_ECHEANCE.map((m: string) =>
          [m, sql<number>`count(*) filter (where ${sansEcheanceSql} = ${m})::int`])),
        avec_echeance: sql<number>`count(*) filter (where ${sansEcheanceSql} is null)::int`,
      },
      etablissement: sql<number>`count(*) filter (where not ${whitelist.fourniParEditeur})::int`,
      avecEcheance: sql<number>`count(*) filter (where ${echeanceSql} is not null)::int`,
      // RENVOI VERS SNIFF, pas un compteur propre. Une règle disparue de l'EDR qui porte encore
      // une exclusion active signifie qu'une détection est revenue sans que personne l'ait
      // décidé.
      disparuesEncoreExclues: sql<number>`count(*) filter (where not ${whitelist.presente} and ${whitelist.sniffIncidentId} is not null)::int`,
      sansDateCreation: sql<number>`count(*) filter (where ${whitelist.dateCreation} is null)::int`,
      // Ce qui pèse sur une règle technique n'est pas une date mais l'absence de motif —
      // un manque qui se comble une fois et ne revient pas, donc un compteur qui converge.
      techniquesSansMotif: sql<number>`count(*) filter (where ${whitelist.technique} and coalesce(trim(${whitelist.motif}), '') = '')::int`,
    }).from(whitelist)
    return r ?? null
  }, { can: { category: 'whitelists', level: 'read' } })

  // PROLONGER — une décision, jamais un automatisme. Repose la date de révision à aujourd'hui :
  // l'échéance repart pour un an.
  .patch('/:id/prolonger', async ({ params, body, status, request }) => {
    const [avant] = await db.select().from(whitelist).where(eq(whitelist.id, params.id)).limit(1)
    if (!avant) return status(404, { message: 'Liste blanche introuvable.' })

    if (avant.technique) {
      return status(409, {
        message: 'Cette règle est technique : elle n\'a pas d\'échéance de revue, donc rien à prolonger.',
      })
    }
    if (avant.sniffIncidentId) {
      return status(409, {
        message: 'Cette exclusion est rattachée à un incident : sa date de revue se prolonge dans Sniff, '
          + 'où la décision a été prise et où le motif est tenu.',
        incidentId: avant.sniffIncidentId,
      })
    }

    beforeSnapshot.set(request, avant)

    const [maj] = await db.update(whitelist)
      .set({
        dateRevision: new Date(),
        prolongations: avant.prolongations + 1,
        notes: body.motif?.trim() ? `${avant.notes ? avant.notes + '\n' : ''}${new Date().toISOString().slice(0, 10)} — ${body.motif.trim()}` : avant.notes,
        updatedAt: new Date(),
      })
      .where(eq(whitelist.id, params.id))
      .returning()
    return maj!
  }, {
    can: { category: 'whitelists', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ motif: t.Optional(t.String()) }),
  })

  .get('/:id', async ({ params, status }) => {
    const [row] = await db.select({ ...getColonnes(), echeance: echeanceSql })
      .from(whitelist).where(eq(whitelist.id, params.id)).limit(1)
    return row ?? status(404, { message: 'Liste blanche introuvable.' })
  }, { can: { category: 'whitelists', level: 'read' }, params: t.Object({ id: t.String() }) })

/**
 * Où se corrige une liste blanche. Trois cas, et un seul vaut pour chaque règle.
 */
function ouCorrigerWhitelist(r: {
  sniffIncidentId: string | null
  fourniParEditeur: boolean
  presente: boolean
}): string {
  if (r.fourniParEditeur) {
    return 'HarfangLab, console de l\'éditeur. Règle livrée avec le produit : non soumise à revue.'
  }
  if (!r.presente) {
    return 'Aucune action : la règle est absente de l\'EDR au dernier relevé.'
      + ' Si une exclusion active la référence encore, sa levée relève de Sniff, sur l\'incident.'
  }
  if (r.sniffIncidentId) {
    return `Sniff, sur l'incident ${r.sniffIncidentId} : motif, date de revue et révocation.`
      + ' Le contenu de la règle se modifie dans HarfangLab.'
  }
  return 'HarfangLab pour le contenu ; Catalogue, page Listes blanches, pour la date de revue —'
    + ' aucune exclusion Sniff n\'est rattachée à cette règle.'
}

function getColonnes() {
  return {
    id: whitelist.id, source: whitelist.source, harfanglabId: whitelist.harfanglabId,
    sniffExclusionId: whitelist.sniffExclusionId, sniffIncidentId: whitelist.sniffIncidentId,
    certitudeRapprochement: whitelist.certitudeRapprochement, libelle: whitelist.libelle,
    criteres: whitelist.criteres, cible: whitelist.cible, regleSigma: whitelist.regleSigma,
    regleCorrelation: whitelist.regleCorrelation, motif: whitelist.motif, active: whitelist.active,
    dateCreation: whitelist.dateCreation, dateRevision: whitelist.dateRevision,
    prolongations: whitelist.prolongations, dateExpirationOutil: whitelist.dateExpirationOutil,
    vueAuSync: whitelist.vueAuSync, notes: whitelist.notes,
    // Nécessaires à la fiche : elles disent où la règle se modifie et qui en répond.
    technique: whitelist.technique, fourniParEditeur: whitelist.fourniParEditeur,
    presente: whitelist.presente, echeanceSniff: whitelist.echeanceSniff,
    // D'où vient la date quand Sniff la porte : exclusion d'incident, ou revue isolée.
    sniffRevueId: whitelist.sniffRevueId,
    tags: whitelist.tags, champTags: whitelist.champTags,
  }
}
