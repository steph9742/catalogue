// LES PÔLES GLPI — le 4e niveau, sous un service seulement.
import { poleDuChemin } from '../src/utils/glpiSync'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

dire(poleDuChemin('l\'établissement > Services Centraux > Dnum > System') === 'System', '« … > Dnum > System » : le pôle System')
dire(poleDuChemin('l\'établissement > IUT NFC > Administration > Service-Tech') === 'Service-Tech', '« … > Administration > Service-Tech » : le pôle Service-Tech')
dire(poleDuChemin('l\'établissement > IUT NFC > Dept-INFO > TP') === null, 'sous un département, aucun pôle : le schéma ne l\'admet que dans un service')
dire(poleDuChemin('l\'établissement > Services Centraux > Dnum') === null, 'trois niveaux : pas de pôle')
dire(poleDuChemin(null) === null, 'sans chemin : pas de pôle')
dire(poleDuChemin('UFC > Services Centraux > Dnum > RT') === 'RT', 'l\'ancien nom de l\'établissement ne change rien')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
