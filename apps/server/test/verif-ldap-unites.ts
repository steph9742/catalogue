// EXTRACTION DES CODES D'UNITÉ — sur les valeurs RÉELLES de l'annuaire. Aucune n'est inventée,
// et c'est ce qui fait leur intérêt — la documentation de l'annuaire annonce « UMR6213 UTINAM:
// Univers, transport, interface… », l'annuaire rend « 6213 Univers, théorie, interfaces,
// nanostructures…
import {
  codeComposante, codeUniteRecherche, composanteDuService, composantePrincipale,
  decomposerService, intituleUniteRecherche, mfaActif, natureDuService, prefixeAffectation, sigleUniteRecherche,
} from '../src/utils/ldapUnites'
import { normaliserUrlLdap } from '../src/utils/ldapClient'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nLes trois préfixes désignent la MÊME composante')
// Les traiter comme distincts couperait chaque composante en deux ou trois lignes
// portant chacune une fraction du total — le défaut corrigé côté Sniff.
for (const p of ['cmpi', 'cmpa', 'cmpg'])
  dire(codeComposante(`${p}-901`) === '901', `${p}-901 → 901`)
dire(codeComposante('CMPA-902') === '902', 'la casse ne change rien')
dire(codeComposante('901') === '901', 'le code nu de ufcCodeComposanteAff passe tel quel')
dire(codeComposante('UFC') === 'UFC', '« UFC » désigne l\'établissement et reste un code')

console.log('\nCe qui n\'est PAS une composante ne rend pas de code')
// `sitea-BES` est un site, `cge-B01` un centre de gestion, `edo-38` une école doctorale.
// Leur inventer un code de composante rattacherait des personnes n'importe où.
for (const v of ['sitea-BES', 'cge-B01', 'edo-38', 'cmpz-901', 'cmpa-9012', '', '  '])
  dire(codeComposante(v) === null, `« ${v || '(vide)'} » ne rend rien`)

console.log('\nLe préfixe est CONSERVÉ, jamais traduit')
dire(prefixeAffectation('cmpi-901') === 'cmpi', 'cmpi est rendu tel quel')
dire(prefixeAffectation('CMPG-903') === 'cmpg', 'ramené en minuscules, sans être interprété')
dire(prefixeAffectation('901') === null, 'un code nu n\'a pas de préfixe')

console.log('\nLes codes d\'unité de recherche, tels que l\'annuaire les rend')
const REELS: Array<[string, string | null]> = [
  ['6174 FEMTO Institut l\'établissement électronique mécanique thermique et optique', '6174'],
  ['24547 Laboratoire de recherches Soins Intégrés, Nanomédecine, IA et Ingénierie Santé', '24547'],
  ['0481 NEUROSCIENCES Laboratoire de neurosciences intégratives et cliniques', '0481'],
  ['EA4267 Sciences séparatives, biologiques et pharmaceutiques (2SBP)', 'EA4267'],
  ['1347JD Personnels de recherche', '1347JD'],
  ['6213 Univers, théorie, interfaces, nanostructures, atmosphère, molécules', '6213'],
  // Sans code : fourre-tout, unité hors nomenclature, et deux entrées de TEST en production.
  ['AUT Autre structure recherche', null],
  ['CEROU Centre d\'études et de recherches olympiques universitaires', null],
  ['Ancien labo test', null],
  ['Unité de recherche labo test', null],
]
for (const [v, attendu] of REELS)
  dire(codeUniteRecherche(v) === attendu, `${attendu ?? 'aucun code'} ← ${v.slice(0, 46)}`)

console.log('\nUn zéro initial n\'est pas décoratif')
// `0481` et `481` désigneraient deux unités si le code était lu comme un nombre.
dire(codeUniteRecherche('0481 NEUROSCIENCES …') !== codeUniteRecherche('481 …'),
  '0481 et 481 restent deux codes distincts')

console.log('\nLA TABULATION EN TÊTE — une vraie valeur de l\'annuaire')
// Sans la coupe, « 4661 » devient une seconde unité à côté de la première : 94 personnes
// d'un côté, 1 de l'autre, pour un seul laboratoire.
{
  const avec = '\t4661 ELLIADD Édition, langages, littératures, informatique, arts'
  const sans = '4661 ELLIADD Édition, langages, littératures, informatique, arts'
  dire(codeUniteRecherche(avec) === '4661', 'la valeur commençant par une tabulation rend bien 4661')
  dire(codeUniteRecherche(avec) === codeUniteRecherche(sans),
    'et rejoint l\'autre écriture au lieu de créer une seconde unité')
}

console.log('\nDEUX ÉCRITURES, UN SEUL CODE')
// 63 personnes avec le sigle, 1 sans. Grouper sur l'intitulé donnerait deux laboratoires.
dire(codeUniteRecherche('3225 CRJFC Centre de recherches juridiques de l\'université de l\'établissement')
  === codeUniteRecherche('3225 Centre de recherches juridiques de l\'université de l\'établissement'),
'les deux écritures du 3225 se rejoignent sur le code')

console.log('\nLe sigle ne se devine PAS quand il n\'y en a pas')
dire(sigleUniteRecherche('6249 CHRONO Laboratoire chrono-environnement') === 'CHRONO',
  'CHRONO est lu comme sigle')
dire(sigleUniteRecherche('3124 MSHE Maison des sciences de l\'homme') === 'MSHE', 'MSHE aussi')
// LE PIÈGE : le mot en capitales EST l'intitulé, et la virgule collée le trahit.
dire(sigleUniteRecherche('4662 NANOMEDECINE, imagerie, thérapeutique') === null,
  '« NANOMEDECINE, » n\'est pas un sigle — la ponctuation collée le dit')
dire(sigleUniteRecherche('6623 Laboratoire de mathématiques') === null,
  'un intitulé qui commence par un mot ordinaire n\'a pas de sigle')
dire(sigleUniteRecherche('6213 Univers, théorie, interfaces') === null,
  'le 6213 n\'a pas de sigle dans l\'annuaire, contrairement à la documentation')

console.log('\nL\'intitulé se sépare du code et du sigle')
dire(intituleUniteRecherche('6249 CHRONO Laboratoire chrono-environnement') === 'Laboratoire chrono-environnement',
  'le code et le sigle sont retirés')
dire(intituleUniteRecherche('6623 Laboratoire de mathématiques') === 'Laboratoire de mathématiques',
  'sans sigle, seul le code part')

console.log('\nufcCodeService porte la composante, pas le service')
dire(composanteDuService('921-21SIG') === '921', '921-21SIG rend 921')
dire(composanteDuService('DSI - Informatique de gestion') === null,
  'un libellé de service ne rend aucun code — ufcService a deux sens selon les fiches')

console.log('\nLa composante principale : le code direct l\'emporte')
{
  const p = composantePrincipale
  dire(p('cmpa-902', ['cmpi-901'], '903') === '903',
    'ufcCodeComposanteAff prime sur les entités d\'affectation')
  dire(p('cmpa-902', ['cmpi-901'], null) === '902',
    'à défaut, l\'affectation PRINCIPALE prime sur les autres')
  // La première valeur n'est pas forcément une composante : `sitea-BES` est un site.
  dire(p(null, ['sitea-BES', 'cge-B01', 'cmpa-905'], null) === '905',
    'on saute les valeurs qui ne sont pas des composantes')
  dire(p(null, ['sitea-BES'], null) === null,
    'aucune composante trouvée ne rend rien — jamais une valeur par défaut')
}

console.log('\nDEUX ÉCRITURES, UN SEUL DÉPARTEMENT')
{
  // Relevé réel : l'annuaire porte les deux formes pour la même unité. Ne chercher «
  // Département » qu'en tête donnait « Département maieutique » et « maieutique » — deux
  // sous-unités, chacune portant une part des personnes.
  const COMPS = ['UFR Sciences de la santé', 'UFR ST', 'IUT NFC']
  const a1 = decomposerService('UFR Sciences de la santé Département maieutique', COMPS)
  const a2 = decomposerService('UFR Sciences de la santé maieutique', COMPS)

  dire(a1.composante === a2.composante, 'les deux écritures désignent la même composante')
  dire(a1.unite === a2.unite && a1.unite === 'maieutique',
    `les deux rendent la même unité — « ${a1.unite} » et « ${a2.unite} »`)
  dire(a1.nature === 'departement', 'et « Département » au milieu donne bien la nature département')

  // Les autres écritures du même mot, telles que GLPI et l'annuaire les emploient.
  for (const forme of ['Dept-INFO', 'Dpt INFO', 'Departement INFO', 'Département INFO'])
    dire(decomposerService(`UFR ST ${forme}`, COMPS).unite === 'INFO',
      `« ${forme} » rend l'unité « INFO »`)

  // LA COMPOSANTE SEULE reste sans nature : rien à créer, la personne y est rattachée.
  dire(decomposerService('UFR ST', COMPS).nature === null,
    'un libellé qui ne nomme que la composante n\'a pas de nature')
}

console.log('\nufcService porte TROIS choses, et une seule se reconnaît')
// Valeurs réelles de l'annuaire. Seul le département se lit dans l'intitulé ; un service
// et un site s'écrivent pareil, et la table de correspondance passe devant.
dire(natureDuService('Département IUT NFC Métiers du multimédia et de l\'internet') === 'departement',
  'un intitulé commençant par « Département » est un département')
dire(natureDuService('département de chimie') === 'departement', 'la casse et l\'accent ne changent rien')
dire(natureDuService('DSI - Informatique de gestion') === 'service', 'un service reste un service')
dire(natureDuService('SSE Santé étudiante site Besançon') === 'service',
  'un SITE part en service faute de signe distinctif — la table tranche, pas le libellé')
dire(natureDuService(null) === null && natureDuService('  ') === null,
  'un attribut absent ne rend aucune nature')
// « Départemental » n'est pas « Département » : la limite de mot évite de ranger en
// département un service dont l'intitulé commence par un adjectif.
dire(natureDuService('Départemental quelque chose') === 'service',
  'la limite de mot empêche « départemental » de passer pour un département')

console.log('\nLa MFA se lit sur la PRÉSENCE, jamais sur le contenu')
dire(mfaActif(['secours@exemple.fr']) === true, 'une adresse de recours signifie MFA activée')
dire(mfaActif([]) === false, 'un attribut présent mais vide signifie MFA non activée')
dire(mfaActif(['  ']) === false, 'une valeur blanche ne compte pas comme une activation')
// LE PIÈGE : `undefined` = l'attribut n'a pas été rendu. Le compter comme `false`
// annoncerait un trou de couverture là où il n'y a qu'une absence d'information.
dire(mfaActif(undefined) === null, 'un attribut ABSENT rend null, jamais false')

console.log('\nL\'adresse du serveur : compléter ce qui est évident, refuser ce qui ne l\'est pas')
{
  const u = (s2: string) => normaliserUrlLdap(s2).url
  dire(u('ldaps.example.org') === 'ldaps://ldaps.example.org',
    'un nom d\'hôte nu est complété — une seule lecture possible')
  dire(u('ldaps.example.org:636') === 'ldaps://ldaps.example.org:636', 'le port est conservé')
  dire(u('ldaps://ldaps.example.org/') === 'ldaps://ldaps.example.org', 'la barre finale est retirée')
  dire(u('LDAPS://X.FR') === 'LDAPS://X.FR', 'un schéma déjà correct passe tel quel')
  dire(normaliserUrlLdap('ldap://x.fr').avertissement !== null,
    'ldap:// est accepté MAIS signalé : le mot de passe y circule en clair')
  dire(normaliserUrlLdap('ldaps://x.fr').avertissement === null, 'ldaps:// ne déclenche aucun avertissement')

  // UN SCHÉMA EXPLICITE ET FAUX NE SE CORRIGE PAS EN SILENCE. « https » peut désigner un
  // mandataire, et réécrire ce que quelqu'un a tapé sans le dire fait chercher ailleurs.
  const refus = (s2: string) => {
    try { normaliserUrlLdap(s2); return null }
    catch (e) { return e instanceof Error ? e.message : String(e) }
  }
  const m = refus('https://ldaps.example.org')
  dire(m !== null, 'https:// est refusé plutôt que réécrit')
  dire(!!m?.includes('ldaps://ldaps.example.org'),
    'et le message donne l\'adresse exacte à saisir, pas seulement le reproche')
  dire(refus('') !== null, 'une adresse vide est refusée')
}

console.log('\nDécomposer un libellé de service — sur les vraies valeurs de l\'annuaire')
{
  // Les intitulés de composante tels que la table de correspondance les porte.
  const COMPS = ['UFR ST', 'UFR STGI', 'UFR SJEPG', 'UFR Sciences de la santé', 'IUT BV', 'IUT NFC', 'OSU']
  const d = (l: string | null) => decomposerService(l, COMPS)

  dire(d('Département IUT BV Gestion des entreprises et des administrations').nature === 'departement',
    '« Département … » donne la nature département')
  dire(d('Département IUT BV Gestion des entreprises et des administrations').composante === 'IUT BV',
    'et la composante IUT BV est reconnue')
  dire(d('Département IUT BV Gestion des entreprises et des administrations').unite === 'Gestion des entreprises et des administrations',
    'le mot « Département » ne fait pas partie du nom de l\'unité')

  dire(d('UFR STGI Service appui à la recherche site Belfort').nature === 'service', 'sans préfixe, c\'est un service')
  dire(d('UFR STGI Service appui à la recherche site Belfort').unite === 'Service appui à la recherche site Belfort',
    'le nom de l\'unité est ce qui suit la composante')

  // LE PIÈGE DU PRÉFIXE : « UFR ST » est un préfixe de « UFR STGI ». Sans essai du plus
  // long au plus court, tout le STGI serait rangé sous l'UFR ST.
  dire(d('UFR STGI Service appui à la recherche site Belfort').composante === 'UFR STGI',
    'UFR STGI l\'emporte sur UFR ST — le préfixe le plus long gagne')
  dire(d('UFR Sciences de la santé Service animalerie').composante === 'UFR Sciences de la santé',
    'et « UFR Sciences de la santé » sur « UFR S… »')

  // LA COMPOSANTE SEULE n'est pas un échec : c'est une personne sans sous-unité.
  dire(d('UFR ST').composante === 'UFR ST' && d('UFR ST').unite === null,
    '« UFR ST » seul rend la composante et aucune unité')

  // Ce que l'annuaire porte et qui n'est pas à nous : aucune composante reconnue, donc
  // aucun rattachement inventé.
  dire(d('UBFC Dijon').composante === null, '« UBFC Dijon » ne se rattache à aucune de nos composantes')
  dire(d('Uo générique').composante === null, '« Uo générique » non plus')
  dire(d('').nature === null && d(null).composante === null, 'un libellé vide ne rend rien')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
