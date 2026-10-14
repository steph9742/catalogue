import { Elysia } from 'elysia'
import { and, eq, inArray, isNotNull, lt, ne, or, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  actionNis2,
  appareilMobile,
  changeRequest,
  composante,
  exigenceNis2,
  glpiMachine,
  iot,
  mesureSmsi,
  notificationIncidentNis2,
  partiePrenante,
  posteTravail,
  risqueSmsi,
  serveur,
  technologie,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { computeAlerts } from './alerts'
import { comptesParComposante } from './composantes'
import { machinesHorsSupport, osSansDate } from './eol'
import { managedCategories, readableCategories, accesDe } from '../utils/access'

// Tableau de bord de PILOTAGE — répond à « qu'est-ce qui cloche aujourd'hui ?

const H = 3600 * 1000
const DELAIS = { alerte: 24 * H, notification: 72 * H, rapport: 30 * 24 * H }

export const pilotageRouter = new Elysia({ name: 'pilotage' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Pilotage'] } })
  .get('/api/dashboard/pilotage', async (ctx) => {
    // Utilisateur OU compte de service : voir `accesDe`.
    const user = accesDe(ctx)
    const [cats, gerees] = await Promise.all([readableCategories(user), managedCategories(user)])
    const has = (c: string) => cats.has(c)
    const today = new Date().toISOString().slice(0, 10)
    const maintenant = Date.now()

    // --- (a) URGENCES -----------------------------------------------------------------
    // Jalons de notification NIS 2 dépassés : calculés depuis la prise de connaissance
    // (les échéances ne sont pas stockées, cf. routers/notificationsNis2).
    let notifsEnRetard = 0
    let notifProchaine: { id: string, libelle: string, echeance: string, jalon: string } | null = null
    if (has('notifications-nis2')) {
      const rows = await db.select().from(notificationIncidentNis2)
        .where(and(ne(notificationIncidentNis2.statut, 'close'), ne(notificationIncidentNis2.statut, 'non_applicable')))
      for (const n of rows) {
        const base = new Date(n.dateDetection).getTime()
        const jalons = [
          { cle: 'alerte précoce', echeance: base + DELAIS.alerte, fait: n.alertePrecoceAt },
          { cle: 'notification', echeance: base + DELAIS.notification, fait: n.notificationAt },
          { cle: 'rapport final', echeance: base + DELAIS.rapport, fait: n.rapportFinalAt },
        ]
        if (jalons.some(j => !j.fait && j.echeance < maintenant)) notifsEnRetard++
        // Prochaine échéance à honorer, tous suivis confondus.
        for (const j of jalons) {
          if (j.fait || j.echeance < maintenant) continue
          if (!notifProchaine || j.echeance < new Date(notifProchaine.echeance).getTime()) {
            notifProchaine = { id: n.id, libelle: n.libelle, echeance: new Date(j.echeance).toISOString(), jalon: j.cle }
          }
          break
        }
      }
    }

    const actionsEnRetard = has('actions-nis2')
      ? (await db.select({ c: sql<number>`count(*)::int` }).from(actionNis2)
          .where(and(inArray(actionNis2.statut, ['a_faire', 'en_cours']), isNotNull(actionNis2.echeance), lt(actionNis2.echeance, today))))[0]?.c ?? 0
      : null

    // Demandes en attente, limitées aux catégories que l'utilisateur gère (null s'il n'en
    // gère aucune : la tuile disparaît alors du tableau de bord).
    const demandes = gerees.size
      ? (await db.select({ c: sql<number>`count(*)::int` }).from(changeRequest)
          .where(and(eq(changeRequest.status, 'pending'), inArray(changeRequest.category, [...gerees]))))[0]?.c ?? 0
      : null

    const alertes = await computeAlerts().catch(() => [])
    const alertesCritiques = alertes.filter(a => a.severity === 'critical').length

    const aClasser = (await db.select({ c: sql<number>`count(*)::int` }).from(glpiMachine)
      .where(eq(glpiMachine.classement, 'a_classer')))[0]?.c ?? 0

    // --- (b) POSTURE ------------------------------------------------------------------
    let conformiteNis2: { taux: number, fait: number, base: number } | null = null
    if (has('exigences-nis2')) {
      const [e] = await db.select({
        total: sql<number>`count(*)::int`,
        fait: sql<number>`count(*) filter (where ${exigenceNis2.conformite} = 'fait')::int`,
        nonApplicables: sql<number>`count(*) filter (where ${exigenceNis2.statut} = 'non_applicable')::int`,
      }).from(exigenceNis2)
      const base = (e?.total ?? 0) - (e?.nonApplicables ?? 0)
      conformiteNis2 = { taux: base ? Math.round(((e?.fait ?? 0) / base) * 100) : 0, fait: e?.fait ?? 0, base }
    }

    const risquesCritiques = has('risques-smsi')
      ? (await db.select({ c: sql<number>`count(*)::int` }).from(risqueSmsi)
          .where(and(
            inArray(risqueSmsi.gravite, ['grave', 'critique']),
            or(inArray(risqueSmsi.statut, ['identifie', 'evalue', 'en_traitement']), eq(risqueSmsi.risqueAccepte, false)),
          )))[0]?.c ?? 0
      : null

    const mesuresEnAttente = has('mesures-smsi')
      ? (await db.select({ c: sql<number>`count(*)::int` }).from(mesureSmsi)
          .where(and(eq(mesureSmsi.applicable, true), inArray(mesureSmsi.statut, ['a_faire', 'en_cours']))))[0]?.c ?? 0
      : null

    // Parties prenantes en zone de danger : menace = (dép × pén) / (mat × conf) > 3.
    const horsSupport = has('technologies') ? await machinesHorsSupport() : null
    const sansDateEol = has('technologies') ? await osSansDate() : null

    const partiesDanger = has('parties-prenantes')
      ? (await db.select({ c: sql<number>`count(*)::int` }).from(partiePrenante)
          .where(sql`${partiePrenante.dependance} is not null and ${partiePrenante.penetration} is not null
                     and ${partiePrenante.maturiteCyber} is not null and ${partiePrenante.confiance} is not null
                     and (${partiePrenante.dependance} * ${partiePrenante.penetration})::numeric
                         / nullif(${partiePrenante.maturiteCyber} * ${partiePrenante.confiance}, 0) > 3`))[0]?.c ?? 0
      : null

    // --- (c) PARC ---------------------------------------------------------------------
    const compteur = async (tbl: typeof serveur | typeof posteTravail | typeof appareilMobile | typeof iot) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await db.select({ c: sql<number>`count(*)::int` }).from(tbl as any))[0]?.c ?? 0

    const parc = {
      serveurs: has('serveurs') ? await compteur(serveur) : null,
      postes: has('postes-travail') ? await compteur(posteTravail) : null,
      mobiles: has('appareils-mobiles') ? await compteur(appareilMobile) : null,
      iot: has('iot') ? await compteur(iot) : null,
    }

    // Répartition par composante (serveurs + postes) — le pivot le plus parlant.
    let parComposante: { id: string, nom: string, serveurs: number, postes: number }[] = []
    if (has('composantes')) {
      const [lignes, srv, pst] = await Promise.all([
        db.select({ id: composante.id, nom: composante.nom }).from(composante),
        comptesParComposante(serveur.composanteId as never, serveur),
        comptesParComposante(posteTravail.composanteId as never, posteTravail),
      ])
      parComposante = lignes
        .map(l => ({ ...l, serveurs: srv.get(l.id) ?? 0, postes: pst.get(l.id) ?? 0 }))
        .sort((a, b) => (b.serveurs + b.postes) - (a.serveurs + a.postes))
        .slice(0, 8)
    }

    const technosEol = has('technologies')
      ? (await db.select({ c: sql<number>`count(*)::int` }).from(technologie)
          .where(and(isNotNull(technologie.finDeVie), lt(technologie.finDeVie, today))))[0]?.c ?? 0
      : null

    // Part de l'inventaire issue de GLPI (vs saisie manuelle) : mesure la couverture.
    const issusGlpi = (await db.select({ c: sql<number>`count(*)::int` }).from(glpiMachine))[0]?.c ?? 0

    return {
      urgences: {
        notifsEnRetard: has('notifications-nis2') ? notifsEnRetard : null,
        notifProchaine,
        actionsEnRetard,
        demandes,
        alertesCritiques: alertes.length ? alertesCritiques : 0,
        alertesTotal: alertes.length,
        aClasser,
      },
      posture: { conformiteNis2, risquesCritiques, mesuresEnAttente, partiesDanger, horsSupport, sansDateEol },
      parc: { ...parc, parComposante, technosEol, issusGlpi },
    }
  }, { auth: ['user', 'admin', 'svc'] })
