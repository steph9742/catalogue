// CLASSEMENT ET EXPOSITION — ce qui manque pour qu'un service exposé ait un répondant.
import { classementDuConstat, estSensible, moisDeRevue, prochaineRevue, signalements, type Exposition } from '../src/utils/classement'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const expo = (x: Partial<Exposition> = {}): Exposition => ({
  proprietaireId: 'p1', classement: null, classementPropose: null, paiementEnLigne: null,
  donneesPersonnelles: null, justificationExposition: null, dateRevue: null, ...x,
})
const CTX = { pagesCibles: 1, aujourdhui: '2026-09-15' }

console.log('\nLE CRITÈRE DU LOT : un site classé paiement sans propriétaire est signalé')
{
  const s = signalements(expo({ classement: 'paiement', proprietaireId: null, justificationExposition: 'boutique un site de l\'établissement', dateRevue: '2027-01-01' }), CTX)
  dire(s.includes('sensible_sans_proprietaire'), 'il est signalé comme service sensible sans propriétaire')
  dire(!s.includes('sans_proprietaire'), 'et le même manque n\'est pas compté une seconde fois')
  dire(signalements(expo({ proprietaireId: null }), CTX).join() === 'sans_proprietaire', 'un site standard sans propriétaire l\'est aussi, moins fort')
}

console.log('\nUNE PROPOSITION DU MOTEUR NE VAUT PAS VALIDATION')
{
  dire(!estSensible(expo({ classementPropose: 'paiement' })), 'proposé paiement, non validé : pas sensible — personne ne l\'a relu')
  dire(signalements(expo({ classementPropose: 'paiement' }), CTX).includes('classement_a_valider'), 'la proposition se signale « à valider »')
  dire(!signalements(expo({ classement: 'paiement', classementPropose: 'paiement', justificationExposition: 'x', dateRevue: '2027-01-01' }), CTX).includes('classement_a_valider'),
    'une proposition identique au classement validé ne se signale plus')
}

console.log('\nLE CAS un site de l\'établissement : paiement sans page cible surveillée')
dire(signalements(expo({ classement: 'paiement', justificationExposition: 'x', dateRevue: '2027-01-01' }), { ...CTX, pagesCibles: 0 }).includes('paiement_sans_surveillance_integrite'),
  'classé paiement, aucune page cible : la surveillance d\'intégrité manque')
dire(signalements(expo({ paiementEnLigne: true, justificationExposition: 'x', dateRevue: '2027-01-01' }), { ...CTX, pagesCibles: 0 }).includes('paiement_sans_surveillance_integrite'),
  'le marqueur « paiement en ligne » suffit, sans attendre le classement')
dire(!signalements(expo({ paiementEnLigne: false }), { ...CTX, pagesCibles: 0 }).includes('paiement_sans_surveillance_integrite'),
  'marqué « pas de paiement » : rien à surveiller')

console.log('\nRevue et justification')
{
  dire(signalements(expo({ dateRevue: '2026-09-01' }), CTX).includes('revue_echue'), 'une revue passée est échue')
  dire(signalements(expo({ donneesPersonnelles: true }), CTX).includes('revue_non_planifiee'), 'un service sensible sans date de revue : non planifiée')
  dire(!signalements(expo(), CTX).includes('revue_non_planifiee'), 'un service standard sans date de revue n\'est pas signalé — pas de compteur qui ne descend pas')
  dire(signalements(expo({ classement: 'sensible', dateRevue: '2027-01-01' }), CTX).includes('sensible_sans_justification'), 'un service sensible doit justifier son exposition')
  dire(signalements(expo({ classement: 'standard' }), CTX).length === 0, 'un service standard avec propriétaire : rien à signaler')
}

console.log('\nIntervalle de revue')
dire(moisDeRevue(expo({ classement: 'paiement' })) === 6 && moisDeRevue(expo()) === 12, 'six mois pour ce qui est sensible, un an sinon')
dire(prochaineRevue(expo({ classement: 'paiement' }), new Date('2026-08-31T10:00:00Z')) === '2027-02-28', '31 août + 6 mois : le 28 février, pas le 3 mars')
dire(prochaineRevue(expo(), new Date('2026-09-15T10:00:00Z')) === '2027-09-15', '15 septembre + 12 mois : le 15 septembre suivant')

console.log('\nLa valeur proposée par un constat « classement »')
dire(classementDuConstat({ reference: 'Paiement', titre: 'Classement proposé' }) === 'paiement', 'lue dans `reference`, casse ignorée')
dire(classementDuConstat({ reference: null, titre: 'Formulaire de paiement Paybox détecté' }) === 'paiement', 'à défaut, un mot du titre')
dire(classementDuConstat({ reference: null, titre: 'Paiement ou page sensible ?' }) === null, 'deux mots dans le titre ne tranchent rien')
dire(classementDuConstat({ reference: 'cve-2024-1234', titre: 'Rien' }) === null, 'sans valeur lisible, aucune proposition')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
