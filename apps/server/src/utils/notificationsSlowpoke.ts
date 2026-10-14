import { eq, inArray } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurSlowpoke, notificationIncidentNis2 } from '@catalogue/database/tables'
import {
  dateConstatDuDetail,
  lireIncident,
  lireIncidents,
  type SlowpokeConfig,
  type SlowpokeIncident,
} from './slowpokeClient'

// Pont Slowpoke → suivi de notification NIS 2 (art. 23).

const SINGLETON = 'connecteur-slowpoke-singleton'

// Gravités Slowpoke déclenchant une ouverture automatique. CORRESPONDANCE AVEC LA GRILLE DE
// PRIORITÉ — sans elle, le lien entre ce filtre et la classification des incidents reste
// implicite, et personne ne sait pourquoi ces deux valeurs-là : critical → P1 (Critique) ┐
// déclenchent un suivi automatique…
/**
 * ⚠️ N'EST PLUS UNE RÈGLE D\'APPLICABILITÉ — conservé pour l\'import manuel seulement.
 */
export const GRAVITES_AUTO = ['critical', 'high'] as const

const TYPE_LABEL: Record<string, string> = {
  phishing: 'Hameçonnage',
  malware: 'Maliciel',
  ransomware: 'Rançongiciel',
  data_breach: 'Violation de données',
  ddos: 'Déni de service',
  network_intrusion: 'Intrusion réseau',
  other: 'Autre',
}

// Slowpoke n'a pas de champ « nom » : on dérive un libellé lisible du type + date.
export function libelleIncident(i: SlowpokeIncident): string {
  const type = TYPE_LABEL[i.type] ?? i.type
  const date = new Date(i.createdAt).toLocaleDateString('fr-FR')
  return `${type} — ${date}`
}

export async function getConfigSlowpoke() {
  const [row] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1)
  return row
}

// Identifiants d'incidents déjà suivis (pour la déduplication et l'affichage).
export async function incidentsDejaSuivis(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await db
    .select({ id: notificationIncidentNis2.incidentExterneId })
    .from(notificationIncidentNis2)
    .where(inArray(notificationIncidentNis2.incidentExterneId, ids))
  return new Set(rows.map(r => r.id).filter(Boolean) as string[])
}

// PRISE DE CONNAISSANCE — ce qui fait courir les délais de l'article 23.
export type OrigineDate = 'connaissance' | 'detection' | 'creation'
export type DateConnaissance = { date: Date, estimee: boolean, origine: OrigineDate }

function dateValide(v: string | null | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function resoudreDateConnaissance(
  i: SlowpokeIncident,
  cfg?: SlowpokeConfig,
): Promise<DateConnaissance> {
  const connaissance = dateValide(i.knowledgeAt)
  if (connaissance) {
    // Sniff sait lui-même si sa date est approchée : on ne réinvente pas ce jugement.
    return { date: connaissance, estimee: !!i.knowledgeEstimated, origine: 'connaissance' }
  }

  // Le détail n'est pas dans la réponse de liste : on ne va le chercher QUE si la date de
  // connaissance manque, pour ne pas produire une requête par incident sans raison.
  if (cfg) {
    const detail = await lireIncident(cfg, i.id)
    const constat = detail && dateConstatDuDetail(detail)
    if (constat) return { date: constat, estimee: true, origine: 'detection' }
  }

  return { date: new Date(i.createdAt), estimee: true, origine: 'creation' }
}

// Crée un suivi à partir d'un incident Slowpoke.
export async function creerSuiviDepuisIncident(i: SlowpokeIncident, cfg?: SlowpokeConfig) {
  const connaissance = await resoudreDateConnaissance(i, cfg)
  const [row] = await db
    .insert(notificationIncidentNis2)
    .values({
      incidentExterneId: i.id,
      libelle: libelleIncident(i),
      gravite: i.severity,
      description: i.description,
      dateDetection: connaissance.date,
      dateDetectionEstimee: connaissance.estimee,
      dateDetectionOrigine: connaissance.origine,
    })
    .returning()
  return row
}

export type ResultatImport = { crees: number, ignores: number, total: number }

// Importe les incidents critiques/élevés non encore suivis. Utilisé par l'ordonnanceur
// ET par le bouton « Importer » de l'interface.
export async function importerNotificationsCritiques(): Promise<ResultatImport> {
  const cfg = await getConfigSlowpoke()
  if (!cfg?.url || !cfg.cleService) {
    throw new Error('Connecteur Slowpoke non configuré.')
  }
  const incidents = await lireIncidents({ url: cfg.url, cleService: cfg.cleService }, { pageSize: 100 })
  const significatifs = incidents.filter(i => (GRAVITES_AUTO as readonly string[]).includes(i.severity))
  const deja = await incidentsDejaSuivis(significatifs.map(i => i.id))

  let crees = 0
  for (const i of significatifs) {
    if (deja.has(i.id)) continue
    // La configuration est transmise pour que le repli puisse aller chercher le détail
    // quand la date de connaissance manque.
    await creerSuiviDepuisIncident(i, { url: cfg.url, cleService: cfg.cleService })
    crees++
  }
  return { crees, ignores: significatifs.length - crees, total: significatifs.length }
}
