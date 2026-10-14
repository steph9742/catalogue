// COMMENT LIRE LES RÉPONSES — le contrôle qui empêche cette liste de devenir décorative.
import { certificatStatut, edrMoteur, whitelistCertitude, whitelistSource } from '@catalogue/database/tables'
import { MOTIFS_SANS_ECHEANCE } from '../src/utils/whitelistsEcheance'
import { DOMAINES_LACUNES } from '../src/routers/lacunes'
import { libelleOs, vocabulairesParChamp } from '../src/routers/lectures'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const source = await Bun.file(new URL('../src/routers/lectures.ts', import.meta.url)).text()
const bloc = source.slice(source.indexOf('const LECTURES'), source.indexOf('export const lecturesRouter'))
const entrees = [...bloc.matchAll(/cle: '([^']+)'/g)].map(m => m[1]!)

console.log('\nPas de champ de localisation')
// Une première version portait `route`. L'énumérer refabriquait le défaut qu'on venait de
// supprimer : un champ transverse ne serait documenté que là où l'on a pensé.
const blocLectures = source.slice(source.indexOf('const LECTURES'), source.indexOf('// --- Vocabulaires'))
dire(!/^\s+(route|ou):/m.test(blocLectures),
  'aucune LECTURE ne porte de champ `route` ou `ou` : la mise en garde porte sur un CHAMP')

console.log('\nLa limite de la garantie est déclarée')
// Une garantie annoncée sans sa limite est pire qu'aucune garantie : on cesse de vérifier.
dire(source.includes('vocabulairesFermes'), 'les vocabulaires fermés sont annoncés comme exhaustifs')
dire(source.includes('champsAmbigus'), 'les champs ambigus sont annoncés comme NON exhaustifs')
dire(/champsAmbigus:[\s\S]{0,120}exhaustif: false/.test(source),
  'et cet aveu est explicite : rien ne relie un champ nouvellement ajouté à cette liste')

console.log('\nComplétude des entrées')
dire(entrees.length >= 15, `${entrees.length} lectures déclarées`)
dire(new Set(entrees).size === entrees.length, 'aucune clé en double')

// Les six champs demandés par les consommateurs. Une entrée amputée est inexploitable :
// « ne signifie pas » sans « où corriger » se lit et ne change rien.
for (const champ of ['champ:', 'valeur:', 'signifie:', 'neSignifiePas:', 'consequence:', 'ouCorriger:']) {
  const n = [...bloc.matchAll(new RegExp(`\\b${champ}`, 'g'))].length
  dire(n >= entrees.length, `chaque entrée porte « ${champ.replace(':', '')} » (${n}/${entrees.length})`)
}

console.log('\nVocabulaires fermés : chaque valeur porte SA LECTURE')

// LE POINT DU LOT, et la version précédente ne le tenait pas. Rendre `enumValues` gardait la
// LISTE à jour, pas sa LECTURE : ajouter une valeur la faisait apparaître sans que rien
// n'oblige à écrire ce qu'elle signifie.
const tables = source.slice(source.indexOf('const SANS_ECHEANCE'), source.indexOf('export const lecturesRouter'))
const bloc2 = source.slice(source.indexOf('const VOCABULAIRES'), source.indexOf('export const lecturesRouter'))
for (const [nom, table] of [
  ['whitelist.sansEcheance', 'SANS_ECHEANCE'],
  ['certificat.dernierStatut', 'STATUT_CERTIFICAT'],
  ['edr.moteur', 'MOTEUR_EDR'],
  ['whitelist.source', 'SOURCE_WHITELIST'],
  ['whitelist.certitudeRapprochement', 'CERTITUDE_RAPPROCHEMENT'],
  ['lacunes.domaine', 'DOMAINE_LACUNE'],
  ['lacunes.unite', 'UNITE_LACUNE'],
  ['application.etatRgpd', 'ETAT_RGPD'],
  ['technologie.eolStatut', 'STATUT_EOL'],
  ['competence.niveau', 'NIVEAU_COMPETENCE'],
  ['competence.etat', 'ETAT_COMPETENCE'],
  ['entiteNis2.statut', 'REGIME_NIS2'],
  ['nis2.conformite', 'CONFORMITE_NIS2'],
  ['iso27001.conformite', 'CONFORMITE_ISO27001'],
  ['rgpd.conformite', 'CONFORMITE_RGPD'],
  ['nis2.statut', 'STATUT_NIS2'],
] as const) {
  dire(bloc2.includes(`'${nom}': ${table}`), `« ${nom} » est servi par ${table}`)
}

// Chaque table doit être typée PAR l'énumération, sinon la garantie n'existe pas : un
// `Record<string, string>` accepterait n'importe quoi et ne signalerait aucun oubli.
for (const t of ['MOTIFS_SANS_ECHEANCE[number]', 'certificatStatut.enumValues[number]',
  'edrMoteur.enumValues[number]', 'whitelistSource.enumValues[number]',
  'whitelistCertitude.enumValues[number]', 'DOMAINES_LACUNES[number]', 'UNITES_LACUNE[number]', 'ETATS_RGPD[number]', 'STATUTS_EOL[number]', 'competenceNiveau.enumValues[number]',
  'ETATS_COMPETENCE[number]', 'nis2StatutEntite.enumValues[number]', 'nis2Conformite.enumValues[number]',
  'iso27001Conformite.enumValues[number]', 'rgpdConformite.enumValues[number]',
  'nis2Statut.enumValues[number]', 'serviceType.enumValues[number]',
  'ETATS_MISE_A_JOUR[number]', 'detectionCertitude.enumValues[number]']) {
  dire(source.includes(`Vocabulaire<typeof ${t}>`),
    `la table de ${t.split('.')[0]} est typée par son énumération`)
}
// Le contrôle porte sur les DÉCLARATIONS de vocabulaire, pas sur tout le fichier : la lecture
// générique de `partitionsPubliees` traverse légitimement un `Record<string, Record<string,
// string>>` pour retrouver une table par sa clé.
{
  const literales = [...source.matchAll(/const (\w+): Vocabulaire<string> = (\w+)/g)]
  for (const [, nom, source_] of literales) {
    dire(/^PERIMETRE_/.test(source_!),
      `${nom} est dérivé de ${source_}, pas écrit à la main`)
  }
  dire(!/: Vocabulaire<string> = \{/.test(source),
    'aucune table typée `string` n\'est écrite littéralement')
  // Et la complétude est vérifiée à l'exécution, puisque le compilateur ne peut plus.
  const familles = vocabulairesParChamp().find(v => v.cle === 'eol.famille')!
  dire(familles.valeurs.every(v => v.signifie.length > 40),
    `les ${familles.valeurs.length} familles ont chacune un périmètre substantiel`)
  const groupes = vocabulairesParChamp().find(v => v.cle === 'eol.groupe')!
  dire(groupes.valeurs.every(v => v.signifie.length > 20),
    `les ${groupes.valeurs.length} groupes énumèrent les familles qu'ils contiennent`)
}

console.log('\nLes lectures couvrent bien toutes les valeurs')
dire(edrMoteur.enumValues.every(v => tables.includes(`  ${v}:`)),
  `les ${edrMoteur.enumValues.length} moteurs ont chacun leur lecture`)
dire(certificatStatut.enumValues.every(v => tables.includes(`  ${v}:`)),
  `les ${certificatStatut.enumValues.length} statuts de certificat ont chacun leur lecture`)
dire(MOTIFS_SANS_ECHEANCE.every(v => tables.includes(`  ${v}:`)),
  `les ${MOTIFS_SANS_ECHEANCE.length} motifs d'absence d'échéance ont chacun leur lecture`)
dire(whitelistSource.enumValues.every(v => tables.includes(`  ${v}:`)), 'les trois sources aussi')
dire(whitelistCertitude.enumValues.every(v => tables.includes(`  ${v}:`)), 'les deux certitudes aussi')
dire(DOMAINES_LACUNES.every(v => tables.includes(`'${v}':`)), 'les neuf domaines aussi')

console.log('\nChaque vocabulaire dit SUR QUEL CHAMP il s\'applique')

// LE POINT DU LOT. Un vocabulaire fermé rend un contrôle de fraîcheur gratuit : une valeur
// absente ne peut signifier qu'une chose, le catalogue du lecteur est périmé.
const parChamp = vocabulairesParChamp()

// Le nombre est DÉRIVÉ de la déclaration : l'écrire en dur ferait rougir ce contrôle à
// chaque vocabulaire ajouté, et le réflexe serait d'incrémenter le chiffre sans regarder.
const declares = [...source.slice(source.indexOf('const VOCABULAIRES = {'),
  source.indexOf('} as const', source.indexOf('const VOCABULAIRES = {')))
  .matchAll(/^ {2}'([^']+)':/gm)].map(m => m[1]!)
dire(parChamp.length === declares.length,
  `${parChamp.length} vocabulaires rendus, autant que déclarés`)
dire(declares.every(c => parChamp.some(v => v.cle === c)),
  'chaque vocabulaire déclaré est effectivement rendu')
dire(parChamp.every(v => typeof v.champ === 'string' && v.champ.length > 0),
  'chaque entrée porte le nom du champ JSON, pas seulement le nom du vocabulaire')
dire(parChamp.every(v => !v.champ.includes('.')),
  'le champ est le nom nu : la partie « entité » du nom de vocabulaire est retirée')
dire(parChamp.every(v => 'cle' in v && 'champ' in v),
  '`cle` et `champ` : même forme que `lectures`, donc un seul chemin de lecture')

// Chaque entrée doit rendre ses valeurs AVEC leur lecture, sinon le contrôle de fraîcheur
// n'a rien à quoi se comparer.
dire(parChamp.every(v => v.valeurs.length > 0 && v.valeurs.every(x => x.valeur && x.signifie)),
  'chaque valeur est rendue avec sa lecture')

const par = (cle: string) => parChamp.find(v => v.cle === cle)!

console.log('\nLes champs sans ambiguïté portent le contrôle')
for (const [cle, champ] of [
  ['whitelist.sansEcheance', 'sansEcheance'],
  ['whitelist.certitudeRapprochement', 'certitudeRapprochement'],
  ['edr.moteur', 'moteur'],
  ['lacunes.domaine', 'domaine'],
] as const) {
  dire(par(cle).champ === champ && par(cle).applicable === true,
    `« ${cle} » → \`${champ}\`, contrôle applicable sur le nom seul`)
}

console.log('\nLes homonymes l\'éteignent, et disent à quelle condition')

// LE FAUX POSITIF QU'ON ÉVITE. `source` est un vocabulaire fermé sur les listes blanches, un
// AUTRE vocabulaire fermé sur les certificats, et du TEXTE LIBRE sur /api/referentiels,
// /api/eol, /api/conformite, /api/incidents et /api/reseau.
for (const cle of ['whitelist.source', 'certificat.dernierStatut'] as const) {
  const v = par(cle)
  dire(v.applicable === false, `« ${cle} » : le nom de champ ne suffit pas`)
  dire(!!v.ailleurs && !!v.discriminer,
    `« ${cle} » dit où le nom est repris et à quelle condition le contrôle vaut`)
}
dire(par('whitelist.source').ailleurs!.includes('referentiels'),
  'le cas du texte libre est nommé, pas laissé à deviner')

console.log('\nLa collision entre deux vocabulaires fermés est CALCULÉE')

// Ce qui est déclaré à la main se périme ; ce qui est calculé, non. Deux vocabulaires déclarés
// demain sur le même nom de champ éteignent `applicable` sans que personne y pense.
{
  const parNom = new Map<string, string[]>()
  for (const v of parChamp) parNom.set(v.champ, [...(parNom.get(v.champ) ?? []), v.cle])
  // ÉCRIT SUR LA PROPRIÉTÉ. La version précédente affirmait « aucune collision aujourd'hui » —
  // un état, pas une règle.
  const collisions = [...parNom.entries()].filter(([, l]) => l.length > 1)
  for (const [champ, cles] of collisions) {
    const concernes = parChamp.filter(v => v.champ === champ)
    dire(concernes.every(v => !v.applicable),
      `« ${champ} » est porté par ${cles.length} vocabulaires : le contrôle est éteint sur tous`)
    dire(concernes.every(v => !!v.discriminer),
      `« ${champ} » dit à quelle condition chacun s'applique`)
  }
  const src = await Bun.file(new URL('../src/routers/lectures.ts', import.meta.url)).text()
  dire(/partage\.length === 0/.test(src),
    'et cette extinction est CALCULÉE, pas déclarée entrée par entrée')
}

console.log('\nUn même vocabulaire sur plusieurs champs ne crée pas d\'ambiguïté')
// `domaine` est aussi porté par trois tableaux de /api/lacunes. Mêmes valeurs, autre
// contenant : le contrôle reste applicable, et les emplacements sont rendus.
dire(par('lacunes.domaine').aussi?.includes('domainesConnus[]') === true,
  'les tableaux de domaines de /api/lacunes sont rendus dans `aussi`')
dire(par('lacunes.domaine').applicable === true,
  'et cela n\'éteint pas le contrôle : ce sont les mêmes valeurs')

console.log('\nLa limite du contrôle de fraîcheur est écrite dans la garantie')
dire(source.includes('controleDeFraicheur'),
  'la garantie dit ce qu\'une valeur inconnue signifie, et à quelle condition')

console.log('\nLe couple non_evalue / ecart est publié, pas laissé à déduire')

// Elle a écrit qu'elles s'effaceraient le jour où le Catalogue publierait sa propre lecture du
// couple.
{
  const etat = parChamp.find(v => v.cle === 'application.etatRgpd')!
  dire(etat.champ === 'etatRgpd' && etat.applicable, '`etatRgpd` porte le contrôle de fraîcheur')
  dire(etat.aussi?.some(a => a.includes('?etatRgpd=')) === true,
    'le vocabulaire dit qu\'il ferme AUSSI la valeur du paramètre de requête')
  const nonEval = etat.valeurs.find(v => v.valeur === 'non_evalue')!
  dire(/pas un manquement|PAS un manquement/i.test(nonEval.signifie),
    '`non_evalue` dit explicitement qu\'il n\'est pas un manquement')
  dire(etat.valeurs.some(v => v.valeur === 'hors_perimetre'
    && /ni.*ni|aucun des deux/i.test(v.signifie)),
  '`hors_perimetre` dit qu\'il n\'entre dans aucun des deux décomptes')
}

console.log('\nChamps calculés : où le contrat peut mentir sans qu\'on s\'en aperçoive')

// Un champ calculé existe, se lit, et ne se compte pas forcément. Rien dans une réponse ne
// distingue un champ porté par une colonne d'un champ posé après coup, et c'est en produisant
// une réponse fausse qu'on découvre la différence.
{
  const bloc = source.slice(source.indexOf('const CHAMPS_CALCULES'), source.indexOf('export const lecturesRouter'))
  const entrees = [...bloc.matchAll(/^ {4}champs: \[([^\]]+)\]/gm)].map(m => m[1]!)
  const champs = entrees.flatMap(e => [...e.matchAll(/'([^']+)'/g)].map(m => m[1]!))
  dire(entrees.length >= 5, `${entrees.length} champs calculés recensés`)

  // APPARIEMENT AUTOMATIQUE. Un nom composé — « a, b, c » — ne correspondrait à aucun champ
  // JSON et la garde ne se déclencherait jamais : un contrôle qui ne peut pas s'exécuter est
  // pire qu'un contrôle absent, il se compte comme fait.
  dire(champs.every(c => !c.includes(',') && !c.includes(' ')),
    'chaque nom est un identifiant JSON isolé, appariable tel quel')
  dire(new Set(champs).size === champs.length, 'aucun nom de champ en double entre les entrées')

  for (const c of ['etatRgpd', 'eolStatut']) {
    dire(champs.some(x => x.includes(c)), `« ${c} » est recensé`)
  }
  dire(champs.some(x => x.includes('incidentOuvert')), '« incidentOuvert » est recensé')

  // Les trois colonnes qui font l'intérêt du tableau. Sans `filtrable` et `compte`, il
  // redevient une liste de champs — ce que /openapi rend déjà.
  for (const cle of ['porte:', 'calcule:', 'filtrable:', 'compte:', 'piege:']) {
    const n = [...bloc.matchAll(new RegExp(`^ {4}${cle.replace(':', ':')}`, 'gm'))].length
    dire(n >= entrees.length, `chaque entrée porte « ${cle.replace(':', '')} » (${n}/${entrees.length})`)
  }

  // LE CAS QUI JUSTIFIE LA COLONNE. `incidentOuvert` ne se filtre pas ET ne se compte nulle
  // part : c'est le seul champ de la liste dont les deux colonnes valent false, et c'est
  // délibéré — un miroir des incidents serait une troisième copie.
  dire(/incidentOuvert[\s\S]{0,400}compte: false/.test(bloc),
    '`incidentOuvert` déclare qu\'aucun décompte n\'existe, plutôt que de laisser chercher')
  // Les deux colonnes sont INDÉPENDANTES : `filtrable` et `compte` se déclarent séparément, et
  // une entrée peut être vraie sur l'une et fausse sur l'autre.
  const valeursFiltrable = new Set([...bloc.matchAll(/^ {4}filtrable: (.+),$/gm)].map(m => m[1]!))
  const valeursCompte = new Set([...bloc.matchAll(/^ {4}compte: (.+),$/gm)].map(m => m[1]!))
  dire(valeursFiltrable.has('false') && valeursFiltrable.size > 1,
    '`filtrable` prend les deux formes : false, ou la manière de filtrer')
  dire(valeursCompte.has('false') && valeursCompte.size > 1,
    '`compte` prend les deux formes : false, ou la route qui rend le décompte')
}

console.log('\nCouverture des pièges les plus coûteux')
// Chacun a été constaté en exploitation, et chacun produisait une réponse fausse et
// rassurante — le seul type d'erreur qu'on ne rattrape pas en aval.
for (const cle of [
  'donnees-personnelles-non-tranche',
  'agent-edr-inconnu',
  'conformite-non-evaluee',
  'premier-releve-moteurs',
  'compteur-depose',
  'codes-de-reponse',
  'source-hors-portee',
  'application-rgpd-non-evaluee',
  'eol-statut-non-evalue',
  'depasses-minorant',
  'combien-sans-unite',
  'service-jamais-scanne',
  'technologies-non-detectees',
  'etat-service-sur-technologies',
  'incident-ouvert-non-filtrable',
]) {
  dire(entrees.includes(cle), `« ${cle} » est couvert`)
}

console.log('\nLE VOCABULAIRE DE SNIFF : relayé, pas recopié')
{
  for (const cle of ['resolution-absente', 'resolution-risque-assume']) {
    dire(entrees.includes(cle), `« ${cle} » est documentée, avec la même clé que chez Sniff`)
  }
  dire(/relaiSniff\(\)/.test(source), 'les mises en garde de Sniff sont relayées en direct depuis leur point d\'entrée')
  dire(/lues: false, motif/.test(source), 'et une lecture impossible est DITE : « Sniff ne dit rien » n\'est pas « nous n\'avons pas pu lire »')
  const croisement = await Bun.file(new URL('../src/routers/incidentsCroises.ts', import.meta.url)).text()
  dire(/motifClotureSoc\(i\)/.test(croisement), 'le motif brut de clôture du SOC accompagne la résolution')
  // Ce que le Catalogue ne doit SURTOUT pas faire : conclure à partir de la résolution.
  const serveur = await Bun.file(new URL('../src/routers/incidentsCroises.ts', import.meta.url)).text()
  dire(!/resolution\s*===\s*'(true_positive|false_positive|risk_accepted)'/.test(serveur),
    'aucun comptage ne classe les incidents d\'après leur résolution')
}

console.log('\nLibellés courts — la réciproque de ce que Sniff publie')
// `signifie` explique une valeur ; il ne tient pas dans une pastille. Sans libellé publié,
// chaque lecteur écrit le sien : c'est arrivé sur notre propre page des incidents, où deux
// libellés de résolution avaient été DEVINÉS et quatre valeurs n'étaient pas couvertes.
const vocabulaires = vocabulairesParChamp()
const valeurs = vocabulaires.flatMap(v => v.valeurs.map(x => ({ ...x, cle: v.cle })))
dire(valeurs.length > 0 && valeurs.every(v => typeof v.libelle === 'string' && v.libelle.trim() !== ''),
  `les ${valeurs.length} valeurs des vocabulaires fermés portent toutes un libellé`)
const longs = valeurs.filter(v => v.libelle.length > 32)
dire(longs.length === 0,
  `aucun libellé ne dépasse 32 caractères${longs.length ? ` (${longs.map(v => `${v.cle}.${v.valeur}`).join(', ')})` : ''}`)
dire(valeurs.every(v => v.libelle !== v.signifie && !v.libelle.endsWith('.')),
  'aucun libellé n\'est la phrase de `signifie` recopiée : ce sont deux usages distincts')
// Un libellé identique à la valeur brute n'étiquette rien — c'est le symptôme d'une table
// remplie machinalement, et le lecteur affiche alors `non_maintenue` à l'écran.
dire(valeurs.every(v => v.libelle !== v.valeur),
  'aucun libellé ne se contente de répéter la valeur technique')

// Les familles de systèmes ne sont pas une énumération écrite mais le produit des règles de
// classement : leur libellé est DÉRIVÉ, sinon une famille ajoutée demain n'en aurait pas.
const derives: [string, string][] = [
  ['windows_server_2019', 'Windows Server 2019'],
  ['ubuntu_24_04', 'Ubuntu 24.04'],
  ['rhel_9', 'RHEL 9'],
  ['macos', 'macOS'],
  ['linux_autre', 'Linux (autres versions)'],
  ['autre', 'Autre'],
]
for (const [cle, attendu] of derives) {
  dire(libelleOs(cle) === attendu, `« ${cle} » se lit « ${attendu} » (obtenu : « ${libelleOs(cle)} »)`)
}

console.log('\nLe Catalogue ne tient aucune copie des libellés de Sniff')
// La page des incidents en avait trois, dont deux devinés. Les valeurs de `resolution` sont
// définies chez Sniff : leur libellé y est défini aussi, et se relaie.
const pageIncidents = await Bun.file(new URL('../../app/app/pages/incidents.vue', import.meta.url)).text()
dire(!/(true_positive|false_positive|risk_accepted|benign|legitimate|duplicate)\s*:\s*'/.test(pageIncidents),
  'aucune table de libellés de résolution ne subsiste dans la page des incidents')
dire(/\.libelle/.test(pageIncidents), 'la page lit le `libelle` relayé par Sniff')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
