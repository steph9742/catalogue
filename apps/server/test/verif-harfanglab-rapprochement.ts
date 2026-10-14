// VÉRIFICATION — rapprochement « agent EDR ↔ machine de l'inventaire ». À lancer : bun run
// apps/server/test/verif-harfanglab-rapprochement.ts C'EST LE CONTRÔLE QUI DIT CE QUE VALENT
// LES CHIFFRES.
import { rapprocher, type AgentEdr, type MachineInventaire } from '../src/utils/harfanglabRapprochement'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const m = (cle: string, nom: string | null, serie: string | null): MachineInventaire => ({ cle, nom, numeroSerie: serie })
const a = (cle: string, host: string | null, serie: string | null): AgentEdr => ({ cle, hostname: host, machineSerial: serie })

console.log('\nNuméro de série — la preuve')
let r = rapprocher([m('M1', 'srv-a', '5CG7192XYZ')], [a('A1', 'autre-nom', '5CG7192XYZ')])
dire(r.comptes.certains === 1, 'même numéro de série → rapprochement CERTAIN')
dire(r.liens[0]?.machine === 'M1' && r.liens[0]?.agent === 'A1', 'et il relie les bons éléments')
dire(r.comptes.machinesSansAgent === 0, 'la machine n\'est pas comptée sans agent')

r = rapprocher([m('M1', 'srv-a', '5cg7192xyz')], [a('A1', 'x', '5CG-7192-XYZ')])
dire(r.comptes.certains === 1, 'casse et ponctuation du numéro sont ignorées')

console.log('\nNuméros de série qui n\'en sont pas — le piège qui ferait fusionner un parc')
r = rapprocher(
  [m('M1', 'poste-1', 'To be filled by O.E.M.'), m('M2', 'poste-2', 'To be filled by O.E.M.')],
  [a('A1', 'poste-1', 'To be filled by O.E.M.'), a('A2', 'poste-9', 'To be filled by O.E.M.')],
)
dire(r.comptes.certains === 0, 'un numéro générique du BIOS ne rapproche RIEN')
dire(r.comptes.probables === 1, 'le repli par nom fonctionne quand même (poste-1)')
dire(r.comptes.machinesSansSerieUtilisable === 2, 'et les machines sans numéro utilisable sont COMPTÉES')

console.log('\nNom d\'hôte — un indice, jamais une preuve')
r = rapprocher([m('M1', 'srv-web', null)], [a('A1', 'srv-web', null)])
dire(r.comptes.probables === 1 && r.comptes.certains === 0, 'même nom, unique des deux côtés → PROBABLE, pas certain')

console.log('\nAmbiguïté — le cas qu\'il ne faut jamais trancher')
r = rapprocher([m('M1', 'gaco-port207', null), m('M2', 'gaco-port207', null)], [a('A1', 'gaco-port207', null)])
dire(r.comptes.ambigus === 2, 'deux machines pour un nom → AMBIGU (les deux sont signalées)')
dire(r.comptes.probables === 0, 'et surtout : aucun rapprochement n\'est inventé')
dire(r.comptes.machinesSansAgent === 0, 'une machine ambiguë n\'est PAS comptée « sans agent » — ce serait un faux écart')

r = rapprocher([m('M1', 'poste', null)], [a('A1', 'poste', null), a('A2', 'poste', null)])
dire(r.comptes.ambigus === 1, 'un nom porté par deux AGENTS est tout aussi ambigu')

r = rapprocher(
  [m('M1', 'x', 'SERIE-COMMUNE'), m('M2', 'y', 'SERIE-COMMUNE')],
  [a('A1', 'x', 'SERIE-COMMUNE')],
)
dire(r.comptes.ambigus === 2 && r.comptes.certains === 0, 'un numéro de série partagé cesse d\'être une preuve')

console.log('\nNoms de repli — « localhost » ne rapproche rien')
r = rapprocher([m('M1', 'localhost', null), m('M2', 'localhost', null)], [a('A1', 'localhost', null)])
dire(r.comptes.probables === 0 && r.comptes.ambigus === 0, '« localhost » n\'est ni un rapprochement ni une ambiguïté : il n\'identifie rien')
dire(r.comptes.machinesSansAgent === 2, 'ces machines ressortent donc SANS agent — l\'écart est signalé, pas masqué')

console.log('\nLes deux sens de l\'écart')
r = rapprocher([m('M1', 'a', 'SER1001'), m('M2', 'b', 'SER2002')], [a('A1', 'a', 'SER1001'), a('A9', 'inconnue', 'SER9009')])
dire(r.comptes.machinesSansAgent === 1, 'machine sans agent : comptée')
dire(r.comptes.agentsSansMachine === 1, 'agent sans machine : compté aussi (information, pas alerte)')

console.log('\nLa série PRIME sur le nom')
// Numéros d'au moins quatre caractères utiles : en deçà, `serieIdentifie` refuse de conclure,
// et le rapprochement retomberait sur le nom — ce que ce cas veut justement écarter.
r = rapprocher([m('M1', 'meme-nom', 'SER1001')], [a('A1', 'meme-nom', 'SER2002'), a('A2', 'autre', 'SER1001')])
dire(r.liens[0]?.agent === 'A2', 'le rapprochement suit le numéro de série, pas le nom homonyme')
dire(r.liens[0]?.certitude === 'certain', 'et il est certain')

console.log('\nUn numéro trop court ne conclut pas')
r = rapprocher([m('M1', 'x', 'AB1')], [a('A1', 'y', 'AB1')])
dire(r.comptes.certains === 0, 'moins de quatre caractères utiles : rien d\'assez discriminant')

console.log('\nCas vides')
r = rapprocher([], [])
dire(r.comptes.machines === 0 && r.comptes.agents === 0, 'deux ensembles vides ne produisent rien')
r = rapprocher([m('M1', 'a', 'SER1001')], [])
dire(r.comptes.machinesSansAgent === 1, 'aucun agent : toutes les machines ressortent sans agent')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
