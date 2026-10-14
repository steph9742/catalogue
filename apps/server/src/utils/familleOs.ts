// FAMILLE D'UN SYSTÈME — le regroupement qu'on demande couramment, calculé une fois.

/**
 * UNE SEULE TABLE, TROIS USAGES DÉRIVÉS. La liste des familles, leur périmètre et le classement
 * doivent s'accorder.
 */
type RegleFamille = {
  famille: string
  /**
   * LE NIVEAU DE REGROUPEMENT. « Combien de Debian » toutes versions confondues, sans que
   * l'appelant ait à sommer `debian_9` à `debian_autre` — c\'est-à-dire sans qu\'il ait à savoir
   * quelles familles existent, ni à refaire ce regroupement à chaque version ajoutée.
   */
  groupe: string
  motif: RegExp
  perimetre: string
}

const REGLES: readonly RegleFamille[] = [
  // --- Windows Server, version majeure par version majeure -----------------------------
  // Les R2 sont rattachées à leur année : Microsoft les traite comme une révision.
  { famille: 'windows_server_2003', groupe: 'windows_serveur', motif: /windows.*server[^0-9]*(2003|2000)\b/, perimetre: 'Windows Server 2003 et 2000, toutes éditions. Hors support depuis juillet 2015 au plus tard.' },
  { famille: 'windows_server_2008', groupe: 'windows_serveur', motif: /windows.*server[^0-9]*2008\b/, perimetre: 'Windows Server 2008 et 2008 R2. Hors support depuis janvier 2020.' },
  { famille: 'windows_server_2012', groupe: 'windows_serveur', motif: /windows.*server[^0-9]*2012\b/, perimetre: 'Windows Server 2012 et 2012 R2. Hors support depuis octobre 2023.' },
  { famille: 'windows_server_2016', groupe: 'windows_serveur', motif: /windows.*server[^0-9]*2016\b/, perimetre: 'Windows Server 2016. Support standard jusqu\'en janvier 2027.' },
  { famille: 'windows_server_2019', groupe: 'windows_serveur', motif: /windows.*server[^0-9]*2019\b/, perimetre: 'Windows Server 2019. Support standard jusqu\'en janvier 2029.' },
  { famille: 'windows_server_2022', groupe: 'windows_serveur', motif: /windows.*server[^0-9]*2022\b/, perimetre: 'Windows Server 2022. Support standard jusqu\'en octobre 2031.' },
  { famille: 'windows_server_2025', groupe: 'windows_serveur', motif: /windows.*server[^0-9]*2025\b/, perimetre: 'Windows Server 2025. Support standard jusqu\'en octobre 2034.' },
  { famille: 'windows_server_autre', groupe: 'windows_serveur', motif: /windows.*server/, perimetre: 'Windows Server dont l\'année n\'a pas pu être lue dans le libellé. Défaut d\'inventaire, pas version exotique.' },

  // --- Mobiles. iPadOS AVANT iOS : « ipados » contient « ios ». -------------------------
  { famille: 'ipados', groupe: 'ipados', motif: /ipad\s*os|ipados|\bipad\b/, perimetre: 'iPadOS — iPad uniquement, depuis 2019. Séparé d\'iOS : parcs, cycles de renouvellement et usages distincts.' },
  { famille: 'ios', groupe: 'ios', motif: /\bios\b|iphone\s*os|\biphone\b/, perimetre: 'iOS — iPhone et iPod touch. Distinct d\'iPadOS depuis 2019.' },
  { famille: 'android', groupe: 'android', motif: /android/, perimetre: 'Android, toutes versions et tous constructeurs. Le support dépend du CONSTRUCTEUR autant que de la version : une version récente sur un appareil abandonné ne reçoit plus de correctif.' },

  // --- Windows de bureau, du plus récent au plus ancien ---------------------------------
  { famille: 'windows_11', groupe: 'windows_bureau', motif: /windows\s*11\b/, perimetre: 'Windows 11, toutes variantes et toutes releases, éditions IoT et LTSC comprises.' },
  { famille: 'windows_10', groupe: 'windows_bureau', motif: /windows\s*10\b/, perimetre: 'Windows 10, TOUTES variantes : Famille, Professionnel, Entreprise, Éducation, LTSC/LTSB et IoT. Les releases (22H2, 1809…) sont regroupées ici ; c\'est pourtant la release qui détermine le support réel, et son détail reste dans les lignes.' },
  { famille: 'windows_8', groupe: 'windows_bureau', motif: /windows\s*8(\.1)?\b/, perimetre: 'Windows 8 ET 8.1, regroupés : 8 n\'a jamais été déployé seul en parc et 8.1 en est la mise à niveau obligatoire. Hors support depuis janvier 2023.' },
  { famille: 'windows_7', groupe: 'windows_bureau', motif: /windows\s*7\b/, perimetre: 'Windows 7, toutes éditions, y compris les postes restés sous contrat ESU expiré. Hors support standard depuis janvier 2020.' },
  { famille: 'windows_vista', groupe: 'windows_bureau', motif: /windows\s*vista/, perimetre: 'Windows Vista, toutes éditions. Hors support depuis avril 2017.' },
  { famille: 'windows_xp', groupe: 'windows_bureau', motif: /windows\s*xp/, perimetre: 'Windows XP, toutes éditions, y compris Embedded et POSReady. Hors support depuis avril 2014.' },
  { famille: 'windows_autre', groupe: 'windows_bureau', motif: /windows/, perimetre: 'Windows de bureau dont la version n\'a pas pu être lue — un libellé réduit à « Microsoft Windows », par exemple. Défaut d\'inventaire : la version existe, elle n\'est pas remontée.' },

  // --- Debian, par version majeure. Nom de code ET numéro, du plus récent au plus ancien.
  // « debian 1 » ne doit jamais capter « debian 12 » : d'où l'ordre et les limites de mot.
  { famille: 'debian_14', groupe: 'debian', motif: /debian[^0-9]*14\b|forky/, perimetre: 'Debian 14 (forky) : version de développement, pas encore publiée en stable. Sa présence en parc serait anormale.' },
  { famille: 'debian_13', groupe: 'debian', motif: /debian[^0-9]*13\b|trixie/, perimetre: 'Debian 13 (trixie). LTS jusqu\'en juin 2030.' },
  { famille: 'debian_12', groupe: 'debian', motif: /debian[^0-9]*12\b|bookworm/, perimetre: 'Debian 12 (bookworm). LTS jusqu\'en juin 2028.' },
  { famille: 'debian_11', groupe: 'debian', motif: /debian[^0-9]*11\b|bullseye/, perimetre: 'Debian 11 (bullseye). LTS jusqu\'en août 2026.' },
  { famille: 'debian_10', groupe: 'debian', motif: /debian[^0-9]*10\b|buster/, perimetre: 'Debian 10 (buster). Hors LTS depuis juin 2024.' },
  { famille: 'debian_9', groupe: 'debian', motif: /debian[^0-9]*9\b|stretch/, perimetre: 'Debian 9 (stretch). Hors support depuis juin 2022.' },
  { famille: 'debian_autre', groupe: 'debian', motif: /debian|jessie|wheezy|squeeze/, perimetre: 'Debian antérieure à 9, ou version illisible dans le libellé. Toutes hors support.' },

  // --- Ubuntu, par version LTS -----------------------------------------------------------
  { famille: 'ubuntu_24_04', groupe: 'ubuntu', motif: /ubuntu[^0-9]*24\.04|noble/, perimetre: 'Ubuntu 24.04 LTS (noble). Support standard jusqu\'en juin 2029.' },
  { famille: 'ubuntu_22_04', groupe: 'ubuntu', motif: /ubuntu[^0-9]*22\.04|jammy/, perimetre: 'Ubuntu 22.04 LTS (jammy). Support standard jusqu\'en juin 2027.' },
  { famille: 'ubuntu_20_04', groupe: 'ubuntu', motif: /ubuntu[^0-9]*20\.04|focal/, perimetre: 'Ubuntu 20.04 LTS (focal). Support standard terminé en mai 2025 ; ESM au-delà.' },
  { famille: 'ubuntu_18_04', groupe: 'ubuntu', motif: /ubuntu[^0-9]*18\.04|bionic/, perimetre: 'Ubuntu 18.04 LTS (bionic). Support standard terminé en mai 2023 ; ESM au-delà.' },
  { famille: 'ubuntu_autre', groupe: 'ubuntu', motif: /ubuntu/, perimetre: 'Ubuntu non LTS, ou version antérieure à 18.04, ou version illisible. Les versions intermédiaires ont neuf mois de support : leur présence en parc est en soi un signal.' },

  // --- Famille Red Hat, distribution par distribution -----------------------------------
  // Elles partagent leur base mais PAS leurs cycles : CentOS 8 s'est arrêté fin 2021 quand
  // RHEL 8 court jusqu'en 2029. Les regrouper effaçait la seule information utile.
  { famille: 'rhel_10', groupe: 'rhel', motif: /(rhel|red\s*hat)[^0-9]*10\b/, perimetre: 'Red Hat Enterprise Linux 10, publiée en 2025. Support complet sur dix ans selon le cycle habituel de Red Hat.' },
  { famille: 'rhel_9', groupe: 'rhel', motif: /(rhel|red\s*hat)[^0-9]*9\b/, perimetre: 'RHEL 9. Support complet jusqu\'en mai 2032.' },
  { famille: 'rhel_8', groupe: 'rhel', motif: /(rhel|red\s*hat)[^0-9]*8\b/, perimetre: 'RHEL 8. Support complet jusqu\'en mai 2029.' },
  { famille: 'rhel_7', groupe: 'rhel', motif: /(rhel|red\s*hat)[^0-9]*7\b/, perimetre: 'RHEL 7. Hors support standard depuis juin 2024.' },
  { famille: 'rhel_autre', groupe: 'rhel', motif: /rhel|red\s*hat/, perimetre: 'RHEL antérieure à 7, ou version illisible dans le libellé.' },
  { famille: 'centos_stream', groupe: 'centos', motif: /centos.*stream/, perimetre: 'CentOS Stream — distribution CONTINUE, en amont de RHEL. N\'a pas de fin de support par version : ne pas la traiter comme un CentOS classique.' },
  { famille: 'centos_8', groupe: 'centos', motif: /centos[^0-9]*8\b/, perimetre: 'CentOS 8. Abandonné par Red Hat fin 2021, bien avant RHEL 8 : c\'est le cas qui justifie de ne pas regrouper la famille.' },
  { famille: 'centos_7', groupe: 'centos', motif: /centos[^0-9]*7\b/, perimetre: 'CentOS 7, toutes éditions. Hors support depuis juin 2024, en même temps que RHEL 7 dont il est la reconstruction.' },
  { famille: 'centos_autre', groupe: 'centos', motif: /centos/, perimetre: 'CentOS antérieur à 7, ou version illisible. Tous hors support.' },
  { famille: 'rocky', groupe: 'rocky', motif: /rocky/, perimetre: 'Rocky Linux, toutes versions. Reconstruction de RHEL, cycles alignés sur elle.' },
  { famille: 'almalinux', groupe: 'almalinux', motif: /alma/, perimetre: 'AlmaLinux, toutes versions. Reconstruction de RHEL, cycles alignés sur elle.' },
  { famille: 'oracle_linux', groupe: 'oracle_linux', motif: /oracle.*linux|\bol[0-9]/, perimetre: 'Oracle Linux, toutes versions. Reconstruction de RHEL.' },
  { famille: 'fedora', groupe: 'fedora', motif: /fedora/, perimetre: 'Fedora, toutes versions. Cycle court — treize mois — et non destinée à la production serveur.' },

  // --- Autres unix ----------------------------------------------------------------------
  { famille: 'macos', groupe: 'macos', motif: /mac\s*os|macos|os\s*x/, perimetre: 'macOS, toutes versions, y compris l\'ancienne numérotation 10.x. Apple ne publie pas ses fins de support à l\'avance : l\'absence de date n\'est pas une lacune.' },
  { famille: 'suse', groupe: 'suse', motif: /suse|sles|opensuse/, perimetre: 'SUSE Linux Enterprise et openSUSE, toutes versions.' },
  { famille: 'alpine', groupe: 'alpine', motif: /alpine/, perimetre: 'Alpine Linux, toutes versions. Cycle de deux ans par version majeure.' },
  { famille: 'arch', groupe: 'arch', motif: /arch\s*linux|endeavour|manjaro/, perimetre: 'Arch et dérivées. Publication CONTINUE : pas de fin de support par version, l\'absence de date est normale.' },
  { famille: 'bsd', groupe: 'bsd', motif: /freebsd|openbsd|netbsd|\bbsd\b/, perimetre: 'FreeBSD, OpenBSD, NetBSD et variantes. Cycles propres à chaque projet, sans rapport avec ceux des distributions Linux.' },
  { famille: 'linux_autre', groupe: 'linux_autre', motif: /linux|mint|gentoo|slackware/, perimetre: 'Autre distribution Linux identifiée comme telle mais sans famille propre.' },
]

/**
 * `autre` ferme le vocabulaire. Ce n'est pas une catégorie honteuse : c\'est la garantie que la
 * partition somme au total.
 */
export const FAMILLES_OS = [...REGLES.map(r => r.famille), 'autre'] as const as readonly string[]
export type FamilleOs = string

/**
 * Les groupes, dans l'ordre de leur première apparition. `autre` ferme le vocabulaire ici comme
 * pour les familles.
 */
export const GROUPES_OS = [...new Set([...REGLES.map(r => r.groupe), 'autre'])] as readonly string[]

/** Le groupe d'une clé. Dérivé de la même table : les deux niveaux ne peuvent pas diverger. */
export function groupeOs(cle: string | null | undefined): string {
  const s = (cle ?? '').toLowerCase().trim()
  if (!s) return 'autre'
  for (const r of REGLES) if (r.motif.test(s)) return r.groupe
  return 'autre'
}

/** Quelles familles composent chaque groupe — publié pour que le rapprochement soit vérifiable. */
export const FAMILLES_DU_GROUPE: Record<string, string[]> = {
  ...REGLES.reduce<Record<string, string[]>>((acc, r) => {
    acc[r.groupe] = [...(acc[r.groupe] ?? []), r.famille]
    return acc
  }, {}),
  autre: ['autre'],
}

export const PERIMETRE_GROUPE: Record<string, string> = Object.fromEntries(
  GROUPES_OS.map(g => [
    g,
    g === 'autre'
      ? 'Systèmes non reconnus par le classement. Voir `famillesNonReconnues` pour le détail clé par clé.'
      : `Toutes versions confondues : ${(FAMILLES_DU_GROUPE[g] ?? []).join(', ')}.`,
  ]),
)

export const PERIMETRE_FAMILLE: Record<string, string> = {
  ...Object.fromEntries(REGLES.map(r => [r.famille, r.perimetre])),
  autre: 'Système non reconnu par le classement, ou nom trop imprécis pour trancher. N\'est PAS une famille : c\'est ce qui reste. Un nombre élevé ici signale un inventaire à compléter, pas un parc exotique — `famillesNonReconnues` en donne le détail, clé par clé.',
}

/** Classe une clé de technologie dans sa famille. Première règle qui correspond. */
export function familleOs(cle: string | null | undefined): FamilleOs {
  const s = (cle ?? '').toLowerCase().trim()
  if (!s) return 'autre'
  for (const r of REGLES) if (r.motif.test(s)) return r.famille
  return 'autre'
}
