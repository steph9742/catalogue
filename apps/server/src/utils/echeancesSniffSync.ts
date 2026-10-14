import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurSlowpoke, sniffEcheance, sniffIncident } from '@catalogue/database/tables'
import { lireEcheancesSniff } from './slowpokeClient'
import { dechiffrer } from './secrets'

// MIROIR DES COMPTEURS RÉGLEMENTAIRES DE SNIFF. Le Catalogue ne décide plus : il lit, il
// archive, il alerte.

const SINGLETON = 'connecteur-slowpoke-singleton'

export type CompteursEcheances = {
  incidents: number
  echeances: number
  courent: number
  echues: number
  deposes: number
  sansDecision: number
  /** Dépôts que le Catalogue connaît et que Sniff ignore : à ressaisir chez eux. */
  deposesHorsSniff: number
  tronque: boolean
  derniereDecision: string | null
  erreur: string | null
}

const dateOuNull = (s: string | null | undefined) => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Relève les compteurs. Ne lève pas : une panne de Sniff est un RÉSULTAT à rapporter, pas un
 * échec qui doit interrompre l'ordonnanceur.
 */
export async function synchroniserEcheancesSniff(): Promise<CompteursEcheances> {
  const c: CompteursEcheances = {
    incidents: 0, echeances: 0, courent: 0, echues: 0, deposes: 0,
    sansDecision: 0, deposesHorsSniff: 0, tronque: false,
    derniereDecision: null, erreur: null,
  }

  const [cfg] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1)
  const cle = dechiffrer(cfg?.cleService)
  if (!cfg?.url || !cle || !cfg.actif) {
    c.erreur = 'Connecteur Sniff inactif ou non configuré : les compteurs réglementaires ne peuvent pas être relevés.'
    return c
  }

  let lu
  try {
    lu = await lireEcheancesSniff({ url: cfg.url, cleService: cle })
  }
  catch (e) {
    // Le miroir reste INTACT. On note le motif et la date d'essai — c'est ce qui permet de
    // distinguer « rien à signaler » de « on ne sait pas depuis trois jours ».
    c.erreur = e instanceof Error ? e.message : String(e)
    await db.update(connecteurSlowpoke)
      .set({ dernierStatut: 'erreur', dernierMessage: c.erreur, dernierAccesAt: new Date() })
      .where(eq(connecteurSlowpoke.id, SINGLETON))
    return c
  }

  c.tronque = lu.tronque
  c.sansDecision = lu.etat?.incidentsSansDecision ?? 0
  c.derniereDecision = lu.etat?.derniereDecision ?? null
  const maintenant = new Date()

  for (const i of lu.incidents) {
    c.incidents++
    const enteteIncident = {
      type: i.type, severity: i.severity, niveau: i.niveau, statut: i.statut,
      knowledgeAt: dateOuNull(i.knowledgeAt),
      knowledgeEstimated: i.knowledgeEstimated ?? null,
      vuAuSync: maintenant, updatedAt: maintenant,
    }
    await db.insert(sniffIncident).values({ incidentId: i.incidentId, ...enteteIncident })
      .onConflictDoUpdate({ target: sniffIncident.incidentId, set: enteteIncident })

    for (const e of i.echeances ?? []) {
      c.echeances++
      const deposeLe = dateOuNull(e.deposeLe)

      const [existante] = await db.select().from(sniffEcheance)
        .where(sql`${sniffEcheance.incidentId} = ${i.incidentId} and ${sniffEcheance.cle} = ${e.cle}`)
        .limit(1)

      // RÈGLE 3 : un dépôt connu de nous seuls survit. Sniff ignore l'accomplissement des
      // incidents antérieurs à sa propre mise à jour ; recopier son `null` effacerait la preuve
      // qu'une déclaration a bien été faite.
      const depotLocalSeul = !deposeLe && !!existante?.deposeLe
      if (depotLocalSeul) c.deposesHorsSniff++

      const valeurs = {
        nom: e.nom, delaiHeures: e.delaiHeures, depart: e.depart,
        condition: e.condition, porteur: e.porteur,
        defaut: e.defaut, applicable: e.applicable ?? null,
        decidePar: e.decidePar, decideLe: dateOuNull(e.decideLe),
        // `court` vient de Sniff. Le recalculer ici reconstruirait la divergence.
        court: depotLocalSeul ? false : e.court,
        echeance: dateOuNull(e.echeance),
        deposeLe: deposeLe ?? existante?.deposeLe ?? null,
        reference: e.reference ?? existante?.reference ?? null,
        deposePar: e.deposePar ?? existante?.deposePar ?? null,
        vuAuSync: maintenant, updatedAt: maintenant,
      }
      if (existante) await db.update(sniffEcheance).set(valeurs).where(eq(sniffEcheance.id, existante.id))
      else await db.insert(sniffEcheance).values({ incidentId: i.incidentId, cle: e.cle, ...valeurs })

      if (valeurs.court) c.courent++
      if (valeurs.deposeLe) c.deposes++
      // « Échue » ne se lit que sur un compteur qui COURT : un jalon déposé avec des heures
      // restantes négatives n'est pas en retard, c'est un devoir accompli.
      if (valeurs.court && valeurs.echeance && valeurs.echeance < maintenant) c.echues++
    }
  }

  // Les compteurs RETIRÉS d'un incident que Sniff nous a bien rendu sont effacés — un compteur
  // qui n'existe plus ne doit pas continuer à alerter.
  if (!c.tronque && lu.incidents.length) {
    const vus = lu.incidents.map(i => i.incidentId)
    await db.delete(sniffEcheance).where(and(
      inArray(sniffEcheance.incidentId, vus),
      lt(sniffEcheance.vuAuSync, maintenant),
    ))
  }

  const message = [
    `${c.incidents} incident(s), ${c.echeances} compteur(s)`,
    c.courent ? `${c.courent} en cours` : '',
    c.echues ? `${c.echues} ÉCHU(S)` : '',
    c.sansDecision ? `${c.sansDecision} incident(s) sans décision d'applicabilité` : '',
    c.deposesHorsSniff ? `${c.deposesHorsSniff} dépôt(s) connu(s) du Catalogue seul` : '',
    c.tronque ? 'relevé PARTIEL' : '',
  ].filter(Boolean).join(' · ') + '.'

  await db.update(connecteurSlowpoke)
    .set({ dernierStatut: 'ok', dernierMessage: message, dernierAccesAt: maintenant })
    .where(eq(connecteurSlowpoke.id, SINGLETON))

  return c
}
