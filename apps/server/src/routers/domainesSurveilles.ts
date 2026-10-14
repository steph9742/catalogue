import { Elysia, t } from 'elysia'
import { asc, eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { domaineSurveille } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { lireListeDomaines } from '../utils/auditClient'
import { verifierParametres } from '../utils/axfr'
import { estEnCours, importerZone, releverDomaine, releverDomainesEchus } from '../utils/ctReleve'
import { chiffrer, dechiffrer } from '../utils/secrets'

// DOMAINES SURVEILLÉS — d'où partent les découvertes de sites : Certificate Transparency,
// transfert de zone DNS, import d'un fichier de zone.

type Ligne = typeof domaineSurveille.$inferSelect
/** Le secret TSIG ne sort jamais : on dit seulement s'il est défini. */
function masquer({ tsigSecret, ...reste }: Ligne) {
  return { ...reste, tsigSecretDefini: !!tsigSecret }
}

export const domainesSurveillesRouter = new Elysia({ name: 'domaines-surveilles', prefix: '/api/domaines-surveilles' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Audit de surface externe'] } })

  .get('/', async () => (await db.select().from(domaineSurveille).orderBy(asc(domaineSurveille.nom))).map(masquer), {
    can: { category: 'audit-surface', level: 'read' },
    detail: { summary: 'Domaines surveillés, leur transfert de zone et leur dernier relevé.' },
  })

  .post('/', async ({ body }) => {
    // AUTANT DE DOMAINES QU'ON VEUT, collés d'un coup : un par ligne, virgules et
    // points-virgules acceptés. Les refus sont rendus : un domaine mal saisi ne disparaît pas.
    const { valides, rejets } = lireListeDomaines(body.noms.split(/[\s,;]+/))
    const ajoutes = valides.length
      ? await db.insert(domaineSurveille).values(valides.map(nom => ({ nom }))).onConflictDoNothing().returning({ nom: domaineSurveille.nom })
      : []
    return { ajoutes: ajoutes.map(a => a.nom), dejaPresents: valides.filter(v => !ajoutes.some(a => a.nom === v)), rejets }
  }, {
    can: { category: 'audit-surface', level: 'write' },
    body: t.Object({ noms: t.String() }),
    detail: { summary: 'Ajoute un ou plusieurs domaines à surveiller (un par ligne).' },
  })

  .delete('/:id', async ({ params, status }) => {
    const [d] = await db.delete(domaineSurveille).where(eq(domaineSurveille.id, params.id)).returning({ id: domaineSurveille.id })
    if (!d) return status(404, 'Domaine introuvable')
    return { ok: true }
  }, {
    can: { category: 'audit-surface', level: 'write' },
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Retire un domaine. Les découvertes déjà faites restent dans la file.' },
  })

  /**
   * TRANSFERT DE ZONE : serveur DNS et clé TSIG. Réservé aux administrateurs — un secret TSIG
   * est une clé d'accès au DNS de l\'établissement.
   */
  .put('/:id/transfert', async ({ params, body, status }) => {
    const [d] = await db.select().from(domaineSurveille).where(eq(domaineSurveille.id, params.id)).limit(1)
    if (!d) return status(404, 'Domaine introuvable')
    const serveur = body.serveurDns?.trim() || null
    if (!serveur) {
      await db.update(domaineSurveille).set({ serveurDns: null, tsigNom: null, tsigAlgorithme: null, tsigSecret: null, updatedAt: new Date() })
        .where(eq(domaineSurveille.id, d.id))
      return { ok: true, transfert: false }
    }
    const nomCle = body.tsigNom?.trim() || null
    const algorithme = body.tsigAlgorithme?.trim() || 'hmac-sha256'
    // Secret vide = inchangé, comme les jetons des connecteurs.
    const secret = body.tsigSecret?.trim() || (nomCle ? dechiffrer(d.tsigSecret) : null)
    if (nomCle && !secret) return status(400, 'Une clé TSIG demande son secret.')
    const refus = verifierParametres(d.nom, serveur, nomCle && secret ? { nom: nomCle, algorithme, secret } : undefined)
    if (refus) return status(400, refus)
    await db.update(domaineSurveille).set({
      serveurDns: serveur,
      tsigNom: nomCle,
      tsigAlgorithme: nomCle ? algorithme : null,
      tsigSecret: nomCle && secret ? chiffrer(secret) : null,
      updatedAt: new Date(),
    }).where(eq(domaineSurveille.id, d.id))
    return { ok: true, transfert: true }
  }, {
    auth: ['admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({
      serveurDns: t.Nullable(t.String()),
      tsigNom: t.Optional(t.Nullable(t.String())),
      // Texte, vérifié par `verifierParametres` contre la liste des algorithmes connus.
      tsigAlgorithme: t.Optional(t.Nullable(t.String())),
      tsigSecret: t.Optional(t.String()),
    }),
    detail: { summary: 'Configure le transfert de zone (AXFR) d\'un domaine : serveur DNS et clé TSIG facultative.' },
  })

  .post('/:id/zone', async ({ params, body, status }) => {
    try {
      return await importerZone(params.id, body.texte)
    }
    catch (e) {
      return status(400, e instanceof Error ? e.message : String(e))
    }
  }, {
    can: { category: 'audit-surface', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ texte: t.String() }),
    detail: {
      summary: 'Importe un fichier de zone DNS (format BIND) : ses noms A, AAAA et CNAME rejoignent les découvertes.',
      description: 'Pour un domaine dont le serveur refuse le transfert, ou géré ailleurs. Les enregistrements joker '
        + 'sont comptés, pas proposés ; un CNAME dont la cible ne résout pas est proposé et signalé pendant.',
    },
  })

  .post('/:id/relever', async ({ params, status }) => {
    const [d] = await db.select().from(domaineSurveille).where(eq(domaineSurveille.id, params.id)).limit(1)
    if (!d) return status(404, 'Domaine introuvable')
    if (estEnCours(d)) return status(409, `Un relevé de ${d.nom} est déjà en cours.`)
    void releverDomaine(d.id).catch(e => console.error(`[domaines] relevé de ${d.nom} en échec —`, e instanceof Error ? e.message : e))
    return { demarre: true }
  }, {
    can: { category: 'audit-surface', level: 'write' },
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Lance le relevé d\'un domaine (Certificate Transparency, puis transfert de zone s\'il est configuré), en arrière-plan.' },
  })

  .post('/relever-tout', async () => {
    // `ageMs: 0` : tous les domaines actifs, un à la fois.
    void releverDomainesEchus(0).catch(e => console.error('[domaines] relevé de tous les domaines en échec —', e instanceof Error ? e.message : e))
    return { demarre: true }
  }, {
    can: { category: 'audit-surface', level: 'write' },
    detail: { summary: 'Lance le relevé de tous les domaines actifs, un à la fois, en arrière-plan.' },
  })
