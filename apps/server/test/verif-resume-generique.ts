// RÉSUMÉ PAR AXE DE FILTRE — dérivé des colonnes, pour les quarante-huit catalogues.
import { axesDe } from '../src/utils/resumeGenerique'
import {
  application, appareilMobile, machineIndus, posteTravail, serveur,
} from '@catalogue/database/tables'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nLes axes viennent des COLONNES, pas d\'une liste')
{
  const src = await Bun.file(new URL('../src/utils/resumeGenerique.ts', import.meta.url)).text()
  dire(/getTableColumns\(table\)/.test(src), 'les colonnes de la table sont lues à l\'exécution')
  dire(/Array\.isArray\(c\.enumValues\)/.test(src),
    'une colonne d\'énumération est reconnue par son vocabulaire, pas par son nom')
  // Un nom de colonne écrit en dur ici ferait de ce fichier une quarante-neuvième liste à
  // tenir à jour, exactement ce qu'il existe pour supprimer.
  dire(!/'(criticite|statut|environnement|type)'/.test(src.slice(src.indexOf('export function axesDe'))),
    'aucun nom de colonne métier n\'est écrit en dur dans la détection')
}

console.log('\nChaque catalogue porte les axes de son écran de recherche')

// Les filtres visibles à l'écran — TYPE, ENVIRONNEMENT, CRITICITÉ, STATUT, EMPLACEMENT,
// COMPOSANTE — doivent tous se retrouver.
for (const [nom, table, attendus] of [
  ['serveurs', serveur, ['type', 'environnement', 'criticite', 'statut']],
  ['postes de travail', posteTravail, ['type', 'criticite', 'statut']],
  ['machines industrielles', machineIndus, ['fonction', 'criticiteSurete', 'statut']],
  ['applications', application, ['categorie', 'criticite', 'statut', 'hebergement', 'exposition', 'sensibilite']],
] as const) {
  const a = axesDe(table as never)
  const champs = a.enums.map(e => e.champ)
  for (const attendu of attendus) {
    dire(champs.includes(attendu), `${nom} : « ${attendu} » est partitionné`)
  }
}

console.log('\nLes axes organisationnels des inventaires matériels')
for (const [nom, table] of [
  ['serveurs', serveur], ['postes de travail', posteTravail],
  ['machines industrielles', machineIndus], ['appareils mobiles', appareilMobile],
] as const) {
  const refs = axesDe(table as never).refs
  for (const attendu of ['lieuId', 'composanteId', 'serviceId', 'departementId']) {
    dire(refs.includes(attendu), `${nom} : ventilé par « ${attendu} »`)
  }
}

console.log('\nUne clé étrangère inconnue n\'est PAS ventilée')
{
  // Mieux vaut ne pas rendre un axe que d'en rendre un dont on ne sait pas nommer les valeurs :
  // une ventilation par identifiants opaques serait illisible et se lirait pourtant comme une
  // réponse.
  const src = await Bun.file(new URL('../src/utils/resumeGenerique.ts', import.meta.url)).text()
  dire(/champ in REFERENTIELS/.test(src),
    'seules les clés étrangères d\'un référentiel déclaré sont ventilées')
  const refs = axesDe(serveur as never).refs
  dire(!refs.includes('id'), 'la clé primaire n\'est pas prise pour un axe')
}

console.log('\n`axes` est rendu : un axe absent n\'est pas un axe vide')
{
  const src = await Bun.file(new URL('../src/utils/resumeGenerique.ts', import.meta.url)).text()
  // Sans cette liste, l'appelant ne peut pas distinguer « cette table ne porte pas
  // d'environnement » de « aucune machine n'a d'environnement renseigné ».
  dire(/axes: \{ partitions:/.test(src), 'la liste des axes portés par la table est rendue')
  dire(axesDe(posteTravail as never).enums.every(e => e.champ !== 'environnement'),
    'un poste de travail ne porte pas d\'environnement — son absence est une propriété du modèle')
}

console.log('\nLes partitions tiennent en une requête')
{
  const src = await Bun.file(new URL('../src/utils/resumeGenerique.ts', import.meta.url)).text()
  // Quarante-huit catalogues × six énumérations feraient trois cents allers-retours pour
  // un écran de synthèse.
  dire(/champs\[`\$\{champ\}__\$\{valeur\}`\]/.test(src),
    'toutes les partitions d\'une table sont demandées dans un seul select')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
