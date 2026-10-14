// FILTRES DÉCLARÉS — ce que le Catalogue accepte, dit à l'appelant. LE DÉFAUT ÉTAIT L'INVERSE
// DE L'HABITUEL.
import { filtresPublies } from '../src/routers/lectures'
import { CATALOGUES_GENERIQUES } from '../src/utils/cataloguesGeneriques'
import { filtresDe } from '../src/utils/resumeGenerique'
import { serveur } from '@catalogue/database/tables'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nLe registre ne diverge pas de ce qui est monté')

// LE CONTRÔLE QUI JUSTIFIE L'EXTRACTION. La liste des catalogues vit désormais à deux endroits
// : `cataloguesGeneriques.ts`, que lit /api/lectures, et le tableau CRUD d'`index.ts`, qui
// monte les routes.
{
  const idx = await Bun.file(new URL('../src/index.ts', import.meta.url)).text()
  const bloc = idx.slice(idx.indexOf('const CRUD:'), idx.indexOf('for (const c of CRUD)'))
  const montes = [...bloc.matchAll(/name: '([a-z0-9-]+)', prefix: '([^']+)'/g)]
    .map(m => `${m[1]}|${m[2]}`)
  const declares = CATALOGUES_GENERIQUES.map(c => `${c.name}|${c.prefix}`)

  dire(montes.length === declares.length,
    `${montes.length} catalogues montés, ${declares.length} déclarés`)
  const manquants = montes.filter(m => !declares.includes(m))
  dire(manquants.length === 0,
    manquants.length ? `monté(s) mais non déclaré(s) : ${manquants.join(', ')}` : 'aucun catalogue monté sans déclaration')
  const fantomes = declares.filter(d => !montes.includes(d))
  dire(fantomes.length === 0,
    fantomes.length ? `déclaré(s) mais non monté(s) : ${fantomes.join(', ')}` : 'aucun catalogue déclaré sans montage')
}

console.log('\nLa liste des filtres EST la liste des colonnes')
{
  const src = await Bun.file(new URL('../src/routers/crud.ts', import.meta.url)).text()
  // `critereDe` accepte toute colonne de la table : c'est ce qui rend la déclaration
  // exhaustive par construction, et non par vigilance.
  dire(/if \(reserved\.has\(k\) \|\| raw == null \|\| !cols\[k\]\) continue/.test(src),
    'critereDe accepte toute colonne de la table, et rien d\'autre')
  dire(/inArray\(col, values/.test(src),
    'et plusieurs valeurs séparées par des virgules se combinent en OU')

  const filtres = filtresDe(serveur as never)
  dire(filtres.some(f => f.champ === 'composanteId' && f.nature === 'referentiel'),
    'une clé étrangère est déclarée comme axe de référentiel')
  dire(filtres.find(f => f.champ === 'composanteId')?.axe === '/api/composantes',
    'et elle dit où retrouver l\'identifiant depuis un libellé')
  dire(filtres.some(f => f.champ === 'statut' && f.nature === 'vocabulaire' && (f.valeurs?.length ?? 0) > 0),
    'une énumération est déclarée avec ses valeurs')
}

console.log('\nTous les catalogues sont couverts')
{
  const publies = filtresPublies()
  dire(publies.length === CATALOGUES_GENERIQUES.length,
    `${publies.length} catalogues publient leurs filtres`)
  dire(publies.every(c => c.filtres.length > 0),
    'aucun catalogue ne publie une liste de filtres vide')
  dire(publies.every(c => c.prefix.startsWith('/api/')),
    'chaque catalogue publie le préfixe à appeler')
}

console.log('\nLe croisement est expliqué, et la faute nommée')
{
  const src = await Bun.file(new URL('../src/routers/lectures.ts', import.meta.url)).text()
  dire(/commentCroiser/.test(src), 'la marche à suivre pour croiser deux axes est publiée')
  // Multiplier deux proportions donnerait un nombre plausible et faux : la part des
  // serveurs en production diffère d'une composante à l'autre.
  dire(/neJamaisFaire/.test(src) && /Multiplier deux proportions/.test(src),
    'et la déduction interdite est nommée explicitement')
  dire(/IDENTIFIANT, pas un libellé/.test(src),
    'un axe de référentiel attend un identifiant, pas « UFR ST » — c\'est dit')
}

console.log('\nAucune route de résumé n\'en masque une autre')

// LA RÉGRESSION QUE CE CONTRÔLE AURAIT VUE. `/api/competences` est à la fois un catalogue
// générique et le préfixe d'un routeur dédié qui sert `/resume`.
{
  const routeurs = [...new Bun.Glob('*.ts').scanSync(new URL('../src/routers/', import.meta.url).pathname)]
  const dedies: Array<{ fichier: string, prefix: string }> = []
  for (const f of routeurs) {
    if (f === 'crud.ts') continue
    const src = await Bun.file(new URL(`../src/routers/${f}`, import.meta.url)).text()
    if (!/\.get\('\/resume'/.test(src)) continue
    const m = src.match(/prefix: '(\/api\/[a-z0-9-]+)'/)
    if (m) dedies.push({ fichier: f, prefix: m[1]! })
  }
  dire(dedies.length > 0, `${dedies.length} routeur(s) dédié(s) servent un /resume`)

  const idx = await Bun.file(new URL('../src/index.ts', import.meta.url)).text()
  const bloc = idx.slice(idx.indexOf('const CRUD:'), idx.indexOf('for (const c of CRUD)'))

  for (const d of dedies) {
    const entree = bloc.split('\n').find(l => l.includes(`prefix: '${d.prefix}'`))
    if (!entree) {
      dire(true, `${d.prefix} n'est pas un catalogue générique : aucune collision possible`)
      continue
    }
    // Le catalogue existe des DEUX côtés : il DOIT se retirer du résumé générique.
    dire(/sansResumeGenerique: true/.test(entree),
      `${d.prefix} est générique ET dédié — il déclare \`sansResumeGenerique\``)
  }
}

console.log('\nL\'exclusion ne monte RIEN, elle ne monte pas un refus')
{
  const src = await Bun.file(new URL('../src/routers/crud.ts', import.meta.url)).text()
  // PREMIÈRE VERSION DE CE CORRECTIF, ET ELLE ÉTAIT PIRE QUE LE BUG. Elle montait la route avec
  // un 404 dans le corps.
  dire(/\?\s*new Elysia\(\{ name: `\$\{name\}-sans-resume` \}\)/.test(src),
    'quand l\'exclusion joue, un greffon VIDE est monté : le chemin n\'est pas réservé')
  dire(!/sansResumeGenerique[\s\S]{0,200}status\(404/.test(src),
    'et aucun 404 n\'est monté sur ce chemin, ce qui masquerait la route dédiée')
}

console.log('\nL\'écran n\'offre aucun filtre que le serveur refuserait')

// LA TROISIÈME LISTE. Le serveur dérive ses filtres des colonnes ; l'écran, lui, DÉCLARE les
// siens dans `apps/app/app/utils/catalogues.ts`.
{
  const src = await Bun.file(new URL('../../app/app/utils/catalogues.ts', import.meta.url)).text()
  const bornes = [...src.matchAll(/key: '([a-z0-9-]+)', endpoint: '([a-z0-9-]+)'/g)]
  let examines = 0
  const fautifs: string[] = []
  for (let i = 0; i < bornes.length; i++) {
    const nom = bornes[i]![1]!
    const bloc = src.slice(bornes[i]!.index!, bornes[i + 1]?.index ?? src.length)
    const cat = CATALOGUES_GENERIQUES.find(c => c.name === nom)
    if (!cat) continue
    const cols = bloc.slice(0, bloc.indexOf('fields:') > 0 ? bloc.indexOf('fields:') : undefined)
    const offerts = [...cols.matchAll(/key: '(\w+)', label: '[^']*', options:/g)].map(x => x[1]!)
    if (!offerts.length) continue
    examines++
    const accepte = new Set(filtresDe(cat.table).map(f => f.champ))
    const fantomes = offerts.filter(k => !accepte.has(k))
    if (fantomes.length) fautifs.push(`${nom} (${fantomes.join(', ')})`)
  }
  dire(examines >= 40, `${examines} catalogues déclarent des filtres à l'écran`)
  dire(fautifs.length === 0,
    fautifs.length
      ? `filtre(s) d'écran que le serveur ignorerait en silence : ${fautifs.join(' · ')}`
      : 'aucun filtre d\'écran n\'est refusé par le serveur')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
