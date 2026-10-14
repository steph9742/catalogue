// FAMILLE D'OS — le regroupement que l'appelant ne doit plus faire lui-même.
import { FAMILLES_DU_GROUPE, FAMILLES_OS, GROUPES_OS, PERIMETRE_FAMILLE, familleOs, groupeOs } from '../src/utils/familleOs'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nChaque famille porte son périmètre')
// « 1 240 Windows 10 » ne dit pas si les LTSC et les éditions IoT y sont. Le vocabulaire
// le dit, valeur par valeur — c'était la demande explicite.
for (const f of FAMILLES_OS) {
  dire((PERIMETRE_FAMILLE[f]?.length ?? 0) > 40, `« ${f} » décrit son périmètre`)
}

console.log('\nLe classement est exhaustif : rien ne disparaît')
// `autre` n'est pas une catégorie honteuse, c'est la garantie que la partition somme au
// total. Sans elle, un système non reconnu disparaîtrait sans que rien ne le signale.
for (const cle of ['', null, undefined, 'Truc Inconnu 4.2', 'AS/400']) {
  dire((FAMILLES_OS as readonly string[]).includes(familleOs(cle)),
    `« ${cle ?? 'null'} » tombe dans une famille déclarée`)
}

console.log('\nL\'ordre des règles porte du sens')

// CHAQUE DÉPENDANCE D'ORDRE CASSE UN DÉCOMPTE RÉEL SI ELLE EST INVERSÉE.
const CAS: Array<[string, string]> = [
  // Serveur avant bureau — sinon des serveurs se comptent parmi les postes.
  ['Microsoft Windows Server 2019 Standard', 'windows_server_2019'],
  ['Microsoft Windows Server 2012 R2 Standard', 'windows_server_2012'],
  ['Microsoft Windows Server 2008 R2 Enterprise', 'windows_server_2008'],
  ['Windows Server 2022 Datacenter', 'windows_server_2022'],
  ['Microsoft Windows Server', 'windows_server_autre'],
  // iPadOS avant iOS — sinon tous les iPad se comptent parmi les iPhone.
  ['iPadOS 17.5', 'ipados'],
  ['iPad Pro', 'ipados'],
  ['iOS 18.1', 'ios'],
  ['iPhone OS 12', 'ios'],
  ['Android 14', 'android'],
  // Du plus récent au plus ancien — sinon « Windows 10 » capte « Windows 11 ».
  ['Microsoft Windows 11 Professionnel', 'windows_11'],
  ['Microsoft Windows 10 Professionnel', 'windows_10'],
  ['Windows 10 Enterprise 2016 LTSB 1607', 'windows_10'],
  ['Windows 10 IoT Enterprise LTSC 21H2', 'windows_10'],
  ['Microsoft Windows 8.1 Pro', 'windows_8'],
  ['Microsoft Windows 7 Professionnel', 'windows_7'],
  ['Windows Vista Business', 'windows_vista'],
  ['Windows XP Professionnel', 'windows_xp'],
  ['Microsoft Windows', 'windows_autre'],
  // Debian : le numéro ET le nom de code, du plus récent au plus ancien.
  ['Debian GNU/Linux 13 (trixie)', 'debian_13'],
  ['Debian GNU/Linux 12 (bookworm)', 'debian_12'],
  ['bookworm', 'debian_12'],
  ['Debian GNU/Linux 11 (bullseye)', 'debian_11'],
  ['Debian GNU/Linux 10 (buster)', 'debian_10'],
  ['Debian GNU/Linux 9 (stretch)', 'debian_9'],
  ['Debian GNU/Linux 8 (jessie)', 'debian_autre'],
  // Ubuntu par LTS.
  ['Ubuntu 24.04.1 LTS', 'ubuntu_24_04'],
  ['Ubuntu 22.04.3 LTS', 'ubuntu_22_04'],
  ['Ubuntu 20.04.6 LTS', 'ubuntu_20_04'],
  ['Ubuntu 23.10', 'ubuntu_autre'],
  // Famille Red Hat : distributions SÉPARÉES, parce que leurs cycles le sont.
  ['Red Hat Enterprise Linux 9.4', 'rhel_9'],
  ['RHEL 8', 'rhel_8'],
  ['Red Hat Enterprise Linux Server 7.9', 'rhel_7'],
  ['CentOS Stream 9', 'centos_stream'],
  ['CentOS Linux 8', 'centos_8'],
  ['CentOS Linux 7 (Core)', 'centos_7'],
  ['Rocky Linux 9.3', 'rocky'],
  ['AlmaLinux 8.9', 'almalinux'],
  ['Oracle Linux Server 8.8', 'oracle_linux'],
  ['Fedora Linux 40', 'fedora'],
  // Autres unix.
  ['macOS 14.5', 'macos'],
  ['Mac OS X 10.15', 'macos'],
  ['SUSE Linux Enterprise Server 15', 'suse'],
  ['Alpine Linux 3.19', 'alpine'],
  ['Arch Linux', 'arch'],
  ['FreeBSD 14.0', 'bsd'],
  ['Linux Mint 21', 'linux_autre'],
]
for (const [cle, attendu] of CAS) {
  const obtenu = familleOs(cle)
  dire(obtenu === attendu, `« ${cle} » → ${obtenu}${obtenu === attendu ? '' : ` (attendu ${attendu})`}`)
}

console.log('\nCentOS 8 n\'est pas RHEL 8, et c\'est tout l\'intérêt du détail')
// CentOS 8 a été abandonné fin 2021, RHEL 8 court jusqu'en 2029. Les regrouper sous
// « rhel_like » effaçait la seule information qui appelle une décision.
dire(familleOs('CentOS Linux 8') !== familleOs('RHEL 8'),
  'CentOS 8 et RHEL 8 tombent dans deux familles distinctes')
dire(familleOs('CentOS Stream 9') !== familleOs('CentOS Linux 8'),
  'CentOS Stream, publication continue, est distinct de CentOS classique')

console.log('\nUn Windows non classé reste un Windows')
// Le ranger dans `autre` masquerait un parc Microsoft mal libellé, et « autre » se lirait
// comme « parc exotique » alors que c'est un défaut d'inventaire sur un parc connu.
dire(familleOs('Microsoft Windows') !== 'autre', 'un libellé Windows imprécis ne tombe pas dans `autre`')
dire(familleOs('Microsoft Windows').startsWith('windows'), 'il reste dans une famille Windows')

console.log('\nLe classement part de la CLÉ, pas du nom')
{
  const src = await Bun.file(new URL('../src/routers/eol.ts', import.meta.url)).text()
  // Repartir du nom brut rouvrirait l'écart entre deux façons de lire le même parc — celui
  // qui a déjà coûté un facteur douze entre deux routes.
  dire(/familleOs\(l\.os\)/.test(src),
    'les partitions par famille sont calculées sur la clé agrégée du parc')
  dire(/machinesParFamilleEtStatut/.test(src), 'le croisement famille × état est rendu')
}

console.log('\nLes deux niveaux ne peuvent pas diverger')

// « Combien de Debian » et « combien de Debian 12 » viennent de la MÊME table : le groupe est
// déclaré à côté de la famille, pas déduit d'un préfixe de nom.
for (const [cle, famille, groupe] of [
  ['Debian GNU/Linux 12 (bookworm)', 'debian_12', 'debian'],
  ['Debian GNU/Linux 9 (stretch)', 'debian_9', 'debian'],
  ['CentOS Linux 8', 'centos_8', 'centos'],
  ['RHEL 8', 'rhel_8', 'rhel'],
  ['Microsoft Windows Server 2019 Standard', 'windows_server_2019', 'windows_serveur'],
  ['Microsoft Windows 10 Professionnel', 'windows_10', 'windows_bureau'],
  ['macOS 14.5', 'macos', 'macos'],
] as const) {
  dire(familleOs(cle) === famille && groupeOs(cle) === groupe,
    `« ${cle} » → ${familleOs(cle)} / ${groupeOs(cle)}`)
}

// CentOS et RHEL partagent une base mais PAS un cycle : ils doivent rester dans deux
// groupes, sinon le regroupement annule le détail qu'on vient d'ajouter.
dire(groupeOs('CentOS Linux 8') !== groupeOs('RHEL 8'),
  'CentOS et RHEL sont dans deux groupes distincts, pas seulement deux familles')

console.log('\nChaque famille appartient à exactement un groupe')
{
  const vues = new Map<string, string>()
  for (const [g, familles] of Object.entries(FAMILLES_DU_GROUPE)) {
    for (const f of familles) {
      dire(!vues.has(f), `« ${f} » n'appartient qu'au groupe « ${g} »${vues.has(f) ? ` (déjà dans ${vues.get(f)})` : ''}`)
      vues.set(f, g)
    }
  }
  // Sans cela, une famille absente de tout groupe disparaîtrait du niveau supérieur : le
  // total par groupe serait inférieur au total par famille, sans que rien ne le signale.
  const orphelines = FAMILLES_OS.filter(f => !vues.has(f))
  dire(orphelines.length === 0,
    orphelines.length ? `famille(s) sans groupe : ${orphelines.join(', ')}` : 'aucune famille orpheline')
  dire(GROUPES_OS.every(g => g in FAMILLES_DU_GROUPE), 'chaque groupe déclare ses familles')
}

console.log('\n`autre` est inspectable, pas seulement compté')
{
  const src = await Bun.file(new URL('../src/routers/eol.ts', import.meta.url)).text()
  // Un compteur seul ne dit pas s'il faut ajouter une famille ou corriger l'inventaire, et
  // une phrase de documentation qui dit « surveillez ce nombre » ne sera pas lue.
  dire(/famillesNonReconnues/.test(src), 'les clés non reconnues sont rendues, pas seulement comptées')
  dire(/tronque: nonReconnues\.length > 50/.test(src),
    'et la troncature est déclarée : une liste coupée en silence se lit comme complète')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
