import { Elysia } from 'elysia'
import { count, lt, eq, and, isNotNull } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { application, logicielPoste, serveur, tiers, accesVpn, technologie, entite, composante, departement, service, pole, personne } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { readableCategories, accesDe } from '../utils/access'

// Tableau de bord : agrégats limités aux catégories accessibles à l'utilisateur.
export const dashboardRouter = new Elysia({ name: 'dashboard' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Pilotage'] } })
  .get('/api/dashboard', async (ctx) => {
    // Utilisateur OU compte de service : voir `accesDe`.
    const user = accesDe(ctx)
    const cats = await readableCategories(user)
    const has = (c: string) => cats.has(c)

    const today = new Date().toISOString().slice(0, 10)
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nb = async (tbl: any) => (await db.select({ c: count() }).from(tbl))[0]?.c ?? 0

    const counts = {
      apps: has('applications') ? await nb(application) : null,
      postes: has('postes') ? await nb(logicielPoste) : null,
      serveurs: has('serveurs') ? await nb(serveur) : null,
      prestataires: has('tiers') ? await nb(tiers) : null,
      vpns: has('vpn') ? await nb(accesVpn) : null,
      technos: has('technologies') ? await nb(technologie) : null,
      // Cartographie humaine
      entites: has('entites') ? await nb(entite) : null,
      composantes: has('composantes') ? await nb(composante) : null,
      departements: has('departements') ? await nb(departement) : null,
      services: has('services') ? await nb(service) : null,
      poles: has('poles') ? await nb(pole) : null,
      personnes: has('personnes') ? await nb(personne) : null,
    }

    const parCriticite = has('applications')
      ? await db.select({ criticite: application.criticite, c: count() }).from(application).groupBy(application.criticite)
      : []
    const exposeesInternet = has('applications')
      ? (await db.select({ c: count() }).from(application).where(eq(application.exposition, 'internet')))[0]?.c ?? 0
      : null
    const rgpd = has('applications')
      ? (await db.select({ c: count() }).from(application).where(eq(application.donneesPersonnelles, true)))[0]?.c ?? 0
      : null
    const technosEol = has('technologies')
      ? await db.select({ id: technologie.id, nom: technologie.nom, version: technologie.version, finDeVie: technologie.finDeVie })
          .from(technologie).where(and(isNotNull(technologie.finDeVie), lt(technologie.finDeVie, today)))
      : []
    const vpnExpirant = has('vpn')
      ? await db.select({ id: accesVpn.id, identifiant: accesVpn.identifiant, dateExpiration: accesVpn.dateExpiration, statut: accesVpn.statut })
          .from(accesVpn).where(and(isNotNull(accesVpn.dateExpiration), lt(accesVpn.dateExpiration, in30)))
      : []

    return { counts, parCriticite, exposeesInternet, rgpd, technosEol, vpnExpirant }
  }, { auth: ['user', 'admin', 'svc'] })
