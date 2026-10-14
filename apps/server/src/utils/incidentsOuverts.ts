// MACHINES SOUS INCIDENT OUVERT — l'ensemble des identifiants GLPI concernés.
import { db } from '@catalogue/database'
import { connecteurSlowpoke } from '@catalogue/database/tables'
import { eq } from 'drizzle-orm'
import { lireIncidents, lireMachinesIncident, type SlowpokeIncident } from './slowpokeClient'
import { dechiffrer } from './secrets'

const SINGLETON = 'connecteur-slowpoke-singleton'

// Statuts qui valent « en cours » côté Sniff. `resolved` et `closed` en sont exclus.
const STATUTS_OUVERTS = ['open', 'investigating', 'in_progress', 'surveillance'] as const

// Plafond d'incidents dépouillés en une passe. S'il est atteint, on le DIT dans les
// journaux : une troncature muette ferait passer un relevé partiel pour un relevé complet.
const PLAFOND = 100

// Mémorisation courte. Sans elle, chaque affichage de liste relancerait la moisson ; avec une
// durée trop longue, un incident déclaré ne se verrait qu'au bout d'un quart d'heure.
const DUREE_MEMO = 2 * 60 * 1000
let memo: { a: number, parGlpiId: Map<string, { gravite: string, statut: string }> } | null = null

export type MarqueIncident = { gravite: string, statut: string }

/**
 * Identifiants GLPI sous incident ouvert, indexés. Renvoie une map VIDE quand le connecteur est
 * inactif ou que Sniff ne répond pas : on n'affiche alors aucune pastille, plutôt que d\'en
 * afficher de fausses.
 */
export async function machinesSousIncident(): Promise<Map<string, MarqueIncident>> {
  if (memo && Date.now() - memo.a < DUREE_MEMO) return memo.parGlpiId

  const parGlpiId = new Map<string, MarqueIncident>()
  try {
    const [cfg] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1)
    const cle = dechiffrer(cfg?.cleService)
    if (!cfg?.url || !cle || !cfg.actif) {
      memo = { a: Date.now(), parGlpiId }
      return parGlpiId
    }
    const acces = { url: cfg.url, cleService: cle }

    // Un appel par statut ouvert : plus sûr que de ramener les N derniers incidents et
    // d'espérer que les anciens encore ouverts s'y trouvent.
    const lots = await Promise.all(STATUTS_OUVERTS.map(s => lireIncidents(acces, { status: s, pageSize: 200 })))
    const ouverts: SlowpokeIncident[] = lots.flat()
    if (ouverts.length > PLAFOND) {
      console.warn(`[sniff] ${ouverts.length} incidents ouverts, ${PLAFOND} dépouillés : la liste des machines signalées est PARTIELLE.`)
    }

    const machines = await Promise.all(
      ouverts.slice(0, PLAFOND).map(async (i) => {
        try { return { incident: i, machines: await lireMachinesIncident(acces, i.id) } }
        // Un incident illisible ne doit pas emporter le relevé des autres.
        catch { return { incident: i, machines: [] as { nom: string, glpiId: string | null }[] } }
      }),
    )

    for (const { incident, machines: liste } of machines) {
      for (const m of liste) {
        if (!m.glpiId) continue
        const deja = parGlpiId.get(m.glpiId)
        // La gravité la plus forte l'emporte : une machine touchée par un incident majeur
        // et un mineur doit se signaler par le majeur.
        const ordre = ['critical', 'high', 'medium', 'low']
        if (!deja || ordre.indexOf(incident.severity) < ordre.indexOf(deja.gravite)) {
          parGlpiId.set(m.glpiId, { gravite: incident.severity, statut: incident.status })
        }
      }
    }
  }
  catch (e) {
    // Sniff injoignable : aucune pastille, et on le dit dans les journaux.
    console.warn(`[sniff] relevé des incidents ouverts indisponible : ${e instanceof Error ? e.message : String(e)}`)
  }

  memo = { a: Date.now(), parGlpiId }
  return parGlpiId
}

/** Vide la mémorisation — après une synchronisation, ou pour un test. */
export function oublierIncidentsOuverts(): void {
  memo = null
}
