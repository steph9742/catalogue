// ORDONNANCEMENT DES CONNECTEURS — une synchronisation morte ne doit pas tout bloquer.
import { DELAI_SYNC_MORTE_MS, syncDue, syncEnCours } from '../src/utils/syncEtat'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const MAINTENANT = new Date('2026-10-06T12:00:00Z')
const ilYA = (ms: number) => new Date(MAINTENANT.getTime() - ms)
const MINUTE = 60_000
const HEURE = 60 * MINUTE

console.log('\nUne synchronisation en cours')
dire(syncEnCours({ dernierStatut: 'en_cours', updatedAt: ilYA(5 * MINUTE) }, MAINTENANT), 'lancée il y a 5 minutes : en cours, on n\'en relance pas une seconde')
dire(!syncEnCours({ dernierStatut: 'en_cours', updatedAt: ilYA(DELAI_SYNC_MORTE_MS + MINUTE) }, MAINTENANT), 'en cours depuis plus de deux heures : tenue pour morte, une nouvelle peut partir')
dire(!syncEnCours({ dernierStatut: 'ok', updatedAt: ilYA(MINUTE) }, MAINTENANT), 'terminée : pas en cours')
dire(!syncEnCours({ dernierStatut: 'erreur', updatedAt: ilYA(MINUTE) }, MAINTENANT), 'en échec : pas en cours non plus')
dire(syncEnCours({ dernierStatut: 'en_cours', updatedAt: null }, MAINTENANT), 'sans date, on ne conclut pas qu\'elle est morte')

console.log('\nUne synchronisation due')
dire(syncDue({ actif: true, frequenceHeures: 24, dernierSyncAt: null }, MAINTENANT), 'jamais synchronisé : due')
dire(syncDue({ actif: true, frequenceHeures: 24, dernierSyncAt: ilYA(25 * HEURE) }, MAINTENANT), '25 h après la dernière, fréquence 24 h : due')
dire(!syncDue({ actif: true, frequenceHeures: 24, dernierSyncAt: ilYA(2 * HEURE) }, MAINTENANT), '2 h après : pas due')
dire(!syncDue({ actif: false, frequenceHeures: 24, dernierSyncAt: null }, MAINTENANT), 'connecteur inactif : jamais due')
dire(!syncDue({ actif: true, frequenceHeures: 0, dernierSyncAt: null }, MAINTENANT), 'fréquence à zéro : jamais due')

console.log('\nLes trois ordonnanceurs suivent la même règle')
{
  const src = await Bun.file(new URL('../src/utils/scheduler.ts', import.meta.url)).text()
  for (const [quoi, nom] of [['HarfangLab', 'startHarfanglabScheduler'], ['l\'annuaire LDAP', 'startLdapScheduler'],
    ['les certificats et les sites exposés', 'startRelevesScheduler']] as const) {
    dire(src.includes(`export function ${nom}`), `${quoi} a enfin son ordonnanceur`)
  }
  const propres = (src.match(/dernierStatut === 'en_cours'/g) ?? []).length
  dire(propres === 0, `aucun ordonnanceur ne teste « en cours » dans son coin (${propres} reste(s))`)
  dire((src.match(/syncEnCours\(/g) ?? []).length >= 3 && (src.match(/syncDue\(/g) ?? []).length >= 3,
    'GLPI, HarfangLab et le moteur d\'audit passent par la règle commune')
  const index = await Bun.file(new URL('../src/index.ts', import.meta.url)).text()
  for (const nom of ['startAlertsScheduler', 'startGlpiScheduler', 'startNotificationsNis2Scheduler', 'startAuditScheduler',
    'startDomainesScheduler', 'startHarfanglabScheduler', 'startLdapScheduler', 'startRelevesScheduler']) {
    dire(index.includes(`${nom}()`), `${nom} est démarré au lancement du serveur`)
  }
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
