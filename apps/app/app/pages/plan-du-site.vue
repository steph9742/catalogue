<script setup lang="ts">
// Plan du site : TOUTES les pages accessibles, groupées par domaine. C'est le filet de sécurité
// de la navigation — la recherche (Cmd+K) accélère, le menu guide, et cette page garantit que
// rien n'est atteignable UNIQUEMENT en sachant quoi taper.

const perms = await usePermissions()
const isAdmin = perms.isAdmin

type Lien = { libelle: string, url: string, icon: string, cat?: string, admin?: boolean, manager?: boolean, note?: string }
type Groupe = { titre: string, icon: string, liens: Lien[] }

const GROUPES: Groupe[] = [
  {
    titre: 'Pilotage',
    icon: 'lucide:layout-dashboard',
    liens: [
      { libelle: 'Tableau de bord', url: '/', icon: 'lucide:layout-dashboard', note: 'Urgences, posture, parc' },
      { libelle: 'Tableau de bord SMSI', url: '/tableau-smsi', icon: 'lucide:gauge', cat: 'mesures-smsi' },
      { libelle: 'Alertes d\'échéance', url: '/alertes', icon: 'lucide:bell', admin: true },
      { libelle: 'Demandes à valider', url: '/demandes', icon: 'lucide:inbox' },
    ],
  },
  {
    titre: 'Cartographie logique',
    icon: 'lucide:app-window',
    liens: [
      { libelle: 'Applications', url: '/applications', icon: 'lucide:app-window', cat: 'applications' },
      { libelle: 'Technologies', url: '/technologies', icon: 'lucide:cpu', cat: 'technologies' },
      { libelle: 'Fin de vie des systèmes', url: '/fin-de-vie', icon: 'lucide:shield-x', cat: 'technologies', note: 'Systèmes hors support ou sans date connue' },
      { libelle: 'Flux applicatifs', url: '/flux-applicatifs', icon: 'lucide:arrow-left-right', cat: 'flux-applicatifs' },
      { libelle: 'Logiciels postes de travail', url: '/postes', icon: 'lucide:monitor-smartphone', cat: 'postes' },
      { libelle: 'Actifs informationnels', url: '/actifs-informationnels', icon: 'lucide:database', cat: 'actifs-informationnels' },
      { libelle: 'Processus métier', url: '/processus', icon: 'lucide:workflow', cat: 'processus' },
      { libelle: 'Prestataires', url: '/tiers', icon: 'lucide:building-2', cat: 'tiers' },
      { libelle: 'Accès VPN', url: '/vpn', icon: 'lucide:shield-check', cat: 'vpn' },
      { libelle: 'Catalogue RGPD', url: '/rgpd', icon: 'lucide:shield', cat: 'applications' },
    ],
  },
  {
    titre: 'Cartographie matérielle',
    icon: 'lucide:server',
    liens: [
      { libelle: 'Serveurs', url: '/serveurs', icon: 'lucide:server', cat: 'serveurs' },
      { libelle: 'Postes de travail', url: '/postes-travail', icon: 'lucide:monitor', cat: 'postes-travail' },
      { libelle: 'Appareils mobiles', url: '/appareils-mobiles', icon: 'lucide:tablet-smartphone', cat: 'appareils-mobiles' },
      { libelle: 'IoT & objets connectés', url: '/iot', icon: 'lucide:cctv', cat: 'iot' },
      { libelle: 'Machines industrielles', url: '/machines-indus', icon: 'lucide:factory', cat: 'machines-indus' },
      { libelle: 'Lieux', url: '/lieux', icon: 'lucide:map-pin', cat: 'lieux' },
    ],
  },
  {
    titre: 'Cartographie réseau',
    icon: 'lucide:router',
    liens: [
      { libelle: 'Topologie (graphe)', url: '/topologie-reseau', icon: 'lucide:share-2', cat: 'equipements-reseau' },
      { libelle: 'Équipements réseau', url: '/equipements-reseau', icon: 'lucide:router', cat: 'equipements-reseau' },
      { libelle: 'Zones & VLAN', url: '/zones-reseau', icon: 'lucide:layout-grid', cat: 'zones-reseau' },
      { libelle: 'Flux réseau', url: '/flux-reseau', icon: 'lucide:waypoints', cat: 'flux-reseau' },
      { libelle: 'Liens réseau', url: '/liens-reseau', icon: 'lucide:cable', cat: 'liens-reseau' },
      { libelle: 'Interconnexions externes', url: '/interconnexions-externes', icon: 'lucide:globe', cat: 'interconnexions-externes' },
    ],
  },
  {
    titre: 'Organisation',
    icon: 'lucide:users',
    liens: [
      { libelle: 'Organigramme', url: '/organigramme', icon: 'lucide:git-fork', cat: 'entites' },
      { libelle: 'Annuaire', url: '/annuaire', icon: 'lucide:contact', cat: 'personnes' },
      { libelle: 'Composantes', url: '/composantes', icon: 'lucide:building', cat: 'composantes', note: 'Vue par périmètre' },
      { libelle: 'Entités', url: '/entites', icon: 'lucide:landmark', cat: 'entites' },
      { libelle: 'Départements', url: '/departements', icon: 'lucide:graduation-cap', cat: 'departements' },
      { libelle: 'Services', url: '/services', icon: 'lucide:layers', cat: 'services' },
      { libelle: 'Pôles', url: '/poles', icon: 'lucide:network', cat: 'poles' },
      { libelle: 'Personnes', url: '/personnes', icon: 'lucide:user-round', cat: 'personnes' },
      { libelle: 'Référents', url: '/referents', icon: 'lucide:badge-check', cat: 'personnes' },
      { libelle: 'Rôles & missions', url: '/missions', icon: 'lucide:shield-user', cat: 'personnes' },
      { libelle: 'Matrice RACI', url: '/raci', icon: 'lucide:user-check', cat: 'personnes' },
      { libelle: 'Populations', url: '/populations', icon: 'lucide:users-round', cat: 'populations' },
      { libelle: 'Groupes', url: '/groupes', icon: 'lucide:folder-tree', cat: 'groupes' },
      { libelle: 'Sections CNU', url: '/sections-cnu', icon: 'lucide:graduation-cap', cat: 'sections-cnu' },
    ],
  },
  {
    titre: 'Risque & SMSI (ISO 27001)',
    icon: 'lucide:shield-check',
    liens: [
      { libelle: 'Périmètres', url: '/perimetres', icon: 'lucide:scan-search', note: 'Le SI par composante, service, département ou lieu' },
      { libelle: 'Matrice des risques', url: '/matrice-risques', icon: 'lucide:grid-3x3', cat: 'risques-smsi' },
      { libelle: 'Risques', url: '/risques-smsi', icon: 'lucide:triangle-alert', cat: 'risques-smsi' },
      { libelle: 'Actifs SMSI', url: '/actifs-smsi', icon: 'lucide:shield-check', cat: 'actifs-smsi' },
      { libelle: 'Dépendances', url: '/dependances', icon: 'lucide:workflow', cat: 'actifs-smsi' },
      { libelle: 'Événements redoutés', url: '/evenements-redoutes', icon: 'lucide:siren', cat: 'evenements-redoutes' },
      { libelle: 'Mesures (SoA)', url: '/mesures-smsi', icon: 'lucide:list-checks', cat: 'mesures-smsi' },
      { libelle: 'Sources de risque', url: '/sources-risque', icon: 'lucide:crosshair', cat: 'sources-risque' },
      { libelle: 'Écosystème (EBIOS)', url: '/ecosysteme', icon: 'lucide:share-2', cat: 'parties-prenantes' },
      { libelle: 'Scénarios EBIOS', url: '/scenarios-ebios', icon: 'lucide:route', cat: 'scenarios-strategiques' },
    ],
  },
  {
    titre: 'Gouvernance SMSI',
    icon: 'lucide:gavel',
    liens: [
      { libelle: 'Objectifs SSI', url: '/objectifs-smsi', icon: 'lucide:target', cat: 'objectifs-smsi' },
      { libelle: 'Documents SMSI', url: '/documents-smsi', icon: 'lucide:file-text', cat: 'documents-smsi' },
      { libelle: 'Audits', url: '/audits-smsi', icon: 'lucide:clipboard-check', cat: 'audits-smsi' },
      { libelle: 'Revues de direction', url: '/revues-direction', icon: 'lucide:users', cat: 'revues-direction' },
      { libelle: 'Non-conformités & actions', url: '/non-conformites', icon: 'lucide:octagon-alert', cat: 'non-conformites' },
      { libelle: 'Opportunités', url: '/opportunites', icon: 'lucide:trending-up', cat: 'opportunites' },
      { libelle: 'Exigences légales', url: '/exigences-legales', icon: 'lucide:gavel', cat: 'exigences-legales' },
      { libelle: 'Parties intéressées', url: '/parties-interessees', icon: 'lucide:users-round', cat: 'parties-interessees' },
      { libelle: 'Compétences', url: '/competences', icon: 'lucide:graduation-cap', cat: 'competences' },
      { libelle: 'Matrice des compétences', url: '/matrice-competences', icon: 'lucide:table-2', cat: 'competences' },
    ],
  },
  {
    titre: 'Conformité NIS 2',
    icon: 'lucide:scale',
    liens: [
      { libelle: 'Mon entité', url: '/entite-nis2', icon: 'lucide:shield', cat: 'exigences-nis2' },
      { libelle: 'Exigences (ReCyF)', url: '/exigences-nis2', icon: 'lucide:clipboard-check', cat: 'exigences-nis2' },
      { libelle: 'Objectifs de sécurité', url: '/objectifs-nis2', icon: 'lucide:scale', cat: 'objectifs-nis2' },
      { libelle: 'Plan d\'actions', url: '/plan-actions-nis2', icon: 'lucide:list-todo', cat: 'actions-nis2' },
      { libelle: 'Toutes les actions', url: '/actions-nis2', icon: 'lucide:table', cat: 'actions-nis2' },
      { libelle: 'Compteurs réglementaires', url: '/notifications-nis2', icon: 'lucide:gavel', cat: 'notifications-nis2', note: 'NIS 2, CNIL, CERT — décidés dans Sniff' },
    ],
  },
  {
    titre: 'Administration',
    icon: 'lucide:settings',
    liens: [
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
      { libelle: 'Annuaire LDAP', url: '/ldap', icon: 'lucide:contact', admin: true },
      { libelle: 'Incidents (Slowpoke)', url: '/incidents', icon: 'lucide:siren', admin: true },
      { libelle: 'Utilisateurs & rôles', url: '/roles', icon: 'lucide:users', admin: true },
      { libelle: 'Comptes techniques', url: '/comptes-techniques', icon: 'lucide:key-round', admin: true },
      { libelle: 'Référentiels', url: '/referentiels', icon: 'lucide:library', admin: true, note: 'Sources et import des jeux de données' },
      { libelle: 'Webhooks', url: '/webhooks', icon: 'lucide:webhook', admin: true },
      { libelle: 'Journal d\'audit', url: '/audit', icon: 'lucide:scroll-text', admin: true },
      { libelle: 'API', url: '/documentation-api', icon: 'lucide:plug', note: 'Référence des routes, authentification, conventions' },
      { libelle: 'Réglages', url: '/reglages', icon: 'lucide:settings', admin: true, note: 'Administration : connecteurs, référentiels, droits' },
      { libelle: 'Mon profil', url: '/profil', icon: 'lucide:user-round', note: 'Mes accès, notifications, préférences' },
    ],
  },
]

const visible = (l: Lien) => (!l.admin || isAdmin.value) && (!l.cat || perms.canRead(l.cat))
const groupes = computed(() =>
  GROUPES.map(g => ({ ...g, liens: g.liens.filter(visible) })).filter(g => g.liens.length))

const TUILE = 'rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]'
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Toutes les pages
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        L'ensemble des vues auxquelles vous avez accès. Astuce : <kbd class="rounded border border-secondary-200 bg-secondary-50 px-1 font-mono text-[10px]">⌘K</kbd> ouvre la recherche rapide.
      </p>
    </header>

    <section
      v-for="g in groupes"
      :key="g.titre"
      :class="[TUILE, 'space-y-2']"
    >
      <h2 class="flex items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          :name="g.icon"
          class="size-4 text-primary-500"
        />{{ g.titre }}
      </h2>
      <div class="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="l in g.liens"
          :key="l.url"
          :to="l.url"
          class="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-secondary-50"
        >
          <Icon
            :name="l.icon"
            class="size-4 shrink-0 text-secondary-400"
          />
          <span class="min-w-0">
            <span class="block truncate text-sm text-secondary-800">{{ l.libelle }}</span>
            <span
              v-if="l.note"
              class="block truncate text-[11px] text-secondary-400"
            >{{ l.note }}</span>
          </span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
