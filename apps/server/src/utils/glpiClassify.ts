// Classification serveur / poste à partir du SEUL système d'exploitation.

export type Classement = 'serveur' | 'poste' | 'appareil_mobile' | 'iot' | 'a_classer'

// Distributions clairement orientées serveur (édition entreprise / hyperviseurs).
const SERVEUR = [
  /windows\s*server/,
  /esxi|vmware\s*esx|vsphere/,
  /proxmox|xenserver|xcp-?ng|hyper-?v/,
  /red\s*hat\s*enterprise|rhel|centos|rocky|almalinux|alma\s*linux/,
  /suse\s*linux\s*enterprise|sles/,
  /oracle\s*linux/,
]

// Systèmes de poste de travail sans ambiguïté.
const POSTE = [
  /windows\s*(11|10|8\.1|8|7|xp|vista)/,
  /mac\s*os|macos|os\s*x|darwin/,
  /chrome\s*os/,
]

/**
 * Déduit le classement d'une machine à partir de son OS. Renvoie \'a_classer' si l'OS est vide,
 * générique ou ambigu (Ubuntu/Debian « nu », Fedora, Mint, Linux sans précision…).
 */
export function classifierParOs(os: string | null | undefined): Classement {
  const s = (os ?? '').toLowerCase().trim()
  if (!s) return 'a_classer'
  // Le mot « server » couvre Windows Server ET « Ubuntu Server », « Debian … server ».
  if (s.includes('server')) return 'serveur'
  if (SERVEUR.some(re => re.test(s))) return 'serveur'
  if (POSTE.some(re => re.test(s))) return 'poste'
  return 'a_classer'
}

// --- Classification affinée par le TYPE (facteur de forme / châssis) GLPI ------------
// Le champ « Type d'ordinateur » de GLPI porte en réalité le châssis SMBIOS (Desktop, Notebook,
// Rack Mount Chassis, QEMU, VMware…).

// Châssis physiques de serveur, sans ambiguïté.
const CHASSIS_SERVEUR = new Set([
  'rack mount chassis', 'main server chassis', 'serveur', 'server', 'blade', 'lxc',
])
// Virtualisation : dans un datacenter, une VM est le plus souvent un serveur — SAUF si
// elle tourne un OS de bureau (Windows 10/macOS), auquel cas c'est un bureau virtuel (VDI).
const CHASSIS_VIRT = new Set([
  'qemu', 'vmware', 'hyper-v', 'hyperv', 'virtual machine', 'virtualbox', 'virtual box', 'kvm', 'xen',
])
// PC portables : jamais un serveur, mais restent des POSTES de travail (pas « mobiles »).
const CHASSIS_PORTABLE = new Set([
  'notebook', 'laptop', 'portable', 'convertible', 'detachable',
  'lunch box', 'workstation laptop',
])
// Châssis de bureau : tranche vers « poste » uniquement quand l'OS est ambigu.
const CHASSIS_BUREAU = new Set([
  'desktop', 'all in one', 'mini tower', 'tower', 'mini pc', 'space-saving',
  'low profile desktop', 'workstation', 'nettop', 'sff', 'small form factor',
])

// Appareil mobile = tablette / iPad / smartphone. GLPI les remonte comme « Computer » de type «
// Tablette », ou avec le modèle dans le type (Lenovo TB-…), ou reconnaissables au nom (~ iPad)
// ou à l'OS (iPadOS / iOS / Android).
function estMobile(type: string, nom: string, os: string): boolean {
  if (type === 'tablet' || type === 'tablette') return true
  if (/ipad/.test(nom)) return true
  if (/^tb[-\s]?x?\d|lenovo\s*tb/.test(type)) return true // modèles de tablettes Lenovo
  if (/ipad|\bios\b|android/.test(os)) return true
  return false
}
// IoT / objet connecté : Raspberry Pi et assimilés (nano-ordinateurs, capteurs…).
function estIot(type: string, nom: string): boolean {
  return /raspberry\s*pi|raspberrypi|\brpi\b/.test(`${type} ${nom}`)
}

export function classifierParTypeEtOs(
  type: string | null | undefined,
  os: string | null | undefined,
  nom?: string | null | undefined,
): Classement {
  const t = (type ?? '').toLowerCase().trim()
  const n = (nom ?? '').toLowerCase()
  const o = (os ?? '').toLowerCase()
  const parOs = classifierParOs(os)
  if (CHASSIS_SERVEUR.has(t)) return 'serveur'
  if (CHASSIS_VIRT.has(t)) return parOs === 'poste' ? 'poste' : 'serveur'
  if (estMobile(t, n, o)) return 'appareil_mobile'
  if (estIot(t, n)) return 'iot'
  if (CHASSIS_PORTABLE.has(t)) return 'poste'
  if (parOs !== 'a_classer') return parOs
  if (CHASSIS_BUREAU.has(t)) return 'poste'
  return 'a_classer'
}
