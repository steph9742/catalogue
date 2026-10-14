// LE BALAYAGE DE TOUS LES SERVICES — un à la fois, rien de perdu, le plafond annoncé.
import { creerBalayage } from '../src/utils/balayage'
import { champsLisibles, type ReleveCertificat } from '../src/utils/certificatScan'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}
const attente = (ms: number) => new Promise(r => setTimeout(r, ms))

console.log('\nLa route rend la main avant la fin du parcours')
{
  const b = creerBalayage({ paquet: 2, plafond: 100 })
  const { demarre } = b.lancer([1, 2, 3, 4], async () => { await attente(20); return { ok: true, detections: 1 } })
  dire(demarre, 'le balayage démarre')
  dire(b.etat().enCours && b.etat().traites === 0, 'et rien n\'est encore traité quand `lancer` rend la main')
  await b.attendre()
  const e = b.etat()
  dire(!e.enCours && e.traites === 4 && e.ok === 4 && e.detections === 4, 'à la fin, les quatre cibles sont relevées et comptées')
  dire(!!e.fin, 'et la fin est datée')
}

console.log('\nUN SEUL BALAYAGE À LA FOIS')
{
  const b = creerBalayage({ paquet: 1, plafond: 100 })
  let appels = 0
  const relever = async () => { appels++; await attente(10); return { ok: true, detections: 0 } }
  b.lancer([1, 2, 3], relever)
  const second = b.lancer([1, 2, 3], relever)
  dire(!second.demarre, 'un second lancement pendant le premier est refusé')
  await b.attendre()
  dire(appels === 3, `les hôtes ne sont relevés qu'une fois (${appels} relevés pour 3 cibles)`)
  dire(b.lancer([1], relever).demarre, 'et un nouveau passage démarre une fois le premier terminé')
  await b.attendre()
}

console.log('\nPAR PAQUETS : jamais plus de N relevés simultanés')
{
  const b = creerBalayage({ paquet: 3, plafond: 100 })
  let actifs = 0
  let pic = 0
  b.lancer(Array.from({ length: 10 }, (_, i) => i), async () => {
    actifs++; pic = Math.max(pic, actifs)
    await attente(5)
    actifs--
    return { ok: true, detections: 0 }
  })
  await b.attendre()
  dire(pic === 3, `au plus 3 relevés en parallèle (pic observé : ${pic})`)
}

console.log('\nUne cible en EXCEPTION n\'arrête pas le parcours, et compte en échec')
{
  const b = creerBalayage({ paquet: 2, plafond: 100 })
  const erreur = console.error
  console.error = () => {}
  b.lancer([1, 2, 3, 4, 5], async (c) => {
    if (c === 2) throw new Error('base indisponible')
    return { ok: c !== 4, detections: 1 }
  })
  await b.attendre()
  console.error = erreur
  const e = b.etat()
  dire(e.traites === 5, 'les cinq cibles sont traitées, y compris celles après l\'exception')
  dire(e.ok === 3 && e.echecs === 2, `3 réussies, 2 en échec — l'exception comprise (${e.ok}/${e.echecs})`)
  dire(!e.enCours, 'et le balayage se termine : il ne reste pas « en cours » pour toujours')
}

console.log('\nLE PLAFOND EST ANNONCÉ, jamais tu')
{
  const b = creerBalayage({ paquet: 5, plafond: 3 })
  const vues: number[] = []
  b.lancer([10, 20, 30, 40, 50], async (c) => { vues.push(c); return { ok: true, detections: 0 } })
  await b.attendre()
  const e = b.etat()
  dire(e.total === 3 && e.tronque && e.ecartes === 2, 'le passage retient 3 cibles, se dit tronqué et compte les 2 écartées')
  // L'ordre est celui de l'appelant (les plus anciennement relevées d'abord) : le plafond
  // coupe la queue, pas un échantillon au hasard.
  dire(vues.sort((a, c) => a - c).join() === '10,20,30', 'et ce sont les premières de la liste qui passent')

  const b2 = creerBalayage({ paquet: 5, plafond: 3 })
  b2.lancer([1, 2, 3], async () => ({ ok: true, detections: 0 }))
  await b2.attendre()
  dire(!b2.etat().tronque && b2.etat().ecartes === 0, 'un parc exactement au plafond n\'est pas tronqué')
}

console.log('\nL\'état rendu est une COPIE')
{
  const b = creerBalayage({ paquet: 1, plafond: 10 })
  const e = b.etat()
  e.enCours = true
  dire(!b.etat().enCours, 'modifier l\'état lu ne modifie pas le balayage')
}

console.log('\nUN HÔTE INJOIGNABLE N\'EFFACE PAS LE CERTIFICAT CONNU')
{
  // Le défaut corrigé : le relevé d'un service écrivait les champs du certificat même
  // vides, et une coupure réseau effaçait la date d'expiration — l'échéance avec.
  const injoignable: ReleveCertificat = {
    statut: 'injoignable', message: 'ECONNREFUSED', sujet: null, emetteur: null, nomsAlternatifs: [],
    numeroSerie: null, empreinte: null, algorithme: null, dateDebut: null, dateFin: null,
    autoSigne: null, chaineValide: null, erreurValidation: null,
  }
  dire(Object.keys(champsLisibles(injoignable)).length === 0,
    'un relevé injoignable ne produit AUCUN champ à écrire — la date connue survit')

  const lu: ReleveCertificat = { ...injoignable, statut: 'ok', message: '', sujet: 'CN=x', dateFin: new Date('2027-01-01') }
  const champs = champsLisibles(lu)
  dire(champs.dateFin?.getFullYear() === 2027 && champs.sujet === 'CN=x', 'un relevé lu écrit bien sa date et son sujet')
  dire(!('statut' in champs) && !('message' in champs), 'le statut et le message restent à la charge de l\'appelant')

  // Les deux chemins d'écriture passent par la même garde : c'est la recopie de la règle qui
  // avait produit le défaut.
  for (const f of ['../src/utils/certificatsReleve.ts', '../src/routers/servicesExposes.ts']) {
    const src = await Bun.file(new URL(f, import.meta.url)).text()
    dire(/champsLisibles\(/.test(src), `${f.split('/').pop()} écrit le certificat à travers champsLisibles`)
  }
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
