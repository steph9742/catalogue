// IMPORT DE SITES — et le piège de la clé fonctionnelle composite. LE DÉFAUT ÉVITÉ.
import { analyserListeSites } from '../src/utils/certificatScan'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nUn seul analyseur pour les deux catalogues')
{
  // En écrire un second aurait produit deux façons de lire la même liste, qui auraient
  // divergé — le défaut qu'on supprime partout ailleurs.
  const src = await Bun.file(new URL('../src/routers/servicesExposes.ts', import.meta.url)).text()
  dire(/analyserListeSites/.test(src), 'l\'import des services réutilise l\'analyseur des certificats')
  dire(!/split\(\/\\r\?\\n\//.test(src), 'et n\'en réécrit pas un second dans le routeur')
}

console.log('\nLe rapprochement porte sur (hote, port)')
{
  const src = await Bun.file(new URL('../src/routers/servicesExposes.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf("post('/import'"), src.indexOf('Relève un service'))
  dire(/\$\{e\.hote\}:\$\{e\.port\}/.test(bloc),
    'la clé de rapprochement combine l\'hôte ET le port')
  dire(!/deja\.has\(e\.hote\)/.test(bloc),
    'jamais l\'hôte seul, qui confondrait deux ports du même serveur')
}

console.log('\nL\'import générique est ÉCARTÉ sur ce catalogue')
{
  const idx = await Bun.file(new URL('../src/index.ts', import.meta.url)).text()
  const ligne = idx.split('\n').find(l => l.includes("name: 'sites-services'"))!
  dire(/sansImportGenerique: true/.test(ligne),
    'l\'entrée CRUD déclare `sansImportGenerique`')

  const crud = await Bun.file(new URL('../src/routers/crud.ts', import.meta.url)).text()
  // Pas montée du tout : une route montée qui refuserait masquerait la route dédiée sur le
  // même chemin, comme le résumé générique l'a fait pour /api/competences/resume.
  dire(/\?\s*new Elysia\(\{ name: `\$\{name\}-sans-import` \}\)/.test(crud),
    'et l\'exclusion monte un greffon VIDE, pas un refus')
}

console.log('\nL\'analyseur tient les formes courantes')
for (const [ligne, hote, port] of [
  ['www.example.org', 'www.example.org', 443],
  ['intranet.example.org:8443', 'intranet.example.org', 8443],
  ['https://moodle.example.org/', 'moodle.example.org', 443],
  ['http://vieux.example.org', 'vieux.example.org', 80],
] as const) {
  const r = analyserListeSites(ligne)
  const e = r.entrees[0]
  dire(e?.hote === hote && e?.port === port, `« ${ligne} » → ${e?.hote}:${e?.port}`)
}

console.log('\nDeux ports du même hôte sont DEUX entrées')
{
  // C'est le cas qui justifie tout ce qui précède : si l'analyseur ou l'import les
  // dédoublonnait sur l'hôte, l'un des deux services disparaîtrait.
  const r = analyserListeSites('srv.example.org\nsrv.example.org:8443')
  dire(r.entrees.length === 2, `${r.entrees.length} entrées pour deux ports du même hôte`)
  dire(r.entrees[0]!.port !== r.entrees[1]!.port, 'et leurs ports diffèrent')
}

console.log('\nLe libellé et les commentaires')
{
  const r = analyserListeSites('# les sites de l\'UFR\nwww.example.org, Portail public\n\n')
  dire(r.entrees.length === 1, 'les lignes vides et les commentaires sont ignorés')
  dire(r.entrees[0]!.libelle === 'Portail public', 'la seconde colonne devient le libellé')
}

console.log('\nLa simulation est le DÉFAUT')
{
  const src = await Bun.file(new URL('../src/routers/servicesExposes.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf("post('/import'"), src.indexOf('Relève un service'))
  // `dryRun !== false` : il faut demander explicitement l'écriture. Un import qui écrirait
  // par défaut ferait d'une faute de frappe une modification du catalogue.
  dire(/body\.dryRun !== false/.test(bloc), 'on annonce avant d\'écrire')
  dire(/rejets/.test(bloc), 'et les lignes rejetées sont rendues, jamais tues')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
