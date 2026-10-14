// L'ÉTAT D'UN CERTIFICAT — lisible, et non l'état du RELEVÉ. `dernierStatut` dit si le relevé a
// abouti : `ok` signifie « lu », pas « valide ».

/** Sous ce seuil, l'échéance appelle une action. Trente jours, comme les alertes. */
const BIENTOT_JOURS = 30

export const ETATS_CERTIFICAT = [
  'valide',
  'expire_bientot',
  'expire',
  'invalide',
  'injoignable',
  'jamais_releve',
  'aucun',
] as const
export type EtatCertificat = typeof ETATS_CERTIFICAT[number]

/**
 * L'ORDRE DES TESTS PORTE DU SENS. L\'expiration est testée AVANT la validité de chaîne : un
 * certificat expiré ET auto-signé est d'abord expiré, parce que c\'est l\'expiration qui coupe le
 * service.
 */
export function etatCertificat(
  cert: { dernierStatut: string, dateFin: Date | string | null, chaineValide: boolean | null } | null,
  maintenant = new Date(),
): EtatCertificat {
  // Aucun certificat inventorié : distinct de « jamais relevé », qui suppose une ligne.
  if (!cert) return 'aucun'
  if (cert.dernierStatut === 'jamais') return 'jamais_releve'
  if (cert.dernierStatut === 'injoignable' || cert.dernierStatut === 'tls_erreur') return 'injoignable'

  const fin = cert.dateFin ? new Date(cert.dateFin) : null
  if (fin) {
    if (fin.getTime() <= maintenant.getTime()) return 'expire'
    const jours = (fin.getTime() - maintenant.getTime()) / 86_400_000
    if (jours <= BIENTOT_JOURS) return 'expire_bientot'
  }

  // Chaîne incomplète, racine inconnue, auto-signé : lu, mais pas digne de confiance.
  if (cert.dernierStatut === 'invalide' || cert.chaineValide === false) return 'invalide'

  // Lu, non expiré, chaîne valide — ou chaîne NON VÉRIFIÉE. Ce second cas se range en `valide`
  // faute de mieux : `chaineValide: null` signifie que la vérification n'a pas eu lieu, et la
  // fiche le dit à côté.
  return 'valide'
}
