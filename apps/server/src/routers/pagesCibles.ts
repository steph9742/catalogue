import { Elysia, t } from 'elysia'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { pageCible, scriptPage, serviceExpose } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { auteurDecision } from '../utils/auteurDecision'
import { comparerScripts, etatDuScript, evaluerCsp } from '../utils/integriteScripts'

// PAGES CIBLES D'UN SERVICE — et la référence de leurs scripts. Monté sur le préfixe des sites
// et services, sur des chemins que ni le catalogue générique (`/:id`) ni `servicesExposes.ts`
// (`/:id/fiche`, `/:id/scan`, `/:id/historique`) ne servent.

const NATURES = ['paiement', 'panier', 'connexion', 'donnees_personnelles', 'autre'] as const

export const pagesCiblesRouter = new Elysia({ name: 'pages-cibles', prefix: '/api/sites-services' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Sites et services'] } })

  .get('/:id/pages', async ({ params, status }) => {
    const [s] = await db.select({ id: serviceExpose.id }).from(serviceExpose).where(eq(serviceExpose.id, params.id)).limit(1)
    if (!s) return status(404, 'Service introuvable')
    const pages = await db.select().from(pageCible).where(eq(pageCible.serviceId, params.id)).orderBy(asc(pageCible.url))
    const scripts = pages.length
      ? await db.select().from(scriptPage).where(inArray(scriptPage.pageId, pages.map(p => p.id)))
      : []

    return pages.map((p) => {
      const observes = scripts.filter(x => x.pageId === p.id && x.role === 'observe')
      const reference = scripts.filter(x => x.pageId === p.id && x.role === 'reference')
      const validee = !!p.referenceValideeLe
      return {
        id: p.id,
        url: p.url,
        nature: p.nature,
        notes: p.notes,
        dernierReleveLe: p.dernierReleveLe,
        referenceValideeLe: p.referenceValideeLe,
        referenceValideePar: p.referenceValideePar,
        referenceScripts: reference.length,
        // Jamais relevée : « non relevée », pas « absente ». Même distinction que les en-têtes.
        csp: evaluerCsp(p.dernierReleveLe ? (p.csp ?? '') : null),
        cspValeur: p.csp,
        sri: {
          externes: observes.filter(x => x.externe).length,
          avecIntegrity: observes.filter(x => x.externe && x.integrity).length,
        },
        scripts: observes.map(x => ({
          src: x.src, domaine: x.domaine, externe: x.externe, sha256: x.sha256, integrity: x.integrity,
          etat: etatDuScript(x, reference, validee),
        })),
        ecarts: validee && p.dernierReleveLe ? comparerScripts(reference, observes) : [],
      }
    })
  }, {
    can: { category: 'sites-services', level: 'read' },
    params: t.Object({ id: t.String() }),
    detail: {
      summary: 'Pages cibles d\'un service : scripts servis, écarts à la référence, CSP effective, SRI.',
      description: 'Sans référence validée, `ecarts` est vide et chaque script est `sans_reference` : aucun écart '
        + 'ne peut être dit. `csp.etat` distingue `non_relevee` (jamais relevée), `absente`, `inoperante` (aucune '
        + 'restriction des scripts), `faible` et `effective`. Une page conforme n\'est pas une page saine.',
    },
  })

  .post('/:id/pages', async ({ params, body, status }) => {
    const [s] = await db.select().from(serviceExpose).where(eq(serviceExpose.id, params.id)).limit(1)
    if (!s) return status(404, 'Service introuvable')
    let u: URL
    try { u = new URL(body.url.trim()) }
    catch { return status(400, 'Adresse illisible : saisissez une URL complète, https://…') }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return status(400, 'Seules les pages http et https se relèvent.')
    // UNE PAGE D'UN AUTRE HÔTE APPARTIENT À UN AUTRE SERVICE. La rattacher ici mêlerait deux
    // références, et un écart sur l'un s'afficherait sur la fiche de l'autre.
    if (u.hostname.toLowerCase() !== s.hote.toLowerCase()) {
      return status(400, `La page doit être servie par ${s.hote}. Une page d'un autre hôte se déclare sur la fiche de son service.`)
    }
    u.hash = ''
    const [p] = await db.insert(pageCible)
      .values({ serviceId: s.id, url: u.toString(), nature: body.nature, notes: body.notes?.trim() || null })
      .onConflictDoNothing().returning()
    if (!p) return status(409, 'Cette page est déjà déclarée pour ce service.')
    return p
  }, {
    can: { category: 'sites-services', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      url: t.String(),
      nature: t.Union(NATURES.map(n => t.Literal(n))),
      notes: t.Optional(t.String()),
    }),
    detail: { summary: 'Déclare une page cible : relevée par le moteur avec l\'inventaire de ses scripts.' },
  })

  .delete('/pages/:pageId', async ({ params, status }) => {
    const [p] = await db.delete(pageCible).where(eq(pageCible.id, params.pageId)).returning({ id: pageCible.id })
    if (!p) return status(404, 'Page introuvable')
    return { ok: true }
  }, {
    can: { category: 'sites-services', level: 'write' },
    params: t.Object({ pageId: t.String() }),
    detail: { summary: 'Retire une page cible, avec sa référence de scripts. Les constats déjà levés restent.' },
  })

  /**
   * VALIDER LA RÉFÉRENCE : les scripts servis au dernier relevé deviennent la norme.
   */
  .post('/pages/:pageId/reference', async ({ params, request, status }) => {
    const [p] = await db.select().from(pageCible).where(eq(pageCible.id, params.pageId)).limit(1)
    if (!p) return status(404, 'Page introuvable')
    if (!p.dernierReleveLe) return status(409, 'Cette page n\'a jamais été relevée : il n\'y a rien à valider comme référence.')

    const observes = await db.select().from(scriptPage).where(and(eq(scriptPage.pageId, p.id), eq(scriptPage.role, 'observe')))
    const par = await auteurDecision(request.headers)
    const maintenant = new Date()
    await db.transaction(async (tx) => {
      await tx.delete(scriptPage).where(and(eq(scriptPage.pageId, p.id), eq(scriptPage.role, 'reference')))
      if (observes.length) {
        await tx.insert(scriptPage).values(observes.map(x => ({
          pageId: p.id, role: 'reference' as const, src: x.src, domaine: x.domaine, externe: x.externe,
          sha256: x.sha256, integrity: x.integrity, releveLe: x.releveLe,
        })))
      }
      await tx.update(pageCible).set({ referenceValideeLe: maintenant, referenceValideePar: par, updatedAt: maintenant })
        .where(eq(pageCible.id, p.id))
    })
    return { ok: true, scripts: observes.length }
  }, {
    can: { category: 'sites-services', level: 'write' },
    params: t.Object({ pageId: t.String() }),
    detail: { summary: 'Valide les scripts du dernier relevé comme référence de la page.' },
  })
