// ÉTAT RGPD DES APPLICATIONS — l'expression écrite une fois, le filtre, et le refus.
import { ETATS_RGPD } from '../src/routers/rgpd'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const rgpd = await Bun.file(new URL('../src/routers/rgpd.ts', import.meta.url)).text()

console.log('\nLe vocabulaire et les branches du `case` se correspondent')

// CE CONTRÔLE PORTE SUR LA PROPRIÉTÉ, PAS SUR L'ÉTAT — et sa première version ne le faisait
// pas.
{
  const bloc = rgpd.slice(rgpd.indexOf('export function expressionEtatRgpd'))
  const corps = bloc.slice(0, bloc.indexOf('end`'))
  // `then` ET `else` : la valeur par défaut du `case` est une branche comme les autres, et ne
  // regarder que les `then` laisserait l'état de repli hors du contrôle — soit précisément
  // celui qui compte le plus, puisque c'est lui qui s'applique quand aucune condition n'est
  // remplie.
  const produites = new Set([...corps.matchAll(/(?:then|else) '(\w+)'/g)].map(m => m[1]!))
  const declarees = new Set<string>(ETATS_RGPD)

  for (const v of declarees) {
    dire(produites.has(v), `« ${v} » est déclaré ET produit par une branche`)
  }
  for (const v of produites) {
    dire(declarees.has(v), `« ${v} » est produit ET déclaré dans le vocabulaire`)
  }
  dire(produites.size === declarees.size,
    `${declarees.size} états déclarés, ${produites.size} produits : les deux ensembles coïncident`)
}

console.log('\nL\'expression est écrite UNE SEULE FOIS')

// Le `case` complet ne doit apparaître qu'une fois dans tout le serveur : partout ailleurs
// c'est `expressionEtatRgpd()` qui est appelée.
const casesEcrits = [...rgpd.matchAll(/when \$\{application\.donneesPersonnelles\} is not true/g)].length
dire(casesEcrits === 1, `le \`case\` n'est écrit qu'une fois (${casesEcrits})`)

for (const [fichier, usages] of [
  ['applications', ['expressionEtatRgpd()', 'selectionEtatRgpd()']],
  ['conformite', ['expressionEtatRgpd()']],
  ['lacunes', ['expressionEtatRgpd()']],
] as const) {
  const src = await Bun.file(new URL(`../src/routers/${fichier}.ts`, import.meta.url)).text()
  for (const u of usages) dire(src.includes(u), `${fichier} appelle ${u}`)
  dire(!/when \$\{application\.donneesPersonnelles\}/.test(src),
    `${fichier} ne garde pas sa copie du \`case\``)
}

console.log('\nL\'ordre des branches porte du sens')
// `hors_perimetre` est testé EN PREMIER : une application qui ne traite pas de données
// personnelles n'a ni écart ni conformité à évaluer.
{
  const bloc = rgpd.slice(rgpd.indexOf('export function expressionEtatRgpd'))
  const ordre = [...bloc.slice(0, bloc.indexOf('end`')).matchAll(/then '(\w+)'/g)].map(m => m[1])
  dire(ordre[0] === 'hors_perimetre', 'hors_perimetre est tranché en premier')
  dire(ordre[1] === 'ecart', 'puis ecart : un écart constaté prime sur une évaluation incomplète')
  dire(ordre.indexOf('conforme') > ordre.indexOf('ecart'),
    'conforme ne peut pas être atteint tant qu\'un écart subsiste')
}

console.log('\nUne valeur inventée est REFUSÉE, jamais ignorée')

// LE POINT 3 DE LA DEMANDE. Un filtre inconnu silencieusement écarté rendrait le catalogue
// entier avec un total exact : une réponse plausible, et fausse quant à la question posée.
{
  const src = await Bun.file(new URL('../src/routers/applications.ts', import.meta.url)).text()
  dire(/status\(422/.test(src), 'une valeur hors vocabulaire est refusée en 422')
  dire(/ETATS_RGPD.*includes\(query\.etatRgpd\)/.test(src),
    'et la validation se fait CONTRE le vocabulaire, pas contre une liste recopiée')
  dire(src.includes('ETATS_RGPD.join'),
    'le message d\'erreur énumère les valeurs acceptées : refuser sans les dire ne se corrige pas')
}

console.log('\nLe filtre et le total portent sur le MÊME critère')
{
  const src = await Bun.file(new URL('../src/routers/applications.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('const where = query.etatRgpd'), src.indexOf('}, {', src.indexOf('const where = query.etatRgpd')))
  // « les 4 applications en écart » et « la première page des applications en écart »
  // doivent être la même vérité : un total qui ignorerait le filtre les ferait diverger.
  dire((bloc.match(/\.where\(where\)/g) ?? []).length >= 2,
    'la page et le décompte partagent littéralement le même `where`')
  dire(/count\(\*\)::int`? \}\)\.from\(application\)\.where\(where\)/.test(bloc.replace(/\s+/g, ' '))
    || /from\(application\)\.where\(where\)/.test(bloc),
  'le total est compté par la base sur le filtre, jamais sur la page')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
