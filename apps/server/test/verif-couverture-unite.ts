// LA SOMME DES LIGNES FAIT LE TOTAL — sinon le détail contredit le résumé.
import { rapprocherParc, SANS_COMPOSANTE, SANS_POLE, SANS_SOUS_UNITE, ventilerCouverture, type MachineCritique, type MachineParc } from '../src/utils/couvertureParUnite'
import { rapprocher } from '../src/utils/harfanglabRapprochement'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const REFS = {
  composantes: [
    { id: 'c1', nom: 'IUT NFC', entiteId: 'e1' },
    { id: 'c2', nom: 'UFR ST', entiteId: 'e1' },
  ],
  services: [{ id: 's1', nom: 'CRI', composanteId: 'c1' }],
  departements: [{ id: 'd1', nom: 'Dept-INFO', composanteId: 'c1' }],
  poles: [{ id: 'p1', nom: 'Réseau', serviceId: 's1' }],
}
const m = (glpiId: string, entite: string | null): MachineCritique => ({ glpiId, entite })

const PARC: MachineCritique[] = [
  m('1', 'l\'établissement > IUT NFC > CRI'),
  m('2', 'l\'établissement > IUT NFC > Dept-INFO'),
  m('3', 'l\'établissement > UFR ST'),
  m('4', 'l\'établissement'), // chemin trop court : aucune composante
  m('5', null), // aucun chemin du tout
  m('6', 'l\'établissement > Composante jamais synchronisée'),
]
type Compte = { critiques: number, avecAgent: number, sansAgent: number, ambigus: number, nonCritiques: number }
const somme = (l: readonly Compte[], f: (x: Compte) => number) => l.reduce((n, x) => n + f(x), 0)

console.log('\nAucune machine ne tombe entre deux lignes')
{
  const { composantes: l } = ventilerCouverture(PARC, new Set(['3']), new Set(['2']), REFS)
  dire(somme(l, x => x.critiques) === PARC.length,
    `les ${PARC.length} machines critiques se retrouvent toutes dans les lignes`)
  dire(somme(l, x => x.avecAgent + x.sansAgent + x.ambigus) === PARC.length,
    'et chacune est dans exactement un des trois états')
}

console.log('\nCe qui n\'a pas de composante est NOMMÉ, pas écarté')
{
  const { composantes: l } = ventilerCouverture(PARC, new Set(), new Set(), REFS)
  const sans = l.find(x => x.nom === SANS_COMPOSANTE)
  // Deux machines : chemin trop court, et chemin absent. Les taire ferait une somme
  // inférieure au total sans que rien ne le signale.
  dire(sans?.critiques === 2, 'les machines sans composante forment leur propre ligne, comptée')
  dire(sans?.composanteId === null, 'et cette ligne ne prétend pas être une composante')
}

console.log('\nUne composante inconnue du catalogue garde son nom GLPI')
{
  const { composantes: l } = ventilerCouverture(PARC, new Set(), new Set(), REFS)
  const inconnue = l.find(x => x.nom === 'Composante jamais synchronisée')
  dire(!!inconnue, 'elle apparaît sous le nom que GLPI porte')
  dire(inconnue?.composanteId === null && inconnue?.entiteId === null,
    'sans identifiant inventé : elle n\'existe pas encore dans le catalogue')
}

console.log('\nUn rapprochement AMBIGU n\'est ni une couverture ni un écart')
{
  const { composantes: l } = ventilerCouverture([m('1', 'l\'établissement > IUT NFC')], new Set(), new Set(['1']), REFS)
  const iut = l.find(x => x.composanteId === 'c1')
  dire(iut?.ambigus === 1, 'il est compté comme ambigu')
  dire(iut?.avecAgent === 0 && iut?.sansAgent === 0,
    'et n\'est compté ni comme couvert ni comme découvert — une incertitude n\'est pas une mesure')
}

console.log('\nLe rapprochement de nom ignore casse et accents')
{
  const { composantes: l } = ventilerCouverture([m('1', 'l\'établissement > iut nfc')], new Set(), new Set(), REFS)
  dire(l[0]?.composanteId === 'c1', '« iut nfc » rejoint « IUT NFC » et ne crée pas une seconde ligne')
}

console.log('\nUn parc vide ne rend aucune ligne, et surtout aucun zéro rassurant')
dire(ventilerCouverture([], new Set(), new Set(), REFS).composantes.length === 0,
  'aucune machine critique ne donne aucune ligne — pas une composante affichée « 0 sans agent »')

console.log('\nLE 3e NIVEAU couvre la même population, sans en perdre ni en inventer')
{
  const { composantes, sousUnites } = ventilerCouverture(PARC, new Set(['3']), new Set(['2']), REFS)
  // LA PROPRIÉTÉ QUI COMPTE : les deux tableaux sont deux VUES de la même population. Un
  // total différent signifierait qu'une machine tombe d'un côté et pas de l'autre.
  dire(somme(sousUnites, x => x.critiques) === somme(composantes, x => x.critiques),
    'services et départements totalisent exactement autant que les composantes')
  dire(somme(sousUnites, x => x.sansAgent) === somme(composantes, x => x.sansAgent),
    'et le même nombre de machines sans agent')
}

console.log('\nLe 3e segment se range selon le RÉFÉRENTIEL, pas selon son nom')
{
  const { sousUnites } = ventilerCouverture(
    [m('1', 'l\'établissement > IUT NFC > CRI'), m('2', 'l\'établissement > IUT NFC > Dept-INFO')],
    new Set(), new Set(), REFS,
  )
  dire(sousUnites.find(x => x.id === 's1')?.niveau === 'service', '« CRI » est le service connu du catalogue')
  dire(sousUnites.find(x => x.id === 'd1')?.niveau === 'departement', '« Dept-INFO » est le département connu')
}

console.log('\nUne unité inconnue est tranchée sur le nom, comme à la synchronisation')
{
  const { sousUnites } = ventilerCouverture(
    [m('1', 'l\'établissement > UFR ST > Dept-CHIMIE'), m('2', 'l\'établissement > UFR ST > Scolarité')],
    new Set(), new Set(), REFS,
  )
  // Aucune des deux n'existe encore : c'est l'intitulé qui décide, exactement comme le
  // fait glpiSync. Deux règles différentes pour le même arbitrage se contrediraient.
  dire(sousUnites.find(x => x.nom === 'Dept-CHIMIE')?.niveau === 'departement', '« Dept-CHIMIE » part en département')
  dire(sousUnites.find(x => x.nom === 'Scolarité')?.niveau === 'service', '« Scolarité » part en service')
  dire(sousUnites.every(x => x.id === null), 'et aucune ne reçoit d\'identifiant inventé')
}

console.log('\nDeux composantes peuvent avoir un service HOMONYME')
{
  const refs = {
    ...REFS,
    services: [
      { id: 's1', nom: 'CRI', composanteId: 'c1' },
      { id: 's2', nom: 'CRI', composanteId: 'c2' },
    ],
  }
  const { sousUnites } = ventilerCouverture(
    [m('1', 'l\'établissement > IUT NFC > CRI'), m('2', 'l\'établissement > UFR ST > CRI')],
    new Set(), new Set(), refs,
  )
  // Les fondre attribuerait les machines de l'une à l'autre — un chiffre faux envoyé au
  // mauvais interlocuteur, ce qui est pire qu'une absence de chiffre.
  dire(sousUnites.length === 2, 'les deux « CRI » restent deux lignes')
  dire(sousUnites.find(x => x.id === 's1')?.critiques === 1 && sousUnites.find(x => x.id === 's2')?.critiques === 1,
    'et chacun garde sa propre machine')
}

console.log('\nUn chemin sans 3e segment est NOMMÉ, pas écarté')
{
  const { composantes, sousUnites } = ventilerCouverture([m('3', 'l\'établissement > UFR ST')], new Set(), new Set(), REFS)
  dire(sousUnites.find(x => x.nom === SANS_SOUS_UNITE)?.critiques === 1,
    'la machine rattachée à une composante seule a sa propre ligne')
  dire(somme(sousUnites, x => x.critiques) === somme(composantes, x => x.critiques),
    'et les deux niveaux restent d\'accord')
}

console.log('\nLE 4e NIVEAU — les pôles — est une TROISIÈME vue, pas une troisième population')
{
  const parc = [...PARC, m('7', 'l\'établissement > IUT NFC > CRI > Réseau'), m('8', 'l\'établissement > IUT NFC > CRI > Poste de travail')]
  const { composantes, sousUnites, poles } = ventilerCouverture(parc, new Set(['3', '7']), new Set(['2']), REFS)
  dire(somme(poles, x => x.critiques) === somme(sousUnites, x => x.critiques),
    'les pôles totalisent exactement autant que les services et départements')
  dire(somme(poles, x => x.sansAgent) === somme(composantes, x => x.sansAgent),
    'et le même nombre de machines sans agent que les composantes')
}

console.log('\nUn 4e segment déclaré rejoint SON pôle ; les autres gardent leur nom GLPI')
{
  const { poles } = ventilerCouverture(
    [m('1', 'l\'établissement > IUT NFC > CRI > Réseau'), m('2', 'l\'établissement > IUT NFC > CRI > Poste de travail')],
    new Set(), new Set(), REFS,
  )
  dire(poles.find(x => x.id === 'p1')?.nom === 'Réseau', '« Réseau » est le pôle connu du catalogue')
  const inconnu = poles.find(x => x.nom === 'Poste de travail')
  dire(inconnu?.id === null, 'le pôle absent du catalogue apparaît sans identifiant inventé')
  dire(poles.every(x => x.sousUniteId === 's1' && x.sousUniteNiveau === 'service'),
    'et les deux se rattachent au service dont la fiche les affichera')
}

console.log('\nUne machine SANS 4e segment n\'est pas prêtée à un pôle')
{
  const { poles } = ventilerCouverture(
    [m('1', 'l\'établissement > IUT NFC > CRI'), m('2', 'l\'établissement > IUT NFC > CRI > Réseau')],
    new Set(), new Set(), REFS,
  )
  // Sans cette ligne, la fiche du service annoncerait 2 machines critiques et n'en
  // détaillerait qu'une : le détail contredirait le bloc juste au-dessus.
  dire(poles.find(x => x.nom === SANS_POLE)?.critiques === 1, 'elle forme sa propre ligne, comptée')
  dire(somme(poles, x => x.critiques) === 2, 'et le détail du service totalise bien ses deux machines')
}

console.log('\nDeux services peuvent avoir un pôle HOMONYME')
{
  const refs = {
    ...REFS,
    services: [
      { id: 's1', nom: 'CRI', composanteId: 'c1' },
      { id: 's2', nom: 'CRI', composanteId: 'c2' },
    ],
    poles: [
      { id: 'p1', nom: 'Réseau', serviceId: 's1' },
      { id: 'p2', nom: 'Réseau', serviceId: 's2' },
    ],
  }
  const { poles } = ventilerCouverture(
    [m('1', 'l\'établissement > IUT NFC > CRI > Réseau'), m('2', 'l\'établissement > UFR ST > CRI > Réseau')],
    new Set(), new Set(), refs,
  )
  dire(poles.length === 2, 'les deux « Réseau » restent deux lignes')
  dire(poles.find(x => x.id === 'p1')?.critiques === 1 && poles.find(x => x.id === 'p2')?.critiques === 1,
    'et chacun garde la machine de son service')
}

console.log('\nLe 4e segment d\'un DÉPARTEMENT est nommé, jamais rattaché à un pôle')
{
  const { poles } = ventilerCouverture([m('1', 'l\'établissement > IUT NFC > Dept-INFO > Réseau')], new Set(), new Set(), REFS)
  // Un pôle appartient à un service : prêter ce « Réseau » au pôle du CRI attribuerait la
  // machine d'une unité à une autre.
  dire(poles[0]?.nom === 'Réseau' && poles[0]?.id === null, 'il garde son nom GLPI, sans identifiant')
  dire(poles[0]?.sousUniteId === 'd1' && poles[0]?.sousUniteNiveau === 'departement',
    'et se rattache au département, pas à un service')
}

console.log('\nLE PARC NON CRITIQUE se ventile à côté du critique, sans s\'y mêler')
{
  const nonCrit = [m('n1', 'l\'établissement > IUT NFC > CRI'), m('n2', 'l\'établissement > UFR ST'), m('n3', 'l\'établissement > UFR ST'), m('n4', null)]
  const { composantes, sousUnites, poles } = ventilerCouverture(PARC, new Set(['3']), new Set(['2']), REFS, {
    machines: nonCrit, avecAgent: new Set(['n1', 'n2']), ambigus: new Set(['n3']),
  })
  dire(somme(composantes, x => x.critiques) === PARC.length, 'les critiques totalisent toujours le parc critique')
  dire(somme(composantes, x => x.nonCritiques) === nonCrit.length
    && somme(sousUnites, x => x.nonCritiques) === nonCrit.length
    && somme(poles, x => x.nonCritiques) === nonCrit.length,
  'les non critiques totalisent leur parc aux trois niveaux')
  const ufr = composantes.find(x => x.composanteId === 'c2')!
  dire(ufr.nonCritiquesAvecAgent === 1 && ufr.nonCritiquesAmbigus === 1 && ufr.nonCritiquesSansAgent === 0,
    'trois états disjoints : avec agent, ambigu, sans agent')
  dire(composantes.find(x => x.nom === SANS_COMPOSANTE)!.nonCritiquesSansAgent === 1, 'une machine non critique sans chemin est nommée, pas écartée')
  // Sans le 5e argument, rien ne change : l'appel existant rend exactement les mêmes lignes.
  const avant = ventilerCouverture(PARC, new Set(['3']), new Set(['2']), REFS)
  dire(avant.composantes.every(x => x.nonCritiques === 0), 'sans parc non critique, ses compteurs restent à zéro')
}

console.log('\nLES AGENTS : cinq cases disjointes, et les chiffres critiques inchangés')
{
  const parc: MachineParc[] = [
    { glpiId: 'c1', entite: 'l\'établissement > IUT NFC > CRI', nom: 'srv-crit-1', numeroSerie: 'SERIALCRIT1', critique: true },
    { glpiId: 'c2', entite: 'l\'établissement > IUT NFC > CRI', nom: 'srv-crit-2', numeroSerie: 'SERIALCRIT2', critique: true },
    { glpiId: 'n1', entite: 'l\'établissement > IUT NFC > CRI', nom: 'pc-bureau-1', numeroSerie: 'SERIALNON1', critique: false },
    { glpiId: 'n2', entite: 'l\'établissement > UFR ST', nom: 'pc-bureau-2', numeroSerie: 'SERIALNON2', critique: false },
  ]
  const agents = [
    { cle: 'a1', hostname: 'srv-crit-1', machineSerial: 'SERIALCRIT1' },
    { cle: 'a2', hostname: 'pc-bureau-1', machineSerial: 'SERIALNON1' },
    { cle: 'a3', hostname: 'portable-perso', machineSerial: 'SERIALXYZ9' },
  ]
  const r = rapprocherParc(parc, agents)
  const a = r.agents
  dire(a.liesCritiques + a.ambigusCritiques + a.liesNonCritiques + a.ambigusNonCritiques + a.sansMachineGlpi === a.total,
    `la somme des cinq cases fait le total des agents (${a.total})`)
  dire(a.liesCritiques === 1 && a.liesNonCritiques === 1 && a.sansMachineGlpi === 1, 'un sur critique, un sur non critique, un hors GLPI')
  dire(r.agentsSansMachineGlpi.join() === 'a3', 'l\'agent hors GLPI est nommé')
  dire(r.nonCritiques.avecAgent.has('n1') && r.nonCritiques.machinesSansAgent.includes('n2'), 'le parc non critique a ses propres états')
  // LA PROPRIÉTÉ QUI PROTÈGE LES CHIFFRES PUBLIÉS : la première passe est /couverture.
  const seul = rapprocher(parc.filter(x => x.critique).map(x => ({ cle: x.glpiId, nom: x.nom, numeroSerie: x.numeroSerie })), agents)
  dire(seul.machinesSansAgent.join() === r.critiques.machinesSansAgent.join() && seul.comptes.ambigus === r.critiques.comptes.ambigus,
    'les chiffres critiques sont exactement ceux du rapprochement critique seul')
  // Un agent pris par une machine critique n'est pas offert au parc non critique.
  const doublon = rapprocherParc([...parc, { glpiId: 'n9', entite: null, nom: 'autre', numeroSerie: 'SERIALCRIT1', critique: false }], agents)
  dire(!doublon.nonCritiques.avecAgent.has('n9') && doublon.agents.liesCritiques === 1,
    'un agent déjà lié au parc critique ne couvre pas en plus une machine non critique')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
