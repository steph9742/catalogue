// VÉRIFICATION — aucun composable Nuxt appelé APRÈS un `await`, hors `<script setup>`.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Racine à inspecter : le dossier `app` de ce dépôt par défaut, ou celui passé en
// argument — le même piège existe dans Sniff, qui partage ce squelette Nuxt.
const APP = process.argv[2] ?? new URL('../app', import.meta.url).pathname

function parcourir(dossier: string, suffixe: string): string[] {
  return readdirSync(dossier).flatMap((e) => {
    const chemin = join(dossier, e)
    if (statSync(chemin).isDirectory()) return parcourir(chemin, suffixe)
    return chemin.endsWith(suffixe) ? [chemin] : []
  })
}

// Composables sensibles au contexte. `useApi` et les utilitaires maison qui n'appellent
// rien de Nuxt directement ne sont pas concernés — on vise ceux du cœur.
const SENSIBLES = /\b(useAsyncData|useFetch|useLazyAsyncData|useLazyFetch|useNuxtApp|useState|useRoute|useRouter|useRuntimeConfig|useHead|useSeoMeta|useCookie|useRequestHeaders)\s*\(/

const fautes: { fichier: string, ligne: number, extrait: string }[] = []

// On n'inspecte QUE les fichiers `.ts` : dans un `.vue`, les `await` de premier niveau du
// `<script setup>` sont réécrits par le compilateur et ne posent pas ce problème.
for (const fichier of parcourir(join(APP, 'composables'), '.ts').concat(parcourir(join(APP, 'utils'), '.ts'))) {
  const source = readFileSync(fichier, 'utf8')
  const lignes = source.split('\n')

  // Dès qu'un `await` a été franchi, tout appel de composable sensible est signalé.
  let apresAwait = false
  let dansExpressionAttendue = false
  let parentheses = 0

  lignes.forEach((ligne, i) => {
    const code = ligne.replace(/\/\/.*$/, '')

    if (apresAwait && !dansExpressionAttendue && SENSIBLES.test(code)) {
      fautes.push({ fichier: fichier.slice(APP.length + 1), ligne: i + 1, extrait: ligne.trim().slice(0, 100) })
    }

    if (/\bawait\b/.test(code)) {
      dansExpressionAttendue = true
      parentheses = 0
    }
    if (dansExpressionAttendue) {
      parentheses += (code.match(/[([{]/g) ?? []).length - (code.match(/[)\]}]/g) ?? []).length
      if (parentheses <= 0) {
        dansExpressionAttendue = false
        apresAwait = true
      }
    }
  })
}

if (fautes.length) {
  console.log(`✗ ${fautes.length} composable(s) Nuxt appelé(s) après un await :\n`)
  for (const f of fautes) {
    console.log(`  ${f.fichier}:${f.ligne}`)
    console.log(`    ${f.extrait}`)
    console.log('    → lancez l\'appel AVANT le premier await (Promise.all), sinon 500 au rendu serveur\n')
  }
  process.exit(1)
}
console.log('✓ aucun composable Nuxt appelé après un await hors <script setup>')
