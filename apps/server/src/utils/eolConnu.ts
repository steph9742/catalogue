// Dates de fin de support des systèmes d'exploitation courants. Table INTERNE (aucune
// dépendance réseau) : le connecteur GLPI tourne déjà derrière un VPN, on ne va pas ajouter un
// appel externe pour une donnée qui bouge une fois par an.

export type RegleEol = {
  motif: RegExp
  finDeVie: string // AAAA-MM-JJ, fin du support STANDARD
  libelle: string // ce que la règle a reconnu
}

// L'ordre compte : la première règle qui correspond gagne (du plus précis au plus large).
export const REGLES_EOL: RegleEol[] = [
  // --- Windows Server (avant Windows client : « Server 2019 » contient aussi « 20 ») ---
  { motif: /windows.*server.*2008/i, finDeVie: '2020-01-14', libelle: 'Windows Server 2008 / R2' },
  { motif: /windows.*server.*2012/i, finDeVie: '2023-10-10', libelle: 'Windows Server 2012 / R2' },
  { motif: /windows.*server.*2016/i, finDeVie: '2027-01-12', libelle: 'Windows Server 2016' },
  { motif: /windows.*server.*2019/i, finDeVie: '2029-01-09', libelle: 'Windows Server 2019' },
  { motif: /windows.*server.*2022/i, finDeVie: '2031-10-14', libelle: 'Windows Server 2022' },
  { motif: /windows.*server.*2025/i, finDeVie: '2034-10-10', libelle: 'Windows Server 2025' },

  // --- Windows client ---
  { motif: /windows.*\bxp\b/i, finDeVie: '2014-04-08', libelle: 'Windows XP' },
  { motif: /windows.*\b7\b/i, finDeVie: '2020-01-14', libelle: 'Windows 7' },
  { motif: /windows.*\b8(\.1)?\b/i, finDeVie: '2023-01-10', libelle: 'Windows 8 / 8.1' },
  { motif: /windows.*\b10\b/i, finDeVie: '2025-10-14', libelle: 'Windows 10' },
  { motif: /windows.*\b11\b/i, finDeVie: '2031-10-14', libelle: 'Windows 11' },

  // --- Debian (dates de fin de LTS) ---
  { motif: /debian.*\b10\b|buster/i, finDeVie: '2024-06-30', libelle: 'Debian 10 (buster)' },
  { motif: /debian.*\b11\b|bullseye/i, finDeVie: '2026-08-31', libelle: 'Debian 11 (bullseye)' },
  { motif: /debian.*\b12\b|bookworm/i, finDeVie: '2028-06-30', libelle: 'Debian 12 (bookworm)' },
  { motif: /debian.*\b13\b|trixie/i, finDeVie: '2030-06-30', libelle: 'Debian 13 (trixie)' },

  // --- Ubuntu (fin du support standard LTS, hors ESM) ---
  { motif: /ubuntu.*18\.04/i, finDeVie: '2023-05-31', libelle: 'Ubuntu 18.04 LTS' },
  { motif: /ubuntu.*20\.04/i, finDeVie: '2025-05-31', libelle: 'Ubuntu 20.04 LTS' },
  { motif: /ubuntu.*22\.04/i, finDeVie: '2027-06-01', libelle: 'Ubuntu 22.04 LTS' },
  { motif: /ubuntu.*24\.04/i, finDeVie: '2029-06-01', libelle: 'Ubuntu 24.04 LTS' },

  // --- Famille Red Hat ---
  { motif: /centos.*\b8\b/i, finDeVie: '2021-12-31', libelle: 'CentOS 8' },
  { motif: /centos/i, finDeVie: '2024-06-30', libelle: 'CentOS 7' },
  { motif: /(rhel|red\s*hat).*\b7\b/i, finDeVie: '2024-06-30', libelle: 'RHEL 7' },
  { motif: /(rhel|red\s*hat).*\b8\b/i, finDeVie: '2029-05-31', libelle: 'RHEL 8' },
  { motif: /(rhel|red\s*hat).*\b9\b/i, finDeVie: '2032-05-31', libelle: 'RHEL 9' },
  { motif: /(rocky|alma).*\b8\b/i, finDeVie: '2029-05-31', libelle: 'Rocky/Alma Linux 8' },
  { motif: /(rocky|alma).*\b9\b/i, finDeVie: '2032-05-31', libelle: 'Rocky/Alma Linux 9' },

  // --- Hyperviseurs ---
  { motif: /esxi.*\b7\b|vsphere.*\b7\b/i, finDeVie: '2025-10-02', libelle: 'VMware ESXi 7' },
  { motif: /esxi.*\b8\b|vsphere.*\b8\b/i, finDeVie: '2027-10-11', libelle: 'VMware ESXi 8' },

  // macOS et les distributions non LTS ne publient pas de date de fin de support fiable :
  // volontairement absents, ils remonteront en « fin de vie inconnue ».
]

/** Cherche la date de fin de support d'un OS. `null` si aucune règle ne s\'applique. */
export function eolConnu(os: string | null | undefined): { finDeVie: string, libelle: string } | null {
  const s = (os ?? '').trim()
  if (!s) return null
  for (const r of REGLES_EOL) {
    if (r.motif.test(s)) return { finDeVie: r.finDeVie, libelle: r.libelle }
  }
  return null
}
