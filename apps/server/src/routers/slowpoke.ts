import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurSlowpoke, glpiMachine } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { chiffrer, dechiffrer } from '../utils/secrets'
import { testerConnexionSlowpoke, lireIncidents, lireIncidentsMachine, motifClotureSoc } from '../utils/slowpokeClient'

// Connecteur Slowpoke — admin. Incidents remontés en LECTURE SEULE (proxy live) : rien
// n'est stocké côté Catalogue, on interroge Slowpoke à la demande.
const SINGLETON = 'connecteur-slowpoke-singleton'

async function getConfig() {
  const [row] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1)
  if (row) return row
  const [created] = await db.insert(connecteurSlowpoke).values({ id: SINGLETON }).onConflictDoNothing().returning()
  return created ?? (await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1))[0]
}

function masquer(c: Awaited<ReturnType<typeof getConfig>>) {
  if (!c) return null
  const { cleService, secretWebhook, ...reste } = c
  return { ...reste, cleServiceDefinie: !!cleService, secretWebhookDefini: !!secretWebhook }
}

export const slowpokeRouter = new Elysia({ name: 'slowpoke', prefix: '/api/slowpoke' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Connecteurs'] } })

  .get('/config', async () => masquer(await getConfig()), { auth: ['admin'] })

  .put('/config', async ({ body }) => {
    const c = await getConfig()
    await db.update(connecteurSlowpoke)
      .set({
        url: body.url?.trim() || null,
        // Clé vide = inchangée.
        cleService: body.cleService?.trim() ? chiffrer(body.cleService.trim()) : c?.cleService,
        // Chiffré comme la clé de service ; vide = inchangé.
        secretWebhook: body.secretWebhook?.trim() ? chiffrer(body.secretWebhook.trim()) : c?.secretWebhook,
        actif: body.actif ?? false,
        autoNotifier: body.autoNotifier ?? c?.autoNotifier ?? true,
        updatedAt: new Date(),
      })
      .where(eq(connecteurSlowpoke.id, SINGLETON))
    return masquer(await getConfig())
  }, {
    auth: ['admin'],
    body: t.Object({
      url: t.Optional(t.String()),
      cleService: t.Optional(t.String()),
      secretWebhook: t.Optional(t.String()),
      actif: t.Optional(t.Boolean()),
      autoNotifier: t.Optional(t.Boolean()),
    }),
  })

  .post('/test', async ({ body }) => {
    const c = await getConfig()
    const url = body.url?.trim() || c?.url
    const cleService = body.cleService?.trim() || dechiffrer(c?.cleService)
    if (!url || !cleService) return { ok: false, message: 'URL et clé de service requises.' }
    return testerConnexionSlowpoke({ url, cleService })
  }, {
    auth: ['admin'],
    body: t.Object({ url: t.Optional(t.String()), cleService: t.Optional(t.String()) }),
  })

  // INCIDENTS D'UN ACTIF DU CATALOGUE (serveur, poste, mobile, IoT). Le rapprochement passe par
  // l'identifiant GLPI : la machine du Catalogue a été créée par la synchronisation, qui a
  // mémorisé `glpi_machine.cibleId` ; Sniff rattache ses incidents au même `glpi_id`.
  .get('/actifs/:id/incidents', async ({ params, query }) => {
    // TOUS les identifiants GLPI de cet actif, pas un seul. Ne lire qu'un identifiant, comme le
    // faisait la première version, revenait à tirer au sort : si l'incident était rattaché à
    // l'autre entrée dans Sniff, la fiche affichait « aucun incident » sur une machine qui en
    // portait un.
    const machines = await db
      .select({ glpiId: glpiMachine.glpiId, nom: glpiMachine.nom })
      .from(glpiMachine)
      .where(eq(glpiMachine.cibleId, params.id))

    if (!machines.length) return { etat: 'hors_inventaire' as const }

    const c = await getConfig()
    const cle = dechiffrer(c?.cleService)
    if (!c?.url || !cle || !c.actif) return { etat: 'non_configure' as const }

    const limite = Math.min(100, Math.max(1, Number(query.limite) || 20))
    try {
      const lots = await Promise.all(machines.map(m =>
        lireIncidentsMachine({ url: c.url!, cleService: cle }, m.glpiId, { limite })))
      // Dédoublonnage par identifiant d'incident : deux entrées GLPI de la même machine
      // peuvent porter le même incident, qui ne doit apparaître qu'une fois.
      const parId = new Map(lots.flat().map(i => [i.id, i]))
      const incidents = [...parId.values()]
        .sort((a, b) => String(b.knowledgeAt ?? b.createdAt).localeCompare(String(a.knowledgeAt ?? a.createdAt)))
        .slice(0, limite)
      return {
        etat: 'ok' as const,
        glpiId: machines.map(m => m.glpiId).join(', '),
        nomGlpi: machines[0]!.nom,
        entrees: machines.length,
        incidents,
      }
    }
    catch (e) {
      return { etat: 'erreur' as const, message: e instanceof Error ? e.message : String(e) }
    }
  }, {
    auth: ['user', 'admin'],
    params: t.Object({ id: t.String() }),
    query: t.Object({ limite: t.Optional(t.String()) }),
  })

  // Proxy lecture seule des incidents (live).
  .get('/incidents', async ({ query, status }) => {
    const c = await getConfig()
    const cle = dechiffrer(c?.cleService)
    if (!c?.url || !cle) {
      return status(422, { ok: false as const, message: 'Connecteur Slowpoke non configuré.' })
    }
    try {
      const lus = await lireIncidents({ url: c.url, cleService: cle }, { status: query.status })
      // Le motif brut de clôture du SOC à côté de la résolution : depuis que Sniff ne déduit
      // plus de résolution de « pas de risque de sécurité » ni « sans objet », c'est lui qui
      // permet de lire une fiche close sans résolution autrement que « on ne sait pas ».
      const incidents = lus.map(i => ({ ...i, motifClotureSoc: motifClotureSoc(i) }))
      await db.update(connecteurSlowpoke).set({ dernierAccesAt: new Date(), dernierStatut: 'ok', dernierMessage: null }).where(eq(connecteurSlowpoke.id, SINGLETON))
      return { ok: true as const, incidents }
    }
    catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await db.update(connecteurSlowpoke).set({ dernierAccesAt: new Date(), dernierStatut: 'erreur', dernierMessage: message }).where(eq(connecteurSlowpoke.id, SINGLETON))
      return status(422, { ok: false as const, message })
    }
  }, { auth: ['admin'], query: t.Object({ status: t.Optional(t.String()) }) })
