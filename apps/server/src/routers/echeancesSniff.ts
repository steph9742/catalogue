import { Elysia, t } from 'elysia'
import { and, asc, count, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurSlowpoke, sniffEcheance, sniffIncident } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { synchroniserEcheancesSniff } from '../utils/echeancesSniffSync'

// COMPTEURS RÉGLEMENTAIRES — miroir de Sniff, en lecture. Le Catalogue ne décide plus
// l'applicabilité et n'enregistre plus les dépôts : les deux se font dans Sniff, pendant la
// conduite de l'incident, par la personne qui le conduit.

const SINGLETON = 'connecteur-slowpoke-singleton'

const LIBELLE_CLE: Record<string, string> = {
  nis2_alerte: 'NIS 2 — alerte précoce (24 h)',
  nis2_notification: 'NIS 2 — notification (72 h)',
  nis2_rapport: 'NIS 2 — rapport final (1 mois)',
  rgpd: 'RGPD — notification CNIL (72 h)',
  cert_renater: 'CERT RENATER (72 h)',
}

export const echeancesSniffRouter = new Elysia({ name: 'echeances-sniff', prefix: '/api/nis2/echeances' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Conformité'] } })

  .get('/', async ({ query }) => {
    const conditions = []
    if (query.cle) conditions.push(eq(sniffEcheance.cle, query.cle))
    // « Ce qui court » : applicable ET rien de déposé. C'est le seul filtre qui désigne du
    // travail à faire maintenant.
    if (query.court === 'true') conditions.push(eq(sniffEcheance.court, true))
    if (query.deposes === 'true') conditions.push(sql`${sniffEcheance.deposeLe} is not null`)
    // Non tranché : ni la grille ni personne n'a dit oui ou non. Un état, pas un délai.
    if (query.aTrancher === 'true') {
      conditions.push(sql`${sniffEcheance.applicable} is null and ${sniffEcheance.defaut} = 'a_evaluer'`)
    }
    if (query.echues === 'true') {
      conditions.push(eq(sniffEcheance.court, true))
      conditions.push(sql`${sniffEcheance.echeance} < now()`)
    }
    const where = conditions.length ? and(...conditions) : undefined

    const total = (await db.select({ total: count() }).from(sniffEcheance).where(where))[0]?.total ?? 0
    const rows = await db.select({
      incidentId: sniffEcheance.incidentId,
      cle: sniffEcheance.cle,
      libelle: sniffEcheance.nom,
      depart: sniffEcheance.depart,
      // Texte qui CHANGE selon les réglages de Sniff : à afficher tel quel, jamais à analyser.
      condition: sniffEcheance.condition,
      porteur: sniffEcheance.porteur,
      defaut: sniffEcheance.defaut,
      applicable: sniffEcheance.applicable,
      decidePar: sniffEcheance.decidePar,
      decideLe: sniffEcheance.decideLe,
      court: sniffEcheance.court,
      echeance: sniffEcheance.echeance,
      deposeLe: sniffEcheance.deposeLe,
      reference: sniffEcheance.reference,
      deposePar: sniffEcheance.deposePar,
      majLe: sniffEcheance.vuAuSync,
      type: sniffIncident.type,
      severity: sniffIncident.severity,
      niveau: sniffIncident.niveau,
      statut: sniffIncident.statut,
      knowledgeAt: sniffIncident.knowledgeAt,
      knowledgeEstimated: sniffIncident.knowledgeEstimated,
    })
      .from(sniffEcheance)
      .leftJoin(sniffIncident, eq(sniffIncident.incidentId, sniffEcheance.incidentId))
      // Ce qui court d'abord, échéance la plus proche en tête ; la clé en dernier rend l'ordre
      // stable — sinon deux compteurs de même échéance permutent d'un appel à l'autre et l'un
      // disparaît à la pagination.
      .orderBy(sql`${sniffEcheance.court} desc`, asc(sniffEcheance.echeance), asc(sniffEcheance.cle))
      .limit(500)

    const [cfg] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1)

    return {
      total,
      tri: 'ce qui court d\'abord, puis échéance croissante, puis clé',
      // TÉMOIN D'ACTIVITÉ. Sans lui, un miroir vide et un connecteur en panne se
      // ressemblent — et le second ferait croire qu'aucune échéance ne court.
      source: {
        dernierAccesAt: cfg?.dernierAccesAt ?? null,
        dernierStatut: cfg?.dernierStatut ?? 'jamais',
        dernierMessage: cfg?.dernierMessage ?? null,
      },
      avertissement: 'Le Catalogue ne décide rien ici : l\'applicabilité et les dépôts se saisissent dans Sniff, '
        + 'sur l\'incident. Ce miroir ne s\'efface jamais sur une panne — vérifier `source.dernierAccesAt` '
        + 'avant de citer un chiffre.',
      resultats: rows.map(r => ({
        ...r,
        libelle: r.libelle ?? LIBELLE_CLE[r.cle] ?? r.cle,
        // Négatif = dépassé. Ne vaut que pour un compteur qui COURT : un jalon déposé avec
        // des heures négatives est un devoir accompli, pas un retard.
        joursRestants: r.echeance ? Math.round((r.echeance.getTime() - Date.now()) / 864e5) : null,
        depassee: !!(r.court && r.echeance && r.echeance.getTime() < Date.now()),
        aTrancher: r.applicable === null && r.defaut === 'a_evaluer',
      })),
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({
      cle: t.Optional(t.String()),
      court: t.Optional(t.String()),
      deposes: t.Optional(t.String()),
      aTrancher: t.Optional(t.String()),
      echues: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Compteurs réglementaires des incidents : NIS 2 (24 h / 72 h / 1 mois), RGPD, CERT RENATER.',
      description: 'Miroir de Sniff, en LECTURE SEULE — l\'applicabilité et les dépôts se saisissent là-bas, '
        + 'pendant la conduite. `court` est LE champ qui dit si un compteur doit être surveillé maintenant '
        + '(applicable ET rien de déposé) ; il vient de Sniff et n\'est jamais recalculé. `defaut` et '
        + '`applicable` restent séparés : « la grille dit oui » n\'est pas « quelqu\'un a décidé oui ». '
        + '`aTrancher` marque ce que personne n\'a encore décidé — un travail à faire, pas un délai. '
        + 'Un compteur déposé n\'est JAMAIS en retard, même avec des heures restantes négatives. '
        + '`condition` est un texte qui change selon les réglages de Sniff : à afficher tel quel.',
    },
  })

  .get('/resume', async () => {
    const [r] = await db.select({
      total: count(),
      courent: sql<number>`count(*) filter (where ${sniffEcheance.court})::int`,
      echues: sql<number>`count(*) filter (where ${sniffEcheance.court} and ${sniffEcheance.echeance} < now())::int`,
      sousUnJour: sql<number>`count(*) filter (where ${sniffEcheance.court} and ${sniffEcheance.echeance} between now() and now() + interval '1 day')::int`,
      deposes: sql<number>`count(*) filter (where ${sniffEcheance.deposeLe} is not null)::int`,
      // Ni la grille ni personne n'a tranché. Le compteur converge : il suffit de décider.
      aTrancher: sql<number>`count(*) filter (where ${sniffEcheance.applicable} is null and ${sniffEcheance.defaut} = 'a_evaluer')::int`,
    }).from(sniffEcheance)
    const [cfg] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1)
    const [inc] = await db.select({ incidents: count() }).from(sniffIncident)
    return {
      ...(r ?? {}),
      incidents: inc?.incidents ?? 0,
      source: {
        dernierAccesAt: cfg?.dernierAccesAt ?? null,
        dernierStatut: cfg?.dernierStatut ?? 'jamais',
        dernierMessage: cfg?.dernierMessage ?? null,
      },
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    detail: { summary: 'Compteurs réglementaires : combien courent, combien sont échus, combien restent à trancher.' },
  })

  /** Relève à la demande. L'ordonnanceur le fait toutes les 30 minutes. */
  .post('/sync', async () => synchroniserEcheancesSniff(), {
    auth: ['admin'],
    detail: { summary: 'Relève les compteurs réglementaires chez Sniff, hors du passage périodique.' },
  })
