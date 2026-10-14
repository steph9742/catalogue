// VÉRIFICATION — tout composant maison employé dans un gabarit est-il résolvable ?
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const APP = new URL('../app', import.meta.url).pathname

function parcourir(dossier: string, suffixe: string): string[] {
  return readdirSync(dossier).flatMap((e) => {
    const chemin = join(dossier, e)
    if (statSync(chemin).isDirectory()) return parcourir(chemin, suffixe)
    return chemin.endsWith(suffixe) ? [chemin] : []
  })
}

// Noms enregistrés par Nuxt : segments de dossier en PascalCase + nom de fichier, avec
// déduplication quand le fichier reprend déjà le nom du dossier.
const pascal = (s: string) => s.replace(/(^|[-_])(\w)/g, (_, __, c: string) => c.toUpperCase())
const enregistres = new Set<string>()
for (const f of parcourir(join(APP, 'components'), '.vue')) {
  // Les suffixes `.client` et `.server` ne font pas partie du nom enregistré.
  const relatif = f.slice(join(APP, 'components').length + 1).replace(/(\.(client|server))?\.vue$/, '')
  const parties = relatif.split('/').map(pascal)
  const nom = parties.reduce((acc, p) => (acc && p.startsWith(acc) ? p : acc + p), '')
  enregistres.add(nom)
}

// Composants « maison » repérables : PascalCase, hors préfixes de bibliothèques.
// `UI` n'est pas ignoré : les composants de `@catalogue/ui` ne sont pas auto-enregistrés,
// ils s'importent. Ceux du dossier `components/` restent couverts par `enregistres`.
const IGNORES = /^(Nuxt|Icon|Transition|Teleport|KeepAlive|Suspense|Component|Template)/
const manquants: { fichier: string, composant: string }[] = []

for (const fichier of [...parcourir(join(APP, 'pages'), '.vue'), ...parcourir(join(APP, 'components'), '.vue')]) {
  const source = readFileSync(fichier, 'utf8')
  const gabarit = source.slice(source.indexOf('<template>'))
  const script = source.slice(0, source.indexOf('<template>'))
  for (const m of gabarit.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) {
    const nom = m[1]!
    if (IGNORES.test(nom)) continue
    // Importé explicitement → toujours bon.
    if (new RegExp(`\\b${nom}\\b[^\\n]*from ['"]`).test(script)) continue
    // Sinon, il doit correspondre à un nom réellement enregistré par Nuxt.
    if (enregistres.has(nom)) continue
    const rel = fichier.slice(APP.length + 1)
    if (!manquants.some(x => x.fichier === rel && x.composant === nom)) manquants.push({ fichier: rel, composant: nom })
  }
}

if (manquants.length) {
  console.log(`✗ ${manquants.length} composant(s) employé(s) sans import ni nom enregistré :\n`)
  for (const m of manquants) console.log(`  ${m.fichier}\n    <${m.composant}> — ajoutez un import explicite\n`)
  process.exit(1)
}
console.log('✓ tous les composants employés sont importés ou correctement nommés')
