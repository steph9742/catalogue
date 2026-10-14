// TOUTE CATÉGORIE GARDÉE DOIT ÊTRE DÉCLARÉE. `webhooks` gardait ses routes avec `can: {
// category: 'webhooks' }` sans figurer dans la liste des catégories.
import { readFileSync } from 'node:fs'
import { CATEGORY_KEYS } from '../src/utils/categories'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const declarees = new Set<string>(CATEGORY_KEYS as readonly string[])

console.log('\nCatégories gardées par les routeurs')

// Les catalogues montés par le routeur générique : `name` sert de clé de catégorie.
const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const montes = [...index.matchAll(/\{ name: '([^']+)', prefix:/g)].map(m => m[1]!)
const orphelins = montes.filter(n => !declarees.has(n))
dire(orphelins.length === 0,
  orphelins.length ? `catalogues gardés par une catégorie NON déclarée : ${orphelins.join(', ')}` : `les ${montes.length} catalogues génériques sont tous déclarés`)

// Les routeurs dédiés qui emploient `can: { category: … }`.
const routeurs = new Bun.Glob('*.ts').scanSync({ cwd: new URL('../src/routers/', import.meta.url).pathname })
const citees = new Set<string>()
for (const f of routeurs) {
  const src = readFileSync(new URL(`../src/routers/${f}`, import.meta.url), 'utf8')
  for (const m of src.matchAll(/can: \{ category: '([^']+)'/g)) citees.add(m[1]!)
}
const inconnues = [...citees].filter(c => !declarees.has(c))
dire(inconnues.length === 0,
  inconnues.length ? `catégories citées par un routeur mais non déclarées : ${inconnues.join(', ')}` : `les ${citees.size} catégories citées par les routeurs dédiés sont déclarées`)

console.log('\nLe cas qui a motivé ce contrôle')
dire(declarees.has('webhooks'), '« webhooks » est déclarée : une clé `read` ne se voit plus refuser en 403')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
