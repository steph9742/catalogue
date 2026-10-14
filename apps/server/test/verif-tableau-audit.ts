// TABLEAU DE BORD DE L'AUDIT — trois partitions des mêmes constats, et les manques nommés.
import {
  HORS_INVENTAIRE, lignesRapport, matrice, NON_CLASSE, PROPRIETAIRE_SANS_COMPOSANTE, SANS_PROPRIETAIRE, type ConstatRapport,
} from '../src/utils/tableauAudit'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const D = new Date('2026-09-14T00:00:00Z')
const c = (id: string, gravite: string, x: Partial<ConstatRapport> = {}): ConstatRapport => ({
  id, gravite, categorie: 'outil_expose', titre: `constat ${id}`, statut: 'ouvert', hote: `${id}.example.org`, port: 443,
  serviceId: `s-${id}`, classement: 'standard', proprietaireId: 'p1', proprietaire: 'Alice Martin', composante: 'IUT NFC',
  premierReleveLe: D, dernierReleveLe: D, acceptationEcheance: null, sniffIncidentId: null, verificationInterieureLe: null, ...x,
})

const CONSTATS = [
  c('a', 'moyenne'),
  c('b', 'critique', { composante: 'UFR ST', proprietaire: 'Bruno Petit', proprietaireId: 'p2', classement: 'paiement' }),
  c('c', 'faible'),
  c('d', 'critique', { serviceId: null, classement: null, proprietaireId: null, proprietaire: null, composante: null }),
  c('e', 'elevee', { proprietaireId: null, proprietaire: null, composante: null, classement: null }),
  c('f', 'info', { composante: null }),
]

console.log('\nTROIS PARTITIONS : aucun constat ne tombe entre deux lignes')
for (const axe of ['composante', 'proprietaire', 'classement'] as const) {
  const m = matrice(CONSTATS, axe)
  dire(m.reduce((n, l) => n + l.total, 0) === CONSTATS.length, `par ${axe} : la somme des lignes fait ${CONSTATS.length}`)
  dire(m.every(l => Object.values(l.parGravite).reduce((n, v) => n + v, 0) === l.total), `par ${axe} : chaque ligne se décompose exactement par gravité`)
}

console.log('\nLES MANQUES SONT DES LIGNES NOMMÉES')
{
  const m = matrice(CONSTATS, 'composante')
  const libelles = m.map(l => l.libelle)
  dire(libelles.includes(HORS_INVENTAIRE), 'un constat hors inventaire a sa ligne')
  dire(libelles.includes(SANS_PROPRIETAIRE), 'un service sans propriétaire a sa ligne — pas de composante devinée')
  dire(libelles.includes(PROPRIETAIRE_SANS_COMPOSANTE), 'un propriétaire sans composante a la sienne')
  dire(matrice(CONSTATS, 'classement').some(l => l.libelle === NON_CLASSE), 'un service non classé a sa ligne par classement')
}

console.log('\nLE PLUS GRAVE EN TÊTE, même hors inventaire')
{
  const m = matrice(CONSTATS, 'composante')
  dire(m[0]!.parGravite.critique === 1 && m[1]!.parGravite.critique === 1, 'les deux lignes à constat critique ouvrent le tableau')
  dire(m.slice(0, 2).some(l => l.libelle === HORS_INVENTAIRE), 'le critique hors inventaire n\'est pas relégué en fin de tableau')
}

console.log('\nLE RAPPORT PAR COMPOSANTE se génère, regroupé et ordonné')
{
  const r = lignesRapport(CONSTATS, 'composante')
  dire(r.length === CONSTATS.length, 'toutes les lignes y sont')
  const groupes = r.map(l => l.groupe)
  const contigus = groupes.every((g, i) => i === 0 || g === groupes[i - 1] || !groupes.slice(0, i - 1).includes(g))
  dire(contigus, 'chaque composante forme un bloc continu')
  dire(groupes.indexOf('IUT NFC') < groupes.indexOf(HORS_INVENTAIRE), 'les interlocuteurs identifiés d\'abord, les groupes nommés ensuite')
  const iut = r.filter(l => l.groupe === 'IUT NFC').map(l => l.gravite)
  dire(iut.join() === 'moyenne,faible', 'dans un groupe, les plus graves d\'abord')
  dire(lignesRapport(CONSTATS, 'proprietaire').some(l => l.groupe === 'Bruno Petit'), 'le rapport par propriétaire nomme les personnes')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
