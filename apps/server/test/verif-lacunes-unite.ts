// LACUNES — l'unité de `combien`, et pourquoi elle doit être déclarée. Sur `parc` un nombre de
// fiches, sur `connecteurs` un nombre de jours — et leur affichage rendait « 34 » comme un
// nombre de machines.
import { UNITES_LACUNE } from '../src/routers/lacunes'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const src = await Bun.file(new URL('../src/routers/lacunes.ts', import.meta.url)).text()

console.log('\nTrois unités, déclarées')
dire(UNITES_LACUNE.length === 3, `${UNITES_LACUNE.length} unités`)
for (const u of ['fiches', 'jours', 'presence']) {
  dire((UNITES_LACUNE as readonly string[]).includes(u), `« ${u} » est déclarée`)
}

console.log('\nCHAQUE lacune déclare son unité')

// LE CONTRÔLE QUI FERME LA CLASSE. Le type l'exige déjà — une lacune sans `unite` ne compile
// pas — mais ce contrôle vérifie qu'aucune ne l'obtient par un défaut ou un cast.
{
  const declarations = [...src.matchAll(/combien: [^,\n]+,/g)].length
  const unites = [...src.matchAll(/unite: '(\w+)'/g)].map(m => m[1]!)
  dire(unites.length >= declarations,
    `${unites.length} unités pour ${declarations} déclarations de \`combien\``)
  for (const u of unites) {
    dire((UNITES_LACUNE as readonly string[]).includes(u), `« ${u} » est une unité déclarée`)
  }
  dire(!/combien: [^,\n]+, sur:/.test(src),
    'aucune déclaration ne passe de `combien` à `sur` sans dire son unité')
}

console.log('\n`sur` n\'a de sens que sur des fiches')
// Un dénominateur sur un délai — « 34 jours sur 8800 » — n'a pas de référent. Le type ne
// peut pas l'interdire ; ce contrôle si.
{
  // Uniquement les LITTÉRAUX — la ligne du type porte aussi « unite: », et la compter
  // ferait rougir ce contrôle sur la déclaration qu'il protège.
  const lignes = src.split('\n').filter(l => l.includes('unite:') && l.includes('combien:'))
  const fautives = lignes.filter(l => !l.includes("unite: 'fiches'") && !/sur: null/.test(l))
  dire(fautives.length === 0,
    `aucune lacune non-\`fiches\` ne porte de dénominateur (${fautives.length} écart(s))`)
}

console.log('\nLa fraîcheur porte une DATE, pas seulement un délai')

// LA MEILLEURE MOITIÉ DU CORRECTIF, et elle vient d'eux : une date ne peut pas être confondue
// avec un décompte, un délai logé dans `combien` le pouvait.
dire(/unite: 'jours'[\s\S]{0,120}depuis: dernier\.toISOString\(\)/.test(src)
  || /depuis: dernier\.toISOString\(\)/.test(src),
'la lacune de péremption rend la date de dernière collecte')
dire(/connecteur_\$\{nom\}_jamais[\s\S]{0,300}depuis: null/.test(src),
  'et « jamais tourné » rend `depuis: null`, qui n\'est pas une date ancienne')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
