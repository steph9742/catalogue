// SCAN APPLICATIF — ce qu'on peut affirmer d'un service, et ce qu'on ne peut pas.
import { principale } from '../src/routers/servicesExposes'
import { analyser, sansLiensExternes } from '../src/utils/scanWeb'
import { PRODUITS } from '../src/utils/scanProduits'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}
const d = (h: Record<string, string>, c = '') => analyser(h, c, 200)

console.log('\nUne version annoncée est CERTAINE')
{
  const r = d({ Server: 'Apache/2.4.58 (Debian)' })
  const a = r.detections[0]!
  dire(a.produit === 'Apache' && a.version === '2.4.58', `Apache 2.4.58 — ${a.produit} ${a.version}`)
  dire(a.certitude === 'certain', 'certitude « certain »')
  dire(a.technologieCle !== null, 'et une clé de rapprochement est calculée')
}

console.log('\nUne version MASQUÉE n\'est pas une absence de produit')

// Masquer la version est une bonne pratique : l'absence n'est PAS une anomalie, mais elle doit
// se distinguer d'un produit non détecté.
{
  const r = d({ Server: 'Apache' })
  const a = r.detections[0]!
  dire(a.produit === 'Apache', 'le produit reste détecté')
  dire(a.version === null && a.certitude === 'absente', 'la VERSION est absente, pas le produit')
  dire(a.technologieCle === null,
    'et AUCUNE clé n\'est calculée : rapprocher « Apache » sans version donnerait à tout le produit la date d\'une release')
}

console.log('\nLe generator nomme le CMS')
for (const [contenu, produit, version] of [
  ['WordPress 6.4.2', 'WordPress', '6.4.2'],
  ['Drupal 10 (https://www.drupal.org)', 'Drupal', '10'],
  ['MediaWiki 1.41.0', 'MediaWiki', '1.41.0'],
  ['DokuWiki', 'DokuWiki', null],
] as const) {
  const r = d({}, `<meta name="generator" content="${contenu}">`)
  const a = r.detections[0]
  dire(a?.produit === produit && a?.version === version,
    `« ${contenu} » → ${a?.produit} ${a?.version ?? '(sans version)'}`)
}

console.log('\nUn chemin d\'actif donne le produit, jamais la version')
{
  const r = d({}, '<link href="/wp-content/themes/x/style.css">')
  const a = r.detections[0]!
  dire(a.produit === 'WordPress', 'WordPress reconnu par /wp-content/')
  dire(a.certitude === 'probable', 'certitude « probable » : c\'est un indice, pas une déclaration')
  dire(a.version === null && a.technologieCle === null, 'ni version ni clé')
}

console.log('\nLa source la plus fiable l\'emporte')
{
  // Le generator porte la version, le chemin d'actif non. Compter les deux ferait apparaître
  // WordPress deux fois, dont une sans version — et le décompte des technologies du service
  // serait faux.
  const r = d({}, '<meta name="generator" content="WordPress 6.4.2"><link href="/wp-content/x.css">')
  dire(r.detections.length === 1, `une seule détection pour WordPress (${r.detections.length})`)
  dire(r.detections[0]!.version === '6.4.2', 'celle qui porte la version')
}

console.log('\nAucune détection n\'est un RÉSULTAT, pas une erreur')
{
  const r = d({ 'content-type': 'text/html' }, '<html><body>bonjour</body></html>')
  dire(r.ok, 'le relevé a abouti')
  dire(r.detections.length === 0, 'et ne trouve rien')
  dire(r.enTetes !== null,
    'mais les en-têtes de sécurité sont relevés : le service a bien répondu')
}

console.log('\nUn ÉCHEC de relevé se distingue d\'une absence')
{
  // C'est la distinction qui compte : `enTetes: null` dit que rien n'a été relevé, là où `hsts:
  // false` dit qu'il a été relevé et qu'il manque.
  const src = await Bun.file(new URL('../src/utils/scanWeb.ts', import.meta.url)).text()
  const bloc = src.slice(src.indexOf('catch (e)'))
  dire(/enTetes: null/.test(bloc), 'en cas d\'échec, `enTetes` vaut null et non un objet à false')
  dire(/detections: \[\]/.test(bloc) && /ok: false/.test(bloc),
    'et `ok: false` accompagne la liste vide : l\'appelant sait que rien n\'a été lu')
}

console.log('\nLes en-têtes de sécurité sont binaires et factuels')
{
  const r = d({ 'strict-transport-security': 'max-age=31536000', 'x-frame-options': 'DENY' })
  dire(r.enTetes!.hsts && r.enTetes!.xFrameOptions, 'les présents sont vrais')
  dire(!r.enTetes!.csp && !r.enTetes!.referrerPolicy, 'les absents sont faux, pas nuls')
  // Aucune interprétation de la VALEUR : un `max-age` trop court est un jugement, et le
  // Catalogue inventorie plutôt qu'il n'audite.
  const src = await Bun.file(new URL('../src/utils/scanWeb.ts', import.meta.url)).text()
  dire(!/max-age\s*[<>]/.test(src), 'la valeur des en-têtes n\'est pas jugée, seulement leur présence')
}

console.log('\nLE SCAN INVENTORIE, IL N\'AUDITE PAS')
{
  const src = await Bun.file(new URL('../src/utils/scanWeb.ts', import.meta.url)).text()
  const prods = await Bun.file(new URL('../src/utils/scanProduits.ts', import.meta.url)).text()

  // LE CONTRAT A CHANGÉ, DÉLIBÉRÉMENT. Le scan était purement passif : une requête sur la
  // racine.
  const interdits = /wp-login|phpinfo|\/\.git|\/\.env|\/admin\/index|xmlrpc|\/setup|\/install/i
  dire(!interdits.test(prods), 'aucun chemin d\'authentification ou d\'installation n\'est sondé')
  dire(!interdits.test(src), 'ni dans l\'orchestration')

  // Chaque sonde vise une ressource que le produit publie POUR être identifié.
  const chemins = [...prods.matchAll(/chemin: '([^']+)'/g)].map(m => m[1]!)
  dire(chemins.length > 0, `${chemins.length} sonde(s) déclarée(s)`)
  dire(chemins.every(c => c.startsWith('/')), 'toutes sont des chemins relatifs à l\'hôte scanné')

  // LE NOMBRE DE REQUÊTES EST BORNÉ. Un inventaire ne martèle pas ce qu'il inventorie, et
  // sans plafond une page détectant huit produits ferait huit requêtes de plus.
  dire(/SONDES_MAX\s*=\s*\d+/.test(src), 'un plafond limite les sondes par service')
  dire(/budget--/.test(src) && /budget <= 0/.test(src), 'et il est réellement décompté')

  // Une seule sonde est lancée sans indice préalable, et elle est marquée comme telle.
  dire((prods.match(/toujours: true/g) ?? []).length <= 2,
    'au plus deux sondes sont lancées sans indice préalable')

  dire((src.match(/AbortSignal\.timeout/g) ?? []).length >= 2, 'un délai borne chaque appel')
  dire(/slice\(0, 512 \* 1024\)/.test(src) && /slice\(0, 256 \* 1024\)/.test(src),
    'les corps lus sont plafonnés — page et sondes')
}

console.log('\nWordPress est détecté, generator ou non')
{
  // LES DEUX CAS RÉELS. Beaucoup d'installations masquent le `generator` — c'est une bonne
  // pratique — et le produit doit alors se reconnaître à ses chemins d'actifs.
  const avec = d({ Server: 'Apache/2.4.58' },
    '<meta name="generator" content="WordPress 6.4.3" />')
  dire(avec.detections.some(x => x.produit === 'WordPress' && x.version === '6.4.3'),
    'generator présent → WordPress avec sa version')

  const sans = d({ Server: 'nginx', 'X-Powered-By': 'PHP/8.2.10' },
    "<link href='/wp-content/plugins/y/z.css?ver=1'><script src=\"/wp-includes/js/jquery.js\"></script>")
  const wp = sans.detections.find(x => x.produit === 'WordPress')
  dire(!!wp, 'generator masqué → WordPress reconnu par ses chemins d\'actifs')
  dire(wp?.certitude === 'probable', 'et la certitude descend à « probable »')
  dire(sans.detections.some(x => x.produit === 'PHP' && x.version === '8.2.10'),
    'le langage reste détecté par son en-tête')
}

console.log('\nLes deux routes de scan ENREGISTRENT, et par le même chemin')
{
  // LE DÉFAUT QUE CE CONTRÔLE AURAIT VU. Le balayage complet mettait à jour la date et les
  // en-têtes, puis JETAIT les détections : un site WordPress ressortait avec « 0 technologie
  // détectée », un dernier relevé daté du jour, et aucune erreur nulle part.
  const src = await Bun.file(new URL('../src/routers/servicesExposes.ts', import.meta.url)).text()
  dire(/async function releverEtEnregistrer/.test(src),
    'le relevé et son enregistrement sont écrits UNE fois')
  const appels = (src.match(/releverEtEnregistrer\(/g) ?? []).length
  dire(appels >= 3, `appelée par les deux routes (${appels - 1} appels)`)

  // Aucune des deux routes ne doit réécrire l'insertion de son côté : c'est la duplication
  // qui a produit le défaut.
  const inserts = (src.match(/db\.insert\(serviceTechnologie\)/g) ?? []).length
  dire(inserts === 1, `une seule insertion des détections dans tout le fichier (${inserts})`)
}

console.log('\nUn relevé fait TOUT le service : certificat compris')
{
  // Relever le certificat séparément obligeait à lancer deux actions pour connaître l'état d'un
  // service, et laissait la fiche a moitie remplie entre les deux.
  const src = await Bun.file(new URL('../src/routers/servicesExposes.ts', import.meta.url)).text()
  dire(/async function releverCertificat/.test(src), 'le certificat est relevé dans le même passage')
  dire(/scannerCertificat/.test(src), 'et par le scanner TLS existant, pas un second')

  // Un service en clair sur le port 80 n'a pas de certificat : tenter une poignée de main
  // dessus produirait une erreur qu'on lirait comme un défaut du service.
  dire(/port === 80 \|\| service\.port === 8080/.test(src),
    'le port en clair est écarté du relevé TLS')

  // Un échec HTTP n'empêche pas le certificat d'avoir été lu : un service peut refuser une
  // requête applicative et présenter un certificat parfaitement valide.
  dire(/if \(!r\.ok\) return \{[^}]*certificat \}/.test(src.replace(/\n/g, ' ')),
    'un échec applicatif rend quand même le résultat du certificat')
}

console.log('\nLa fin de support est cherchée APRÈS la détection')
{
  const src = await Bun.file(new URL('../src/routers/servicesExposes.ts', import.meta.url)).text()
  dire(/enrichirTechnologie/.test(src),
    'chaque technologie détectée est enrichie dans la foulée')

  const enr = await Bun.file(new URL('../src/utils/eolTechnologie.ts', import.meta.url)).text()
  // Sans garde de fraîcheur, la source serait sollicitée autant de fois qu'on a de sites
  // sous le même produit — cinquante WordPress, cinquante appels pour la même réponse.
  dire(/FRAICHEUR_MS/.test(enr), 'une garde de fraîcheur évite d\'interroger la source à chaque relevé')
  // La décision humaine ne se réécrit pas, ici comme partout ailleurs.
  dire(/sourceEol === 'manuel'/.test(enr), 'une date saisie à la main n\'est jamais écrasée')
  // Une panne réseau ne doit pas effacer ce qu'on savait : écrire des dates nulles ferait
  // disparaître un « hors support » connu.
  dire(/if \(!cycles\)/.test(enr) && /on ne touche à RIEN/.test(enr),
    'source injoignable : rien n\'est écrit, les dates connues survivent')
  // Un produit inconnu de la source crée quand même sa ligne, sans dates : elle se lit
  // « inconnu », ce qui invite à saisir la date plutôt qu'à croire le produit supporté.
  dire(/Produit inconnu de la source/.test(enr),
    'un produit hors source garde une ligne sans dates, pas d\'absence de ligne')
}


console.log('\nUN LIEN VERS AILLEURS N\'EST PAS UNE TECHNOLOGIE D\'ICI')
{
  // Le cas réel : une page institutionnelle qui renvoie vers le Moodle de l'établissement.
  const avecLien = '<html><body><p>Voir la <a href="https://moodle.example.org/lib/exe/fetch.php">page Moodle</a></p></body></html>'
  const r1 = analyser({}, avecLien, 200)
  dire(!r1.detections.some(d => d.produit === 'DokuWiki'),
    'un lien sortant vers /lib/exe/ ne fait pas détecter DokuWiki')

  const imageDistante = '<html><body><img src="https://autre-site.fr/wp-content/uploads/logo.png"></body></html>'
  const r2 = analyser({}, imageDistante, 200)
  dire(!r2.detections.some(d => d.produit === 'WordPress'),
    'une image hébergée sur un autre WordPress ne fait pas détecter WordPress')

  // LE SIGNAL LÉGITIME EST CONSERVÉ : un chemin relatif désigne le site lui-même.
  const chezSoi = '<html><body><link rel="stylesheet" href="/wp-content/themes/x/style.css"></body></html>'
  const r3 = analyser({}, chezSoi, 200)
  dire(r3.detections.some(d => d.produit === 'WordPress'),
    'un chemin RELATIF /wp-content/ fait toujours détecter WordPress')

  // Le texte du lien porte souvent le nom du produit : le retirer aussi.
  dire(!sansLiensExternes('<a href="https://x.fr/a">notre WordPress</a>').includes('WordPress'),
    'le texte d\'un lien absolu part avec le lien')
  dire(sansLiensExternes('<a href="/interne">notre WordPress</a>').includes('WordPress'),
    'celui d\'un lien relatif reste')
}

console.log('\nLa technologie PRINCIPALE est le CMS, pas la plomberie')
// Un site rend « nginx, PHP, WordPress ». Prendre le premier détecté afficherait « nginx » sur
// tout le parc : une colonne qui ne distingue rien.
{
  const t = (produit: string, version: string | null = null) => ({ produit, version })
  const p = (l: Array<{ produit: string, version: string | null }>) => principale(l)?.produit ?? null

  dire(p([t('nginx'), t('PHP', '8.2'), t('WordPress', '6.4')]) === 'WordPress',
    'WordPress l\'emporte sur PHP et nginx')
  dire(p([t('nginx'), t('PHP', '8.2')]) === 'PHP',
    'sans CMS, le langage l\'emporte sur le serveur web')
  dire(p([t('nginx', '1.24')]) === 'nginx',
    'seul, le serveur web est bien la technologie principale')
  dire(p([]) === null,
    'aucune détection ne donne aucune technologie principale — jamais un produit par défaut')
  // Deux produits de même rang : l'ordre alphabétique, et non l'ordre de la base. Sans
  // départage, la colonne changerait d'un affichage à l'autre sur les mêmes données.
  dire(p([t('TYPO3'), t('Drupal')]) === 'Drupal',
    'à rang égal, l\'ordre est stable et non celui de la base')

  // LE DÉFAUT CORRIGÉ : `categorieDe` ne connaissait que sept CMS recopiés à la main.
  dire(p([t('Apache', '2.4'), t('PHP', '7.4'), t('Magento', '2.4')]) === 'Magento',
    'Magento l\'emporte sur Apache et PHP')
  for (const produit of ['Moodle', 'Zimbra', 'Nextcloud', 'PrestaShop', 'Roundcube', 'LemonLDAP::NG']) {
    dire(p([t('nginx'), t('PHP'), t(produit)]) === produit, `${produit} l'emporte sur nginx et PHP`)
  }
  // LA PROPRIÉTÉ, pas une liste : tout produit que le scan sait déclarer est applicatif.
  // Une signature ajoutée demain n'a rien à recopier ailleurs.
  const relegues = PRODUITS.filter(x => p([t('Apache'), t('PHP'), t(x.produit)]) !== x.produit).map(x => x.produit)
  dire(relegues.length === 0,
    `chaque produit déclaré au scan passe devant la plomberie${relegues.length ? ` — relégués : ${relegues.join(', ')}` : ''}`)
}

console.log('\nMagento : reconnu à son chargeur, versionné par sa sonde')
{
  const page = '<html><body><script type="text/x-magento-init">{"*":{}}</script></body></html>'
  const r = analyser({}, page, 200)
  dire(r.detections.some(d => d.produit === 'Magento' && d.certitude === 'probable'),
    'le chargeur de composants Magento 2 fait soupçonner Magento')
  const sonde = PRODUITS.find(x => x.produit === 'Magento')?.sondes?.[0]
  dire(sonde?.chemin === '/magento_version', 'une sonde interroge /magento_version')
  dire(sonde?.version('Magento/2.4 (Community)') === '2.4' && sonde?.confirme?.('Magento/2.4 (Community)') === true,
    '« Magento/2.4 (Community) » confirme le produit et donne la branche 2.4')
  // Une page d'erreur HTML servie en 200 sur ce chemin ne doit ni confirmer ni versionner.
  dire(sonde?.version('<html>404</html>') === null && sonde?.confirme?.('<html>Magento</html>') === false,
    'une page quelconque sur ce chemin ne confirme rien')
}

console.log(`\n${PRODUITS.length} produits déclarés`)
const g = (p: string, v = '') => `<meta name="generator" content="${p}${v ? ` ${v}` : ''}">`

dire(d({}, g('Nextcloud Hub 8')).detections.some(x => x.produit === 'Nextcloud'), 'Nextcloud')
dire(d({}, g('MediaWiki', '1.41.1')).detections.some(x => x.produit === 'MediaWiki' && x.version === '1.41.1'), 'MediaWiki 1.41.1')
dire(d({}, g('DokuWiki Release 2024-02-06a')).detections.some(x => x.produit === 'DokuWiki' && x.version === '2024-02-06a'), 'DokuWiki daté')
dire(d({}, g('SPIP', '4.2.13')).detections.some(x => x.produit === 'SPIP' && x.version === '4.2.13'), 'SPIP')
dire(d({}, g('Roundcube Webmail 1.6.6')).detections.some(x => x.produit === 'Roundcube'), 'Roundcube')
dire(d({ 'set-cookie': 'MoodleSession=abc; Path=/' }, '<html></html>').detections.some(x => x.produit === 'Moodle'), 'Moodle par son cookie')
dire(d({ 'set-cookie': 'lemonldap=xyz' }, '<html></html>').detections.some(x => x.produit === 'LemonLDAP::NG'), 'LemonLDAP par son cookie')
dire(d({ 'x-generator': 'Drupal 10 (https://www.drupal.org)' }, '<html></html>').detections.some(x => x.produit === 'Drupal'), 'Drupal par X-Generator')

console.log('\nUne famille ne rend qu\'un produit')
{
  const carbonio = d({}, `${g('Carbonio')}<p>zimbra collaboration suite</p>`)
  const noms = carbonio.detections.map(x => x.produit)
  dire(noms.includes('Carbonio') && !noms.includes('Zimbra'),
    'une page Carbonio mentionnant Zimbra ne rend que Carbonio')
}

console.log('\nUn indice de structure ne vaut pas une déclaration')
{
  const r = d({}, '<html><link href="/wp-content/x.css"></html>')
  const wp = r.detections.find(x => x.produit === 'WordPress')!
  dire(wp.certitude === 'probable', 'chemin d\'actif seul → probable')
  dire(wp.technologieCle === null, 'et aucune clé de rapprochement — donc aucune fin de vie attribuée')
}
console.log('\nLA VERSION SE LIT DANS L\'URL DES ACTIFS quand le generator est retiré')
{
  // Retirer la balise `generator` est une bonne pratique répandue. Retirer le paramètre de
  // cache casserait les mises à jour côté client : presque personne ne le fait, et c'est là que
  // la version subsiste.
  const wp = d({}, '<link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css?ver=6.4.3">')
  const t = wp.detections.find(x => x.produit === 'WordPress')
  dire(t?.version === '6.4.3', 'WordPress 6.4.3 lu sur un actif de wp-includes')

  // LE PIÈGE : un thème porte SA version, pas celle du noyau. L'attribuer à WordPress lui
  // prêterait une fin de vie qui n'est pas la sienne.
  const theme = d({}, '<link href="/wp-content/themes/monsite/style.css?ver=1.2.0">')
  const t2 = theme.detections.find(x => x.produit === 'WordPress')
  dire(!!t2 && t2.version === null,
    'la version d\'un THÈME n\'est jamais attribuée à WordPress')

  const dr = d({}, '<script src="/core/misc/drupal.js?v=10.2.4"></script>')
  dire(dr.detections.find(x => x.produit === 'Drupal')?.version === '10.2.4',
    'Drupal 10.2.4 lu sur un actif du cœur')

  const mw = d({}, '<script>RLCONF={"wgVersion":"1.41.1"};</script><div class="mw-body"></div>')
  dire(mw.detections.find(x => x.produit === 'MediaWiki')?.version === '1.41.1',
    'MediaWiki lu dans wgVersion')

  // UNE DÉCLARATION EXPLICITE RESTE PRÉFÉRABLE : l'ordre le dit.
  const deux = d({}, '<meta name="generator" content="WordPress 6.5.2"><link href="/wp-includes/x.css?ver=6.4.3">')
  dire(deux.detections.find(x => x.produit === 'WordPress')?.version === '6.5.2',
    'le generator l\'emporte sur le paramètre de cache')
}

console.log('\nUne version est une SUITE DE NOMBRES, pas n\'importe quels chiffres et points')
{
  // LE DÉFAUT RÉEL : `Drupal\s*([\d.]+)` reconnaissait « drupal » dans « drupal.js » puis le
  // point de l'extension, et rendait la version « .
  const r = d({}, '<script src="/core/misc/drupal.js"></script>')
  const dr = r.detections.find(x => x.produit === 'Drupal')
  dire(!!dr, 'le produit reste détecté')
  dire(dr?.version === null, 'mais sans version — « . » n\'en est pas une')
  dire(dr?.technologieCle === null, 'donc sans clé de rapprochement, donc sans fin de vie')

  // Les versions DATÉES restent acceptées : les refuser priverait DokuWiki de toute version.
  const dw = d({}, '<meta name="generator" content="DokuWiki Release 2024-02-06a">')
  dire(dw.detections.find(x => x.produit === 'DokuWiki')?.version === '2024-02-06a',
    'une version datée passe le contrôle')
}

console.log('\nLes en-têtes et cookies qui NOMMENT le produit')
{
  dire(d({ 'x-drupal-dynamic-cache': 'MISS' }, '<html></html>').detections.some(x => x.produit === 'Drupal'),
    'Drupal par son en-tête de cache')
  dire(d({ 'set-cookie': 'fe_typo_user=abc; path=/' }, '<html></html>').detections.some(x => x.produit === 'TYPO3'),
    'TYPO3 par son cookie de session')
  dire(d({ 'set-cookie': 'roundcube_sessid=xyz' }, '<html></html>').detections.some(x => x.produit === 'Roundcube'),
    'Roundcube par son cookie')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
