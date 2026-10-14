// ÉCHÉANCE D'UNE LISTE BLANCHE — et surtout, pourquoi certaines n'en ont pas.
import { echeanceDeSniff, etatEcheance, estTechnique, prolongeableParCatalogue } from '../src/utils/whitelistsEcheance'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const J2020 = new Date('2020-03-01T10:00:00Z')
const J2024 = new Date('2024-06-01T10:00:00Z')

console.log('\nUne règle ordinaire : un an depuis la création, ou depuis la dernière revue')
let e = etatEcheance({ dateCreation: J2024, dateRevision: null })
dire(e.sansEcheance === null && e.echeance!.getUTCFullYear() === 2025, 'sans revue : création + 1 an')
e = etatEcheance({ dateCreation: J2020, dateRevision: new Date('2026-02-01T00:00:00Z') })
dire(e.echeance!.getUTCFullYear() === 2027, 'la revue redémarre le compteur')
e = etatEcheance({ dateCreation: J2020, dateRevision: null })
dire(!!e.echeance && e.echeance < new Date(),
  'une règle de 2020 jamais revue est ÉCHUE dès le premier inventaire — c\'est le but')

console.log('\nFournie par l\'éditeur : aucune échéance')
// Demander de justifier périodiquement le produit qu'on achète noierait ces quelques dizaines
// sous des milliers de lignes.
e = etatEcheance({ dateCreation: J2020, dateRevision: null, fourniParEditeur: true })
dire(e.echeance === null && e.sansEcheance === 'editeur',
  'une règle livrée avec le produit n\'a pas d\'échéance, et le motif est rendu')
dire(!prolongeableParCatalogue({ dateCreation: J2020, dateRevision: null, fourniParEditeur: true }),
  'et elle ne peut pas être prolongée')

console.log('\nAppariée à une exclusion : l\'autorité bascule vers Sniff')
// Sans préséance écrite, deux dates coexistent sur la même règle et aucune ne fait foi.
const dateSniff = new Date('2027-01-15T00:00:00Z')
e = etatEcheance({ dateCreation: J2020, dateRevision: new Date('2026-01-01T00:00:00Z'), echeanceSniff: dateSniff })
dire(e.echeance?.getTime() === dateSniff.getTime() && e.sansEcheance === 'portee_par_sniff',
  'l\'échéance de Sniff l\'emporte sur la révision locale, si récente soit-elle')
dire(!prolongeableParCatalogue({ dateCreation: J2020, dateRevision: null, echeanceSniff: dateSniff }),
  'et le Catalogue ne la prolonge plus : la date naît là où naît la décision')

console.log('\nDisparue de l\'EDR : l\'angle mort est refermé')
e = etatEcheance({ dateCreation: J2020, dateRevision: null, presente: false })
dire(e.echeance === null && e.sansEcheance === 'disparue',
  'une règle qui n\'est plus dans l\'outil n\'a plus rien à réexaminer')

console.log('\nSans date de création : l\'absence est DITE, jamais comblée')
// L'EDR ne rend pas toujours `creation_date`. Retomber sur la date d'import donnerait une
// échéance à la fois fausse et rassurante — exactement ce que la règle sert à éviter.
e = etatEcheance({ dateCreation: null, dateRevision: null })
dire(e.echeance === null && e.sansEcheance === 'sans_date',
  'pas de date de création, pas d\'échéance inventée depuis la date d\'import')

console.log('\nPrécédence entre motifs')
dire(etatEcheance({ dateCreation: J2020, dateRevision: null, fourniParEditeur: true, presente: false }).sansEcheance === 'editeur',
  'l\'origine éditeur prime : c\'est la raison la plus structurelle')
dire(etatEcheance({ dateCreation: J2020, dateRevision: null, presente: false, echeanceSniff: dateSniff }).sansEcheance === 'disparue',
  'une règle disparue ne se voit pas armer l\'échéance de Sniff')
dire(etatEcheance({ dateCreation: null, dateRevision: null, echeanceSniff: dateSniff }).echeance?.getTime() === dateSniff.getTime(),
  'une règle sans date de création GARDE l\'échéance de Sniff : c\'est une date, pas un calcul')

console.log('\nClassement technique — contre les marqueurs déclarés, et rien d\'autre')
// Ce chemin ne classe donc rien aujourd'hui ; il reste ouvert si l'éditeur en ajoute un, et ces
// contrôles garantissent qu'il se comportera correctement alors.
dire(estTechnique(['harfanglab_rule'], ['harfanglab_rule']), 'le marqueur déclaré classe la règle')
dire(estTechnique(['  HarfangLab_Rule  '], ['harfanglab_rule']), 'casse et espaces sont ignorés')
dire(!estTechnique(['harfanglab_rule_exception'], ['harfanglab_rule']),
  'AUCUNE correspondance partielle : un fragment ne classe pas')
dire(!estTechnique(['harfanglab_rule'], []),
  'sans marqueur déclaré, aucune règle n\'est technique — l\'état réel aujourd\'hui')
dire(!estTechnique([], ['harfanglab_rule']), 'une règle sans étiquette n\'est pas technique')

console.log('\nQUI PORTE L\'ÉCHÉANCE D\'UNE RÈGLE (arbitrage de Sniff 1fae1c7)')
{
  const exclusion = { reviewDate: '2027-03-01T00:00:00Z', motif: 'incident 42' }
  const revue = { id: 'rev-1', echeance: '2027-06-01T00:00:00Z', motif: 'script de sauvegarde' }

  const a = echeanceDeSniff(exclusion, revue)
  dire(a.origine === 'exclusion' && a.echeance?.toISOString().startsWith('2027-03-01') === true && a.revueId === null,
    'une exclusion prime sur la revue isolée : une règle ne porte jamais deux échéances')
  const b = echeanceDeSniff(null, revue)
  dire(b.origine === 'revue' && b.revueId === 'rev-1' && b.motif === 'script de sauvegarde',
    'sans exclusion, la revue isolée porte la date et son motif')
  const c = echeanceDeSniff(null, null)
  dire(c.origine === null && c.echeance === null, 'ni l\'une ni l\'autre : le Catalogue garde la main')
  dire(echeanceDeSniff({ reviewDate: null, motif: 'x' }, { echeance: null }).origine === null,
    'une exclusion ou une revue SANS date ne porte pas l\'échéance')
  dire(echeanceDeSniff({ reviewDate: 'pas une date' }, revue).origine === 'revue', 'une date illisible ne fait pas autorité')
}

console.log('\nLa bascule est immédiate sur les événements poussés')
{
  const src = await Bun.file(new URL('../src/routers/sniffEvenements.ts', import.meta.url)).text()
  dire(src.includes('revue_liste_blanche_proche') && src.includes('revue_liste_blanche_depassee'), 'les deux événements de revue sont traités')
  dire(/dateRevision: null/.test(src), 'et la date locale cesse d\'être entretenue : deux dates, aucune ne ferait foi')
  const sync = await Bun.file(new URL('../src/utils/harfanglabSync.ts', import.meta.url)).text()
  dire(/echeanceDeSniff\(/.test(sync), 'le relevé périodique applique le même arbitrage que les événements')
  dire(/revuesSniffIndisponibles/.test(sync), 'une instance Sniff sans les revues est dite, pas confondue avec « aucune revue »')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
