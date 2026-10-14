// Valeurs d'enums du modèle (côté DB) + libellés lisibles. Source unique pour les
// <select> des formulaires et l'affichage des libellés dans les listes/fiches.
export type EnumOption = { value: string, label: string }

export const appCategories: EnumOption[] = [
  { value: 'metier', label: 'Métier' },
  { value: 'bureautique', label: 'Bureautique' },
  { value: 'saas', label: 'SaaS' },
  { value: 'technique_infra', label: 'Technique / infra' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'autre', label: 'Autre' },
]

// Criticité MÉTIER, vocabulaire NIS 2. À ne pas confondre avec `criticitesSurete`.
export const appCriticites: EnumOption[] = [
  { value: 'vitale', label: 'Vitale' },
  // « Critique » sans niveau : ce que dit une source qui ne différencie pas.
  { value: 'critique', label: 'Critique' },
  { value: 'essentielle', label: 'Essentielle' },
  { value: 'importante', label: 'Importante' },
  { value: 'secondaire', label: 'Secondaire' },
]

// Criticité de SÛRETÉ DE FONCTIONNEMENT (machines industrielles) : ce qu'une défaillance
// peut provoquer physiquement. Échelle distincte, et volontairement inchangée.
export const criticitesSurete: EnumOption[] = [
  { value: 'vitale', label: 'Vitale' },
  { value: 'critique', label: 'Critique' },
  { value: 'importante', label: 'Importante' },
  { value: 'mineure', label: 'Mineure' },
]

// Durée maximale d'interruption admissible (DMIA / RTO).
export const dureesIndisponibiliteTolerable: EnumOption[] = [
  { value: 'immediate', label: 'Aucune interruption admissible' },
  { value: 'moins_4h', label: 'Moins de 4 h' },
  { value: 'moins_24h', label: 'Moins de 24 h' },
  { value: 'moins_72h', label: 'Moins de 72 h' },
  { value: 'moins_1_semaine', label: 'Moins d\'une semaine' },
  { value: 'plus_1_semaine', label: 'Plus d\'une semaine' },
]

// Moyens de surveillance couvrant un actif. Cumulables — et `aucune` est un CONSTAT
// (« vérifié, rien ne le couvre »), pas un champ laissé vide.
export const couverturesDetection: EnumOption[] = [
  { value: 'soc_externe', label: 'SOC externe' },
  { value: 'wazuh', label: 'Wazuh' },
  { value: 'epp', label: 'Antivirus / EPP' },
  { value: 'aucune', label: 'Aucune (vérifié)' },
]

export const appStatuts: EnumOption[] = [
  { value: 'en_projet', label: 'En projet' },
  { value: 'en_deploiement', label: 'En déploiement' },
  { value: 'en_production', label: 'En production' },
  { value: 'en_maintenance', label: 'En maintenance' },
  { value: 'en_decommissionnement', label: 'En décommissionnement' },
  { value: 'retiree', label: 'Retirée' },
]

export const appHebergements: EnumOption[] = [
  { value: 'interne', label: 'Interne' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'saas', label: 'SaaS' },
  { value: 'hybride', label: 'Hybride' },
]

export const appExpositions: EnumOption[] = [
  { value: 'interne', label: 'Interne' },
  { value: 'dmz', label: 'DMZ' },
  { value: 'internet', label: 'Exposée Internet' },
]

export const appSensibilites: EnumOption[] = [
  { value: 'publique', label: 'Publique' },
  { value: 'interne', label: 'Interne' },
  { value: 'restreinte', label: 'Restreinte' },
  { value: 'confidentielle', label: 'Confidentielle' },
]

export const appMaintenances: EnumOption[] = [
  { value: 'a_jour', label: 'À jour' },
  { value: 'en_retard', label: 'En retard' },
  { value: 'non_maintenue', label: 'Non maintenue' },
  { value: 'fin_de_support', label: 'Fin de support' },
]

export const authMethodes: EnumOption[] = [
  { value: 'oidc_oauth', label: 'OIDC / OAuth' },
  { value: 'ldap_ad', label: 'LDAP / AD' },
  { value: 'cas', label: 'CAS' },
  { value: 'comptes_locaux', label: 'Comptes locaux' },
  { value: 'autre', label: 'Autre' },
]

// Catalogue « Postes de travail » (logiciels autorisés)
export const logicielCategories: EnumOption[] = [
  { value: 'navigateur', label: 'Navigateur' },
  { value: 'bureautique', label: 'Bureautique' },
  { value: 'messagerie', label: 'Messagerie' },
  { value: 'securite', label: 'Sécurité' },
  { value: 'metier', label: 'Métier' },
  { value: 'utilitaire', label: 'Utilitaire' },
  { value: 'multimedia', label: 'Multimédia' },
  { value: 'developpement', label: 'Développement' },
  { value: 'autre', label: 'Autre' },
]

export const logicielLicences: EnumOption[] = [
  { value: 'gratuit', label: 'Gratuit' },
  { value: 'libre', label: 'Libre' },
  { value: 'payant', label: 'Payant' },
  { value: 'abonnement', label: 'Abonnement' },
  { value: 'autre', label: 'Autre' },
]

export const logicielInstallations: EnumOption[] = [
  { value: 'libre_service', label: 'Libre-service' },
  { value: 'sur_demande', label: 'Sur demande' },
  { value: 'deploiement_centralise', label: 'Déploiement centralisé' },
]

export const logicielStatuts: EnumOption[] = [
  { value: 'autorise', label: 'Autorisé' },
  { value: 'sur_derogation', label: 'Sur dérogation' },
  { value: 'retire', label: 'Retiré' },
]

// Prestataires / tiers
export const tiersTypes: EnumOption[] = [
  { value: 'prestataire_it', label: 'Prestataire IT' },
  { value: 'prestataire_non_it', label: 'Prestataire non-IT' },
  { value: 'editeur', label: 'Éditeur' },
]
export const tiersNiveauAcces: EnumOption[] = [
  { value: 'aucun', label: 'Aucun' },
  { value: 'ponctuel', label: 'Ponctuel' },
  { value: 'permanent', label: 'Permanent' },
]

// Serveurs
export const serveurTypes: EnumOption[] = [
  { value: 'vm', label: 'VM' },
  { value: 'physique', label: 'Physique' },
]
export const hyperviseurs: EnumOption[] = [
  { value: 'vmware', label: 'VMware' },
  { value: 'proxmox', label: 'Proxmox' },
]
export const environnements: EnumOption[] = [
  { value: 'production', label: 'Production' },
  { value: 'preproduction', label: 'Préproduction' },
  { value: 'recette', label: 'Recette' },
  { value: 'developpement', label: 'Développement' },
]
export const serveurStatuts: EnumOption[] = [
  { value: 'actif', label: 'Actif' },
  { value: 'arrete', label: 'Arrêté' },
  { value: 'decommissionne', label: 'Décommissionné' },
]

// Technologies
export const technoCategories: EnumOption[] = [
  { value: 'langage', label: 'Langage' },
  { value: 'framework', label: 'Framework' },
  { value: 'runtime', label: 'Runtime' },
  { value: 'base_de_donnees', label: 'Base de données' },
  { value: 'serveur_web', label: 'Serveur web' },
  { value: 'conteneurisation', label: 'Conteneurisation' },
  { value: 'orchestration', label: 'Orchestration' },
  { value: 'os', label: 'OS' },
  { value: 'autre', label: 'Autre' },
]

// Pôles
export const poleTypes: EnumOption[] = [
  { value: 'it', label: 'IT' },
  { value: 'autre', label: 'Autre' },
]

// Domaine d'un pôle IT (liste figée, extensible). Le domaine « Autre » ouvre un champ libre.
export const poleDomainesIt: EnumOption[] = [
  { value: 'metiers', label: 'Métiers' },
  { value: 'dev', label: 'Développement' },
  { value: 'systemes', label: 'Systèmes' },
  { value: 'reseaux', label: 'Réseaux' },
  { value: 'cyber', label: 'Cyber' },
  { value: 'mesocentre', label: 'Mésocentre' },
  { value: 'support', label: 'Support' },
  { value: 'autre', label: 'Autre' },
]

// Statut juridique d'une entité (établissement).
export const entiteStatuts: EnumOption[] = [
  { value: 'epscp', label: 'EPSCP' },
  { value: 'epa', label: 'EPA' },
  { value: 'epic', label: 'EPIC' },
  { value: 'gip', label: 'GIP' },
  { value: 'association', label: 'Association' },
  { value: 'autre', label: 'Autre' },
]

// Types de composante (art. L713-1 du code de l'éducation).
export const composanteTypes: EnumOption[] = [
  { value: 'ufr', label: 'UFR' },
  { value: 'institut', label: 'Institut / IUT' },
  { value: 'ecole_ingenieur', label: 'École d\'ingénieurs' },
  { value: 'ecole_interne', label: 'École interne' },
  { value: 'ecole_doctorale', label: 'École doctorale' },
  { value: 'service_commun', label: 'Service commun' },
  { value: 'laboratoire', label: 'Laboratoire' },
  { value: 'autre', label: 'Autre' },
]

export const departementTypes: EnumOption[] = [
  { value: 'recherche', label: 'Recherche' },
  { value: 'enseignement', label: 'Enseignement' },
]

// Relations de la fiche application
export const deploiementRoles: EnumOption[] = [
  { value: 'frontal_web', label: 'Frontal web' },
  { value: 'applicatif', label: 'Applicatif' },
  { value: 'base_de_donnees', label: 'Base de données' },
  { value: 'reverse_proxy', label: 'Reverse proxy' },
  { value: 'cache', label: 'Cache' },
  { value: 'batch', label: 'Batch' },
  { value: 'autre', label: 'Autre' },
]
export const responsabiliteRoles: EnumOption[] = [
  { value: 'gestionnaire_technique', label: 'Gestionnaire technique' },
  { value: 'chef_de_projet', label: 'Chef de projet' },
  { value: 'gestionnaire_quotidien', label: 'Gestionnaire quotidien' },
  { value: 'referent_metier', label: 'Référent métier' },
]

// Accès VPN
export const vpnStatuts: EnumOption[] = [
  { value: 'actif', label: 'Actif' },
  { value: 'suspendu', label: 'Suspendu' },
  { value: 'expire', label: 'Expiré' },
  { value: 'revoque', label: 'Révoqué' },
  { value: 'en_attente', label: 'En attente' },
]

export const labelOf = (options: EnumOption[], value: string | null | undefined): string =>
  options.find(o => o.value === value)?.label ?? (value ?? '—')

// Comme labelOf, mais pour l'option « Autre » affiche « Autre : <précision> » si fournie.
export const labelOfAutre = (
  options: EnumOption[],
  value: string | null | undefined,
  precision: string | null | undefined,
): string => {
  const label = labelOf(options, value)
  return value === 'autre' && precision ? `${label} : ${precision}` : label
}

// --- Cartographie matérielle -----------------------------------------------------------
export const lieuTypes: EnumOption[] = [
  { value: 'site', label: 'Site' },
  { value: 'batiment', label: 'Bâtiment' },
  { value: 'salle', label: 'Salle' },
  { value: 'baie', label: 'Baie / rack' },
]

export const materielStatuts: EnumOption[] = [
  { value: 'actif', label: 'Actif' },
  { value: 'en_stock', label: 'En stock' },
  { value: 'en_panne', label: 'En panne' },
  { value: 'reforme', label: 'Réformé' },
]

export const appareilMobileCategories: EnumOption[] = [
  { value: 'tablette', label: 'Tablette' },
  { value: 'smartphone', label: 'Smartphone' },
  { value: 'liseuse', label: 'Liseuse' },
  { value: 'autre', label: 'Autre' },
]

export const posteTravailTypes: EnumOption[] = [
  { value: 'fixe', label: 'Fixe' },
  { value: 'portable', label: 'Portable' },
  { value: 'tout_en_un', label: 'Tout-en-un' },
  { value: 'client_leger', label: 'Client léger' },
  { value: 'autre', label: 'Autre' },
]

export const iotCategories: EnumOption[] = [
  { value: 'camera', label: 'Caméra' },
  { value: 'capteur', label: 'Capteur' },
  { value: 'imprimante', label: 'Imprimante' },
  { value: 'affichage', label: 'Affichage' },
  { value: 'controle_acces', label: 'Contrôle d\'accès' },
  { value: 'reseau', label: 'Réseau' },
  { value: 'autre', label: 'Autre' },
]

export const iotExpositions: EnumOption[] = [
  { value: 'isole', label: 'Isolé' },
  { value: 'interne', label: 'Interne' },
  { value: 'expose', label: 'Exposé' },
]

export const machineIndusFonctions: EnumOption[] = [
  { value: 'automate', label: 'Automate (PLC)' },
  { value: 'ihm', label: 'IHM (HMI)' },
  { value: 'capteur', label: 'Capteur' },
  { value: 'robot', label: 'Robot' },
  { value: 'variateur', label: 'Variateur' },
  { value: 'autre', label: 'Autre' },
]

export const otProtocoles: EnumOption[] = [
  { value: 'modbus', label: 'Modbus' },
  { value: 'profinet', label: 'PROFINET' },
  { value: 'opc_ua', label: 'OPC UA' },
  { value: 'ethernet_ip', label: 'EtherNet/IP' },
  { value: 'bacnet', label: 'BACnet' },
  { value: 'autre', label: 'Autre' },
]

// --- Cartographie réseau ---------------------------------------------------------------
export const equipementReseauTypes: EnumOption[] = [
  { value: 'switch', label: 'Switch' },
  { value: 'routeur', label: 'Routeur' },
  { value: 'firewall', label: 'Pare-feu' },
  { value: 'borne_wifi', label: 'Borne Wi-Fi' },
  { value: 'load_balancer', label: 'Répartiteur de charge' },
  { value: 'passerelle', label: 'Passerelle' },
  { value: 'autre', label: 'Autre' },
]

export const zoneReseauTypes: EnumOption[] = [
  { value: 'zone_securite', label: 'Zone de sécurité' },
  { value: 'vlan', label: 'VLAN' },
  { value: 'sous_reseau', label: 'Sous-réseau' },
  { value: 'dmz', label: 'DMZ' },
]

export const zoneNiveaux: EnumOption[] = [
  { value: 'non_maitrise', label: 'Non maîtrisé' },
  { value: 'exposee', label: 'Exposée' },
  { value: 'interne', label: 'Interne' },
  { value: 'securisee', label: 'Sécurisée' },
  { value: 'critique', label: 'Critique' },
]

export const fluxProtocoles: EnumOption[] = [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'icmp', label: 'ICMP' },
  { value: 'tout', label: 'Tout' },
  { value: 'autre', label: 'Autre' },
]

export const fluxStatuts: EnumOption[] = [
  { value: 'autorise', label: 'Autorisé' },
  { value: 'a_revoir', label: 'À revoir' },
  { value: 'interdit', label: 'Interdit' },
]

// --- Actifs primaires (ISO 27005) ------------------------------------------------------
export const actifDonneeCategories: EnumOption[] = [
  { value: 'donnees_personnelles', label: 'Données personnelles' },
  { value: 'rh', label: 'RH' },
  { value: 'scolarite', label: 'Scolarité' },
  { value: 'recherche', label: 'Recherche' },
  { value: 'financieres', label: 'Financières' },
  { value: 'techniques', label: 'Techniques' },
  { value: 'autre', label: 'Autre' },
]

export const processusDomaines: EnumOption[] = [
  { value: 'rh', label: 'RH' },
  { value: 'finances', label: 'Finances' },
  { value: 'scolarite', label: 'Scolarité' },
  { value: 'recherche', label: 'Recherche' },
  { value: 'si', label: 'Système d\'information' },
  { value: 'pilotage', label: 'Pilotage' },
  { value: 'autre', label: 'Autre' },
]

// --- Couche SMSI / ISO 27001 -----------------------------------------------------------
export const niveauBesoins: EnumOption[] = [
  { value: 'faible', label: 'Faible' },
  { value: 'modere', label: 'Modéré' },
  { value: 'eleve', label: 'Élevé' },
  { value: 'critique', label: 'Critique' },
]

export const actifSmsiTypes: EnumOption[] = [
  { value: 'serveur', label: 'Serveur' },
  { value: 'application', label: 'Application' },
  { value: 'poste-travail', label: 'Poste de travail' },
  { value: 'iot', label: 'IoT' },
  { value: 'machine-indus', label: 'Machine industrielle' },
  { value: 'equipement-reseau', label: 'Équipement réseau' },
  { value: 'actif-informationnel', label: 'Actif informationnel' },
  { value: 'processus', label: 'Processus métier' },
  { value: 'personne', label: 'Personne' },
  { value: 'lieu', label: 'Lieu' },
  { value: 'autre', label: 'Autre' },
]

// Catégorie ISO 27005 / EBIOS RM.
export const actifCategories: EnumOption[] = [
  { value: 'primaire', label: 'Primaire (valeur métier)' },
  { value: 'support', label: 'Support (bien support)' },
]

// Critère de sécurité (D/I/C) atteint par l'événement redouté.
export const proprietesDic: EnumOption[] = [
  { value: 'disponibilite', label: 'Disponibilité' },
  { value: 'integrite', label: 'Intégrité' },
  { value: 'confidentialite', label: 'Confidentialité' },
]

export const risqueVraisemblances: EnumOption[] = [
  { value: 'rare', label: 'Rare' },
  { value: 'possible', label: 'Possible' },
  { value: 'probable', label: 'Probable' },
  { value: 'quasi_certain', label: 'Quasi certain' },
]

export const risqueGravites: EnumOption[] = [
  { value: 'mineure', label: 'Mineure' },
  { value: 'significative', label: 'Significative' },
  { value: 'grave', label: 'Grave' },
  { value: 'critique', label: 'Critique' },
]

export const risqueTraitements: EnumOption[] = [
  { value: 'reduire', label: 'Réduire' },
  { value: 'accepter', label: 'Accepter' },
  { value: 'transferer', label: 'Transférer' },
  { value: 'eviter', label: 'Éviter' },
]

export const risqueStatuts: EnumOption[] = [
  { value: 'identifie', label: 'Identifié' },
  { value: 'evalue', label: 'Évalué' },
  { value: 'en_traitement', label: 'En traitement' },
  { value: 'traite', label: 'Traité' },
  { value: 'accepte', label: 'Accepté' },
]

export const mesureThemes: EnumOption[] = [
  { value: 'organisationnelles', label: 'Organisationnelles (A.5)' },
  { value: 'personnes', label: 'Personnes (A.6)' },
  { value: 'physiques', label: 'Physiques (A.7)' },
  { value: 'technologiques', label: 'Technologiques (A.8)' },
]

export const mesureStatuts: EnumOption[] = [
  { value: 'a_faire', label: 'À faire' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'mise_en_oeuvre', label: 'Mise en œuvre' },
  { value: 'a_ameliorer', label: 'À améliorer' },
]

export const mesureTypes: EnumOption[] = [
  { value: 'preventive', label: 'Préventive' },
  { value: 'detective', label: 'Détective' },
  { value: 'corrective', label: 'Corrective' },
]

// --- Système de management SMSI (clauses 4-10) -----------------------------------------
export const objectifStatuts: EnumOption[] = [
  { value: 'a_faire', label: 'À faire' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'atteint', label: 'Atteint' },
  { value: 'abandonne', label: 'Abandonné' },
]

export const documentTypes: EnumOption[] = [
  { value: 'politique', label: 'Politique' },
  { value: 'procedure', label: 'Procédure' },
  { value: 'instruction', label: 'Instruction' },
  { value: 'enregistrement', label: 'Enregistrement' },
  { value: 'guide', label: 'Guide' },
  { value: 'autre', label: 'Autre' },
]

export const documentStatuts: EnumOption[] = [
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'en_validation', label: 'En validation' },
  { value: 'valide', label: 'Validé' },
  { value: 'en_revision', label: 'En révision' },
  { value: 'obsolete', label: 'Obsolète' },
]

export const auditTypes: EnumOption[] = [
  { value: 'interne', label: 'Interne' },
  { value: 'externe', label: 'Externe' },
  { value: 'certification', label: 'Certification' },
]

export const auditStatuts: EnumOption[] = [
  { value: 'planifie', label: 'Planifié' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'realise', label: 'Réalisé' },
  { value: 'cloture', label: 'Clôturé' },
]

export const revueStatuts: EnumOption[] = [
  { value: 'planifiee', label: 'Planifiée' },
  { value: 'realisee', label: 'Réalisée' },
]

export const ncSources: EnumOption[] = [
  { value: 'audit', label: 'Audit' },
  { value: 'incident', label: 'Incident' },
  { value: 'revue', label: 'Revue de direction' },
  { value: 'veille', label: 'Veille' },
  { value: 'autre', label: 'Autre' },
]

export const ncTypes: EnumOption[] = [
  { value: 'non_conformite', label: 'Non-conformité' },
  { value: 'action_amelioration', label: 'Action d\'amélioration' },
]

export const ncGravites: EnumOption[] = [
  { value: 'mineure', label: 'Mineure' },
  { value: 'majeure', label: 'Majeure' },
]

export const ncStatuts: EnumOption[] = [
  { value: 'ouverte', label: 'Ouverte' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'close', label: 'Close' },
]

// --- Contexte & compétences (compléments ISO 27001) -------------------------------------
export const exigenceLegaleTypes: EnumOption[] = [
  { value: 'loi', label: 'Loi' },
  { value: 'reglement', label: 'Règlement' },
  { value: 'directive', label: 'Directive' },
  { value: 'contrat', label: 'Contrat' },
  { value: 'norme', label: 'Norme' },
  { value: 'autre', label: 'Autre' },
]
export const exigenceLegaleConformites: EnumOption[] = [
  { value: 'conforme', label: 'Conforme' },
  { value: 'partiellement', label: 'Partiellement conforme' },
  { value: 'non_conforme', label: 'Non conforme' },
  { value: 'a_evaluer', label: 'À évaluer' },
]
export const partieInteresseeTypes: EnumOption[] = [
  { value: 'interne', label: 'Interne' },
  { value: 'externe', label: 'Externe' },
]
export const partieInteresseeCategories: EnumOption[] = [
  { value: 'autorite', label: 'Autorité / régulateur' },
  { value: 'usager', label: 'Usager / étudiant' },
  { value: 'personnel', label: 'Personnel' },
  { value: 'fournisseur', label: 'Fournisseur' },
  { value: 'partenaire', label: 'Partenaire' },
  { value: 'financeur', label: 'Financeur / tutelle' },
  { value: 'syndicat', label: 'Syndicat' },
  { value: 'autre', label: 'Autre' },
]
export const niveauInfluences: EnumOption[] = [
  { value: 'faible', label: 'Faible' },
  { value: 'moyenne', label: 'Moyenne' },
  { value: 'forte', label: 'Forte' },
]
export const competenceDomaines: EnumOption[] = [
  { value: 'technique', label: 'Technique' },
  { value: 'gouvernance', label: 'Gouvernance' },
  { value: 'juridique', label: 'Juridique' },
  { value: 'gestion_de_projet', label: 'Gestion de projet' },
  { value: 'sensibilisation', label: 'Sensibilisation' },
  { value: 'autre', label: 'Autre' },
]
export const competenceNiveaux: EnumOption[] = [
  { value: 'notion', label: 'Notion' },
  { value: 'intermediaire', label: 'Intermédiaire' },
  { value: 'confirme', label: 'Confirmé' },
  { value: 'expert', label: 'Expert' },
]
export const opportuniteGains: EnumOption[] = [
  { value: 'faible', label: 'Faible' },
  { value: 'modere', label: 'Modéré' },
  { value: 'eleve', label: 'Élevé' },
  { value: 'majeur', label: 'Majeur' },
]
export const opportuniteStatuts: EnumOption[] = [
  { value: 'identifiee', label: 'Identifiée' },
  { value: 'evaluee', label: 'Évaluée' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'realisee', label: 'Réalisée' },
  { value: 'abandonnee', label: 'Abandonnée' },
]

// --- Conformité NIS 2 (référentiel ReCyF, ANSSI) ----------------------------------------
export const nis2Domaines: EnumOption[] = [
  { value: 'gouvernance', label: 'Gouvernance' },
  { value: 'protection', label: 'Protection' },
  { value: 'defense', label: 'Défense' },
  { value: 'resilience', label: 'Résilience' },
]
export const nis2Applicabilites: EnumOption[] = [
  { value: 'ei_ee', label: 'Entités importantes et essentielles' },
  { value: 'ee', label: 'Entités essentielles uniquement' },
]
export const nis2Conformites: EnumOption[] = [
  { value: 'fait', label: 'Fait' },
  { value: 'partiellement', label: 'Partiellement' },
  { value: 'tres_partiellement', label: 'Très partiellement' },
  { value: 'pas_du_tout', label: 'Pas du tout' },
]
export const nis2Statuts: EnumOption[] = [
  { value: 'a_faire', label: 'À faire' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'fait', label: 'Fait' },
  { value: 'non_applicable', label: 'Non applicable' },
]
// Plan d'actions : le travail concret à mener pour atteindre la conformité.
export const nis2ActionStatuts: EnumOption[] = [
  { value: 'a_faire', label: 'À faire' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'fait', label: 'Fait' },
  { value: 'abandonnee', label: 'Abandonnée' },
]
export const nis2ActionPriorites: EnumOption[] = [
  { value: 'basse', label: 'Basse' },
  { value: 'moyenne', label: 'Moyenne' },
  { value: 'haute', label: 'Haute' },
  { value: 'critique', label: 'Critique' },
]

// --- EBIOS Risk Manager (ateliers 2/3/4) --------------------------------------------
// Catégories de sources de risque (profils d'attaquants types du référentiel).
export const sourceRisqueCategories: EnumOption[] = [
  { value: 'etatique', label: 'Étatique' },
  { value: 'crime_organise', label: 'Crime organisé' },
  { value: 'terroriste', label: 'Terroriste' },
  { value: 'ideologue_hacktiviste', label: 'Idéologue / hacktiviste' },
  { value: 'officine_privee', label: 'Officine privée' },
  { value: 'amateur', label: 'Amateur' },
  { value: 'vengeur', label: 'Vengeur' },
  { value: 'malveillant_interne', label: 'Malveillant interne' },
  { value: 'concurrent', label: 'Concurrent' },
  { value: 'autre', label: 'Autre' },
]
// Décision sur le couple source de risque / objectif visé (atelier 2).
export const sourceRisquePertinences: EnumOption[] = [
  { value: 'retenue', label: 'Retenue' },
  { value: 'a_surveiller', label: 'À surveiller' },
  { value: 'ecartee', label: 'Écartée' },
]
// Parties prenantes de l'écosystème (atelier 3).
export const partiePrenanteTypes: EnumOption[] = [
  { value: 'fournisseur', label: 'Fournisseur' },
  { value: 'prestataire_it', label: 'Prestataire informatique' },
  { value: 'partenaire', label: 'Partenaire' },
  { value: 'client', label: 'Client / usager' },
  { value: 'filiale', label: 'Filiale' },
  { value: 'entite_interne', label: 'Entité interne' },
  { value: 'autre', label: 'Autre' },
]
// Échelle EBIOS 1-4 (motivation, ressources, activité, et critères de l'écosystème).
export const ebiosNiveaux: EnumOption[] = [
  { value: '1', label: '1 — Négligeable' },
  { value: '2', label: '2 — Limité' },
  { value: '3', label: '3 — Important' },
  { value: '4', label: '4 — Critique' },
]
// Zones de danger de l'écosystème, déduites du niveau de menace calculé.
export const ecosystemeZones: EnumOption[] = [
  { value: 'danger', label: 'Zone de danger' },
  { value: 'controle', label: 'Zone de contrôle' },
  { value: 'veille', label: 'Zone de veille' },
  { value: 'negligeable', label: 'Négligeable' },
  { value: 'non_evaluee', label: 'Non évaluée' },
]
// Statut de l'entité au regard de NIS 2.
export const nis2StatutsEntite: EnumOption[] = [
  { value: 'essentielle', label: 'Entité essentielle' },
  { value: 'importante', label: 'Entité importante' },
  { value: 'non_assujettie', label: 'Non assujettie' },
  { value: 'a_determiner', label: 'À déterminer' },
]
export const nis2Secteurs: EnumOption[] = [
  { value: 'administration_publique', label: 'Administration publique (annexe I)' },
  { value: 'recherche', label: 'Recherche (annexe II)' },
  { value: 'enseignement_superieur', label: 'Enseignement supérieur' },
  { value: 'sante', label: 'Santé (annexe I)' },
  { value: 'infrastructure_numerique', label: 'Infrastructure numérique (annexe I)' },
  { value: 'gestion_services_tic', label: 'Gestion de services TIC (annexe I)' },
  { value: 'eau_potable', label: 'Eau potable (annexe I)' },
  { value: 'eaux_usees', label: 'Eaux usées (annexe I)' },
  { value: 'energie', label: 'Énergie (annexe I)' },
  { value: 'espace', label: 'Espace (annexe I)' },
  { value: 'autre', label: 'Autre' },
]

// --- Flux applicatifs (cartographie applicative) ---------------------------------------
export const fluxAppProtocoles: EnumOption[] = [
  { value: 'https', label: 'HTTPS' },
  { value: 'api_rest', label: 'API REST' },
  { value: 'soap', label: 'SOAP' },
  { value: 'sql', label: 'SQL' },
  { value: 'ldap', label: 'LDAP' },
  { value: 'smtp', label: 'SMTP' },
  { value: 'fichier', label: 'Fichier' },
  { value: 'message', label: 'File de messages' },
  { value: 'autre', label: 'Autre' },
]
export const fluxAppSens: EnumOption[] = [
  { value: 'unidirectionnel', label: 'Unidirectionnel' },
  { value: 'bidirectionnel', label: 'Bidirectionnel' },
]
export const fluxAppFrequences: EnumOption[] = [
  { value: 'temps_reel', label: 'Temps réel' },
  { value: 'frequent', label: 'Fréquent' },
  { value: 'quotidien', label: 'Quotidien' },
  { value: 'hebdomadaire', label: 'Hebdomadaire' },
  { value: 'ponctuel', label: 'Ponctuel' },
]

// --- Topologie physique réseau ---------------------------------------------------------
export const lienReseauTypes: EnumOption[] = [
  { value: 'fibre', label: 'Fibre' },
  { value: 'cuivre', label: 'Cuivre' },
  { value: 'vlan_trunk', label: 'Trunk VLAN' },
  { value: 'sans_fil', label: 'Sans fil' },
  { value: 'autre', label: 'Autre' },
]
// Portée du lien : local (intra-site) ou MAN (inter-sites, réseau multi-villes).
export const lienReseauPortees: EnumOption[] = [
  { value: 'local', label: 'Local (intra-site)' },
  { value: 'man', label: 'MAN (inter-sites)' },
]
export const interconnexionTypes: EnumOption[] = [
  { value: 'operateur', label: 'Opérateur' },
  { value: 'renater', label: 'RENATER' },
  { value: 'internet', label: 'Internet' },
  { value: 'partenaire', label: 'Partenaire' },
  { value: 'autre', label: 'Autre' },
]

// Groupes / familles CNU (Conseil National des Universités).
export const cnuGroupes: EnumOption[] = [
  { value: 'Groupe 1', label: 'Groupe 1 — Droit, éco, gestion' },
  { value: 'Groupe 2', label: 'Groupe 2 — Éco, gestion' },
  { value: 'Groupe 3', label: 'Groupe 3 — Lettres & SHS (1)' },
  { value: 'Groupe 4', label: 'Groupe 4 — Lettres & SHS (1)' },
  { value: 'Groupe 5', label: 'Groupe 5 — Sciences (1)' },
  { value: 'Groupe 6', label: 'Groupe 6 — Sciences (1)' },
  { value: 'Groupe 7', label: 'Groupe 7 — Sciences (1)' },
  { value: 'Groupe 8', label: 'Groupe 8 — Sciences (1)' },
  { value: 'Disciplines de santé', label: 'Disciplines de santé' },
  { value: 'Groupe 9', label: 'Groupe 9 — Sciences (2)' },
  { value: 'Groupe 10', label: 'Groupe 10 — Sciences (2)' },
  { value: 'Groupe 11', label: 'Groupe 11 — Lettres & SHS (2)' },
  { value: 'Théologie', label: 'Théologie' },
  { value: 'Pharmacie', label: 'Pharmacie' },
  { value: 'Autres sections de santé', label: 'Autres sections de santé' },
]

// --- ISO/IEC 27001:2022 — clauses du système de management -----------------------------
export const iso27001Conformites: EnumOption[] = [
  { value: 'conforme', label: 'Conforme' },
  { value: 'partielle', label: 'Partiellement conforme' },
  { value: 'non_conforme', label: 'Non conforme' },
  { value: 'non_applicable', label: 'Non applicable' },
]

export const iso27001Statuts: EnumOption[] = [
  { value: 'a_faire', label: 'À faire' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'fait', label: 'Fait' },
]

// Provenance de l'intitulé français : officiel (table ANSSI) ou traduit de l'édition anglaise.
export const iso27001SourcesIntitule: EnumOption[] = [
  { value: 'officiel', label: 'Intitulé officiel (édition française)' },
  { value: 'traduction', label: 'Traduit de l\'édition anglaise' },
]

// Le TYPE d'un service exposé. Les libellés disent ce qu'on voit, pas ce que la base
// stocke : « site web » plutôt que « web ».
export const serviceExposeTypes: EnumOption[] = [
  { value: 'web', label: 'Site web' },
  { value: 'messagerie', label: 'Messagerie' },
  { value: 'annuaire', label: 'Annuaire' },
  { value: 'autre', label: 'Autre' },
]
