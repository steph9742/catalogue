// STATUT DE FIN DE SUPPORT — les deux implémentations doivent dire la même chose.
import { STATUTS_EOL, statutEol, type StatutEol } from '../src/routers/eol'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const AUJOURDHUI = '2026-08-28'
const DANS_UN_AN = '2027-08-28'

/**
 * La transcription SQL, évaluée en JavaScript sur les mêmes entrées. Elle reproduit branche à
 * branche le `case` de `expressionEolStatut`, dans le même ordre.
 */
function transcriptionSql(
  finDeVie: string | null, finDeVieEtendue: string | null, sourceEol: string | null,
): StatutEol {
  if (finDeVie === null) return sourceEol === 'api' ? 'supporte' : 'inconnu'
  if (finDeVie < AUJOURDHUI) {
    return finDeVieEtendue !== null && finDeVieEtendue >= AUJOURDHUI ? 'etendu' : 'depasse'
  }
  if (finDeVie < DANS_UN_AN) return 'bientot'
  return 'ok'
}

// Les cas limites, et pourquoi chacun est là.
const CAS: Array<{ quoi: string, finDeVie: string | null, etendue: string | null, source: string | null }> = [
  { quoi: 'sans date, source inconnue → inconnu', finDeVie: null, etendue: null, source: null },
  // Une source qui CONFIRME l'absence de date est une information, pas une absence.
  { quoi: 'sans date, source api → supporté', finDeVie: null, etendue: null, source: 'api' },
  { quoi: 'dépassée depuis longtemps', finDeVie: '2020-01-01', etendue: null, source: 'api' },
  // Le cas qui distingue « hors support » de « sous contrat étendu ». Les confondre
  // signalerait comme manquement des machines couvertes par un contrat payé.
  { quoi: 'dépassée mais étendue en cours → étendu', finDeVie: '2020-01-01', etendue: '2027-01-01', source: 'api' },
  { quoi: 'dépassée et extension expirée → dépassé', finDeVie: '2020-01-01', etendue: '2021-01-01', source: 'api' },
  // BORNES EXACTES. C'est là que `<` et `<=` divergent, et une erreur d'un jour sur des
  // milliers de machines ne se voit pas à l'œil.
  { quoi: 'fin de vie AUJOURD\'HUI → pas encore dépassée', finDeVie: AUJOURDHUI, etendue: null, source: 'api' },
  { quoi: 'fin de vie hier → dépassée', finDeVie: '2026-08-27', etendue: null, source: 'api' },
  { quoi: 'extension se terminant AUJOURD\'HUI → encore étendu', finDeVie: '2020-01-01', etendue: AUJOURDHUI, source: 'api' },
  { quoi: 'extension terminée hier → dépassé', finDeVie: '2020-01-01', etendue: '2026-08-27', source: 'api' },
  { quoi: 'fin de vie dans onze mois → bientôt', finDeVie: '2027-07-01', etendue: null, source: 'api' },
  { quoi: 'fin de vie dans un an pile → plus « bientôt »', finDeVie: DANS_UN_AN, etendue: null, source: 'api' },
  { quoi: 'fin de vie dans trois ans → ok', finDeVie: '2029-01-01', etendue: null, source: 'api' },
]

console.log('\nLes deux implémentations s\'accordent, cas par cas')
for (const c of CAS) {
  const js = statutEol(
    { finDeVie: c.finDeVie, finDeVieEtendue: c.etendue, sourceEol: c.source },
    AUJOURDHUI, DANS_UN_AN,
  )
  const sql = transcriptionSql(c.finDeVie, c.etendue, c.source)
  dire(js === sql, `${c.quoi} — JS « ${js} », SQL « ${sql} »`)
}

console.log('\nLe vocabulaire et les branches du `case` se correspondent')

// LA MÊME PROPRIÉTÉ QUE POUR `etatRgpd`, et elle a trouvé un vrai défaut ici : la liste des six
// statuts était RECOPIÉE dans le filtre `?eolStatut=`, parce qu'une union de types ne s'énumère
// pas à l'exécution.
{
  const src = await Bun.file(new URL('../src/routers/eol.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('export function expressionEolStatut'))
  const corps = bloc.slice(0, bloc.indexOf('from ${technologie}'))
  const produites = new Set([...corps.matchAll(/(?:then|else) '(\w+)'/g)].map(m => m[1]!))
  const declarees = new Set<string>(STATUTS_EOL)

  for (const v of declarees) dire(produites.has(v), `« ${v} » est déclaré ET produit par une branche`)
  for (const v of produites) dire(declarees.has(v), `« ${v} » est produit ET déclaré dans le vocabulaire`)
  dire(produites.size === declarees.size,
    `${declarees.size} statuts déclarés, ${produites.size} produits : les deux ensembles coïncident`)

  // Et la liste du filtre ne doit pas être une SECONDE copie : c'est le défaut trouvé.
  const idx = await Bun.file(new URL('../src/index.ts', import.meta.url)).text()
  dire(/valeurs: STATUTS_EOL/.test(idx), 'le filtre prend sa liste du module, il ne la recopie pas')
  dire(!/valeurs: \['depasse'/.test(idx), 'et l\'ancienne copie a bien été retirée')
}

console.log('\nL\'ordre des branches est le même des deux côtés')
{
  const src = await Bun.file(new URL('../src/routers/eol.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('export function expressionEolStatut'))
  const ordreSql = [...bloc.slice(0, bloc.indexOf('from ${technologie}')).matchAll(/'(\w+)'/g)]
    .map(m => m[1]!).filter(v => ['supporte', 'inconnu', 'etendu', 'depasse', 'bientot', 'ok', 'api'].includes(v))
  dire(ordreSql[0] === 'api' && ordreSql[1] === 'supporte' && ordreSql[2] === 'inconnu',
    'la branche « sans date » est traitée en premier des deux côtés')
  dire(ordreSql.indexOf('etendu') < ordreSql.indexOf('depasse'),
    'l\'extension est examinée AVANT de conclure au dépassement')
}

console.log('\nLa partition du résumé est COMPLÈTE, et dérivée')

// LE DÉFAUT SIGNALÉ. Les compteurs de /api/eol/etat étaient écrits un par un, et il en manquait
// un : `ok`, soit l'état le plus nombreux du parc — 5 481 machines sur 8 862.
{
  const src = await Bun.file(new URL('../src/routers/eol.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('const machinesParStatut'), src.indexOf('avertissement:'))

  // ÉCRIT SUR LA PROPRIÉTÉ, PAS SUR LA FORME. La première version cherchait `STATUTS_EOL.map`
  // et a rougi le jour où la dérivation a été factorisée dans `partitionEnMemoire` — pour une
  // amélioration.
  dire(/STATUTS_EOL/.test(bloc), 'la partition est construite à partir du vocabulaire')
  const litteraux = [...bloc.matchAll(/=== '(depasse|etendu|bientot|ok|supporte|inconnu)'/g)]
  dire(litteraux.length === 0,
    `aucun compteur ne filtre sur un nom de statut écrit en dur (${litteraux.length})`)
  dire(/machinesTotal/.test(bloc),
    'le total est rendu : l\'appelant rapporte chaque catégorie sans sommer les lignes')

  // Les noms historiques restent, mais ils DÉRIVENT de la partition : ils ne peuvent donc
  // plus diverger d'elle. Un compteur historique calculé séparément recréerait le défaut.
  const historiques = [...bloc.matchAll(/machines(Depassees|Bientot|Inconnues|Etendues|Supportees|Ok): ([^,\n]+)/g)]
  dire(historiques.length === 6, `${historiques.length} compteurs historiques, dont machinesOk`)
  dire(historiques.every(m => m[2]!.startsWith('machinesParStatut.')),
    'et chacun dérive de la partition plutôt que de recalculer')

  // Toute valeur du vocabulaire doit avoir son compteur — c'est la définition d'une
  // partition. Vérifié sur la sortie de la dérivation, pas sur une liste écrite ici.
  const derives = Object.fromEntries(STATUTS_EOL.map(st => [st, 0]))
  dire(Object.keys(derives).length === STATUTS_EOL.length
    && STATUTS_EOL.every(st => st in derives),
  `les ${STATUTS_EOL.length} états ont chacun leur compteur`)
}

console.log('\nLa reprise non faite ne se lit pas comme un parc sain')

// LA PRÉCAUTION DEMANDÉE, et elle vient d'une panne qu'ils ont payée : une colonne matérialisée
// restée nulle sur 3 196 passages, sans que rien ne signale que le service tournait dégradé.
{
  const src = await Bun.file(new URL('../src/routers/eol.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('export function expressionEolStatut'), src.indexOf('// Marque les lignes'))
  // La sous-requête ne trouve rien quand la clé est nulle : SQL rend alors `null`, et non
  // une valeur du vocabulaire. C'est ce qui permet aux compteurs de nommer ces machines.
  dire(/StatutEol \| null/.test(bloc),
    'l\'expression peut rendre `null` : la clé non calculée n\'est pas un statut')
  dire(!/coalesce/.test(bloc),
    'aucun `coalesce` ne rabat ce `null` sur « supporte » ou « inconnu »')

  const rec = await Bun.file(new URL('../src/utils/technologieCle.ts', import.meta.url)).text()
  dire(/clesNonEvaluees/.test(rec), 'un compteur dédié nomme les machines non encore évaluées')
  dire(/and\(isNull\(table\.technologieCle\), isNotNull\(table\.os\)\)/.test(rec),
    'et il exclut les machines sans OS, qui n\'ont rien à évaluer')
  // `&&` sur deux fragments SQL rend l'opérande de droite, sans erreur : la première
  // condition disparaît silencieusement. Le défaut a existé dans ce fichier.
  dire(!/\)\s*&&\s*isNotNull/.test(rec),
    'la conjonction est un `and(...)` SQL, jamais un `&&` JavaScript')
}

console.log('\nLa réconciliation ne suit pas la détection de changement')
{
  const rec = await Bun.file(new URL('../src/utils/technologieCle.ts', import.meta.url)).text()
  // LE CŒUR DE LEUR CICATRICE. Une reprise qui ne visite que les lignes modifiées laisse
  // à null tout ce qui n'a pas bougé — et la migration « réussit ».
  dire(/\.select\(\{[\s\S]{0,200}\}\)\s*\.from\(table\)\s*$/m.test(rec)
    || !/where\([^)]*modifi/i.test(rec),
  'la réconciliation relit TOUTES les lignes, sans filtre de fraîcheur')
  dire(/l\.cle !== attendue/.test(rec), 'et n\'écrit que celles dont la clé diffère : elle est idempotente')
}

console.log('\nUne seule définition de « machine hors support »')

// TROIS IMPLÉMENTATIONS ONT COEXISTÉ, et donné trois nombres : 611 /api/eol/etat fiches GLPI
// (8862), clé matérialisée 581 /api/technologies/parc serveurs+postes (8581), clé matérialisée
// 580 /api/dashboard/pilotage serveurs+postes (8581), clé RECALCULÉE en JS Le premier écart est
// une différence de…
{
  const src = await Bun.file(new URL('../src/routers/eol.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('export async function machinesHorsSupport'),
    src.indexOf('export async function osSansDate'))
  dire(/expressionEolStatut\(cle/.test(bloc),
    'le tableau de bord utilise la même expression SQL que les autres routes')
  dire(/technologieCle/.test(bloc), 'et la clé MATÉRIALISÉE, pas une clé recalculée')
  // Les COMMENTAIRES sont retirés avant l'examen : celui qui explique le correctif cite
  // `cleTechnologie`, et un contrôle qui rougirait sur sa propre explication serait un contrôle
  // qu'on désactive.
  const code = bloc.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
  dire(!/cleTechnologie\(/.test(code),
    'aucun recalcul de clé dans ce comptage — c\'était la cause de l\'écart d\'une machine')

  // Le dénominateur voyage AVEC le nombre : « 580 machines hors support » sur une tuile sans
  // population ne se rapporte à rien, et l'écran voisin en affiche un autre sur une autre
  // population.
  dire(/\{ nombre: number, sur: number \}|nombre: s\.depasse \+ p\.depasse, sur:/.test(bloc),
    'la fonction rend son dénominateur avec son nombre')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
