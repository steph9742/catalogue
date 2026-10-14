// VÉRIFICATION — `v-for` combiné à `v-else` sur le même élément.
//
// À lancer : bun run apps/app/test/verif-directives-vue.ts
//
// POURQUOI CE CONTRÔLE EXISTE. Une chaîne écrite ainsi :
//
//     <p v-if="…">…</p>
//     <div v-for="x in liste" v-else>…</div>
//
// est invalide en Vue 3 : la branche « sinon » devient une LISTE là où le compilateur
// attend un nœud unique. Le rendu serveur et le rendu client divergent alors, l'hydratation
// échoue sur un « e.hasAttribute is not a function » parfaitement opaque, et toute la page
// perd son interactivité — un volet entier s'affiche vide sans le moindre message d'erreur
// visible pour l'utilisateur.
//
// Ce défaut a coûté plusieurs allers-retours de diagnostic : la base contenait les données,
// l'API les renvoyait, le serveur était à jour. Rien ne pointait vers le gabarit.
//
// eslint ne l'attrape PAS : `vue/no-use-v-if-with-v-for` ne couvre que `v-if`, pas `v-else`.
// D'où ce contrôle, volontairement minimal — il ne cherche que cette faute-là.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RACINE = new URL('../app', import.meta.url).pathname

function fichiersVue(dossier: string): string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) return fichiersVue(chemin)
    return chemin.endsWith('.vue') ? [chemin] : []
  })
}

const fautifs: { fichier: string, balise: string }[] = []
for (const fichier of fichiersVue(RACINE)) {
  const source = readFileSync(fichier, 'utf8')
  // Balises ouvrantes, attributs multilignes compris.
  for (const m of source.matchAll(/<[a-zA-Z][^>]*?>/gs)) {
    const balise = m[0]
    if (/\bv-for\b/.test(balise) && /\bv-else(-if)?\b/.test(balise)) {
      fautifs.push({ fichier: fichier.replace(RACINE, 'app'), balise: balise.replace(/\s+/g, ' ').slice(0, 70) })
    }
  }
}

if (fautifs.length) {
  console.log(`✗ ${fautifs.length} élément(s) portant à la fois v-for et v-else :\n`)
  for (const f of fautifs) console.log(`  ${f.fichier}\n    ${f.balise}…\n`)
  console.log('Enveloppez la liste dans <template v-else> plutôt que de porter la directive')
  console.log('sur l\'élément répété.')
  process.exit(1)
}
console.log('✓ aucun v-for combiné à v-else')
