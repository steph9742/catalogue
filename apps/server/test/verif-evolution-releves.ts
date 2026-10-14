// L'ÉVOLUTION D'UN SERVICE — n'annoncer que ce qui a changé. L'historique des relevés sert à
// répondre à « qu'est-ce qui a bougé ».
import { evolution, type Releve } from '../src/utils/evolutionReleves'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const tete = { hsts: true, csp: true, xFrameOptions: false, referrerPolicy: false }
const lu = (jour: number, techs: Array<[string, string | null]>, extra: Partial<Releve> = {}): Releve => ({
  releveLe: new Date(2026, 8, jour),
  statut: 'ok',
  codeHttp: 200,
  technologies: techs.map(([produit, version]) => ({ produit, version, certitude: 'certain' })),
  enTetes: tete,
  certificatEmpreinte: 'AA',
  ...extra,
})
const echec = (jour: number, extra: Partial<Releve> = {}): Releve => ({
  releveLe: new Date(2026, 8, jour), statut: 'echec', codeHttp: null,
  technologies: null, enTetes: null, certificatEmpreinte: null, ...extra,
})
const natures = (r: { changements: { nature: string }[] }) => r.changements.map(c => c.nature).sort().join(',')

console.log('\nDeux relevés successifs, une version et un en-tête qui changent')
{
  const [a, b] = evolution([
    lu(1, [['WordPress', '6.4.2'], ['PHP', '8.1']]),
    lu(2, [['WordPress', '6.4.3'], ['PHP', '8.1']], { enTetes: { ...tete, csp: false } }),
  ])
  dire(a!.changements.length === 0, 'le premier relevé n\'annonce rien — pas « tout est nouveau »')
  dire(b!.changements.some(c => c.nature === 'version_changee' && c.produit === 'WordPress' && c.avant === '6.4.2' && c.apres === '6.4.3'),
    'la montée WordPress 6.4.2 → 6.4.3 est vue')
  dire(b!.changements.some(c => c.nature === 'entete_disparu' && c.entete === 'csp'), 'la CSP retirée est vue')
  dire(b!.changements.length === 2, `et rien d'autre (${natures(b!)})`)
}

console.log('\nUN ÉCHEC N\'EFFACE RIEN, ET SON RETOUR NE RECRÉE RIEN')
{
  const [, b, c] = evolution([
    lu(1, [['WordPress', '6.4.2']]),
    echec(2),
    lu(3, [['WordPress', '6.4.2']]),
  ])
  dire(natures(b!) === 'joignabilite', 'le relevé en échec n\'annonce que la perte de joignabilité')
  dire(natures(c!) === 'joignabilite', 'le retour n\'annonce que le retour — ni technologie « ajoutée », ni en-tête « apparu »')

  const [, , d] = evolution([
    lu(1, [['WordPress', '6.4.2']]),
    echec(2),
    lu(3, [['WordPress', '6.5.0']]),
  ])
  dire(d!.changements.some(x => x.nature === 'version_changee' && x.avant === '6.4.2'),
    'un changement survenu PENDANT la coupure est vu, comparé au dernier relevé lu')
}

console.log('\nUne version qui devient inconnue n\'est pas une version qui change')
{
  const [, b] = evolution([lu(1, [['Drupal', '10.2']]), lu(2, [['Drupal', null]])])
  dire(b!.changements.length === 0, 'une sonde muette ne fait pas clignoter la fiche')
}

console.log('\nTechnologies ajoutées et retirées')
{
  const [, b] = evolution([lu(1, [['Apache', null], ['PHP', '7.4']]), lu(2, [['nginx', null], ['PHP', '7.4']])])
  dire(b!.changements.some(c => c.nature === 'technologie_ajoutee' && c.produit === 'nginx'), 'nginx ajouté')
  dire(b!.changements.some(c => c.nature === 'technologie_retiree' && c.produit === 'Apache'), 'Apache retiré')
  dire(!b!.changements.some(c => 'produit' in c && c.produit === 'PHP'), 'PHP inchangé n\'apparaît pas')
}

console.log('\nLe certificat : remplacé seulement quand on a LU les deux empreintes')
{
  const [, b, c] = evolution([
    lu(1, [], { certificatEmpreinte: 'AA' }),
    lu(2, [], { certificatEmpreinte: null }), // TLS injoignable ce jour-là
    lu(3, [], { certificatEmpreinte: 'BB' }),
  ])
  dire(b!.changements.length === 0, 'un certificat non lu n\'est pas un certificat remplacé')
  dire(c!.changements.some(x => x.nature === 'certificat_remplace' && x.avant === 'AA' && x.apres === 'BB'),
    'le remplacement AA → BB est vu par-dessus le relevé muet')

  // Un service qui refuse la requête HTTP peut présenter son certificat : il se compare.
  const [, e] = evolution([echec(1, { certificatEmpreinte: 'AA' }), echec(2, { certificatEmpreinte: 'CC' })])
  dire(e!.changements.some(x => x.nature === 'certificat_remplace'), 'le certificat se compare même quand la page est en échec')
}

console.log('\nLe code HTTP')
{
  const [, b] = evolution([lu(1, []), lu(2, [], { codeHttp: 503 })])
  dire(b!.changements.some(c => c.nature === 'code_http' && c.avant === 200 && c.apres === 503), '200 → 503 est vu')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
