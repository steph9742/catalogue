// Taxonomie d'événements partagée par les webhooks (n8n) et les abonnements push.
// Clés : `<entite>:<action>` pour les mutations, `echeance:<type>` pour les échéances.
export const eventEntities = [
  { key: 'applications', label: 'Applications' },
  { key: 'postes', label: 'Logiciels postes de travail' },
  { key: 'serveurs', label: 'Serveurs' },
  { key: 'technologies', label: 'Technologies' },
  { key: 'tiers', label: 'Prestataires' },
  { key: 'vpn', label: 'Accès VPN' },
  { key: 'entites', label: 'Entités' },
  { key: 'composantes', label: 'Composantes' },
  { key: 'departements', label: 'Départements' },
  { key: 'services', label: 'Services' },
  { key: 'poles', label: 'Pôles' },
  { key: 'personnes', label: 'Personnes' },
  { key: 'populations', label: 'Populations' },
  { key: 'groupes', label: 'Groupes' },
  { key: 'webhooks', label: 'Webhooks' },
]

export const eventActions = [
  { key: 'create', label: 'Création' },
  { key: 'update', label: 'Modification' },
  { key: 'delete', label: 'Suppression' },
]

export const echeanceTypes = [
  { key: 'vpn_expiration', label: 'Expiration VPN' },
  { key: 'techno_eol', label: 'Techno en fin de vie' },
  { key: 'contrat_fin', label: 'Fin de contrat' },
  { key: 'app_fin_support', label: 'Fin de support applicatif' },
  { key: 'homologation_revue', label: 'Revue d\'homologation' },
  // Ces trois-là existaient côté serveur sans être déclarées ici : elles ne pouvaient
  // donc être ni nommées à l'écran, ni choisies comme abonnement de notification.
  { key: 'aipd_revue', label: 'Réexamen d\'analyse d\'impact (RGPD art. 35.11)' },
  { key: 'tiers_revue', label: 'Revue de fournisseur' },
  { key: 'whitelist_revue', label: 'Revue de liste blanche' },
  { key: 'compteur_reglementaire', label: 'Compteur réglementaire (NIS 2, RGPD, CERT)' },
  { key: 'applicabilite_a_trancher', label: 'Applicabilité réglementaire à trancher' },
  { key: 'certificat_expiration', label: 'Expiration de certificat TLS' },
  { key: 'certificat_invalide', label: 'Certificat TLS non validé' },
]

// Catégorie rattachée à chaque échéance (pour filtrer par droit de gestion).
export const echeanceCategory: Record<string, string> = {
  vpn_expiration: 'vpn',
  techno_eol: 'technologies',
  contrat_fin: 'tiers',
  app_fin_support: 'applications',
  homologation_revue: 'applications',
  aipd_revue: 'applications',
  tiers_revue: 'tiers',
  whitelist_revue: 'whitelists',
  compteur_reglementaire: 'incidents',
  applicabilite_a_trancher: 'incidents',
  certificat_expiration: 'certificats',
  certificat_invalide: 'certificats',
}
