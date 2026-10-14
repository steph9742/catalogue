// COMPARAISON DE VERSIONS ET ÉTAT DE MISE À JOUR. `1.41.9` contre `1.41.10` : une comparaison
// de chaînes conclut que la première est la plus grande, parce que « 9 » suit « 1 » dans
// l'ordre lexical.
import { ETATS_MISE_A_JOUR, comparerVersions, etatDuService, etatMiseAJour } from '../src/utils/versions'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nLe piège lexical')
dire(comparerVersions('1.41.9', '1.41.10') === -1, '1.41.9 < 1.41.10 — et non l\'inverse')
dire(comparerVersions('1.9', '1.10') === -1, '1.9 < 1.10')
dire(comparerVersions('2.4.58', '2.4.9') === 1, '2.4.58 > 2.4.9')

console.log('\nSegments absents et préfixes')
dire(comparerVersions('1.41', '1.41.0') === 0, '1.41 et 1.41.0 sont la même version')
dire(comparerVersions('v6.4.2', '6.4.2') === 0, 'le préfixe « v » est ignoré')
dire(comparerVersions('6.4.2', '6.4.2') === 0, 'égalité')

console.log('\nVersions datées, comme DokuWiki')
dire(comparerVersions('2024-02-06a', '2024-02-06b') === -1, '2024-02-06a < 2024-02-06b')
dire(comparerVersions('2023-04-04', '2024-02-06') === -1, '2023 < 2024')

console.log('\nCe qui ne se compare pas ne se compare PAS')
// Inventer un ordre entre « 1.41.rc1 » et « 1.41.2 » donnerait un état faux. Ne rien
// conclure est la seule réponse honnête, et elle remonte en `version_inconnue`.
dire(comparerVersions('1.41.rc1', '1.41.2') === null, 'un segment textuel face à un numérique : null')
dire(comparerVersions('', '1.0') === null, 'une version vide : null')

console.log('\nLes quatre états')
dire(ETATS_MISE_A_JOUR.length === 4, `${ETATS_MISE_A_JOUR.length} états`)
dire(etatMiseAJour('1.41.9', '1.41.9', true) === 'a_jour', 'dernière de la branche, branche maintenue → à jour')
dire(etatMiseAJour('1.41.3', '1.41.9', true) === 'correctif_disponible', 'en retard sur sa branche → correctif disponible')

console.log('\nLa branche close prime sur tout le reste')

// Sur une branche qui ne reçoit plus rien, être à jour ne veut rien dire, et afficher
// « correctif disponible » enverrait appliquer une mise à jour qui n'existe pas.
dire(etatMiseAJour('1.39.0', '1.39.9', false) === 'non_maintenue',
  'en retard MAIS branche close → non maintenue, pas « correctif disponible »')
dire(etatMiseAJour('1.39.9', '1.39.9', false) === 'non_maintenue',
  'à jour MAIS branche close → non maintenue quand même')

console.log('\nL\'inconnu n\'est jamais « à jour »')
for (const [installee, ref, cas] of [
  [null, '1.41.9', 'version installée inconnue'],
  ['1.41.9', null, 'version de référence inconnue'],
  ['1.41.rc1', '1.41.2', 'comparaison impossible'],
] as const) {
  dire(etatMiseAJour(installee, ref, true) === 'version_inconnue', `${cas} → version inconnue`)
}
dire(etatMiseAJour(null, null, null) === 'version_inconnue', 'rien de connu → version inconnue')

console.log('\nAgrégation : le pire l\'emporte, l\'inconnu ne compte pas comme bon')
{
  dire(etatDuService(['a_jour', 'a_jour']).etat === 'a_jour', 'tout à jour → à jour')
  dire(etatDuService(['a_jour', 'correctif_disponible']).etat === 'correctif_disponible',
    'un correctif en attente suffit à faire basculer le service')
  dire(etatDuService(['correctif_disponible', 'non_maintenue']).etat === 'non_maintenue',
    'une branche close prime sur un correctif')
  dire(etatDuService(['a_jour', 'version_inconnue']).etat === 'version_inconnue',
    'un inconnu empêche d\'annoncer « à jour »')

  // LE CAS QUI JUSTIFIE LE DÉNOMBREMENT. Aucune technologie détectée n'est pas un service
  // sain : c'est un service dont on ne sait rien, et les deux se ressemblent à l'écran.
  const vide = etatDuService([])
  dire(vide.etat === 'version_inconnue', 'aucune technologie détectée → version inconnue')
  dire(vide.surTechnologies === 0, 'et le dénombrement le dit : zéro technologie')
  dire(etatDuService(['a_jour', 'a_jour']).surTechnologies === 2,
    'le dénombrement accompagne toujours l\'état — « à jour sur 2 technologies » n\'est pas « à jour »')
}

console.log('\nLe MÉLANGE se distingue de l\'ignorance complète')
{
  // « Version inconnue » sur un service dont deux technologies sur trois sont à jour est
  // exact et inexploitable : on ne sait pas si l'on ignore tout ou presque rien.
  const melange = etatDuService(['a_jour', 'a_jour', 'version_inconnue'])
  dire(melange.etat === 'version_inconnue', 'la règle ne faiblit pas : on ne peut pas dire « à jour »')
  dire(melange.partiel, 'mais `partiel` dit qu\'une partie est vérifiée')
  dire(melange.verifiees === 2 && melange.surTechnologies === 3, '2 vérifiées sur 3')

  const rien = etatDuService(['version_inconnue', 'version_inconnue'])
  dire(!rien.partiel, 'tout inconnu → pas partiel, on ignore réellement tout')

  // Si une technologie appelle un correctif, c'est CELA qu'il faut lire — pas la
  // couverture de la vérification.
  const actionnable = etatDuService(['correctif_disponible', 'version_inconnue'])
  dire(actionnable.etat === 'correctif_disponible' && !actionnable.partiel,
    'un état actionnable prime, et n\'est pas marqué partiel')
}

console.log('\nL\'ordre des tests est figé')
{
  const src = await Bun.file(new URL('../src/utils/versions.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('export function etatMiseAJour'))
  dire(bloc.indexOf("'non_maintenue'") < bloc.indexOf("'version_inconnue'"),
    'la branche close est tranchée avant l\'absence de version')
  dire(bloc.indexOf("'version_inconnue'") < bloc.indexOf("'correctif_disponible'"),
    'et l\'absence de version avant le retard de correctif')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
