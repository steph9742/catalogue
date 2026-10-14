// VÉRIFICATION — la correspondance « groupe GLPI → criticité ». À lancer : bun run
// apps/server/test/verif-glpi-criticite.ts POURQUOI CE CONTRÔLE EXISTE.
import { criticiteDuGroupe, lireReglesCriticite, type RegleCriticite } from '../src/utils/glpiSync'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

// --- Lecture de la correspondance stockée (jsonb : ne jamais croire son contenu) ------
console.log('\nLecture de la correspondance')
dire(lireReglesCriticite(null).length === 0, 'une correspondance absente donne une liste vide')
dire(lireReglesCriticite('nimporte quoi').length === 0, 'une valeur qui n\'est pas un tableau donne une liste vide')
dire(lireReglesCriticite([{ groupe: '', criticite: 'vitale' }]).length === 0, 'une ligne sans nom de groupe est écartée')
// « mineure » appartenait à l'ANCIENNE échelle et n'a pas été rétablie, contrairement
// à « critique » (migration 0042) : elle sert donc de valeur invalide témoin.
dire(lireReglesCriticite([{ groupe: 'X', criticite: 'mineure' }]).length === 0, 'une criticité hors énumération est écartée (ex. l\'ancien « mineure »)')
dire(lireReglesCriticite([{ groupe: 'X', criticite: 'critique' }]).length === 1, '« critique » est accepté — une source qui ne différencie pas ne doit pas être forcée de choisir')
dire(lireReglesCriticite([{ groupe: '  Machines critiques  ', criticite: 'vitale' }])[0]?.groupe === 'Machines critiques', 'le nom de groupe est débarrassé de ses espaces')
dire(lireReglesCriticite([{ groupe: 'A', criticite: 'vitale' }, { groupe: 'B', criticite: 'secondaire' }]).length === 2, 'les lignes valides sont conservées')

// --- Rapprochement d'un groupe -------------------------------------------------------
console.log('\nRapprochement du groupe d\'une machine')
const regles: RegleCriticite[] = [
  { groupe: 'Machines critiques', criticite: 'vitale' },
  { groupe: 'Serveurs sensibles', criticite: 'essentielle' },
]

dire(criticiteDuGroupe('Machines critiques', regles) === 'vitale', 'le nom exact correspond')
dire(criticiteDuGroupe('l\'établissement > Machines critiques', regles) === 'vitale', 'le CHEMIN COMPLET correspond via sa feuille (personne ne recopie une arborescence sans se tromper)')
dire(criticiteDuGroupe('machines  critiques', regles) === 'vitale', 'casse et espaces multiples sont ignorés')
dire(criticiteDuGroupe('MACHINES-CRITIQUES', regles) === 'vitale', 'la ponctuation est ignorée (tirets, underscores)')
dire(criticiteDuGroupe('Machines Critîques', regles) === 'vitale', 'les accents sont ignorés')
dire(criticiteDuGroupe('Serveurs sensibles', regles) === 'essentielle', 'une seconde règle s\'applique aussi')

console.log('\nSous-arbre — le cas réel de l\'l\'établissement')
// L'inventaire porte « superadmin > critique » (744 machines) et ses raffinements « superadmin
// > critique > Niveau 1 > Applicatif », etc.
const arbre: RegleCriticite[] = [{ groupe: 'critique', criticite: 'critique' }]
dire(criticiteDuGroupe('superadmin > critique', arbre) === 'critique', 'le nœud déclaré lui-même correspond')
dire(criticiteDuGroupe('superadmin > critique > Niveau 1 > Applicatif', arbre) === 'critique', 'un SOUS-GROUPE hérite du parent déclaré')
dire(criticiteDuGroupe('superadmin > critique > Niveau 3 > Web', arbre) === 'critique', 'quelle que soit la profondeur')
dire(criticiteDuGroupe('superadmin > autre > critique-bis', arbre) === null, 'un nœud seulement RESSEMBLANT ne correspond pas')
dire(criticiteDuGroupe('superadmin > bureautique', arbre) === null, 'une autre branche ne correspond pas')

console.log('\nPlusieurs groupes sur une même machine')
// GLPI renvoie un tableau quand une machine appartient à deux groupes ; le client les
// écrit séparés par « ; ». Les traiter comme une seule chaîne ne correspondait à rien.
const deux = 'superadmin > critique ; superadmin > critique > Niveau 1 > Applicatif'
dire(criticiteDuGroupe(deux, arbre) === 'critique', 'une machine à deux groupes est bien reconnue')
dire(criticiteDuGroupe('superadmin > bureautique ; superadmin > critique', arbre) === 'critique', 'il suffit qu\'UN des groupes corresponde')
dire(criticiteDuGroupe('superadmin > bureautique ; superadmin > libre', arbre) === null, 'aucun des deux ne correspond → rien')

console.log('\nLa règle la plus SPÉCIFIQUE l\'emporte — c\'est ce qui permet d\'écarter une branche')
const nuance: RegleCriticite[] = [
  { groupe: 'critique', criticite: 'critique' },
  { groupe: 'critique > Niveau 3', criticite: 'importante' },
]
dire(criticiteDuGroupe('superadmin > critique > Niveau 1 > Applicatif', nuance) === 'critique', 'la règle générale s\'applique aux branches non précisées')
dire(criticiteDuGroupe('superadmin > critique > Niveau 3 > Web', nuance) === 'importante', 'la règle précise l\'emporte sur la générale, MÊME moins grave')

console.log('\nCas où RIEN ne doit s\'appliquer')
dire(criticiteDuGroupe(null, regles) === null, 'une machine sans groupe ne reçoit aucune criticité')
dire(criticiteDuGroupe('   ', regles) === null, 'un groupe vide ne reçoit aucune criticité')
dire(criticiteDuGroupe('Postes bureautiques', regles) === null, 'un groupe non déclaré ne reçoit aucune criticité')
dire(criticiteDuGroupe('Machines critiques', []) === null, 'sans aucune règle, rien ne s\'applique — l\'absence de règle ne vaut pas règle implicite')
dire(criticiteDuGroupe('Machines critiques (archive)', regles) === null, 'un nom seulement RESSEMBLANT ne correspond pas')

console.log('\nConflits à spécificité ÉGALE : la plus grave gagne')
const conflit: RegleCriticite[] = [
  { groupe: 'Parc', criticite: 'secondaire' },
  { groupe: 'parc', criticite: 'vitale' },
]
dire(criticiteDuGroupe('Parc', conflit) === 'vitale', 'entre deux règles également spécifiques, la plus grave gagne (sous-estimer est la seule erreur qui coûte)')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
