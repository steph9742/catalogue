// DÉCOUVERTE PAR CERTIFICATE TRANSPARENCY — ne garder que les noms du domaine.
import { adressePrivee, certificatExpire, nomsDuReleve, resoutParJoker } from '../src/utils/ctDecouverte'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const ENTREES = [
  { issuer_name: 'C=US, O=Let\'s Encrypt, CN=R11', common_name: 'moodle.example.org', name_value: 'moodle.example.org\nwww.moodle.example.org', not_after: '2026-11-02T10:00:00' },
  { issuer_name: 'C=GR, O=Hellenic Academic and Research Institutions CA, CN=GEANT TLS RSA 1', common_name: '*.pufc.example.org', name_value: '*.pufc.example.org\npufc.example.org', not_after: '2027-03-01T00:00:00' },
  { issuer_name: 'C=US, O=Let\'s Encrypt, CN=R10', common_name: 'Moodle.example.org.', name_value: 'Moodle.example.org.', not_after: '2026-12-01T00:00:00' },
  { issuer_name: 'O=Autre', common_name: 'evil-example.org', name_value: 'evil-example.org\nx@example.org\nexample.org.attaquant.com', not_after: '2027-01-01' },
  'illisible',
  null,
]

console.log('\nLes noms du domaine, dédoublonnés')
{
  const n = nomsDuReleve(ENTREES, 'example.org')
  const hotes = n.map(x => x.hote)
  dire(hotes.join() === 'moodle.example.org,pufc.example.org,www.moodle.example.org', `trois noms retenus (${hotes.join(', ')})`)
  const moodle = n.find(x => x.hote === 'moodle.example.org')!
  dire(moodle.certificats === 2 && moodle.finValidite === '2026-12-01', 'casse et point final ignorés : deux certificats, la fin la plus lointaine gardée')
  dire(moodle.emetteurs.join() === 'Let\'s Encrypt', 'l\'émetteur est lu dans O=')
  dire(n.find(x => x.hote === 'pufc.example.org')?.emetteurs[0] === 'Hellenic Academic and Research Institutions CA', 'un joker désigne le nom qu\'il couvre')
}

console.log('\nCe qui n\'est pas un nom du domaine est écarté')
{
  const hotes = nomsDuReleve(ENTREES, 'example.org').map(x => x.hote)
  dire(!hotes.includes('evil-example.org'), 'un domaine qui finit par les mêmes lettres n\'en fait pas partie')
  dire(!hotes.some(h => h.includes('@')), 'une adresse électronique n\'est pas un site')
  dire(!hotes.includes('example.org.attaquant.com'), 'un nom qui CONTIENT le domaine sans en finir n\'en fait pas partie')
  dire(nomsDuReleve([], 'example.org').length === 0, 'aucune entrée, aucun nom')
}

console.log('\nAdresses privées')
dire(adressePrivee('10.1.2.3') && adressePrivee('172.20.0.1') && adressePrivee('192.168.1.1') && adressePrivee('fd00::1'), 'les plages privées sont reconnues')
dire(!adressePrivee('193.52.1.10') && !adressePrivee('172.32.0.1') && !adressePrivee('2001:660::1'), 'les adresses publiques ne le sont pas')

console.log('\nLE JOKER DNS : un nom qui ne répond que par lui n\'est pas un site établi')
dire(resoutParJoker(['193.52.1.10'], ['193.52.1.10']), 'mêmes adresses que le joker : il ne prouve rien')
dire(!resoutParJoker(['193.52.1.20'], ['193.52.1.10']), 'une adresse propre : le nom existe vraiment')
dire(!resoutParJoker(['193.52.1.10', '193.52.1.20'], ['193.52.1.10']), 'une adresse en plus du joker : le nom existe')
dire(!resoutParJoker(['193.52.1.10'], null), 'pas de joker dans le domaine : rien n\'est écarté')

console.log('\nCertificats expirés')
dire(certificatExpire('2025-01-31', '2026-09-15'), 'dernier certificat du 31 janvier 2025 : expiré')
dire(!certificatExpire('2027-01-01', '2026-09-15'), 'valide jusqu\'en 2027 : non expiré')
dire(!certificatExpire(null, '2026-09-15'), 'sans certificat connu (le domaine lui-même) : non expiré')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
