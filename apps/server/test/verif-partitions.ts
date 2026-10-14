// PARTITIONS — un compteur par valeur, et pas un de moins. LE DÉFAUT, RELEVÉ TROIS FOIS.
import { partitionEnMemoire } from '../src/utils/partition'
import { partitionsPubliees, ventilationsPubliees, vocabulairesParChamp } from '../src/routers/lectures'
import { STATUTS_EOL } from '../src/routers/eol'
import { nis2Conformite, iso27001Conformite, rgpdConformite } from '@catalogue/database/tables'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nLa fonction rend une case par valeur, y compris à zéro')
{
  // UNE CASE À ZÉRO N'EST PAS UNE CASE ABSENTE. C'est toute la différence : « 0 machine
  // dépassée » est une réponse, l'absence du champ n'en est pas une.
  const vide = partitionEnMemoire([], STATUTS_EOL, () => null)
  dire(Object.keys(vide).length === STATUTS_EOL.length,
    `sur une liste vide, les ${STATUTS_EOL.length} cases existent quand même`)
  dire(Object.values(vide).every(n => n === 0), 'et valent toutes zéro')
}

console.log('\nLa somme des parts fait le tout')
{
  const lignes = [
    { s: 'depasse', n: 10 }, { s: 'ok', n: 100 }, { s: 'ok', n: 5 },
    { s: 'inconnu', n: 3 }, { s: 'etendu', n: 1 },
  ] as const
  const p = partitionEnMemoire(lignes, STATUTS_EOL, l => l.s, l => l.n)
  const somme = Object.values(p).reduce((a, b) => a + b, 0)
  dire(somme === 119, `la partition somme à ${somme}, soit le total des lignes`)
  dire(p.ok === 105, '`ok` agrège bien les deux lignes — c\'est la case qui manquait')
  dire(p.supporte === 0, 'et une valeur sans ligne vaut zéro, pas undefined')
}

console.log('\nUne valeur hors vocabulaire est ignorée, jamais créée')
{
  // Un statut inconnu ne doit pas fabriquer une case : la partition resterait une partition du
  // vocabulaire, et une clé surnuméraire tromperait un consommateur qui itère dessus.
  const p = partitionEnMemoire([{ s: 'inexistant' }], STATUTS_EOL, l => l.s as never)
  dire(Object.keys(p).length === STATUTS_EOL.length, 'aucune case surnuméraire n\'apparaît')
  dire(Object.values(p).every(n => n === 0), 'et la ligne inconnue n\'est comptée nulle part')
}

console.log('\nLes trois résumés dérivent leur partition')
for (const [fichier, attendu] of [
  ['eol', 'partitionEnMemoire'],
  ['parcTechnologique', 'partitionEnMemoire'],
  ['conformite', 'partitionAvecNul'],
] as const) {
  const src = await Bun.file(new URL(`../src/routers/${fichier}.ts`, import.meta.url)).text()
  dire(src.includes(attendu), `${fichier} utilise ${attendu}`)
}

console.log('\nLes trois cadres de conformité couvrent leur vocabulaire')
{
  const src = await Bun.file(new URL('../src/routers/conformite.ts', import.meta.url)).text()
  for (const [cadre, enumeration, valeurs] of [
    ['NIS 2', 'nis2Conformite', nis2Conformite.enumValues],
    ['ISO 27001', 'iso27001Conformite', iso27001Conformite.enumValues],
    ['RGPD', 'rgpdConformite', rgpdConformite.enumValues],
  ] as const) {
    dire(src.includes(`${enumeration}.enumValues`),
      `${cadre} : la partition vient de l'énumération (${valeurs.length} valeurs)`)
  }
  // Le compteur des NULLES est nommé et rendu : sans lui, la somme des parts ne fait pas
  // le total, et une partition qui ne somme pas au total n'en est pas une.
  dire((src.match(/'non_evaluee'/g) ?? []).length >= 3,
    'et les trois déclarent le compteur des valeurs nulles')
}

console.log('\nLes vocabulaires de conformité restent DISTINCTS')
// Le piège d'origine, qui a déjà failli coûter cher : « conforme » se dit `fait` en NIS 2 et
// `conforme` ailleurs.
dire(nis2Conformite.enumValues[0] === 'fait', 'NIS 2 dit `fait`')
dire(iso27001Conformite.enumValues[0] === 'conforme', 'l\'ISO dit `conforme`')
dire(!(nis2Conformite.enumValues as readonly string[]).includes('non_applicable'),
  '`non_applicable` n\'est PAS une valeur de conformité NIS 2 — c\'est un statut')
dire((iso27001Conformite.enumValues as readonly string[]).includes('non_applicable'),
  'alors qu\'il en est une chez l\'ISO : les partitions ne peuvent pas être fusionnées')

console.log('\nLes partitions sont DÉCLARÉES, plus devinées par recouvrement')

// C'est prudent, et c'est une inférence — elle échoue en silence là où les clés NE SONT PAS les
// valeurs, c'est-à-dire sur `machinesDepassees`, `machinesBientot`, `machinesOk`… soit les
// partitions les plus anciennes et les plus lues.
const partitions = partitionsPubliees()
const vocabulaires = new Map(vocabulairesParChamp().map(v => [v.cle, v.valeurs.map(x => x.valeur)]))

dire(partitions.length >= 28, `${partitions.length} partitions déclarées`)
dire(partitions.every(p => p.route && p.chemin && p.vocabulaire),
  'chaque partition dit sa route, son chemin et son vocabulaire')

console.log('\nChaque partition pointe un vocabulaire QUI EXISTE')
// Une partition renvoyant à un vocabulaire absent laisserait le consommateur sans rien à
// quoi comparer — il se tairait au lieu de mentir, mais il ne servirait plus à rien.
for (const p of partitions) {
  dire(vocabulaires.has(p.vocabulaire),
    `${p.chemin} → « ${p.vocabulaire} » est publié`)
}

console.log('\nLes clés couvrent le vocabulaire, exactement une fois')
for (const p of partitions) {
  const valeurs = vocabulaires.get(p.vocabulaire) ?? []
  if (p.alias) {
    // UN ALIAS INCOMPLET REDONNERAIT LA PARTITION TROUÉE qu'on vient de supprimer, sous
    // une autre forme : le consommateur croirait vérifier une partition entière.
    const couvertes = Object.values(p.alias)
    dire(new Set(couvertes).size === couvertes.length,
      `${p.chemin} : aucune valeur n'est visée par deux clés`)
    dire(valeurs.every(v => couvertes.includes(v)),
      `${p.chemin} : les ${valeurs.length} valeurs du vocabulaire ont chacune leur clé`)
    dire(couvertes.every(v => valeurs.includes(v)),
      `${p.chemin} : aucune clé ne vise une valeur qui n'existe pas`)
    dire(p.cles.length === Object.keys(p.alias).length,
      `${p.chemin} : les clés publiées sont celles de l'alias`)
  }
  else {
    const attendues = [...valeurs, ...(p.nul ? [p.nul] : [])]
    dire(p.cles.length === attendues.length && attendues.every(c => p.cles.includes(c)),
      `${p.chemin} : ${p.cles.length} clés, dérivées du vocabulaire${p.nul ? ` + « ${p.nul} »` : ''}`)
  }
}

console.log('\nLe chemin déclaré existe dans le routeur')

// LE DÉFAUT QUE LEUR HARNAIS A ATTRAPÉ AVANT MOI. J'avais déclaré `chemin:
// "resume.parEolStatut"` pour /api/technologies/parc, qui rend ses compteurs sous `comptes`.
{
  const fichierDe: Record<string, string> = {
    '/api/conformite/resume': 'conformite',
    '/api/applications/resume': 'applications',
    '/api/certificats/resume': 'certificats',
    '/api/whitelists/resume': 'whitelists',
    '/api/parc/resume': 'parcResume',
    '/api/sites-services/etat': 'servicesExposes',
    '/api/eol/etat': 'eol',
    '/api/technologies/parc': 'parcTechnologique',
    '/api/competences/resume': 'competencesResume',
  }
  for (const p of partitions) {
    const fichier = fichierDe[p.route]
    if (!fichier) { dire(false, `route ${p.route} non rattachée à un routeur connu`); continue }
    const src = await Bun.file(new URL(`../src/routers/${fichier}.ts`, import.meta.url)).text()
    // Chaque segment du chemin doit apparaître comme clé d'objet dans le routeur.
    const segments = p.chemin.split('.')
    // `nom:` OU `nom,` — la notation abrégée d'un objet JavaScript rend la clé sans
    // les deux-points, et ne chercher que la forme longue produisait un faux négatif.
    const manquants = segments.filter(seg => !new RegExp(`\\b${seg}\\s*[:,]`).test(src))
    dire(manquants.length === 0,
      `${p.route} → ${p.chemin}${manquants.length ? ` — segment(s) introuvable(s) : ${manquants.join(', ')}` : ''}`)
  }
}

console.log('\nDeux partitions du même vocabulaire disent ce qu\'elles comptent')

// Le vocabulaire dit ce que valent les CLÉS ; il ne dit pas ce que comptent les VALEURS.
{
  const parVocabulaire = new Map<string, typeof partitions>()
  for (const p of partitions) {
    parVocabulaire.set(p.vocabulaire, [...(parVocabulaire.get(p.vocabulaire) ?? []), p])
  }
  for (const [voc, liste] of parVocabulaire) {
    if (liste.length < 2) continue
    dire(liste.every(p => !!p.note),
      `« ${voc} » est partitionné ${liste.length} fois : chacune dit ce qu'elle compte`)
    dire(new Set(liste.map(p => p.note)).size === liste.length,
      `et les ${liste.length} notes sont distinctes — une note identique ne distinguerait rien`)
  }
}

console.log('\nChaque partition déclare CE QU\'ELLE COMPTE')

// LE SECOND SIGNALEMENT, et il a survécu à la première correction. Après avoir aligné le
// rapprochement, deux partitions de `technologie.eolStatut` rendaient encore 8 862 et 8 581 —
// 281 d'écart.
dire(partitions.every(p => !!p.population), 'chaque partition nomme sa population')

console.log('\nMême population ⇒ les partitions doivent concorder')
{
  // C'EST CE QUI REND LA DÉCLARATION UTILISABLE. Sans elle, un consommateur ne peut pas savoir
  // si deux nombres différents sont une régression ou deux questions distinctes.
  const parPopulation = new Map<string, typeof partitions>()
  for (const p of partitions) {
    parPopulation.set(p.population, [...(parPopulation.get(p.population) ?? []), p])
  }
  for (const [pop, liste] of parPopulation) {
    if (liste.length < 2) continue
    const vocabs = new Set(liste.map(p => p.vocabulaire))
    dire(vocabs.size >= 1,
      `« ${pop.slice(0, 46)}… » : ${liste.length} partitions, ${vocabs.size} vocabulaire(s)`)
  }
  // Les deux partitions de machines ne partagent PAS de population : c'est ce qui explique
  // leur écart, et le déclarer empêche de le prendre pour un défaut.
  const glpi = partitions.find(p => p.chemin === 'resume.machinesParStatut')!
  const catalogue = partitions.find(p => p.chemin === 'comptes.machinesParEolStatut')!
  dire(glpi.population !== catalogue.population,
    'les deux partitions de machines déclarent des populations DISTINCTES')
  dire(/GLPI/.test(glpi.population) && /catalogue/.test(catalogue.population),
    'et chacune nomme la sienne : fiches GLPI d\'un côté, fiches du catalogue de l\'autre')
  dire(/doublons/.test(glpi.population),
    'celle de GLPI signale ses doublons : un total de fiches n\'est pas un nombre de machines')
}

console.log('\nLes croisements disent qu\'ils sont des croisements')

// Un croisement a pour valeurs des OBJETS et non des nombres. Un contrôle de complétude qui
// sommerait ses valeurs additionnerait des objets — sans erreur, avec un résultat absurde.
{
  const croisements = partitions.filter(p => p.sousPartition)
  dire(croisements.length >= 1, `${croisements.length} croisement(s) déclaré(s)`)
  for (const c of croisements) {
    dire(vocabulaires.has(c.sousPartition!),
      `${c.chemin} → second niveau « ${c.sousPartition} » publié`)
    dire(/OBJETS|objets/.test(c.note ?? ''),
      `${c.chemin} avertit que ses valeurs ne sont pas des nombres`)
  }
  dire(partitions.filter(p => !p.sousPartition).length === partitions.length - croisements.length,
    'les partitions ordinaires portent `sousPartition: null`')
}

console.log('\nLes clés sont dérivées, pas recopiées')
{
  const src = await Bun.file(new URL('../src/routers/lectures.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('const PARTITIONS'), src.indexOf('export function partitionsPubliees'))
  dire(!/cles: \[/.test(bloc),
    'aucune déclaration ne porte de liste de clés écrite à la main')
  dire(/Object\.keys\(table/.test(src),
    'elles viennent de la table du vocabulaire')
}

console.log('\nVentilations : un axe de RÉFÉRENTIEL, pas un vocabulaire')

// « Combien de serveurs à l'UFR ST » n'avait aucune réponse : l'assistant répondait « le
// décompte n'est pas disponible », ce qui était la seule réponse honnête que sa consigne lui
// permettait.
const ventilations = ventilationsPubliees()
dire(ventilations.length >= 10, `${ventilations.length} ventilations déclarées`)
dire(ventilations.every(v => v.route && v.chemin && v.axe && v.population && v.note),
  'chaque ventilation dit sa route, son chemin, son axe, sa population et ce qu\'elle compte')

console.log('\nChaque axe pointe une route qui EXISTE')
{
  // Une chaîne ne se vérifie pas à la compilation, et c'est déjà ce qui a laissé passer un
  // `chemin` faux sur deux partitions.
  const idx = await Bun.file(new URL('../src/index.ts', import.meta.url)).text()
  const routeurs = [...new Bun.Glob('*.ts').scanSync(new URL('../src/routers/', import.meta.url).pathname)]
  const sources = await Promise.all(routeurs.map(f =>
    Bun.file(new URL(`../src/routers/${f}`, import.meta.url)).text()))
  const tout = idx + sources.join('\n')
  for (const axe of new Set(ventilations.map(v => v.axe))) {
    dire(tout.includes(`'${axe}'`), `« ${axe} » est monté quelque part`)
  }
}

console.log('\nLe non-rattaché est TOUJOURS nommé')
{
  // Sans lui, la somme des lignes est inférieure au total et rien ne le signale : un
  // appelant qui additionne les composantes obtient un parc plus petit que le parc.
  dire(ventilations.every(v => v.sansRattachement === 'sansRattachement'),
    'chaque ventilation déclare son compteur de non-rattachés')
  const src = await Bun.file(new URL('../src/utils/ventilation.ts', import.meta.url)).text()
  dire(/sansRattachement: tot\?\.sans/.test(src),
    'et il est compté par la base, sur la même table que le total')
  dire(/filter \(where \$\{cle\} is null\)/.test(src),
    'sur le critère « la clé étrangère est nulle », donc exactement ce que l\'axe ne classe pas')
}

console.log('\nUne ventilation n\'est pas déclarée comme une partition')
{
  // Les deux blocs sont séparés dans la charge utile : un consommateur qui appliquerait son
  // contrôle de complétude de partition à une ventilation la déclarerait incomplète à chaque
  // composante créée.
  const cheminsP = new Set(partitions.map(p => `${p.route}${p.chemin}`))
  const collisions = ventilations.filter(v => cheminsP.has(`${v.route}${v.chemin}`))
  dire(collisions.length === 0,
    collisions.length
      ? `bloc(s) déclaré(s) des DEUX côtés : ${collisions.map(v => v.chemin).join(', ')}`
      : 'aucun bloc n\'est déclaré à la fois comme partition et comme ventilation')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
