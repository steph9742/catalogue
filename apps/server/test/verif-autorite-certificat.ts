// L'AUTORITÉ D'UN CERTIFICAT — la voie normale, le toléré, et ce qui doit alerter.
import { autoriteDe, graviteAutorite, surNosDomaines } from '../src/utils/autoriteCertificat'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const MAINTENANT = new Date('2026-09-15T00:00:00Z')
const cert = (emetteur: string | null, x: Partial<{ autoSigne: boolean | null, chaineValide: boolean | null, dateFin: string | null }> = {}) => ({
  emetteur, autoSigne: false, chaineValide: true, dateFin: '2027-06-01T00:00:00Z', ...x,
})
const a = (c: ReturnType<typeof cert>) => autoriteDe(c, MAINTENANT)
const DOMAINES = ['example.org', 'exemple.fr']

console.log('\nLe tri des autorités')
dire(a(cert('CN=HARICA GEANT TLS RSA 1, O=Hellenic Academic and Research Institutions CA')) === 'harica', 'HARICA : voie normale')
dire(a(cert('CN=GEANT OV RSA CA 4, O=GEANT Vereniging')) === 'harica', 'l\'ancien GÉANT TCS (Sectigo) : voie normale aussi')
dire(a(cert('CN=R11, O=Let\'s Encrypt')) === 'lets_encrypt', 'Let\'s Encrypt')
dire(a(cert('CN=DigiCert Global G2 TLS RSA SHA256 2020 CA1, O=DigiCert Inc')) === 'autre_commerciale', 'DigiCert : autre autorité commerciale')
dire(a(cert('CN=Mon Autorite Maison, O=Prestataire X')) === 'autorite_inattendue', 'une autorité inconnue : inattendue')

console.log('\nL\'ORDRE : un certificat qui ne fonctionne pas est d\'abord cela')
dire(a(cert('CN=HARICA GEANT TLS RSA 1', { dateFin: '2026-09-01T00:00:00Z' })) === 'expire', 'HARICA expiré : expiré, pas « HARICA »')
dire(a(cert('CN=serveur.local', { autoSigne: true })) === 'auto_signe', 'auto-signé')
dire(a(cert('CN=R11, O=Let\'s Encrypt', { chaineValide: false })) === 'chaine_invalide', 'chaîne invalide avant l\'émetteur')
dire(autoriteDe({ emetteur: null, autoSigne: null, chaineValide: null, dateFin: null }, MAINTENANT) === null, 'jamais lu : non classé, pas « inattendu »')

console.log('\nLE CRITÈRE DU LOT : hors HARICA / Let\'s Encrypt, une alerte')
dire(graviteAutorite('autre_commerciale', 'www.example.org', DOMAINES) === 'warning', 'autre autorité commerciale : alerte')
dire(graviteAutorite('autorite_inattendue', 'boutique.exemple.fr', DOMAINES) === 'critical', 'autorité inattendue sur notre domaine : alerte CRITIQUE')
dire(graviteAutorite('autorite_inattendue', 'prestataire.example.com', DOMAINES) === 'warning', 'autorité inattendue hors de nos domaines : alerte simple')
dire(graviteAutorite('harica', 'www.example.org', DOMAINES) === null, 'HARICA : aucune alerte')
dire(graviteAutorite('lets_encrypt', 'www.example.org', DOMAINES) === null, 'Let\'s Encrypt : toléré, sans alerte')
dire(graviteAutorite('expire', 'www.example.org', DOMAINES) === null, 'expiré : pas d\'alerte d\'autorité en plus de l\'alerte d\'expiration')

console.log('\nNos domaines')
dire(surNosDomaines('WWW.Example.org.', DOMAINES), 'sous-domaine, casse et point final ignorés')
dire(surNosDomaines('exemple.fr', DOMAINES), 'le domaine lui-même')
dire(!surNosDomaines('fauxexemple.fr', DOMAINES), 'un domaine qui finit par les mêmes lettres n\'en fait pas partie')

console.log('\nLE MOTEUR D\'ALERTES porte les types du lot')
{
  // Le moteur d'alertes interroge la base : on vérifie qu'il ÉMET chaque type, et qu'il lit
  // l'autorité par la même fonction que la page des certificats.
  const src = await Bun.file(new URL('../src/routers/alerts.ts', import.meta.url)).text()
  for (const type of ['service_hors_support', 'correctif_disponible', 'service_injoignable', 'nouvelle_technologie',
    'autorite_certificat_inattendue', 'revue_exposition_echue', 'integrite_script', 'compromission']) {
    dire(src.includes(`type: '${type}'`), `computeAlerts émet « ${type} »`)
  }
  dire(/graviteAutorite\(/.test(src) && /autoriteDe\(/.test(src), 'l\'autorité y est calculée par la même fonction que la page des certificats')
  dire(/etatsDesServices\(\)/.test(src), 'les états des services viennent de la même fonction que les écrans')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
