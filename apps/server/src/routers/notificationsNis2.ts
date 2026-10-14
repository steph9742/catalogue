import { Elysia, t } from 'elysia'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { notificationIncidentNis2, personne } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import {
  GRAVITES_AUTO,
  creerSuiviDepuisIncident,
  getConfigSlowpoke,
  importerNotificationsCritiques,
  incidentsDejaSuivis,
  libelleIncident,
} from '../utils/notificationsSlowpoke'
import { lireIncidents } from '../utils/slowpokeClient'

// Notification d'incidents NIS 2 (art. 23) — les échéances réglementaires 24 h / 72 h / 1 mois
// découlent de `dateDetection` (prise de connaissance) : on les CALCULE ici plutôt que de les
// stocker, pour qu'elles restent justes si la date de détection est corrigée.

const H = 3600 * 1000
const DELAIS = { alerte: 24 * H, notification: 72 * H, rapport: 30 * 24 * H } as const

// État d'un jalon : fait (horodaté), en retard (échéance dépassée), ou à faire.
function etatJalon(faitAt: Date | null, echeance: Date, maintenant: number) {
  if (faitAt) return 'fait' as const
  return echeance.getTime() < maintenant ? 'en_retard' as const : 'a_faire' as const
}

function enrichir(n: typeof notificationIncidentNis2.$inferSelect & { referent?: string | null }, maintenant: number) {
  const base = new Date(n.dateDetection).getTime()
  const jalons = {
    alerte: {
      echeance: new Date(base + DELAIS.alerte),
      faitAt: n.alertePrecoceAt,
      reference: n.alertePrecoceRef,
      etat: etatJalon(n.alertePrecoceAt, new Date(base + DELAIS.alerte), maintenant),
    },
    notification: {
      echeance: new Date(base + DELAIS.notification),
      faitAt: n.notificationAt,
      reference: n.notificationRef,
      etat: etatJalon(n.notificationAt, new Date(base + DELAIS.notification), maintenant),
    },
    rapport: {
      echeance: new Date(base + DELAIS.rapport),
      faitAt: n.rapportFinalAt,
      reference: n.rapportFinalRef,
      etat: etatJalon(n.rapportFinalAt, new Date(base + DELAIS.rapport), maintenant),
    },
  }
  // Ni une notification clôturée, ni une « non applicable » (jugée non significative)
  // ne peuvent être en retard : plus aucune obligation ne court.
  const suivie = n.statut !== 'close' && n.statut !== 'non_applicable'
  const enRetard = suivie
    && (jalons.alerte.etat === 'en_retard' || jalons.notification.etat === 'en_retard' || jalons.rapport.etat === 'en_retard')
  return { ...n, jalons, enRetard }
}

// Colonnes d'un jalon dans la table (pour le patch générique de bascule).
const COLS = {
  alerte: { at: 'alertePrecoceAt', ref: 'alertePrecoceRef' },
  notification: { at: 'notificationAt', ref: 'notificationRef' },
  rapport: { at: 'rapportFinalAt', ref: 'rapportFinalRef' },
} as const

export const notificationsNis2Router = new Elysia({ name: 'notifications-nis2-suivi' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Conformité'] } })

  // Liste enrichie : référent + échéances + états de jalon (pour la timeline).
  .get('/api/nis2/notifications', async () => {
    const rows = await db
      .select({
        n: notificationIncidentNis2,
        referent: sql<string | null>`nullif(trim(coalesce(${personne.prenom}, '') || ' ' || coalesce(${personne.nom}, '')), '')`,
      })
      .from(notificationIncidentNis2)
      .leftJoin(personne, eq(personne.id, notificationIncidentNis2.referentId))
      .orderBy(asc(notificationIncidentNis2.dateDetection))
    const maintenant = Date.now()
    return rows.map(r => enrichir({ ...r.n, referent: r.referent }, maintenant))
  }, { can: { category: 'notifications-nis2', level: 'read' } })

  // Création d'un suivi à partir d'un incident (Slowpoke ou saisie manuelle).
  .post('/api/nis2/notifications/from-incident', async ({ body }) => {
    const [row] = await db
      .insert(notificationIncidentNis2)
      .values({
        incidentExterneId: body.incidentExterneId?.trim() || null,
        libelle: body.libelle.trim(),
        gravite: body.gravite?.trim() || null,
        description: body.description?.trim() || null,
        // Prise de connaissance : fournie, sinon maintenant (départ des délais).
        dateDetection: body.dateDetection ? new Date(body.dateDetection) : new Date(),
        // Saisie humaine : l'origine est tracée comme les dates issues du connecteur, et
        // l'estimation est un choix explicite de celui qui saisit — pas un défaut.
        dateDetectionOrigine: 'saisie',
        dateDetectionEstimee: body.dateDetectionEstimee ?? false,
        referentId: body.referentId?.trim() || null,
      })
      .returning()
    return row
  }, {
    can: { category: 'notifications-nis2', level: 'write' },
    body: t.Object({
      libelle: t.String({ minLength: 1 }),
      incidentExterneId: t.Optional(t.String()),
      gravite: t.Optional(t.String()),
      description: t.Optional(t.String()),
      dateDetection: t.Optional(t.String()),
      dateDetectionEstimee: t.Optional(t.Boolean()),
      referentId: t.Optional(t.String()),
    }),
  })

  // Bascule d'un jalon : « fait » pose l'horodatage (maintenant) + la référence ANSSI ;
  // « défait » les efface. Le statut suit : premier jalon → en cours, rapport final → clos.
  .patch('/api/nis2/notifications/:id/jalon', async ({ params, body, status }) => {
    const [avant] = await db.select().from(notificationIncidentNis2).where(eq(notificationIncidentNis2.id, params.id)).limit(1)
    if (!avant) return status(404, { message: 'Notification introuvable' })

    const col = COLS[body.jalon]
    const patch: Record<string, unknown> = {
      [col.at]: body.done ? new Date() : null,
      [col.ref]: body.done ? (body.reference?.trim() || null) : null,
      updatedAt: new Date(),
    }
    // Statut déduit, sans écraser une clôture manuelle vers l'ouverture.
    if (body.jalon === 'rapport' && body.done) patch.statut = 'close'
    else if (body.done && avant.statut === 'ouverte') patch.statut = 'en_cours'

    const [row] = await db
      .update(notificationIncidentNis2)
      .set(patch)
      .where(eq(notificationIncidentNis2.id, params.id))
      .returning()
    return row
  }, {
    can: { category: 'notifications-nis2', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      jalon: t.Union([t.Literal('alerte'), t.Literal('notification'), t.Literal('rapport')]),
      done: t.Boolean(),
      reference: t.Optional(t.String()),
    }),
  })

  // Statut manuel — sert surtout à marquer « non applicable » un incident importé
  // automatiquement mais jugé non significatif (art.
  .patch('/api/nis2/notifications/:id/statut', async ({ params, body, status }) => {
    const [avant] = await db.select().from(notificationIncidentNis2).where(eq(notificationIncidentNis2.id, params.id)).limit(1)
    if (!avant) return status(404, { message: 'Notification introuvable' })

    const justification = body.justification?.trim()
    const notes = justification
      ? [avant.notes, `Non applicable : ${justification}`].filter(Boolean).join('\n')
      : avant.notes
    const [row] = await db
      .update(notificationIncidentNis2)
      .set({
        statut: body.statut as never,
        // Marquer « non applicable » revient à dire : incident NON significatif.
        significatif: body.statut === 'non_applicable' ? false : avant.significatif,
        notes,
        updatedAt: new Date(),
      })
      .where(eq(notificationIncidentNis2.id, params.id))
      .returning()
    return row
  }, {
    can: { category: 'notifications-nis2', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      statut: t.Union([t.Literal('ouverte'), t.Literal('en_cours'), t.Literal('close'), t.Literal('non_applicable')]),
      justification: t.Optional(t.String()),
    }),
  })

  // --- Pont Slowpoke ----------------------------------------------------------------
  // Incidents Slowpoke (live) avec l'indication de ceux DÉJÀ suivis : alimente le bouton
  // « Importer depuis Slowpoke » pour les gravités que l'automatisme ne prend pas.
  .get('/api/nis2/notifications/slowpoke', async ({ status }) => {
    const cfg = await getConfigSlowpoke()
    if (!cfg?.url || !cfg.cleService) {
      return status(422, { ok: false as const, message: 'Connecteur Slowpoke non configuré.' })
    }
    try {
      const incidents = await lireIncidents({ url: cfg.url, cleService: cfg.cleService }, { pageSize: 100 })
      const deja = await incidentsDejaSuivis(incidents.map(i => i.id))
      return {
        ok: true as const,
        incidents: incidents.map(i => ({
          id: i.id,
          libelle: libelleIncident(i),
          severity: i.severity,
          status: i.status,
          createdAt: i.createdAt,
          dejaSuivi: deja.has(i.id),
          auto: (GRAVITES_AUTO as readonly string[]).includes(i.severity),
        })),
      }
    }
    catch (e) {
      return status(422, { ok: false as const, message: e instanceof Error ? e.message : String(e) })
    }
  }, { can: { category: 'notifications-nis2', level: 'read' } })

  // Import à la demande d'UN incident précis (bouton de la liste).
  .post('/api/nis2/notifications/importer/:incidentId', async ({ params, status }) => {
    const cfg = await getConfigSlowpoke()
    if (!cfg?.url || !cfg.cleService) {
      return status(422, { ok: false as const, message: 'Connecteur Slowpoke non configuré.' })
    }
    const deja = await incidentsDejaSuivis([params.incidentId])
    if (deja.has(params.incidentId)) return { ok: true as const, deja: true as const }
    try {
      const incidents = await lireIncidents({ url: cfg.url, cleService: cfg.cleService }, { pageSize: 100 })
      const incident = incidents.find(i => i.id === params.incidentId)
      if (!incident) return status(404, { ok: false as const, message: 'Incident introuvable dans Slowpoke.' })
      const row = await creerSuiviDepuisIncident(incident, { url: cfg.url, cleService: cfg.cleService })
      return { ok: true as const, deja: false as const, notification: row }
    }
    catch (e) {
      return status(422, { ok: false as const, message: e instanceof Error ? e.message : String(e) })
    }
  }, {
    can: { category: 'notifications-nis2', level: 'write' },
    params: t.Object({ incidentId: t.String() }),
  })

  // Rattrapage manuel : ouvre les suivis pour TOUS les incidents critiques/élevés non
  // encore suivis (même logique que l'ordonnanceur, déclenchée à la demande).
  .post('/api/nis2/notifications/importer-critiques', async ({ status }) => {
    try {
      return { ok: true as const, ...(await importerNotificationsCritiques()) }
    }
    catch (e) {
      return status(422, { ok: false as const, message: e instanceof Error ? e.message : String(e) })
    }
  }, { can: { category: 'notifications-nis2', level: 'write' } })

  // Compteurs : notifications ouvertes et jalons en retard (badge / tableau de bord).
  .get('/api/nis2/notifications/compteurs', async () => {
    const rows = await db.select().from(notificationIncidentNis2)
    const maintenant = Date.now()
    let ouvertes = 0
    let enRetard = 0
    let nonApplicables = 0
    for (const n of rows) {
      const e = enrichir({ ...n, referent: null }, maintenant)
      if (n.statut === 'non_applicable') nonApplicables++
      else if (n.statut !== 'close') ouvertes++
      if (e.enRetard) enRetard++
    }
    return { total: rows.length, ouvertes, enRetard, nonApplicables }
  }, { can: { category: 'notifications-nis2', level: 'read' } })
