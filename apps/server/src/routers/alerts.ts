import { Elysia } from 'elysia'
import { lt, and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { accesVpn, application, applicationRgpd, certificat, connecteurAudit, constat, sniffEcheance, technologie, tiers, whitelist } from '@catalogue/database/tables'
import { autoriteDe, graviteAutorite } from '../utils/autoriteCertificat'
import { changementsDepuis, etatsDesServices } from './servicesExposes'
import { betterAuth } from '../middleware/auth'
import { notify } from '../utils/notify'

type Severity = 'critical' | 'warning'
type Alert = {
  type: string
  severity: Severity
  message: string
  entite: string
  entiteId: string
  dueDate: string | null
}

// Moteur d'alertes généralisé : balaie les échéances (VPN, technos EOL, contrats,
// fin de support applicative, revues d'homologation) et renvoie la liste courante.
export async function computeAlerts(): Promise<Alert[]> {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const in30 = new Date(now.getTime() + 30 * 864e5).toISOString().slice(0, 10)
  const sev = (d: string | null): Severity => (d && d < today ? 'critical' : 'warning')
  const alerts: Alert[] = []

  const vpns = await db.select().from(accesVpn)
    .where(and(isNotNull(accesVpn.dateExpiration), lt(accesVpn.dateExpiration, in30)))
  for (const v of vpns) {
    alerts.push({ type: 'vpn_expiration', severity: sev(v.dateExpiration), message: `Accès VPN ${v.identifiant ?? ''} — expiration ${v.dateExpiration}`, entite: 'vpn', entiteId: v.id, dueDate: v.dateExpiration })
  }

  const technos = await db.select().from(technologie)
    .where(and(isNotNull(technologie.finDeVie), lt(technologie.finDeVie, in30)))
  for (const t of technos) {
    alerts.push({ type: 'techno_eol', severity: sev(t.finDeVie), message: `${t.nom}${t.version ? ' ' + t.version : ''} — fin de vie ${t.finDeVie}`, entite: 'technologies', entiteId: t.id, dueDate: t.finDeVie })
  }

  const contrats = await db.select().from(tiers)
    .where(and(isNotNull(tiers.contratFin), lt(tiers.contratFin, in30)))
  for (const ti of contrats) {
    alerts.push({ type: 'contrat_fin', severity: sev(ti.contratFin), message: `Contrat ${ti.nom} — fin ${ti.contratFin}`, entite: 'tiers', entiteId: ti.id, dueDate: ti.contratFin })
  }

  const finSupport = await db.select().from(application)
    .where(and(isNotNull(application.dateFinDeSupport), lt(application.dateFinDeSupport, in30)))
  for (const a of finSupport) {
    alerts.push({ type: 'app_fin_support', severity: sev(a.dateFinDeSupport), message: `${a.nom} — fin de support ${a.dateFinDeSupport}`, entite: 'applications', entiteId: a.id, dueDate: a.dateFinDeSupport })
  }

  const revues = await db.select().from(application)
    .where(and(isNotNull(application.dateRevueHomologation), lt(application.dateRevueHomologation, today)))
  for (const a of revues) {
    alerts.push({ type: 'homologation_revue', severity: 'warning', message: `${a.nom} — revue d'homologation à faire (${a.dateRevueHomologation})`, entite: 'applications', entiteId: a.id, dueDate: a.dateRevueHomologation })
  }

  // COMPTEURS RÉGLEMENTAIRES (NIS 2 art. 23, RGPD art.
  const compteurs = await db.select({
    id: sniffEcheance.id, incidentId: sniffEcheance.incidentId, cle: sniffEcheance.cle,
    nom: sniffEcheance.nom, echeance: sniffEcheance.echeance, porteur: sniffEcheance.porteur,
  })
    .from(sniffEcheance)
    .where(and(
      eq(sniffEcheance.court, true),
      isNotNull(sniffEcheance.echeance),
      sql`${sniffEcheance.echeance} < now() + interval '30 days'`,
    ))
  for (const e of compteurs) {
    const echeance = e.echeance ? e.echeance.toISOString().slice(0, 10) : null
    alerts.push({
      type: 'compteur_reglementaire',
      severity: sev(echeance),
      message: `${e.nom ?? e.cle} — incident ${e.incidentId}${e.porteur ? ` (${e.porteur})` : ''}, échéance ${echeance}`,
      entite: 'incidents',
      entiteId: e.incidentId,
      dueDate: echeance,
    })
  }

  // APPLICABILITÉ NON TRANCHÉE — un ÉTAT, pas une échéance. La grille de Sniff laisse certains
  // cas à évaluer, et tant que personne ne tranche, aucun délai ne court.
  const aTrancher = await db.select({
    incidentId: sniffEcheance.incidentId,
    combien: sql<number>`count(*)::int`,
    compteurs: sql<string>`string_agg(coalesce(${sniffEcheance.nom}, ${sniffEcheance.cle}), ', ' order by ${sniffEcheance.cle})`,
  })
    .from(sniffEcheance)
    .where(and(isNull(sniffEcheance.applicable), eq(sniffEcheance.defaut, 'a_evaluer')))
    .groupBy(sniffEcheance.incidentId)
  for (const e of aTrancher) {
    alerts.push({
      type: 'applicabilite_a_trancher',
      severity: 'warning',
      message: `Incident ${e.incidentId} — ${e.combien} compteur(s) dont l'applicabilité n'est pas tranchée : ${e.compteurs}`,
      entite: 'incidents',
      entiteId: e.incidentId,
      dueDate: null,
    })
  }

  // CERTIFICATS TLS. C'était le trou du moteur d'échéances, et le plus coûteux : la seule
  // catégorie dont l'expiration n'entraîne pas une dégradation mais un ARRÊT franc du service.
  const certificats = await db.select().from(certificat)
    .where(and(
      eq(certificat.surveille, true),
      isNotNull(certificat.dateFin),
      sql`${certificat.dateFin} < now() + interval '30 days'`,
    ))
  for (const c of certificats) {
    const echeance = c.dateFin ? c.dateFin.toISOString().slice(0, 10) : null
    const cible = `${c.hote}${c.port === 443 ? '' : ':' + c.port}`
    alerts.push({
      type: 'certificat_expiration',
      severity: sev(echeance),
      message: `${c.libelle ?? cible} — certificat expire le ${echeance}`,
      entite: 'certificats',
      entiteId: c.id,
      dueDate: echeance,
    })
  }

  // CERTIFICAT INVALIDE — un ÉTAT, pas une échéance. Chaîne incomplète, racine inconnue,
  // auto-signé : pour l'utilisateur, l'incident est le même qu'une expiration, mais il n'a pas
  // de date.
  const invalides = await db.select().from(certificat)
    .where(and(eq(certificat.surveille, true), eq(certificat.chaineValide, false)))
  for (const c of invalides) {
    // Un certificat expiré est DÉJÀ signalé ci-dessus : le compter deux fois gonflerait
    // le nombre d'alertes sans ajouter un seul fait.
    if (c.erreurValidation === 'CERT_HAS_EXPIRED') continue
    const cible = `${c.hote}${c.port === 443 ? '' : ':' + c.port}`
    alerts.push({
      type: 'certificat_invalide',
      severity: 'warning',
      message: `${c.libelle ?? cible} — certificat non validé : ${c.erreurValidation ?? 'motif inconnu'}`,
      entite: 'certificats',
      entiteId: c.id,
      dueDate: null,
    })
  }

  // RÉEXAMEN D'ANALYSE D'IMPACT (RGPD art. 35.11).
  const aipd = await db
    .select({ id: application.id, nom: application.nom, revue: applicationRgpd.aipdRevueDate })
    .from(applicationRgpd)
    .innerJoin(application, eq(application.id, applicationRgpd.applicationId))
    .where(and(isNotNull(applicationRgpd.aipdRevueDate), lt(applicationRgpd.aipdRevueDate, in30)))
  for (const a of aipd) {
    alerts.push({ type: 'aipd_revue', severity: sev(a.revue), message: `${a.nom} — réexamen de l'analyse d'impact (RGPD art. 35.11) au ${a.revue}`, entite: 'applications', entiteId: a.id, dueDate: a.revue })
  }

  // Revue périodique d'un tiers (NIS 2 art. 21.2.d — chaîne d'approvisionnement).
  const revuesTiers = await db.select().from(tiers)
    .where(and(isNotNull(tiers.dateRevue), lt(tiers.dateRevue, in30)))
  for (const ti of revuesTiers) {
    alerts.push({ type: 'tiers_revue', severity: sev(ti.dateRevue), message: `${ti.nom} — revue du fournisseur au ${ti.dateRevue}${ti.critiqueNis2 ? ' (fournisseur critique NIS 2)' : ''}`, entite: 'tiers', entiteId: ti.id, dueDate: ti.dateRevue })
  }

  // LISTES BLANCHES ÉCHUES OU PROCHES DE L'ÊTRE. Un an de validité à compter de la dernière
  // revue, ou de la CRÉATION si la règle n'a jamais été revue — jamais de la date d'import.
  const echeanceSql = sql<string>`to_char(coalesce(${whitelist.dateRevision}, ${whitelist.dateCreation}) + interval '1 year', 'YYYY-MM-DD')`
  const listesBlanches = await db
    .select({ id: whitelist.id, libelle: whitelist.libelle, motif: whitelist.motif, incident: whitelist.sniffIncidentId, echeance: echeanceSql })
    .from(whitelist)
    // Les règles inactives ne sont plus des angles morts : les signaler serait du bruit.
    .where(and(
      eq(whitelist.active, true),
      eq(whitelist.technique, false),
      eq(whitelist.fourniParEditeur, false),
      eq(whitelist.presente, true),
      isNull(whitelist.echeanceSniff),
      isNotNull(whitelist.dateCreation),
      lt(echeanceSql, in30),
    ))
    .limit(500)
  for (const w of listesBlanches) {
    alerts.push({
      type: 'whitelist_revue',
      severity: sev(w.echeance),
      message: `Liste blanche « ${w.libelle.slice(0, 80)} » — revue au ${w.echeance}${w.motif ? '' : ' (SANS MOTIF enregistré)'}`,
      entite: 'whitelists',
      entiteId: w.id,
      dueDate: w.echeance,
    })
  }

  // INTÉGRITÉ DES SCRIPTS — un ÉTAT, pas une échéance. Un script modifié ou un nouveau domaine
  // tiers sur une page de paiement n'attend pas une date : c'est le mode opératoire d'un
  // skimmer, et chaque jour ouvert est un jour de cartes captées.
  const integrite = await db.select({ id: constat.id, titre: constat.titre, hote: constat.actifHote, gravite: constat.gravite })
    .from(constat)
    .where(and(eq(constat.categorie, 'integrite_script'), eq(constat.statut, 'ouvert')))
    .limit(500)
  for (const c of integrite) {
    alerts.push({
      type: 'integrite_script',
      severity: c.gravite === 'critique' || c.gravite === 'elevee' ? 'critical' : 'warning',
      message: `${c.hote} — ${c.titre}`,
      entite: 'audit-surface',
      entiteId: c.id,
      dueDate: null,
    })
  }

  // --- SITES ET SERVICES EXPOSÉS -----------------------------------------------------------
  // LES MÊMES ÉTATS QUE LES ÉCRANS (etatsDesServices) : une alerte qu'aucune fiche ne montre ne
  // se vérifie pas.
  const libelleService = (sv: { libelle: string | null, hote: string, port: number }) =>
    `${sv.libelle ?? sv.hote}${sv.port === 443 ? '' : ':' + sv.port}`
  for (const sv of await etatsDesServices()) {
    // HORS SUPPORT L'EMPORTE SUR CORRECTIF : la réponse est une migration, pas un correctif.
    // Les deux alertes ensemble diraient deux actions là où il n'y en a qu'une à décider.
    if (sv.support === 'depasse') {
      alerts.push({ type: 'service_hors_support', severity: 'critical', message: `${libelleService(sv)} — une technologie détectée est hors support`, entite: 'sites-services', entiteId: sv.id, dueDate: null })
    }
    else if (sv.miseAJour.etat === 'correctif_disponible') {
      alerts.push({ type: 'correctif_disponible', severity: 'warning', message: `${libelleService(sv)} — correctif disponible sur la branche installée`, entite: 'sites-services', entiteId: sv.id, dueDate: null })
    }
    if (sv.dernierStatut === 'echec') {
      alerts.push({ type: 'service_injoignable', severity: 'warning', message: `${libelleService(sv)} — dernier relevé en échec${sv.dernierMessage ? ` : ${sv.dernierMessage.slice(0, 120)}` : ''}`, entite: 'sites-services', entiteId: sv.id, dueDate: null })
    }
    // Sur le modèle de `whitelist_revue` : échue, ou à moins de trente jours.
    if (sv.dateRevue && sv.dateRevue < in30) {
      alerts.push({ type: 'revue_exposition_echue', severity: sev(sv.dateRevue), message: `${libelleService(sv)} — revue d'exposition au ${sv.dateRevue}`, entite: 'sites-services', entiteId: sv.id, dueDate: sv.dateRevue })
    }
  }

  // NOUVELLE TECHNOLOGIE sur les sept derniers jours de relevés : un CMS qui apparaît sur un
  // hôte est un service monté, ou un service remplacé — dans les deux cas, quelqu'un doit le
  // savoir.
  const semaine = await changementsDepuis(7)
  let nouvelles = 0
  for (const c of semaine.changements) {
    if (c.nature !== 'technologie_ajoutee' || nouvelles >= 500) continue
    nouvelles++
    alerts.push({
      type: 'nouvelle_technologie',
      severity: 'warning',
      message: `${c.hote ?? '?'}${c.port && c.port !== 443 ? ':' + c.port : ''} — ${c.produit}${c.version ? ' ' + c.version : ''} détecté le ${new Date(c.releveLe).toISOString().slice(0, 10)}`,
      entite: 'sites-services',
      entiteId: c.serviceId,
      dueDate: null,
    })
  }

  // Critique quand l'autorité est inconnue ET l'hôte sur l'un de nos domaines déclarés : shadow
  // IT, ou usurpation.
  const [cfgAudit] = await db.select({ domaines: connecteurAudit.domaines }).from(connecteurAudit).limit(1)
  const domaines = cfgAudit?.domaines ?? []
  const certsLus = await db.select({
    id: certificat.id, hote: certificat.hote, port: certificat.port, libelle: certificat.libelle,
    emetteur: certificat.emetteur, autoSigne: certificat.autoSigne, chaineValide: certificat.chaineValide, dateFin: certificat.dateFin,
  }).from(certificat).where(and(eq(certificat.surveille, true), isNotNull(certificat.emetteur)))
  for (const c of certsLus) {
    const autorite = autoriteDe(c, now)
    const gravite = graviteAutorite(autorite, c.hote, domaines)
    if (!gravite) continue
    const cible = `${c.hote}${c.port === 443 ? '' : ':' + c.port}`
    alerts.push({
      type: 'autorite_certificat_inattendue',
      severity: gravite,
      message: `${c.libelle ?? cible} — certificat émis ${autorite === 'autorite_inattendue' ? 'par une autorité inattendue' : 'hors HARICA'} : ${(c.emetteur ?? '').slice(0, 100)}`,
      entite: 'certificats',
      entiteId: c.id,
      dueDate: null,
    })
  }

  // COMPROMISSION relevée par le moteur d'audit, tant qu'elle est ouverte.
  const compromissions = await db.select({ id: constat.id, titre: constat.titre, hote: constat.actifHote })
    .from(constat)
    .where(and(eq(constat.categorie, 'compromission'), eq(constat.statut, 'ouvert')))
    .limit(500)
  for (const c of compromissions) {
    alerts.push({ type: 'compromission', severity: 'critical', message: `${c.hote} — ${c.titre}`, entite: 'audit-surface', entiteId: c.id, dueDate: null })
  }

  alerts.sort((x, y) =>
    x.severity === y.severity
      ? String(x.dueDate).localeCompare(String(y.dueDate))
      : (x.severity === 'critical' ? -1 : 1),
  )
  return alerts
}

// Diffuse les échéances courantes (push/webhooks) via la taxonomie `echeance:<type>`.
// Appelé par la route /dispatch (admin/compte technique) ET par l'ordonnanceur quotidien.
export async function dispatchAlerts(): Promise<{ dispatched: number }> {
  const alerts = await computeAlerts()
  const at = new Date().toISOString()
  for (const a of alerts) {
    await notify(`echeance:${a.type}`, {
      event: `echeance:${a.type}`,
      kind: 'echeance',
      type: a.type,
      severity: a.severity,
      message: a.message,
      entite: a.entite,
      entiteId: a.entiteId,
      dueDate: a.dueDate,
      at,
      title: a.severity === 'critical' ? 'Échéance critique' : 'Échéance à venir',
      body: a.message,
    })
  }
  return { dispatched: alerts.length }
}

export const alertsRouter = new Elysia({ name: 'alerts', prefix: '/api/alerts' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Pilotage'] } })
  .get('/', () => computeAlerts(), {
    auth: ['admin', 'svc'],
    detail: {
      summary: 'Toutes les échéances en cours ou dépassées, toutes catégories.',
      description: 'Couvre les accès VPN, les fins de vie de technologies, les contrats, les fins de support '
        + 'applicatives, les revues d\'homologation, les réexamens d\'AIPD, les revues de tiers, les revues de '
        + 'listes blanches ET les certificats TLS. Renvoie un tableau, trié par nature d\'échéance ; chaque '
        + 'entrée porte `dueDate` (nulle quand l\'alerte décrit un ÉTAT et non une échéance, par exemple un '
        + 'certificat dont la chaîne est invalide) et `severity` (`critical` si la date est dépassée).',
    },
  })
  .post('/dispatch', () => dispatchAlerts(), { auth: ['admin', 'svc'] })
