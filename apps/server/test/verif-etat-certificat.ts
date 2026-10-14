// L'ÉTAT DU CERTIFICAT, distinct de l'état de sa LECTURE. `dernierStatut: 'ok'` dit que le
// relevé a abouti.
import { ETATS_CERTIFICAT, etatCertificat } from '../src/utils/certificatEtat'
import { VOCABULAIRES } from '../src/routers/lectures'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const LE_1ER_SEPTEMBRE = new Date('2026-09-01T12:00:00Z')
const cert = (dateFin: string | null, dernierStatut = 'ok', chaineValide: boolean | null = true) =>
  ({ dernierStatut, dateFin: dateFin ? new Date(dateFin) : null, chaineValide })

console.log('\nUn certificat LU n\'est pas un certificat VALIDE')
dire(etatCertificat(cert('2025-01-01'), LE_1ER_SEPTEMBRE) === 'expire',
  'expiré depuis huit mois, relevé « ok » : expire')
dire(etatCertificat(cert('2027-06-01'), LE_1ER_SEPTEMBRE) === 'valide',
  'expire dans neuf mois : valide')

console.log('\nLes trente jours')
dire(etatCertificat(cert('2026-09-15'), LE_1ER_SEPTEMBRE) === 'expire_bientot',
  'à quatorze jours : expire bientôt')
dire(etatCertificat(cert('2026-10-25'), LE_1ER_SEPTEMBRE) === 'valide',
  'à cinquante-quatre jours : valide')

console.log('\nL\'ABSENCE de relevé n\'est pas l\'absence de certificat')
dire(etatCertificat(null, LE_1ER_SEPTEMBRE) === 'aucun',
  'aucune ligne inventoriée : aucun')
dire(etatCertificat(cert(null, 'jamais'), LE_1ER_SEPTEMBRE) === 'jamais_releve',
  'ligne inventoriée, jamais relevée : jamais_releve')
dire(etatCertificat(cert('2027-06-01', 'injoignable'), LE_1ER_SEPTEMBRE) === 'injoignable',
  'hôte injoignable : injoignable, même avec une date de fin lointaine en base')

console.log('\nLa chaîne non validée l\'emporte sur une date lointaine')
dire(etatCertificat(cert('2027-06-01', 'ok', false), LE_1ER_SEPTEMBRE) === 'invalide',
  'auto-signé mais non expiré : invalide')
// `null` = chaîne non vérifiée. La traiter comme invalide accuserait sans avoir regardé.
dire(etatCertificat(cert('2027-06-01', 'ok', null), LE_1ER_SEPTEMBRE) === 'valide',
  'chaîne non vérifiée : pas une accusation d\'invalidité')

console.log('\nL\'expiration passe AVANT la chaîne')
dire(etatCertificat(cert('2025-01-01', 'ok', false), LE_1ER_SEPTEMBRE) === 'expire',
  'expiré ET auto-signé : on annonce l\'expiration, qui est ce qui casse le service')

console.log('\nChaque état est publié pour l\'assistant')
// Écrit sur la PROPRIÉTÉ : ajouter un état sans le décrire fait rougir ce contrôle, alors
// qu'un décompte figé passerait au vert en laissant un état muet dans les réponses.
{
  const publie = VOCABULAIRES['service.certificat'] as Record<string, string>
  for (const e of ETATS_CERTIFICAT)
    dire(typeof publie[e] === 'string' && publie[e]!.length > 20, `« ${e} » est décrit dans /api/lectures`)
  dire(Object.keys(publie).length === ETATS_CERTIFICAT.length,
    'et rien n\'y est décrit qui ne soit un état réel')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
