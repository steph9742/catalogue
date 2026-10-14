import { Elysia, t } from 'elysia'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurSlowpoke, whitelist } from '@catalogue/database/tables'
import { dechiffrer } from '../utils/secrets'
import { etatEcheance } from '../utils/whitelistsEcheance'

// ÉVÉNEMENTS POUSSÉS PAR SNIFF. Le relevé périodique reste le filet ; ce point d'entrée sert à
// ne pas vivre une journée entière avec une date périmée.

const SINGLETON = 'connecteur-slowpoke-singleton'

/** Comparaison à temps constant, sur des longueurs égales. */
function signatureValide(corps: string, entete: string | null, secret: string): boolean {
  if (!entete) return false
  const attendu = `sha256=${createHmac('sha256', secret).update(corps).digest('hex')}`
  const a = Buffer.from(attendu)
  const b = Buffer.from(entete)
  // `timingSafeEqual` lève sur des longueurs différentes : on le dit avant, sans révéler
  // autre chose que la longueur — qui est publique de toute façon.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const dateOuNull = (s: string | null | undefined) => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export const sniffEvenementsRouter = new Elysia({ name: 'sniff-evenements', prefix: '/api/sniff' })
  .guard({ detail: { tags: ['Connecteurs'] } })

  /**
   * Réception d'un événement Sniff. Non authentifiée par session ou clé de service : c\'est la
   * SIGNATURE qui autorise, puisque l'appelant est une machine sans compte ici.
   */
  .post('/evenements', async ({ body, request, status }) => {
    const [cfg] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1)
    const secret = dechiffrer(cfg?.secretWebhook)
    if (!secret) {
      return status(503, {
        message: 'Aucun secret de webhook configuré pour Sniff : les événements poussés sont refusés.',
        consequence: 'Le relevé périodique continue de fonctionner ; seule la bascule immédiate est indisponible.',
      })
    }

    const brut = JSON.stringify(body)
    if (!signatureValide(brut, request.headers.get('x-slowpoke-signature'), secret)) {
      return status(401, { message: 'Signature absente ou invalide.' })
    }

    const evenement = String(body.event ?? '')
    const exclusion = body.exclusion
    const ref = exclusion?.outilRef ?? null

    // Sans référence d'outil, l'événement ne désigne aucune règle de notre inventaire.
    if (evenement === 'exclusion_appariee' && !ref) {
      return { traite: false, motif: 'Appariement sans référence d\'outil : aucune règle désignée.' }
    }

    if (evenement === 'exclusion_appariee') {
      const [regle] = await db.select().from(whitelist).where(eq(whitelist.harfanglabId, ref!)).limit(1)
      if (!regle) {
        // La règle n'est pas encore dans notre inventaire : le prochain relevé la posera
        // avec son appariement. Rien à rattraper, et surtout rien à inventer.
        return { traite: false, motif: 'Règle inconnue de l\'inventaire ; le relevé périodique la posera.' }
      }
      const echeanceSniff = dateOuNull(exclusion?.reviewDate)
      await db.update(whitelist).set({
        source: 'les_deux',
        sniffExclusionId: exclusion?.id ?? null,
        sniffIncidentId: exclusion?.incidentId ?? null,
        certitudeRapprochement: 'certain',
        motif: exclusion?.motif ?? null,
        echeanceSniff,
        // L'autorité bascule : la date locale cesse d'être entretenue, sans quoi deux
        // dates coexisteraient sur la même règle sans qu'aucune fasse foi.
        dateRevision: null,
        active: exclusion?.state === 'revoquee' ? false : regle.active,
        updatedAt: new Date(),
      }).where(eq(whitelist.id, regle.id))
      return { traite: true, regle: ref, echeance: echeanceSniff?.toISOString() ?? null }
    }

    if (evenement === 'exclusion_detachee') {
      // Le détachement porte `outilRef: null` : c'est l'identifiant d'EXCLUSION qui
      // permet de retrouver la règle. Chercher par `outilRef` ne rendrait jamais rien.
      const idExclusion = exclusion?.id
      if (!idExclusion) return { traite: false, motif: 'Détachement sans identifiant d\'exclusion.' }
      const [regle] = await db.select().from(whitelist)
        .where(eq(whitelist.sniffExclusionId, idExclusion)).limit(1)
      if (!regle) return { traite: false, motif: 'Aucune règle de l\'inventaire ne portait cette exclusion.' }

      await db.update(whitelist).set({
        source: 'harfanglab',
        sniffExclusionId: null,
        sniffIncidentId: null,
        certitudeRapprochement: null,
        // Le motif venait de l'exclusion, et l'EDR n'en stocke aucun : il s'en va avec elle.
        motif: null,
        echeanceSniff: null,
        updatedAt: new Date(),
      }).where(eq(whitelist.id, regle.id))

      // L'autorité NOUS revient : l'échéance repart de la création, comme pour toute règle
      // que personne d'autre ne porte. Le calcul est celui de `etatEcheance`, pas un autre.
      const etat = etatEcheance({
        dateCreation: regle.dateCreation,
        dateRevision: null,
        technique: regle.technique,
        fourniParEditeur: regle.fourniParEditeur,
        presente: regle.presente,
        echeanceSniff: null,
      })
      return {
        traite: true,
        regle: regle.harfanglabId,
        echeance: etat.echeance?.toISOString() ?? null,
        sansEcheance: etat.sansEcheance,
      }
    }

    // --- REVUES DE LISTES BLANCHES (Sniff 1fae1c7) -------------------------------------
    // Deux événements, un seul traitement : la date de Sniff devient celle de la règle, et le
    // Catalogue cesse d'entretenir la sienne.
    if (evenement === 'revue_liste_blanche_proche' || evenement === 'revue_liste_blanche_depassee') {
      const lb = body.listeBlanche
      const ref = lb?.regleRef
      if (!ref) return { traite: false, motif: 'Événement de revue sans référence de règle.' }
      const echeance = dateOuNull(lb?.echeance)
      if (!echeance) return { traite: false, motif: 'Événement de revue sans échéance : rien à reprendre.' }
      const [regle] = await db.select().from(whitelist).where(eq(whitelist.harfanglabId, ref)).limit(1)
      if (!regle) {
        return { traite: false, motif: 'Règle inconnue de l\'inventaire ; le relevé périodique la posera.' }
      }
      const parExclusion = lb?.origine === 'exclusion'
      await db.update(whitelist).set({
        echeanceSniff: echeance,
        motif: lb?.motif ?? regle.motif,
        sniffRevueId: parExclusion ? regle.sniffRevueId : (lb?.id ?? null),
        sniffExclusionId: parExclusion ? (lb?.id ?? regle.sniffExclusionId) : regle.sniffExclusionId,
        sniffIncidentId: lb?.incidentId ?? regle.sniffIncidentId,
        // L'autorité est à Sniff : deux dates sur la même règle, et aucune ne ferait foi.
        dateRevision: null,
        updatedAt: new Date(),
      }).where(eq(whitelist.id, regle.id))
      return { traite: true, regle: ref, echeance: echeance.toISOString(), origine: lb?.origine ?? null }
    }

    // Un événement qu'on ne traite pas n'est pas une erreur : Sniff en diffuse d'autres,
    // et refuser bruyamment ferait apparaître des échecs de livraison sans objet.
    return { traite: false, motif: `Événement « ${evenement} » non traité par le Catalogue.` }
  }, {
    body: t.Object({
      event: t.String(),
      timestamp: t.Optional(t.String()),
      message: t.Optional(t.String()),
      incident: t.Optional(t.Unknown()),
      exclusion: t.Optional(t.Object({
        id: t.Optional(t.String()),
        incidentId: t.Optional(t.String()),
        outilRef: t.Optional(t.Union([t.String(), t.Null()])),
        motif: t.Optional(t.Union([t.String(), t.Null()])),
        reviewDate: t.Optional(t.Union([t.String(), t.Null()])),
        state: t.Optional(t.String()),
      })),
      // Charge utile des événements de revue (Sniff 1fae1c7).
      listeBlanche: t.Optional(t.Object({
        origine: t.Optional(t.String()),
        id: t.Optional(t.String()),
        regleRef: t.Optional(t.String()),
        incidentId: t.Optional(t.Union([t.String(), t.Null()])),
        objet: t.Optional(t.Union([t.String(), t.Null()])),
        motif: t.Optional(t.Union([t.String(), t.Null()])),
        echeance: t.Optional(t.Union([t.String(), t.Null()])),
        niveau: t.Optional(t.Union([t.String(), t.Null()])),
      })),
    }),
    detail: {
      summary: 'Reçoit un événement poussé par Sniff (appariement, détachement, revue de liste blanche).',
      description: 'Authentifiée par SIGNATURE HMAC-SHA256 (`X-Slowpoke-Signature`), pas par session : '
        + 'l\'appelant est une machine sans compte ici. Sans secret configuré, la route refuse — accepter '
        + 'une charge non signée laisserait modifier des échéances réglementaires par simple requête. '
        + 'Le relevé périodique reste le filet : une livraison manquée se rattrape au passage suivant.',
    },
  })
