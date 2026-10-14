// VÉRIFICATION — le journal d'audit trace-t-il le DÉTAIL des relations ?
import { computeChanges } from '../src/utils/audit'

let ko = 0
const dire = (bon: boolean, msg: string) => {
  if (!bon) ko++
  console.log(`${bon ? '✓' : '✗'} ${msg}`)
}
const cherche = <T extends { field: string }>(changes: T[], field: string) => changes.find(c => c.field === field)

// 1. Objet : aplati en champs pointés, seuls les sous-champs modifiés ressortent.
{
  const avant = {
    nom: 'App',
    rgpd: { id: 'x1', applicationId: 'a1', createdAt: 'ts', updatedAt: 'ts', aipdStatut: 'a_faire', aipdConclusion: null, notes: 'n' },
  }
  const corps = { nom: 'App', rgpd: { aipdStatut: 'terminee', aipdConclusion: 'risque_eleve_consultation', notes: 'n' } }
  const ch = computeChanges(avant, corps)
  dire(!!cherche(ch, 'rgpd.aipdStatut'), 'sous-champ modifié tracé en champ pointé (rgpd.aipdStatut)')
  dire(!!cherche(ch, 'rgpd.aipdConclusion'), 'sous-champ posé depuis null tracé (rgpd.aipdConclusion)')
  dire(!cherche(ch, 'rgpd.notes'), 'sous-champ inchangé absent du diff')
  dire(!cherche(ch, 'nom'), 'scalaire inchangé absent du diff')
  dire(ch.every(c => !c.field.includes('createdAt') && !c.field.includes('applicationId')), 'clés techniques jamais comparées')
}

// 2. Tableau modifié : contenu avant ET après conservés — c'est le jsonb qui fait preuve.
{
  const avant = { rgpdExigences: [{ exigenceRgpdId: 'e1', etat: 'conforme', justification: null }] }
  const corps = { rgpdExigences: [{ exigenceRgpdId: 'e1', etat: 'non_conforme', justification: 'manque le chiffrement' }] }
  const ch = computeChanges(avant, corps)
  const c = cherche(ch, 'rgpdExigences')
  dire(!!c, 'tableau modifié tracé')
  dire(JSON.stringify(c?.to).includes('non_conforme') && JSON.stringify(c?.to).includes('chiffrement'), 'le contenu APRÈS est conservé')
  dire(JSON.stringify(c?.from).includes('conforme'), "le contenu AVANT est conservé")
}

// 3. Tableau réordonné : PAS un changement — un journal qui crie pour rien cesse d'être lu.
{
  const avant = { technologieIds: ['t1', 't2', 't3'] }
  const corps = { technologieIds: ['t3', 't1', 't2'] }
  dire(computeChanges(avant, corps).length === 0, 'tableau réordonné = aucun changement')
}

// 4. Effacement d'une relation (case RGPD décochée) : l'état effacé est conservé.
{
  const avant = { rgpd: { id: 'x', aipdStatut: 'terminee', aipdConclusion: 'risque_acceptable' } }
  const corps = { rgpd: null }
  const c = cherche(computeChanges(avant, corps), 'rgpd')
  dire(!!c && c.to === null && JSON.stringify(c.from).includes('terminee'), "effacement tracé avec l'état d'avant")
}

// 5. Le comportement scalaire d'origine est intact.
{
  const ch = computeChanges({ nom: 'Avant', criticite: 'vitale' }, { nom: 'Après', criticite: 'vitale' })
  dire(ch.length === 1 && ch[0]!.field === 'nom', 'diff scalaire inchangé')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CAS PASSENT')
process.exit(ko ? 1 : 0)
