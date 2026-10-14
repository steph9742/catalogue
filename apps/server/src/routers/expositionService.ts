import { Elysia, t } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { serviceExpose } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { auteurDecision } from '../utils/auteurDecision'
import { CLASSEMENTS, estSensible, prochaineRevue } from '../utils/classement'

// EXPOSITION D'UN SERVICE — les deux décisions qui gardent leur auteur. Le formulaire générique
// édite les champs ; le CLASSEMENT et la REVUE passent par ici, parce que ce sont des décisions
// : le moteur propose un classement, une personne le valide ; une revue d'exposition se fait,
// se date et se signe.

export const expositionServiceRouter = new Elysia({ name: 'exposition-service', prefix: '/api/sites-services' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Sites et services'] } })

  .post('/:id/classement', async ({ params, body, request, status }) => {
    const [s] = await db.select({ id: serviceExpose.id }).from(serviceExpose).where(eq(serviceExpose.id, params.id)).limit(1)
    if (!s) return status(404, 'Service introuvable')
    const maintenant = new Date()
    const [maj] = await db.update(serviceExpose).set({
      classement: body.classement,
      classementValidePar: await auteurDecision(request.headers),
      classementValideLe: maintenant,
      updatedAt: maintenant,
    }).where(eq(serviceExpose.id, s.id)).returning()
    return maj
  }, {
    can: { category: 'sites-services', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ classement: t.Union(CLASSEMENTS.map(c => t.Literal(c))) }),
    detail: {
      summary: 'Valide le classement d\'un service : paiement, sensible ou standard.',
      description: 'La proposition du moteur est conservée à part (`classementPropose`) et ne déclenche rien tant '
        + 'qu\'elle n\'est pas validée. Le classement validé part au moteur dans le périmètre.',
    },
  })

  .post('/:id/revue', async ({ params, body, request, status }) => {
    const [s] = await db.select().from(serviceExpose).where(eq(serviceExpose.id, params.id)).limit(1)
    if (!s) return status(404, 'Service introuvable')
    const justification = body.justificationExposition?.trim() || s.justificationExposition?.trim() || null
    // UNE REVUE SANS RAISON D'ÊTRE EXPOSÉ N'EST PAS UNE REVUE. Sur un service sensible, la
    // signer sans justification reporterait la question de six mois sans y avoir répondu.
    if (estSensible(s) && !justification) {
      return status(400, 'Un service sensible ou de paiement ne se revoit pas sans justification de son exposition.')
    }
    const maintenant = new Date()
    const [maj] = await db.update(serviceExpose).set({
      justificationExposition: justification,
      derniereRevueLe: maintenant,
      derniereRevuePar: await auteurDecision(request.headers),
      dateRevue: prochaineRevue(s, maintenant),
      updatedAt: maintenant,
    }).where(eq(serviceExpose.id, s.id)).returning()
    return maj
  }, {
    can: { category: 'sites-services', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ justificationExposition: t.Optional(t.String()) }),
    detail: {
      summary: 'Enregistre la revue d\'exposition d\'un service et planifie la suivante.',
      description: 'Prochaine revue dans six mois pour un service sensible (classement paiement ou sensible, ou '
        + 'marqueur paiement en ligne / données personnelles), un an sinon. Justification exigée sur un service sensible.',
    },
  })

  /**
   * VÉRIFIÉ DE L'INTÉRIEUR — la seule façon de dire qu\'un site est sain, pas seulement propre.
   */
  .post('/:id/verification-interieure', async ({ params, body, request, status }) => {
    const [s] = await db.select({ id: serviceExpose.id }).from(serviceExpose).where(eq(serviceExpose.id, params.id)).limit(1)
    if (!s) return status(404, 'Service introuvable')
    const methode = body.methode.trim()
    if (!methode) return status(400, 'Dites comment la vérification a été faite : sommes de contrôle du CMS, surveillance de fichiers la supervision interne…')
    const maintenant = new Date()
    const [maj] = await db.update(serviceExpose).set({
      verificationInterieureLe: maintenant,
      verificationInterieurePar: await auteurDecision(request.headers),
      verificationInterieureMethode: methode,
      verificationInterieureNote: body.note?.trim() || null,
      updatedAt: maintenant,
    }).where(eq(serviceExpose.id, s.id)).returning()
    return maj
  }, {
    can: { category: 'sites-services', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ methode: t.String(), note: t.Optional(t.String()) }),
    detail: {
      summary: 'Enregistre une vérification d\'intégrité faite de l\'intérieur du serveur.',
      description: 'Méthode exigée. Un relevé externe ne voit pas une porte dérobée placée dans un fichier du CMS : '
        + 'sans vérification de l\'intérieur, un site propre vu du dehors ne peut pas être dit sain.',
    },
  })
