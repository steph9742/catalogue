import { chargerCorrespondanceIso, referenceSoa } from '../src/utils/correspondanceIso'
import { chargerReferentielNis2 } from '../src/utils/referentielNis2'
import { mesuresSoa } from '../src/utils/referentiels'

const corr = chargerCorrespondanceIso()
const exigences = new Set(chargerReferentielNis2().map(e => e.reference))
const soa = new Set(mesuresSoa.map(m => m.reference))

console.log(`correspondances lues : ${corr.length}`)
console.log(`renvois totaux       : ${corr.reduce((n, c) => n + c.renvois.length, 0)}`)
const parNorme: Record<string, number> = {}
for (const c of corr) for (const r of c.renvois) parNorme[r.norme] = (parNorme[r.norme] ?? 0) + 1
console.log('par norme            :', parNorme)
console.log('niveaux              :', corr.reduce((a: Record<string, number>, c) => { const k = c.correspondance ?? 'aucun'; a[k] = (a[k] ?? 0) + 1; return a }, {}))
console.log('avec observation     :', corr.filter(c => c.observations).length)

// 1. Les références ReCyF de la table retrouvent-elles les exigences seedées ?
const orphelines = corr.map(c => c.reference).filter(r => !exigences.has(r))
console.log(`\nréférences ReCyF sans exigence correspondante : ${orphelines.length} ${orphelines.slice(0, 5)}`)

// 2. LE POINT CRITIQUE : les renvois 27002 retrouvent-ils une mesure de la SoA ?
const refs27002 = corr.flatMap(c => c.renvois.map(referenceSoa)).filter((r): r is string => !!r)
const uniques = [...new Set(refs27002)]
const introuvables = uniques.filter(r => !soa.has(r))
console.log(`renvois 27002 : ${refs27002.length} (${uniques.length} mesures distinctes)`)
console.log(`  → retrouvées dans la déclaration d'applicabilité : ${uniques.length - introuvables.length}`)
console.log(`  → INTROUVABLES : ${introuvables.length} ${introuvables.slice(0, 12)}`)
console.log(`\nmesures de la SoA jamais citées par NIS 2 : ${[...soa].filter(m => !uniques.includes(m)).length} / ${soa.size}`)
