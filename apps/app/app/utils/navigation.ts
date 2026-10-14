// LE MENU, ET LE TITRE DE CHAQUE PAGE, DÉCLARÉS UNE SEULE FOIS. Cette table vivait dans le
// composant de la barre latérale.

export type Item = {
  libelle: string
  url: string
  icon: string
  cat?: string // droit de lecture requis
  cats?: string[] // au moins un de ces droits
  admin?: boolean
  manager?: boolean // gestionnaire ou admin
  contributeurOuPlus?: boolean
  externe?: boolean
  badge?: 'demandes' | 'alertes'
  // Cadre de référence dont dépend l'entrée. Absent = toujours visible (cartographie,
  // administration, préférences : rien de tout cela ne relève d'un référentiel).
  cadre?: string
}
export type Groupe = { label?: string, items: Item[] }
export type Section = { id: string, titre: string, groupes: Groupe[] }

// LES UNITÉS D'ORGANISATION, déclarées UNE fois et présentes dans deux sections.
export const ORGANISATION: Item[] = [
  { libelle: 'Entités', url: '/entites', icon: 'lucide:landmark', cat: 'entites' },
  { libelle: 'Composantes', url: '/composantes', icon: 'lucide:building', cat: 'composantes' },
  { libelle: 'Départements', url: '/departements', icon: 'lucide:graduation-cap', cat: 'departements' },
  { libelle: 'Services', url: '/services', icon: 'lucide:layers', cat: 'services' },
  { libelle: 'Pôles', url: '/poles', icon: 'lucide:network', cat: 'poles' },
]

export const SECTIONS: Section[] = [
  {
    id: 'logique',
    titre: 'Cartographie logique',
    groupes: [{ items: [
      { libelle: 'Applications', url: '/applications', icon: 'lucide:app-window', cat: 'applications' },
      { libelle: 'Technologies', url: '/technologies', icon: 'lucide:cpu', cat: 'technologies' },
      { libelle: 'Flux applicatifs', url: '/flux-applicatifs', icon: 'lucide:arrow-left-right', cat: 'flux-applicatifs' },
      { libelle: 'Logiciels postes de travail', url: '/postes', icon: 'lucide:monitor-smartphone', cat: 'postes' },
      { libelle: 'Actifs informationnels', url: '/actifs-informationnels', icon: 'lucide:database', cat: 'actifs-informationnels' },
      { libelle: 'Processus métier', url: '/processus', icon: 'lucide:workflow', cat: 'processus' },
      { libelle: 'Prestataires', url: '/tiers', icon: 'lucide:building-2', cat: 'tiers' },
      { libelle: 'Accès VPN', url: '/vpn', icon: 'lucide:shield-check', cat: 'vpn' },
    ] }],
  },
  {
    id: 'materielle',
    titre: 'Cartographie matérielle',
    groupes: [
      { label: 'Inventaires', items: [
        { libelle: 'Serveurs', url: '/serveurs', icon: 'lucide:server', cat: 'serveurs' },
        { libelle: 'Postes de travail', url: '/postes-travail', icon: 'lucide:monitor', cat: 'postes-travail' },
        { libelle: 'Appareils mobiles', url: '/appareils-mobiles', icon: 'lucide:tablet-smartphone', cat: 'appareils-mobiles' },
        { libelle: 'IoT & objets connectés', url: '/iot', icon: 'lucide:cctv', cat: 'iot' },
        { libelle: 'Machines industrielles', url: '/machines-indus', icon: 'lucide:factory', cat: 'machines-indus' },
        { libelle: 'Lieux', url: '/lieux', icon: 'lucide:map-pin', cat: 'lieux' },
      ] },
      { label: 'Par organisation', items: ORGANISATION },
    ],
  },
  {
    id: 'reseau',
    titre: 'Cartographie réseau',
    groupes: [
      { label: 'Vues', items: [
        { libelle: 'Topologie (graphe)', url: '/topologie-reseau', icon: 'lucide:share-2', cat: 'equipements-reseau' },
      ] },
      { label: 'Référentiels', items: [
        { libelle: 'Équipements réseau', url: '/equipements-reseau', icon: 'lucide:router', cat: 'equipements-reseau' },
        { libelle: 'Zones & VLAN', url: '/zones-reseau', icon: 'lucide:layout-grid', cat: 'zones-reseau' },
        { libelle: 'Flux réseau', url: '/flux-reseau', icon: 'lucide:waypoints', cat: 'flux-reseau' },
        { libelle: 'Liens réseau', url: '/liens-reseau', icon: 'lucide:cable', cat: 'liens-reseau' },
        { libelle: 'Interconnexions externes', url: '/interconnexions-externes', icon: 'lucide:globe', cat: 'interconnexions-externes' },
      ] },
    ],
  },
  {
    id: 'humaine',
    titre: 'Cartographie humaine',
    groupes: [
      { label: 'Vues', items: [
        { libelle: 'Organigramme', url: '/organigramme', icon: 'lucide:git-fork', cats: ['entites', 'composantes', 'departements', 'services', 'poles', 'personnes'] },
        { libelle: 'Annuaire', url: '/annuaire', icon: 'lucide:contact', cat: 'personnes' },
        { libelle: 'Référents', url: '/referents', icon: 'lucide:badge-check', cat: 'personnes' },
        { libelle: 'Rôles & missions', url: '/missions', icon: 'lucide:shield-user', cat: 'personnes' },
      ] },
      { label: 'Référentiels', items: [
        ...ORGANISATION,
        { libelle: 'Personnes', url: '/personnes', icon: 'lucide:user-round', cat: 'personnes' },
        { libelle: 'Populations', url: '/populations', icon: 'lucide:users-round', cat: 'populations' },
        { libelle: 'Groupes', url: '/groupes', icon: 'lucide:folder-tree', cat: 'groupes' },
        { libelle: 'Sections CNU', url: '/sections-cnu', icon: 'lucide:graduation-cap', cat: 'sections-cnu' },
      ] },
    ],
  },
  {
    id: 'smsi',
    titre: 'SMSI / ISO 27001',
    groupes: [
      { label: 'Vues', items: [
        { libelle: 'Tableau de bord', url: '/tableau-smsi', icon: 'lucide:gauge', cat: 'mesures-smsi' },
        { libelle: 'Périmètres', url: '/perimetres', icon: 'lucide:scan-search', cats: ['composantes', 'services', 'departements', 'lieux'] },
        { libelle: 'Matrice des risques', url: '/matrice-risques', icon: 'lucide:grid-3x3', cat: 'risques-smsi', cadre: 'iso27005' },
        { libelle: 'Fin de vie des systèmes', url: '/fin-de-vie', icon: 'lucide:shield-x', cat: 'technologies' },
        { libelle: 'Dépendances', url: '/dependances', icon: 'lucide:workflow', cat: 'actifs-smsi' },
        { libelle: 'Écosystème', url: '/ecosysteme', icon: 'lucide:share-2', cat: 'parties-prenantes' },
        { libelle: 'Scénarios EBIOS', url: '/scenarios-ebios', icon: 'lucide:route', cat: 'scenarios-strategiques', cadre: 'iso27005' },
      ] },
      { label: 'Référentiels', items: [
        { libelle: 'Actifs SMSI', url: '/actifs-smsi', icon: 'lucide:shield-check', cat: 'actifs-smsi' },
        { libelle: 'Risques', url: '/risques-smsi', icon: 'lucide:triangle-alert', cat: 'risques-smsi', cadre: 'iso27005' },
        { libelle: 'Événements redoutés', url: '/evenements-redoutes', icon: 'lucide:siren', cat: 'evenements-redoutes', cadre: 'iso27005' },
        { libelle: 'Mesures (SoA)', url: '/mesures-smsi', icon: 'lucide:list-checks', cat: 'mesures-smsi', cadre: 'iso27002' },
        { libelle: 'Sources de risque', url: '/sources-risque', icon: 'lucide:crosshair', cat: 'sources-risque', cadre: 'iso27005' },
      ] },
    ],
  },
  {
    id: 'nis2',
    titre: 'Conformité NIS 2',
    groupes: [{ items: [
      { libelle: 'Mon entité', url: '/entite-nis2', icon: 'lucide:shield', cat: 'exigences-nis2', cadre: 'nis2' },
      { libelle: 'Exigences (ReCyF)', url: '/exigences-nis2', icon: 'lucide:clipboard-check', cat: 'exigences-nis2', cadre: 'nis2' },
      { libelle: 'Objectifs de sécurité', url: '/objectifs-nis2', icon: 'lucide:scale', cat: 'objectifs-nis2', cadre: 'nis2' },
      { libelle: 'Plan d\'actions', url: '/plan-actions-nis2', icon: 'lucide:list-todo', cat: 'actions-nis2', cadre: 'nis2' },
      { libelle: 'Toutes les actions', url: '/actions-nis2', icon: 'lucide:table', cat: 'actions-nis2', cadre: 'nis2' },
      { libelle: 'Compteurs réglementaires', url: '/notifications-nis2', icon: 'lucide:gavel', cat: 'notifications-nis2', cadre: 'nis2' },
    ] }],
  },
  {
    id: 'gouvernance',
    titre: 'Gouvernance SMSI',
    groupes: [
      { label: 'Vues', items: [
        { libelle: 'Matrice des compétences', url: '/matrice-competences', icon: 'lucide:table-2', cat: 'competences' },
        { libelle: 'Matrice RACI', url: '/raci', icon: 'lucide:user-check', cat: 'personnes' },
      ] },
      { label: 'Référentiels', items: [
        { libelle: 'Clauses ISO 27001', url: '/clauses-iso27001', icon: 'lucide:scale', cat: 'clauses-iso27001', cadre: 'iso27001' },
        { libelle: 'Objectifs SSI', url: '/objectifs-smsi', icon: 'lucide:target', cat: 'objectifs-smsi', cadre: 'iso27001' },
        { libelle: 'Documents SMSI', url: '/documents-smsi', icon: 'lucide:file-text', cat: 'documents-smsi', cadre: 'iso27001' },
        { libelle: 'Audits', url: '/audits-smsi', icon: 'lucide:clipboard-check', cat: 'audits-smsi', cadre: 'iso27001' },
        { libelle: 'Revues de direction', url: '/revues-direction', icon: 'lucide:users', cat: 'revues-direction', cadre: 'iso27001' },
        { libelle: 'Non-conformités & actions', url: '/non-conformites', icon: 'lucide:octagon-alert', cat: 'non-conformites', cadre: 'iso27001' },
        { libelle: 'Opportunités', url: '/opportunites', icon: 'lucide:trending-up', cat: 'opportunites', cadre: 'iso27001' },
        { libelle: 'Exigences légales', url: '/exigences-legales', icon: 'lucide:gavel', cat: 'exigences-legales' },
        { libelle: 'Parties intéressées', url: '/parties-interessees', icon: 'lucide:users-round', cat: 'parties-interessees' },
        { libelle: 'Compétences', url: '/competences', icon: 'lucide:graduation-cap', cat: 'competences' },
      ] },
    ],
  },
  {
    id: 'supervision',
    titre: 'Supervision',
    groupes: [{ items: [
      { libelle: 'Demandes', url: '/demandes', icon: 'lucide:inbox', contributeurOuPlus: true, badge: 'demandes' },
      { libelle: 'Alertes', url: '/alertes', icon: 'lucide:bell', admin: true, badge: 'alertes' },
      { libelle: 'Catalogue RGPD', url: '/rgpd', icon: 'lucide:shield', cat: 'applications', cadre: 'rgpd' },
      { libelle: 'Sites et services', url: '/sites-services', icon: 'lucide:globe', cat: 'sites-services' },
      { libelle: 'Audit de surface', url: '/audit-surface', icon: 'lucide:scan-search', cat: 'audit-surface' },
      { libelle: 'Tableau de bord audit', url: '/audit-surface/tableau', icon: 'lucide:layout-dashboard', cat: 'audit-surface' },
      { libelle: 'Domaines surveillés', url: '/audit-surface/domaines', icon: 'lucide:at-sign', cat: 'audit-surface' },
      { libelle: 'Certificats TLS', url: '/certificats', icon: 'lucide:shield-check', cat: 'certificats' },
      { libelle: 'Listes blanches', url: '/whitelists', icon: 'lucide:shield-off', cat: 'whitelists' },
      { libelle: 'Règles YARA', url: '/edr/yara', icon: 'lucide:file-code', cat: 'edr-regles' },
      { libelle: 'Règles Sigma', url: '/edr/sigma', icon: 'lucide:file-search', cat: 'edr-regles' },
      { libelle: 'IOC', url: '/edr/ioc', icon: 'lucide:fingerprint', cat: 'edr-regles' },
      { libelle: 'Règles de corrélation', url: '/edr/correlation', icon: 'lucide:git-merge', cat: 'edr-regles' },
      { libelle: 'Driver blocklist', url: '/edr/driverblock', icon: 'lucide:shield-x', cat: 'edr-regles' },
      { libelle: 'Jeux de règles', url: '/edr/rulesets', icon: 'lucide:layers', cat: 'edr-regles' },
      { libelle: 'Connecteur GLPI', url: '/glpi', icon: 'lucide:database-zap', admin: true },
      { libelle: 'Connecteur HarfangLab', url: '/harfanglab', icon: 'lucide:radar', admin: true },
      { libelle: 'Moteur d\'audit externe', url: '/audit-surface/connecteur', icon: 'lucide:satellite-dish', admin: true },
      { libelle: 'Annuaire LDAP', url: '/ldap', icon: 'lucide:contact', admin: true },
      { libelle: 'Incidents (Slowpoke)', url: '/incidents', icon: 'lucide:siren', admin: true },
      { libelle: 'Webhooks', url: '/webhooks', icon: 'lucide:webhook', admin: true },
      { libelle: 'Utilisateurs & rôles', url: '/roles', icon: 'lucide:users', admin: true },
      { libelle: 'Comptes techniques', url: '/comptes-techniques', icon: 'lucide:key-round', admin: true },
      { libelle: 'Référentiels', url: '/referentiels', icon: 'lucide:library', admin: true },
      { libelle: 'Journal d\'audit', url: '/audit', icon: 'lucide:scroll-text', admin: true },
    ] }],
  },
  {
    id: 'autres',
    titre: 'Autres',
    groupes: [{ items: [
      { libelle: 'Toutes les pages', url: '/plan-du-site', icon: 'lucide:compass' },
      { libelle: 'API', url: '/documentation-api', icon: 'lucide:plug' },
      { libelle: 'Réglages', url: '/reglages', icon: 'lucide:settings', admin: true },
      { libelle: 'Documentation API', url: '/openapi', icon: 'lucide:book-text', manager: true, externe: true },
    ] }],
  },
]

// --- Titre d'une page -------------------------------------------------------------------

// Toutes les entrées à plat, adresse → libellé. Construite une fois : la table ne change
// pas pendant la session.
const LIBELLES_PAR_URL = new Map<string, string>(
  SECTIONS.flatMap(s => s.groupes.flatMap(g => g.items.map(i => [i.url, i.libelle] as const))),
)

// Ce que le dernier segment d'une adresse dit du MODE de la page, et non de son sujet.
const MODES: Record<string, string> = { new: 'création', edit: 'modification' }

/**
 * Le titre d'une page, dérivé de son adresse. Trois sources, dans l\'ordre : le menu, qui nomme
 * 92 pages ; la configuration des catalogues, qui nomme les écrans génériques (`/[catalogue]`)
 * absents du menu ; et à défaut le segment d'adresse lui-même, rendu lisible.
 */
export function titreDeRoute(chemin: string): string {
  const segments = chemin.split('/').filter(Boolean)
  if (!segments.length) return 'Tableau de bord'

  const mode = MODES[segments[segments.length - 1] ?? '']
  const utiles = mode ? segments.slice(0, -1) : segments

  // Du plus précis au plus général : /applications/12 retombe sur /applications.
  for (let i = utiles.length; i > 0; i--) {
    const libelle = LIBELLES_PAR_URL.get('/' + utiles.slice(0, i).join('/'))
    if (libelle) return mode ? `${libelle} · ${mode}` : libelle
  }

  const racine = utiles[0] ?? ''
  const libelle = catalogues[racine]?.label ?? capitalize(racine.replace(/-/g, ' '))
  return mode ? `${libelle} · ${mode}` : libelle
}
