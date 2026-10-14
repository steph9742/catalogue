// LIBELLÉS DU TRI DES CERTIFICATS PAR AUTORITÉ — écrits une fois pour la page des certificats
// et la fiche d'un site.
export const AUTORITE_CERTIFICAT: Record<string, { l: string, t: string }> = {
  harica: { l: 'HARICA / GÉANT TCS', t: 'emerald' },
  lets_encrypt: { l: 'Let\'s Encrypt', t: 'blue' },
  autre_commerciale: { l: 'Autre autorité commerciale', t: 'amber' },
  auto_signe: { l: 'Auto-signé', t: 'orange' },
  expire: { l: 'Expiré', t: 'red' },
  chaine_invalide: { l: 'Chaîne invalide', t: 'red' },
  autorite_inattendue: { l: 'Autorité inattendue', t: 'red' },
}
