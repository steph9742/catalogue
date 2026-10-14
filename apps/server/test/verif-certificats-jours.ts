// JOURS RESTANTS AVANT EXPIRATION — l'expression SQL, éprouvée hors de la base.
import { readFileSync } from 'node:fs'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const source = readFileSync(new URL('../src/routers/certificats.ts', import.meta.url), 'utf8')
const bloc = source.slice(source.indexOf('const joursSql'), source.indexOf('const LIMITE_SCAN'))

console.log('\nCalcul des jours restants')

dire(!bloc.includes('::int / 86400'),
  'la division d\'un interval par 86400 n\'est pas réintroduite — c\'était la cause de l\'échec')
dire(bloc.includes('::date - current_date'),
  'la différence porte sur des `date` : PostgreSQL rend alors un entier de jours')
dire(bloc.includes('is null then null'),
  'une date de fin absente rend `null`, et non zéro : « inconnu » n\'est pas « expire aujourd\'hui »')

// La colonne ne doit pas être stockée : elle serait fausse le lendemain du calcul.
dire(!/jours_restants/.test(readFileSync(new URL('../../../packages/database/src/schemas/certificats.ts', import.meta.url), 'utf8')),
  'les jours restants ne sont pas une colonne : ils sont calculés à la lecture')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
