import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurGlpi } from '@catalogue/database/tables'
import { dispatchAlerts } from '../routers/alerts'
import { synchroniserGlpi } from './glpiSync'
import { synchroniserHarfanglab, lireConfigHarfanglab } from './harfanglabSync'
import { syncDue, syncEnCours } from './syncEtat'
import { configLdapComplete, lireConfigLdap, SINGLETON_LDAP, synchroniserLdap } from './ldapSync'
import { connecteurLdap } from '@catalogue/database/tables'
import { scannerCertificatsSiDu } from './certificatsReleve'
import { balayerSiDu } from '../routers/servicesExposes'
import { synchroniserEcheancesSniff } from './echeancesSniffSync'
import { lireConfigAudit, synchroniserAudit } from './auditSync'
import { releverDomainesEchus } from './ctReleve'

// Ordonnanceur interne : diffuse les échéances une fois par jour à heure fixe (par défaut
// 08:00, heure du serveur).

const DAY_MS = 24 * 60 * 60 * 1000

function msUntilNext(hour: number): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(hour, 0, 0, 0)
  if (next.getTime() <= now.getTime()) next.setTime(next.getTime() + DAY_MS)
  return next.getTime() - now.getTime()
}

async function runOnce(): Promise<void> {
  try {
    const { dispatched } = await dispatchAlerts()
    console.log(`🔔 Diffusion automatique des échéances : ${dispatched} envoyée(s).`)
  }
  catch (e) {
    console.error('❌ Échec de la diffusion automatique des échéances —', e instanceof Error ? e.message : String(e))
  }
}

export function startAlertsScheduler(): void {
  if (process.env.ALERTS_DISPATCH_DISABLED === 'true') {
    console.log('⏸️  Diffusion automatique des échéances désactivée (ALERTS_DISPATCH_DISABLED).')
    return
  }
  const hour = Math.min(23, Math.max(0, Number(process.env.ALERTS_DISPATCH_HOUR ?? 8) || 0))
  const delay = msUntilNext(hour)
  console.log(`⏰ Diffusion automatique des échéances programmée à ${String(hour).padStart(2, '0')}:00 (dans ${Math.round(delay / 60000)} min).`)
  setTimeout(() => {
    void runOnce()
    setInterval(() => void runOnce(), DAY_MS)
  }, delay)
}

// Ordonnanceur GLPI : synchronise l'inventaire à la fréquence configurée (en heures) tant que
// le connecteur est actif.
const CHECK_MS = 15 * 60 * 1000

async function tickGlpi(): Promise<void> {
  try {
    const [cfg] = await db.select().from(connecteurGlpi).where(eq(connecteurGlpi.id, 'connecteur-glpi-singleton')).limit(1)
    if (!cfg || syncEnCours(cfg) || !syncDue(cfg)) return
    console.log('🔄 Synchronisation GLPI automatique…')
    const c = await synchroniserGlpi()
    console.log(`✅ Sync GLPI : ${c.total} machine(s) — ${c.serveurs} serveur(s), ${c.postes} poste(s), ${c.aClasser} à classer.`)
  }
  catch (e) {
    console.error('❌ Sync GLPI automatique —', e instanceof Error ? e.message : String(e))
  }
}

export function startGlpiScheduler(): void {
  if (process.env.GLPI_SYNC_DISABLED === 'true') {
    console.log('⏸️  Synchronisation GLPI automatique désactivée (GLPI_SYNC_DISABLED).')
    return
  }
  console.log('⏰ Ordonnanceur GLPI actif (vérification toutes les 15 min).')
  setInterval(() => void tickGlpi(), CHECK_MS)
}

// Ordonnanceur « notification NIS 2 » : ouvre automatiquement un suivi de déclaration pour les
// incidents Slowpoke CRITIQUES ou ÉLEVÉS (art.
async function tickNotificationsNis2(): Promise<void> {
  try {
    const c = await synchroniserEcheancesSniff()
    if (c.erreur) {
      // Le miroir reste INTACT : une panne de Sniff ne doit jamais faire croire qu'aucune
      // échéance ne court. Le motif est noté, la date d'essai aussi.
      console.warn(`⚠️  Compteurs réglementaires non relevés — ${c.erreur}`)
      return
    }
    if (c.echues || c.sansDecision) {
      console.log(`⚖️  Compteurs réglementaires : ${c.courent} en cours, ${c.echues} échu(s), ${c.sansDecision} sans décision d'applicabilité.`)
    }
  }
  catch (e) {
    console.error('❌ Relevé des compteurs réglementaires —', e instanceof Error ? e.message : String(e))
  }
}

// COMPTEURS RÉGLEMENTAIRES — relevés toutes les 30 minutes. Le Catalogue ne calcule plus ces
// échéances et ne décide plus de leur applicabilité : les deux vivent dans Sniff, avec la
// décision tracée et son auteur.
const RELEVE_ECHEANCES_MS = 30 * 60 * 1000

export function startNotificationsNis2Scheduler(): void {
  if (process.env.NIS2_AUTO_NOTIF_DISABLED === 'true') {
    console.log('⏸️  Relevé des compteurs réglementaires désactivé (NIS2_AUTO_NOTIF_DISABLED).')
    return
  }
  console.log('⏰ Compteurs réglementaires relevés chez Sniff toutes les 30 min.')
  // Un premier passage au démarrage : sinon le miroir reste vide une demi-heure après
  // chaque redémarrage, et un miroir vide ressemble à « rien à signaler ».
  setTimeout(() => void tickNotificationsNis2(), 20_000)
  setInterval(() => void tickNotificationsNis2(), RELEVE_ECHEANCES_MS)
}


// MOTEUR D'AUDIT EXTERNE : même mécanique que GLPI. Échéance vérifiée toutes les 15 min,
// synchronisation lancée si la fréquence configurée est dépassée — robuste aux redémarrages.
async function tickAudit(): Promise<void> {
  try {
    const cfg = await lireConfigAudit()
    if (!cfg || syncEnCours(cfg) || !syncDue(cfg)) return
    const c = await synchroniserAudit()
    console.log(`🛰️  Moteur d'audit : ${c.recus} constat(s) reçu(s), ${c.crees} nouveau(x), ${c.decouvertesAValider} découverte(s) à valider${c.rejetes ? `, ${c.rejetes} rejeté(s)` : ''}.`)
  }
  catch (e) {
    console.error('❌ Synchronisation du moteur d\'audit —', e instanceof Error ? e.message : String(e))
  }
}

export function startAuditScheduler(): void {
  if (process.env.AUDIT_SYNC_DISABLED === 'true') {
    console.log('⏸️  Synchronisation du moteur d\'audit désactivée (AUDIT_SYNC_DISABLED).')
    return
  }
  setInterval(() => void tickAudit(), CHECK_MS)
}

// DOMAINES SURVEILLÉS : relevé Certificate Transparency une fois par semaine. Vérifié toutes
// les 6 h, domaines relevés un à la fois — crt.sh est public et souvent saturé.
const SEMAINE_MS = 7 * DAY_MS
async function tickDomaines(): Promise<void> {
  try {
    const r = await releverDomainesEchus(SEMAINE_MS)
    if (r.releves || r.echecs) console.log(`🔎 Domaines surveillés : ${r.releves} relevé(s), ${r.echecs} en échec.`)
  }
  catch (e) {
    console.error('❌ Relevé des domaines surveillés —', e instanceof Error ? e.message : String(e))
  }
}

export function startDomainesScheduler(): void {
  if (process.env.DOMAINES_RELEVE_DISABLED === 'true') {
    console.log('⏸️  Relevé des domaines surveillés désactivé (DOMAINES_RELEVE_DISABLED).')
    return
  }
  setInterval(() => void tickDomaines(), 6 * 60 * 60 * 1000)
}

// HARFANGLAB : l'ordonnanceur MANQUAIT. Le connecteur enregistrait « actif » et une fréquence
// que personne ne lisait — la synchronisation automatique n'a jamais tourné, sans que rien ne
// le signale.
async function tickHarfanglab(): Promise<void> {
  try {
    const cfg = await lireConfigHarfanglab()
    if (!cfg || syncEnCours(cfg) || !syncDue(cfg)) return
    console.log('🔄 Synchronisation HarfangLab automatique…')
    const c = await synchroniserHarfanglab()
    console.log(`✅ Sync HarfangLab : ${c.agents} agent(s), ${c.agentsEnLigne} en ligne.`)
  }
  catch (e) {
    console.error('❌ Sync HarfangLab automatique —', e instanceof Error ? e.message : String(e))
  }
}

export function startHarfanglabScheduler(): void {
  if (process.env.HARFANGLAB_SYNC_DISABLED === 'true') {
    console.log('⏸️  Synchronisation HarfangLab automatique désactivée (HARFANGLAB_SYNC_DISABLED).')
    return
  }
  console.log('⏰ Ordonnanceur HarfangLab actif (vérification toutes les 15 min).')
  setInterval(() => void tickHarfanglab(), CHECK_MS)
}

// ANNUAIRE LDAP : l'ordonnanceur manquait, comme celui de HarfangLab. La configuration portait
// « actif » et une fréquence que personne ne lisait.
async function tickLdap(): Promise<void> {
  try {
    const etat = await lireConfigLdap()
    if (!etat || syncEnCours(etat) || !syncDue(etat)) return
    const cfg = await configLdapComplete()
    if (!cfg) return
    console.log('🔄 Synchronisation LDAP automatique…')
    await db.update(connecteurLdap).set({ dernierStatut: 'en_cours' }).where(eq(connecteurLdap.id, SINGLETON_LDAP))
    try {
      const r = await synchroniserLdap(cfg)
      await db.update(connecteurLdap).set({
        dernierSyncAt: new Date(), dernierStatut: 'ok', dernierMessage: r.message, dernierComptes: r,
      }).where(eq(connecteurLdap.id, SINGLETON_LDAP))
      console.log(`✅ Sync LDAP : ${r.message}`)
    }
    catch (e) {
      // L'ÉCHEC EST ENREGISTRÉ, comme sur la synchronisation manuelle : un connecteur en panne
      // et un annuaire vide se ressemblent trop.
      const message = e instanceof Error ? e.message : String(e)
      await db.update(connecteurLdap).set({ dernierStatut: 'erreur', dernierMessage: message })
        .where(eq(connecteurLdap.id, SINGLETON_LDAP))
      throw e
    }
  }
  catch (e) {
    console.error('❌ Sync LDAP automatique —', e instanceof Error ? e.message : String(e))
  }
}

export function startLdapScheduler(): void {
  if (process.env.LDAP_SYNC_DISABLED === 'true') {
    console.log('⏸️  Synchronisation LDAP automatique désactivée (LDAP_SYNC_DISABLED).')
    return
  }
  console.log('⏰ Ordonnanceur LDAP actif (vérification toutes les 15 min).')
  setInterval(() => void tickLdap(), CHECK_MS)
}

// CERTIFICATS ET SITES EXPOSÉS : aucun réglage de fréquence n'existe pour eux, et leurs relevés
// n'avaient aucun ordonnanceur — ils ne partaient que sur un bouton.
const AGE_RELEVE_MS = DAY_MS
const CHECK_RELEVE_MS = 60 * 60 * 1000

async function tickCertificats(): Promise<void> {
  try {
    const r = await scannerCertificatsSiDu(AGE_RELEVE_MS)
    if (r.lance) console.log(`🔐 Certificats relevés : ${r.scannes} scanné(s), ${r.ok} lu(s), ${r.echecs} en échec${r.tronque ? ' — relevé PARTIEL (plafond atteint)' : ''}.`)
  }
  catch (e) {
    console.error('❌ Relevé automatique des certificats —', e instanceof Error ? e.message : String(e))
  }
}

async function tickSitesExposes(): Promise<void> {
  try {
    const r = await balayerSiDu(AGE_RELEVE_MS)
    if (r.lance) console.log(`🌐 Relevé des sites exposés lancé : ${r.aRelever} service(s) à relever.`)
  }
  catch (e) {
    console.error('❌ Relevé automatique des sites exposés —', e instanceof Error ? e.message : String(e))
  }
}

export function startRelevesScheduler(): void {
  if (process.env.RELEVES_DISABLED === 'true') {
    console.log('⏸️  Relevés automatiques des certificats et des sites désactivés (RELEVES_DISABLED).')
    return
  }
  console.log('⏰ Relevés des certificats et des sites exposés : vérification toutes les heures, passage si le dernier date de plus de 24 h.')
  setInterval(() => void tickCertificats(), CHECK_RELEVE_MS)
  setInterval(() => void tickSitesExposes(), CHECK_RELEVE_MS)
}
