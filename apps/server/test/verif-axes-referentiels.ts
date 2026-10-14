// TOUTE CLÉ ÉTRANGÈRE VERS UN RÉFÉRENTIEL DOIT PORTER UN AXE. LE DÉFAUT QUI A MOTIVÉ CE
// CONTRÔLE.
import { getTableConfig } from 'drizzle-orm/pg-core'
import { getTableColumns } from 'drizzle-orm'
import { CATALOGUES_GENERIQUES } from '../src/utils/cataloguesGeneriques'
import { COLONNES_AXES, TABLES_REFERENTIELLES, axesDe } from '../src/utils/resumeGenerique'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

/**
 * Les colonnes qui pointent vers un référentiel SANS devoir en être un axe.
 */
const EXCEPTIONS: Record<string, string> = {
  // Hiérarchie interne au référentiel lui-même : ventiler les composantes par leur
  // directeur ne répond à aucune question qu'on pose d'un inventaire.
  'composantes.directeurId': 'Qui dirige la composante est un attribut de la composante, pas un axe : « les composantes par directeur » n\'est pas une question d\'inventaire.',
  'composantes.viceDirecteurId': 'Même raison que le directeur : un rôle porté par le référentiel lui-même.',
  'composantes.rsaId': 'Le responsable de la sécurité applicative est un rôle de la composante, pas une clé de répartition.',
  'departements.directeurId': 'Rôle du département, au même titre que le directeur d\'une composante.',
  'departements.secretaireId': 'Rôle du département : ventiler les départements par secrétaire ne désigne aucun travail.',
  'services.directeurId': 'Rôle du service, symétrique du directeur de composante.',
  'personnes.populationId': 'Catégorie d\'appartenance de la personne dans son propre référentiel — un attribut, pas un rattachement organisationnel.',
  'personnes.sectionCnuId': 'Section CNU : classement disciplinaire de l\'enseignant-chercheur, interne au référentiel des personnes.',
  'parties-interessees.contactId': 'Le contact est une coordonnée de la partie intéressée, pas un rattachement : « les parties intéressées par contact » rendrait une ligne par partie.',
  'lieux.parentId': 'Arborescence du référentiel des lieux (un bâtiment contient des salles). Ce n\'est pas un rattachement, c\'est la structure du référentiel.',
}

console.log('\nChaque clé étrangère vers un référentiel porte un axe')
const manquants: string[] = []
for (const c of CATALOGUES_GENERIQUES) {
  const cfg = getTableConfig(c.table as never)
  for (const fk of cfg.foreignKeys) {
    const ref = fk.reference()
    if (!TABLES_REFERENTIELLES.has(ref.foreignTable as never)) continue
    // Le NOM JS de la colonne, celui que `REFERENTIELS` indexe — et non le nom SQL.
    // `getTableConfig().columns` est un TABLEAU : l'indexer par clé donnait « composantes.4 ».
    const sql = ref.columns[0]?.name
    const jsNom = Object.entries(getTableColumns(c.table as never))
      .find(([, col]) => (col as { name: string }).name === sql)?.[0]
    if (!jsNom) continue
    const cle = `${c.name}.${jsNom}`
    if (COLONNES_AXES.has(jsNom) || EXCEPTIONS[cle]) continue
    manquants.push(cle)
  }
}
dire(manquants.length === 0,
  manquants.length
    ? `${manquants.length} clé(s) étrangère(s) sans axe ni raison : ${manquants.join(', ')}`
    : 'aucune clé étrangère vers un référentiel n\'est laissée sans axe')

console.log('\nToute exception porte une raison écrite')
for (const [cle, raison] of Object.entries(EXCEPTIONS))
  dire(raison.trim().length > 15, `${cle} — la raison est écrite`)

console.log('\nLe catalogue des sites et services se ventile')
{
  const sites = CATALOGUES_GENERIQUES.find(c => c.name === 'sites-services')
  dire(!!sites, 'le catalogue existe dans le registre générique')
  const refs = sites ? axesDe(sites.table).refs : []
  // Écrit sur la PROPRIÉTÉ : un axe AJOUTÉ demain ne doit pas faire rougir ce contrôle.
  dire(refs.includes('applicationId'), 'il se ventile par application')
  dire(refs.includes('proprietaireId'), 'il se ventile par propriétaire')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
