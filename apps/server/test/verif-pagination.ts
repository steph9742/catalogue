// PAGINATION — les contrôles qui empêchent la promesse du contrat de redevenir fausse.
import { bornes, enveloppe, pagineDemandee, paginerEnMemoire, PAGE_TAILLE_DEFAUT, PAGE_TAILLE_MAX } from '../src/utils/pagination'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nLa bascule : `pageSize` SEUL suffit')
// LE DÉFAUT SIGNALÉ. Exiger les deux ferait retomber l'appelant sur le tableau complet — une
// réponse plausible qui n'est pas celle qu'il a demandée.
dire(pagineDemandee({ pageSize: '1' }), '`pageSize` seul déclenche la pagination')
dire(pagineDemandee({ page: '1' }), '`page` seul aussi')
dire(pagineDemandee({ page: '1', pageSize: '1' }), 'les deux ensemble aussi')
dire(!pagineDemandee({}), 'sans aucun des deux, la forme historique est conservée')

console.log('\nLes bornes ne peuvent pas sortir du domaine valide')
dire(bornes({}).pageSize === PAGE_TAILLE_DEFAUT, `taille par défaut : ${PAGE_TAILLE_DEFAUT}`)
dire(bornes({}).page === 1, 'page par défaut : 1')
dire(bornes({ pageSize: '99999' }).pageSize === PAGE_TAILLE_MAX,
  `une taille démesurée est ramenée au plafond (${PAGE_TAILLE_MAX})`)
dire(bornes({ page: '0' }).page === 1, 'la page 0 devient la page 1')
dire(bornes({ page: '-5' }).page === 1, 'une page négative aussi')
dire(bornes({ pageSize: '0' }).pageSize === PAGE_TAILLE_DEFAUT, 'une taille nulle retombe sur le défaut')

// `Number('abc')` vaut NaN, et NaN est faux : le paramètre illisible est rattrapé par le même
// `|| defaut` que le paramètre absent.
dire(bornes({ page: 'abc' }).page === 1, 'une page illisible ne produit pas NaN')
dire(Number.isInteger(bornes({ page: '2.7' }).offset), 'une page décimale ne produit pas un OFFSET fractionnaire')

console.log('\nL\'offset suit la page')
dire(bornes({ page: '1', pageSize: '20' }).offset === 0, 'page 1 → offset 0')
dire(bornes({ page: '3', pageSize: '20' }).offset === 40, 'page 3 taille 20 → offset 40')

console.log('\nL\'enveloppe a la forme promise au § 10')
{
  const e = enveloppe([{ id: 'a' }], 4797, bornes({ pageSize: '1' }))
  dire(Object.keys(e).sort().join(',') === 'page,pageSize,rows,total',
    '{ rows, total, page, pageSize } — exactement les quatre clés annoncées')
  // LA DOCTRINE DU § 2. Le nombre de lignes reçues ne doit jamais servir de décompte : le total
  // vient de la base, et une enveloppe qui compterait ses propres lignes annoncerait le plafond
  // comme total dès la première page.
  dire(e.total === 4797 && e.rows.length === 1,
    'le total est celui de la base, pas le nombre de lignes rendues')
}

console.log('\nPagination en mémoire, pour les listes assemblées en JS')
{
  const tout = Array.from({ length: 130 }, (_, i) => ({ i }))
  dire(Array.isArray(paginerEnMemoire({}, tout)), 'sans paramètre, la liste complète est rendue telle quelle')
  const p = paginerEnMemoire({ page: '2', pageSize: '50' }, tout) as { rows: { i: number }[], total: number }
  dire(p.rows.length === 50 && p.rows[0]!.i === 50, 'la page 2 commence au 51e élément')
  dire(p.total === 130, 'le total est celui de la liste entière')
  const fin = paginerEnMemoire({ page: '3', pageSize: '50' }, tout) as { rows: unknown[], total: number }
  dire(fin.rows.length === 30 && fin.total === 130, 'la dernière page est partielle, le total ne bouge pas')
  const apres = paginerEnMemoire({ page: '99', pageSize: '50' }, tout) as { rows: unknown[], total: number }
  dire(apres.rows.length === 0 && apres.total === 130,
    'au-delà de la dernière page : zéro ligne, et le total dit toujours la vérité')
}

console.log('\nToute route de liste appelle la fonction partagée')

// LE CONTRÔLE QUI AURAIT ATTRAPÉ LE DÉFAUT D'ORIGINE. Les précédents éprouvent la fonction ;
// celui-ci vérifie qu'elle est BRANCHÉE.
const routeurs = [...new Bun.Glob('*.ts').scanSync(new URL('../src/routers/', import.meta.url).pathname)]
  .filter(f => f !== 'crud.ts')

const sansPagination: string[] = []
for (const fichier of routeurs) {
  const src = await Bun.file(new URL(`../src/routers/${fichier}`, import.meta.url)).text()
  // Une route GET dont le corps rend directement une requête sur une table : c'est la
  // signature d'une liste, et une liste doit pouvoir se compter.
  const rendUneListe = /\.get\([^)]*,\s*(async\s*)?\([^)]*\)\s*=>\s*\n?\s*db\s*\n?\s*\.select\(/.test(src)
    || /=>\s*\n?\s*db\.select\([^)]*\)\.from\(/.test(src)
  if (rendUneListe && !src.includes('SCHEMA_PAGINATION')) sansPagination.push(fichier)
}
// EXCEPTIONS DÉCLARÉES AVEC LEUR RAISON. Toutes les listes n'ont pas à être paginées, mais
// l'exception doit être ÉCRITE.
const SANS_PAGINATION: Record<string, string> = {
  'risques.ts': 'sous-ressources d\'un risque (actifs, mesures) : bornées par leur parent',
  'actifsInfo.ts': 'sous-ressource d\'un actif informationnel',
  'composantes.ts': 'périmètre et référents d\'une composante : bornés par leur parent ; la volumétrie est un agrégat',
  'ebios.ts': 'écosystème et scénarios sont bornés par l\'atelier EBIOS en cours ; la synthèse est un agrégat',
  'logicielsPoste.ts': 'inventaire logiciel d\'un poste : borné par la machine',
  'ldap.ts': 'tables de réglage du connecteur : la correspondance des unités et les valeurs '
    + 'relevées sont bornées par le nombre d\'unités de l\'établissement (une quarantaine), et '
    + 'l\'écran des réglages les charge entières pour alimenter ses listes déroulantes — les '
    + 'paginer obligerait à parcourir des pages pour trouver une valeur à déclarer',
}

const nonJustifies = sansPagination.filter(f => !(f in SANS_PAGINATION))
dire(nonJustifies.length === 0,
  nonJustifies.length
    ? `routeur(s) rendant une liste sans pagination ni raison déclarée : ${nonJustifies.join(', ')}`
    : `${sansPagination.length} routeur(s) sans pagination, tous avec une raison écrite`)

// Une raison vide ou absente ne vaut pas une raison : elle se lirait comme une décision
// alors qu'elle n'en est pas une.
dire(Object.values(SANS_PAGINATION).every(r => r.length > 20),
  'chaque exception porte une raison substantielle, pas un mot')

// Et une exception devenue caduque doit disparaître : un routeur qui pagine désormais n'a
// plus rien à faire dans cette liste, sinon elle se périme en silence.
const caduques = Object.keys(SANS_PAGINATION).filter(f => !sansPagination.includes(f))
dire(caduques.length === 0,
  caduques.length ? `exception(s) devenue(s) caduque(s) : ${caduques.join(', ')}` : 'aucune exception caduque')

// Les routes nommément corrigées, pour que leur régression soit lisible dans la sortie.
const ROUTES_DE_LISTE = [
  'applications', 'certificats', 'whitelists', 'tiersRouter', 'auditRouter', 'responsables',
  'competences', 'changeRequests', 'cadres', 'actifsSmsi', 'entiteResponsables',
]
for (const nom of ROUTES_DE_LISTE) {
  const src = await Bun.file(new URL(`../src/routers/${nom}.ts`, import.meta.url)).text()
  dire(/from '\.\.\/utils\/pagination'/.test(src), `${nom} importe la pagination partagée`)
  dire(src.includes('SCHEMA_PAGINATION'), `${nom} déclare \`page\` et \`pageSize\` dans son schéma`)
}

// Le routeur générique doit l'appeler AUSSI, sinon la règle est de nouveau écrite deux
// fois — et c'est la duplication, pas l'absence, qui avait produit la divergence.
{
  const src = await Bun.file(new URL('../src/routers/crud.ts', import.meta.url)).text()
  dire(/from '\.\.\/utils\/pagination'/.test(src), 'crud.ts appelle la même fonction, il ne garde pas sa copie')
  dire(!/Math\.min\(200, Math\.max\(1/.test(src), 'et sa copie des bornes a bien été retirée')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
