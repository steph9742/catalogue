// ÉTAT D'UNE SYNCHRONISATION DE CONNECTEUR — deux questions, une seule règle.

export const DELAI_SYNC_MORTE_MS = 2 * 60 * 60 * 1000

export type EtatSync = {
  dernierStatut: string | null
  /** Touché à chaque écriture (`$onUpdate`) : c'est lui qui date le passage en « en cours ». */
  updatedAt: Date | string | null
}

export function syncEnCours(cfg: EtatSync, maintenant: Date = new Date(), maxMs: number = DELAI_SYNC_MORTE_MS): boolean {
  if (cfg.dernierStatut !== 'en_cours') return false
  if (!cfg.updatedAt) return true
  return maintenant.getTime() - new Date(cfg.updatedAt).getTime() < maxMs
}

export type EtatPeriodique = {
  actif: boolean | null
  frequenceHeures: number | null
  dernierSyncAt: Date | string | null
}

/** Un connecteur actif dont la dernière synchronisation réussie date de plus que sa fréquence. */
export function syncDue(cfg: EtatPeriodique, maintenant: Date = new Date()): boolean {
  if (!cfg.actif || !cfg.frequenceHeures) return false
  if (!cfg.dernierSyncAt) return true
  return maintenant.getTime() - new Date(cfg.dernierSyncAt).getTime() >= cfg.frequenceHeures * 60 * 60 * 1000
}
