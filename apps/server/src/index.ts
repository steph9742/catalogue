import { t, Elysia } from 'elysia'
import { openapi } from '@elysia/openapi'
import { cors } from '@elysiajs/cors'
import { betterAuth } from './middleware/auth'
import { crudRouter } from './routers/crud'
import { limiteurConnexion, secoursOuvert } from './middleware/limiteurConnexion'
import { verifierAccesSso, verifierConfig } from './utils/verifierConfig'
import { IMPORT_REFERENCES } from './routers/importRefs'
import { applicationsRouter } from './routers/applications'
import { logicielsPosteRouter } from './routers/logicielsPoste'
import { tiersRouter } from './routers/tiersRouter'
import { dashboardRouter } from './routers/dashboard'
import { pilotageRouter } from './routers/pilotage'
import { rechercheRouter } from './routers/recherche'
import { composantesRouter } from './routers/composantes'
import { preferencesRouter } from './routers/preferences'
import { perimetreRouter } from './routers/perimetre'
import { STATUTS_EOL, bornes as bornesEol, decorerEol, eolRouter, expressionEolStatut } from './routers/eol'
import { harfanglabRouter } from './routers/harfanglab'
import { auditSurfaceRouter } from './routers/auditSurface'
import { domainesSurveillesRouter } from './routers/domainesSurveilles'
import { ldapRouter } from './routers/ldap'
import { whitelistsRouter } from './routers/whitelists'
import { edrReglesRouter } from './routers/edrRegles'
import { certificatsRouter } from './routers/certificats'
import { servicesExposesRouter } from './routers/servicesExposes'
import { pagesCiblesRouter } from './routers/pagesCibles'
import { expositionServiceRouter } from './routers/expositionService'
import { conformiteRouter } from './routers/conformite'
import { lacunesRouter } from './routers/lacunes'
import { lecturesRouter } from './routers/lectures'
import { impactRouter } from './routers/impact'
import { responsablesRouter } from './routers/responsables'
import { parcExposeRouter } from './routers/parcExpose'
import { parcResumeRouter } from './routers/parcResume'
import { competencesResumeRouter } from './routers/competencesResume'
import { incidentsCroisesRouter } from './routers/incidentsCroises'
import { dossierApplicationRouter } from './routers/dossierApplication'
import { parcTechnologiqueRouter } from './routers/parcTechnologique'
import { reseauExposeRouter } from './routers/reseauExpose'
import { metierRouter } from './routers/metier'
import { echeancesRouter } from './routers/echeances'
import { sniffEvenementsRouter } from './routers/sniffEvenements'
import { echeancesSniffRouter } from './routers/echeancesSniff'
import { referentielsRouter } from './routers/referentiels'
import { cadresRouter } from './routers/cadres'
import { rgpdRouter } from './routers/rgpd'
import { alertsRouter } from './routers/alerts'
import { auditRouter } from './routers/auditRouter'
import { pushRouter } from './routers/push'
import { rolesRouter } from './routers/roles'
import { changeRequestsRouter } from './routers/changeRequests'
import { referentsRouter } from './routers/referents'
import { entiteResponsablesRouter } from './routers/entiteResponsables'
import { risquesRouter } from './routers/risques'
import { actifsSmsiRouter } from './routers/actifsSmsi'
import { actifsInfoRouter } from './routers/actifsInfo'
import { competencesRouter } from './routers/competences'
import { nis2Router } from './routers/nis2'
import { piecesJointesRouter } from './routers/piecesJointes'
import { entiteNis2Router } from './routers/entiteNis2'
import { ebiosRouter } from './routers/ebios'
import { notificationsNis2Router } from './routers/notificationsNis2'
import { glpiRouter } from './routers/glpi'
import { slowpokeRouter } from './routers/slowpoke'
import { afterMutation } from './utils/audit'
import { sql, type Column } from 'drizzle-orm'
import { setApp } from './utils/internal'
import { startAlertsScheduler, startAuditScheduler, startDomainesScheduler, startGlpiScheduler, startHarfanglabScheduler, startLdapScheduler, startNotificationsNis2Scheduler, startRelevesScheduler } from './utils/scheduler'
import { reconcilierClesTechnologie } from './utils/technologieCle'
import {
  entite,
  serviceExpose,
  composante,
  departement,
  pole,
  service,
  personne,
  population,
  groupe,
  technologie,
  serveur,
  accesVpn,
  webhook,
  lieu,
  posteTravail,
  appareilMobile,
  iot,
  machineIndus,
  equipementReseau,
  zoneReseau,
  fluxReseau,
  actifInformationnel,
  processusMetier,
  sectionCnu,
  actifSmsi,
  risqueSmsi,
  clauseIso27001,
  mesureSmsi,
  objectifSmsi,
  documentSmsi,
  auditSmsi,
  revueDirection,
  nonConformite,
  evenementRedoute,
  fluxApplicatif,
  lienReseau,
  interconnexionExterne,
  objectifNis2,
  exigenceNis2,
  actionNis2,
  exigenceLegale,
  partieInteressee,
  competence,
  opportunite,
  sourceRisque,
  partiePrenante,
  scenarioStrategique,
  scenarioOperationnel,
  notificationIncidentNis2,
} from '@catalogue/database/tables'

const app = new Elysia()
  // Limiteur AVANT better-auth : il doit intercepter la tentative avant la vérification
  // du mot de passe, sinon il ne freine rien.
  .use(limiteurConnexion)
  // Ce que le frontend doit savoir avant toute connexion : quelles voies sont ouvertes.
  // Public par nécessité — la page de connexion s'affiche avant toute authentification.
  .get('/api/auth-config', () => ({
    sso: !!process.env.OUATE_CLIENT_ID,
    secours: secoursOuvert(),
  }))
  .use(
    openapi({
      documentation: {
        info: {
          title: 'API Catalogue',
          version: '1.0.0',
          description: [
            "API de l'application de cartographie et de conformité cyber.",
            '',
            '## Authentification',
            '',
            'Deux modes, selon que l\'appelant est une personne ou un programme :',
            '',
            '- **Session** — cookie posé à la connexion (SSO ou mot de passe). C\'est ce',
            '  qu\'utilise l\'interface. Les requêtes doivent porter les cookies.',
            '- **Compte de service** — en-tête `x-service-key` avec une clé `sk_…`, créée',
            '  dans *Réglages → Comptes techniques*. Sa portée est limitée par ses *scopes*',
            '  (`read`, `write`, `delete`, `admin`) : hors périmètre, la réponse est `403`.',
            '',
            '## Permissions',
            '',
            'Les droits sont attribués **par catégorie**, pas globalement. Une lecture exige',
            'un rôle sur la catégorie visée ; une écriture exige `gestionnaire`. Un',
            '`contributeur` qui écrit ne modifie rien : sa requête est enregistrée comme',
            '**demande de validation** et la réponse est `202`.',
            '',
            '## Conventions',
            '',
            '- Listes : `?page` & `?pageSize` renvoient `{ rows, total }` ; sans eux, le',
            '  tableau complet. `?q=` cherche dans les colonnes texte, `?<colonne>=v1,v2`',
            '  filtre, `?sort=` & `?dir=` trient.',
            '- Actions groupées : `/lot` accepte soit `ids`, soit `filtre` — ce dernier',
            '  désignant **tous** les résultats du filtre, y compris non affichés. Chaque',
            '  opération renvoie un `annulationId` réutilisable pendant 24 h.',
            '- Import : `dryRun: true` par défaut — l\'appel annonce ce qui serait écrit',
            '  sans rien écrire.',
          ].join('\n'),
          contact: { name: 'Cellule cyber — DSI' },
        },
        tags: [
          { name: 'Catalogues', description: 'Listes, fiches, création, modification, suppression' },
          { name: 'Actions groupées', description: 'Modification et suppression en masse, avec annulation' },
          { name: 'Import', description: 'Import de fichiers tabulaires, avec simulation préalable' },
          { name: 'Connecteurs', description: 'GLPI et Sniff — lecture seule des systèmes sources' },
          { name: 'Conformité', description: 'NIS 2 / ReCyF, SMSI / ISO 27001, EBIOS RM' },
          { name: 'Pilotage', description: 'Tableau de bord, périmètres, fin de vie des systèmes' },
          { name: 'Administration', description: 'Rôles, référentiels, comptes techniques, audit' },
          { name: 'Authentification', description: 'Session, comptes de service, connexion de secours' },
        ],
        components: {
          securitySchemes: {
            session: {
              type: 'apiKey',
              in: 'cookie',
              name: 'catalogue.session_token',
              description: 'Cookie de session posé à la connexion. Utilisé par l\'interface.',
            },
            compteDeService: {
              type: 'apiKey',
              in: 'header',
              name: 'x-service-key',
              description: 'Clé `sk_…` d\'un compte technique. Sa portée dépend de ses scopes.',
            },
          },
        },
        security: [{ session: [] }, { compteDeService: [] }],
      },
    }),
  )
  .use(betterAuth)
  .use(
    cors({
      origin: process.env.TRUSTED_ORIGINS?.split(',') || [],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  )
  .onError(({ code, error, request }) => {
    console.error(
      `❌ [${code}] ${request.method} ${new URL(request.url).pathname} —`,
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    )
  })
  // Sur mutation : audit + diffusion webhooks/push (fire-and-forget).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .onAfterResponse((ctx: any) => { void afterMutation(ctx) })
  .use(dashboardRouter)
  .use(pilotageRouter)
  .use(rechercheRouter)
  .use(composantesRouter)
  .use(preferencesRouter)
  .use(perimetreRouter)
  .use(eolRouter)
  .use(harfanglabRouter)
  .use(auditSurfaceRouter)
  .use(domainesSurveillesRouter)
  .use(ldapRouter)
  .use(whitelistsRouter)
  .use(edrReglesRouter)
  .use(certificatsRouter)
  .use(servicesExposesRouter)
  .use(pagesCiblesRouter)
  .use(expositionServiceRouter)
  .use(conformiteRouter)
  .use(lacunesRouter)
  .use(lecturesRouter)
  .use(impactRouter)
  .use(responsablesRouter)
  .use(parcExposeRouter)
  .use(parcResumeRouter)
  .use(competencesResumeRouter)
  .use(incidentsCroisesRouter)
  .use(dossierApplicationRouter)
  .use(parcTechnologiqueRouter)
  .use(reseauExposeRouter)
  .use(metierRouter)
  .use(echeancesRouter)
  .use(sniffEvenementsRouter)
  .use(echeancesSniffRouter)
  .use(referentielsRouter)
  .use(cadresRouter)
  .use(rgpdRouter)
  .use(alertsRouter)
  .use(auditRouter)
  .use(pushRouter)
  .use(rolesRouter)
  .use(changeRequestsRouter)
  .use(referentsRouter)
  .use(entiteResponsablesRouter)
  .use(risquesRouter)
  .use(actifsSmsiRouter)
  .use(actifsInfoRouter)
  .use(competencesRouter)
  .use(nis2Router)
  .use(piecesJointesRouter)
  .use(entiteNis2Router)
  .use(ebiosRouter)
  .use(notificationsNis2Router)
  .use(glpiRouter)
  .use(slowpokeRouter)
  .use(applicationsRouter)
  .use(logicielsPosteRouter)
  .use(tiersRouter)

// Catalogues CRUD génériques : enregistrés via une boucle à type neutre pour éviter l'explosion
// d'inférence TypeScript (TS2589) d'une longue chaîne .use().
const filtreEol = (cle: Column) => ({
  param: 'eolStatut',
  // La liste vient du module, jamais recopiée : voir STATUTS_EOL.
  valeurs: STATUTS_EOL,
  where: (v: string) => {
    const { aujourdhui, dansUnAn } = bornesEol()
    return sql`${expressionEolStatut(cle, aujourdhui, dansUnAn)} = ${v}`
  },
})

const CRUD: Array<Parameters<typeof crudRouter>[0]> = [
  // « Sites et services » : catalogue générique pour la pagination, les filtres et le résumé
  // par colonne.
  { name: 'sites-services', prefix: '/api/sites-services', table: serviceExpose, naturalKey: 'hote', category: 'sites-services', sansImportGenerique: true },
  { name: 'entites', prefix: '/api/entites', table: entite, naturalKey: 'nom' },
  { name: 'composantes', prefix: '/api/composantes', table: composante, naturalKey: 'nom', references: IMPORT_REFERENCES.composantes },
  { name: 'departements', prefix: '/api/departements', table: departement, naturalKey: 'nom', references: IMPORT_REFERENCES.departements },
  { name: 'poles', prefix: '/api/poles', table: pole, naturalKey: 'nom', references: IMPORT_REFERENCES.poles },
  { name: 'services', prefix: '/api/services', table: service, naturalKey: 'nom', references: IMPORT_REFERENCES.services },
  { name: 'personnes', prefix: '/api/personnes', table: personne, naturalKey: 'email', references: IMPORT_REFERENCES.personnes },
  { name: 'populations', prefix: '/api/populations', table: population, naturalKey: 'nom' },
  { name: 'groupes', prefix: '/api/groupes', table: groupe, naturalKey: 'nom' },
  { name: 'sections-cnu', prefix: '/api/sections-cnu', table: sectionCnu, naturalKey: 'numero' },
  { name: 'technologies', prefix: '/api/technologies', table: technologie, naturalKey: 'nom' },
  // Serveurs et postes portent un OS confronté au référentiel de fin de vie : leurs
  // lectures sont décorées du statut de support (pastille en liste, alerte en fiche).
  { name: 'serveurs', prefix: '/api/serveurs', table: serveur, naturalKey: 'hostname', decorate: decorerEol, filtreCalcule: filtreEol(serveur.technologieCle) },
  { name: 'lieux', prefix: '/api/lieux', table: lieu, naturalKey: 'nom' },
  { name: 'postes-travail', prefix: '/api/postes-travail', table: posteTravail, naturalKey: 'nom', decorate: decorerEol, filtreCalcule: filtreEol(posteTravail.technologieCle) },
  { name: 'appareils-mobiles', prefix: '/api/appareils-mobiles', table: appareilMobile, naturalKey: 'nom' },
  { name: 'iot', prefix: '/api/iot', table: iot, naturalKey: 'nom' },
  { name: 'machines-indus', prefix: '/api/machines-indus', table: machineIndus, naturalKey: 'nom' },
  { name: 'equipements-reseau', prefix: '/api/equipements-reseau', table: equipementReseau, naturalKey: 'nom' },
  { name: 'zones-reseau', prefix: '/api/zones-reseau', table: zoneReseau, naturalKey: 'nom' },
  { name: 'flux-reseau', prefix: '/api/flux-reseau', table: fluxReseau, naturalKey: 'nom' },
  { name: 'actifs-informationnels', prefix: '/api/actifs-informationnels', table: actifInformationnel, naturalKey: 'nom' },
  { name: 'processus', prefix: '/api/processus', table: processusMetier, naturalKey: 'nom' },
  { name: 'actifs-smsi', prefix: '/api/actifs-smsi', table: actifSmsi, naturalKey: 'nom' },
  { name: 'risques-smsi', prefix: '/api/risques-smsi', table: risqueSmsi, naturalKey: 'nom' },
  { name: 'mesures-smsi', prefix: '/api/mesures-smsi', table: mesureSmsi, naturalKey: 'reference' },
  { name: 'clauses-iso27001', prefix: '/api/clauses-iso27001', table: clauseIso27001, naturalKey: 'reference' },
  { name: 'evenements-redoutes', prefix: '/api/evenements-redoutes', table: evenementRedoute, naturalKey: 'nom' },
  { name: 'sources-risque', prefix: '/api/sources-risque', table: sourceRisque, naturalKey: 'nom' },
  { name: 'parties-prenantes', prefix: '/api/parties-prenantes', table: partiePrenante, naturalKey: 'nom' },
  { name: 'scenarios-strategiques', prefix: '/api/scenarios-strategiques', table: scenarioStrategique, naturalKey: 'nom' },
  { name: 'scenarios-operationnels', prefix: '/api/scenarios-operationnels', table: scenarioOperationnel, naturalKey: 'nom' },
  { name: 'flux-applicatifs', prefix: '/api/flux-applicatifs', table: fluxApplicatif, naturalKey: 'nom' },
  { name: 'liens-reseau', prefix: '/api/liens-reseau', table: lienReseau, naturalKey: 'nom' },
  { name: 'interconnexions-externes', prefix: '/api/interconnexions-externes', table: interconnexionExterne, naturalKey: 'nom' },
  { name: 'objectifs-smsi', prefix: '/api/objectifs-smsi', table: objectifSmsi, naturalKey: 'nom' },
  { name: 'documents-smsi', prefix: '/api/documents-smsi', table: documentSmsi, naturalKey: 'nom' },
  { name: 'audits-smsi', prefix: '/api/audits-smsi', table: auditSmsi, naturalKey: 'nom' },
  { name: 'revues-direction', prefix: '/api/revues-direction', table: revueDirection, naturalKey: 'nom' },
  { name: 'non-conformites', prefix: '/api/non-conformites', table: nonConformite, naturalKey: 'nom' },
  { name: 'vpn', prefix: '/api/vpn', table: accesVpn, naturalKey: 'identifiant', references: IMPORT_REFERENCES.vpn },
  { name: 'objectifs-nis2', prefix: '/api/objectifs-nis2', table: objectifNis2, naturalKey: 'numero' },
  { name: 'exigences-nis2', prefix: '/api/exigences-nis2', table: exigenceNis2, naturalKey: 'reference' },
  { name: 'actions-nis2', prefix: '/api/actions-nis2', table: actionNis2, naturalKey: 'intitule' },
  { name: 'notifications-nis2', prefix: '/api/notifications-nis2', table: notificationIncidentNis2, naturalKey: 'libelle' },
  { name: 'exigences-legales', prefix: '/api/exigences-legales', table: exigenceLegale, naturalKey: 'intitule' },
  { name: 'parties-interessees', prefix: '/api/parties-interessees', table: partieInteressee, naturalKey: 'nom' },
  // `/api/competences/resume` est servi par `competencesResume.ts` : le résumé générique
  // le masquerait, la dernière route montée gagnant en silence.
  { name: 'competences', prefix: '/api/competences', table: competence, naturalKey: 'nom', sansResumeGenerique: true },
  { name: 'opportunites', prefix: '/api/opportunites', table: opportunite, naturalKey: 'nom' },
  { name: 'webhooks', prefix: '/api/webhooks', table: webhook, naturalKey: 'nom' },
]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let runtimeApp: any = app
for (const c of CRUD) runtimeApp = runtimeApp.use(crudRouter(c))
runtimeApp = runtimeApp
  .get('/health', () => ({ status: 'ok' }), { query: t.Object({ details: t.Optional(t.Boolean()) }) })
  // idleTimeout à 255 s (max Bun) : certaines requêtes sont longues (sync GLPI d'un parc
  // de plusieurs milliers de machines) et Bun coupe sinon la socket à ~30 s (ECONNRESET).
  .listen({ port: Number(process.env.PORT) || 4000, idleTimeout: 255 })

// Contrôle de cohérence AVANT tout le reste : une erreur de configuration doit se voir
// dans les journaux au démarrage, pas se deviner depuis une page blanche.
verifierConfig()
// Sondage réseau : hors du chemin de démarrage (le serveur écoute déjà), pour qu'un
// fournisseur lent ne retarde pas la mise en service.
void verifierAccesSso()

setApp(runtimeApp)

// RÉCONCILIATION DE LA CLÉ DE TECHNOLOGIE, hors du chemin de démarrage. La synchronisation GLPI
// la fait aussi, mais elle ne couvre que les machines que GLPI alimente : celles saisies à la
// main ne passent jamais par le connecteur et resteraient à `null` indéfiniment.
void reconcilierClesTechnologie()
  .then((r) => {
    const ecrites = r.reduce((n, t) => n + t.ecrites, 0)
    if (ecrites) console.log(`🔑 Clés de technologie réconciliées : ${ecrites} écriture(s)`)
  })
  .catch(e => console.error('⚠️  Réconciliation des clés de technologie en échec :', e))

startAlertsScheduler()
startGlpiScheduler()
startHarfanglabScheduler()
startLdapScheduler()
startRelevesScheduler()
startNotificationsNis2Scheduler()
startAuditScheduler()
startDomainesScheduler()

console.log(`🦊 Catalogue API en écoute sur ${runtimeApp.server?.hostname}:${runtimeApp.server?.port}`)

export type App = typeof app
