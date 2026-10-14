// COMPARAISON DE VERSIONS — le seul endroit où l'on décide qu'une version est en retard.

/**
 * TROIS ÉTATS DE MISE À JOUR, plus un quatrième qui n'en est pas un. a_jour la version
 * installée est la dernière de sa branche, et la branche est maintenue ; correctif_disponible
 * la branche est maintenue, des correctifs ne sont pas appliqués.
 */
export const ETATS_MISE_A_JOUR = ['a_jour', 'correctif_disponible', 'non_maintenue', 'version_inconnue'] as const
export type EtatMiseAJour = typeof ETATS_MISE_A_JOUR[number]

/**
 * Compare deux versions segment par segment. -1, 0 ou 1.
 */
export function comparerVersions(a: string, b: string): number | null {
  const decouper = (v: string) => v.trim().replace(/^v/i, '').split(/[.\-_]/).filter(Boolean)
  const sa = decouper(a)
  const sb = decouper(b)
  if (!sa.length || !sb.length) return null

  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const xa = sa[i] ?? '0'
    const xb = sb[i] ?? '0'
    const na = /^\d+$/.test(xa)
    const nb = /^\d+$/.test(xb)
    // Un segment numérique et un segment textuel ne se comparent pas : « 1.41.rc1 » contre
    // « 1.41.2 » n'a pas d'ordre évident, et en inventer un donnerait un état faux.
    if (na !== nb) return null
    if (na && nb) {
      const d = Number(xa) - Number(xb)
      if (d !== 0) return d > 0 ? 1 : -1
    }
    else if (xa !== xb) {
      return xa > xb ? 1 : -1
    }
  }
  return 0
}

/**
 * L'état de mise à jour d\'une technologie. L\'ORDRE DES TESTS PORTE DU SENS.
 */
export function etatMiseAJour(
  installee: string | null | undefined,
  derniereBranche: string | null | undefined,
  brancheMaintenue: boolean | null | undefined,
): EtatMiseAJour {
  // La branche close prime : ce n'est pas un correctif qu'il faut, c'est une migration.
  if (brancheMaintenue === false) return 'non_maintenue'
  if (!installee || !derniereBranche) return 'version_inconnue'
  const c = comparerVersions(installee, derniereBranche)
  // Comparaison impossible : on ne conclut pas. `version_inconnue` dit qu'on ne sait pas,
  // là où `a_jour` affirmerait quelque chose de non vérifié.
  if (c === null) return 'version_inconnue'
  return c < 0 ? 'correctif_disponible' : 'a_jour'
}

/**
 * L'état d\'un SERVICE, agrégé sur ses technologies. LE PIRE ÉTAT L\'EMPORTE, ET « INCONNU » NE
 * COMPTE JAMAIS COMME BON.
 */
const RANG: Record<EtatMiseAJour, number> = {
  non_maintenue: 3,
  correctif_disponible: 2,
  version_inconnue: 1,
  a_jour: 0,
}

export function etatDuService(etats: readonly EtatMiseAJour[]): {
  etat: EtatMiseAJour
  surTechnologies: number
  /** Combien de technologies ont une version comparable. */
  verifiees: number
  /**
   * MÉLANGE : certaines technologies sont à jour, d'autres sans version connue.
   */
  partiel: boolean
} {
  // Aucune technologie détectée : l'état est inconnu, jamais « à jour ». Un service jamais
  // scanné et un service sans technologie se ressemblent, et un seul des deux va bien.
  if (!etats.length) return { etat: 'version_inconnue', surTechnologies: 0, verifiees: 0, partiel: false }
  let pire: EtatMiseAJour = 'a_jour'
  for (const e of etats) if (RANG[e] > RANG[pire]) pire = e
  const verifiees = etats.filter(e => e !== 'version_inconnue').length
  return {
    etat: pire,
    surTechnologies: etats.length,
    verifiees,
    // Partiel UNIQUEMENT quand l'inconnu est ce qui empêche de conclure. Si une technologie
    // appelle un correctif, c'est cela qu'il faut lire, pas la couverture de la vérification.
    partiel: pire === 'version_inconnue' && verifiees > 0,
  }
}
