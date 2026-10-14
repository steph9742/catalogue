// COMPÉTENCES — les cinq états, et pourquoi deux d'entre eux ne doivent pas fusionner.
import { ETATS_COMPETENCE } from '../src/routers/competencesResume'
import { competenceNiveau } from '@catalogue/database/tables'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const src = await Bun.file(new URL('../src/routers/competencesResume.ts', import.meta.url)).text()

console.log('\nLa jointure part du RÉFÉRENTIEL, pas des personnes')

// LE CORRECTIF LUI-MÊME. Inverser cette jointure ferait disparaître les compétences sans
// détenteur — sans erreur, sans ligne manquante visible, juste une réponse qui ne peut plus
// dire non.
dire(/from \$\{competence\} c/.test(src), 'la table de départ est `competence`')
dire(/left join \$\{personneCompetence\} pc/.test(src),
  'et `personne_competence` est jointe en LEFT JOIN : une compétence sans détenteur reste une ligne')
dire(!/from \$\{personneCompetence\}/.test(src),
  'jamais l\'inverse — c\'est ce sens-là qui rendait le trou invisible')

console.log('\nLes cinq états sont déclarés et produits')
{
  const corps = src.slice(src.indexOf('case\n'), src.indexOf('end as etat'))
  const produits = new Set([...corps.matchAll(/then '(\w+)'|else '(\w+)'/g)].map(m => (m[1] ?? m[2])!))
  for (const e of ETATS_COMPETENCE) dire(produits.has(e), `« ${e} » est déclaré ET produit`)
  for (const p of produits) {
    dire((ETATS_COMPETENCE as readonly string[]).includes(p), `« ${p} » est produit ET déclaré`)
  }
}

console.log('\n`non_evaluee` ne peut pas fusionner avec `sous_niveau`')

// La première appelle une ÉVALUATION — ni le même acte, ni le même budget.
{
  const corps = src.slice(src.indexOf('case\n'), src.indexOf('end as etat'))
  // L'ordre des branches EST la distinction : `non_evaluee` est tranché AVANT `sous_niveau`,
  // sinon une compétence sans aucun niveau saisi tomberait dans « sous le niveau requis » —
  // zéro personne au niveau, donc insuffisante, donc une formation budgétée pour un manque qui
  // n'a jamais été constaté.
  dire(corps.indexOf("'non_evaluee'") < corps.indexOf("'sous_niveau'"),
    '`non_evaluee` est tranché AVANT `sous_niveau`')
  dire(/count\(pc\.niveau\) = 0 then 'non_evaluee'/.test(corps),
    'et sa condition est « aucun niveau saisi », pas « aucun niveau suffisant »')
}

console.log('\n`sans_exigence` est hors du dénominateur')
// Sans niveau requis déclaré, ni la couverture ni le manque ne se constatent. Compter ces
// compétences comme couvertes gonflerait un taux qui ne mesure rien.
dire(/etat !== 'sans_exigence'/.test(src), '`jugeables` exclut les compétences sans niveau requis')
dire(/sans_exigence/.test(src.slice(src.indexOf('avertissement:'), src.indexOf('resultats:'))),
  'et l\'avertissement le dit dans la réponse, pas seulement dans la documentation')

console.log('\nL\'ordre des niveaux vient de l\'énumération, jamais d\'une liste écrite')

// Une liste de niveaux recopiée ici serait une seconde copie du vocabulaire : ajouter un niveau
// la laisserait en arrière et les comparaisons deviendraient fausses en silence.
dire(/enum_range\(null::competence_niveau\)/.test(src),
  'le rang vient de `enum_range`, donc de l\'ordre de déclaration')
dire(!new RegExp(`'${competenceNiveau.enumValues.join("'.*'")}'`).test(src),
  'aucune liste de niveaux n\'est recopiée dans ce fichier')
dire(competenceNiveau.enumValues[0] === 'notion'
  && competenceNiveau.enumValues[competenceNiveau.enumValues.length - 1] === 'expert',
'l\'énumération est bien ordonnée du plus faible au plus fort')

console.log('\nUne valeur de domaine inventée est refusée')
dire(/status\(422/.test(src), 'un domaine hors vocabulaire est refusé en 422, jamais filtré à vide')
dire(/competenceDomaine\.enumValues/.test(src),
  'et la validation se fait contre l\'énumération, pas contre une liste recopiée')

console.log('\nLe détenteur unique est signalé')
// Une compétence tenue par une seule personne au niveau requis s'éteint avec son départ.
// L'ISO 27001 et EBIOS le demandent tous deux.
dire(/au_niveau === 1/.test(src), 'les compétences à détenteur unique sont listées nommément')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
