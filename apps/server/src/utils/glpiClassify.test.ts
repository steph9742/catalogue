import { describe, expect, it } from 'bun:test'
import { classifierParOs, classifierParTypeEtOs } from './glpiClassify'

// La classification est le cœur de l'import GLPI (pas de convention de nommage à
// l'université) : on la verrouille par des cas concrets tirés de l'instance réelle.

describe('classifierParOs (OS seul)', () => {
  it('classe les OS serveur', () => {
    expect(classifierParOs('Microsoft Windows Server 2022 Standard')).toBe('serveur')
    expect(classifierParOs('Ubuntu 22.04 Server')).toBe('serveur')
    expect(classifierParOs('Rocky Linux 9.8 (Blue Onyx)')).toBe('serveur')
    expect(classifierParOs('Red Hat Enterprise Linux 8')).toBe('serveur')
    expect(classifierParOs('VMware ESXi 7.0')).toBe('serveur')
    expect(classifierParOs('Proxmox VE')).toBe('serveur')
  })
  it('classe les OS de poste', () => {
    expect(classifierParOs('Microsoft Windows 11 Pro')).toBe('poste')
    expect(classifierParOs('Windows 10 Entreprise')).toBe('poste')
    expect(classifierParOs('macOS 14 Sonoma')).toBe('poste')
    expect(classifierParOs('ChromeOS')).toBe('poste')
  })
  it('laisse en « à classer » les OS ambigus ou vides', () => {
    expect(classifierParOs('Debian GNU/Linux 12 (bookworm)')).toBe('a_classer')
    expect(classifierParOs('Ubuntu 24.04.4 LTS')).toBe('a_classer')
    expect(classifierParOs('Fedora Linux 40')).toBe('a_classer')
    expect(classifierParOs(null)).toBe('a_classer')
    expect(classifierParOs('')).toBe('a_classer')
  })
})

describe('classifierParTypeEtOs (type châssis + OS)', () => {
  it('châssis serveur physique → serveur, même OS ambigu', () => {
    expect(classifierParTypeEtOs('Rack Mount Chassis', 'Debian GNU/Linux 12')).toBe('serveur')
    expect(classifierParTypeEtOs('Main Server Chassis', null)).toBe('serveur')
    expect(classifierParTypeEtOs('Serveur', 'Ubuntu 24.04')).toBe('serveur')
    expect(classifierParTypeEtOs('lxc', 'Debian 13')).toBe('serveur')
  })
  it('virtualisation → serveur, sauf OS de bureau (VDI) → poste', () => {
    expect(classifierParTypeEtOs('QEMU', 'Debian GNU/Linux 12')).toBe('serveur')
    expect(classifierParTypeEtOs('VMware', 'Ubuntu 24.04')).toBe('serveur')
    expect(classifierParTypeEtOs('Hyper-V', 'Windows Server 2019')).toBe('serveur')
    // VDI : une VM sous OS de bureau est un poste.
    expect(classifierParTypeEtOs('QEMU', 'Microsoft Windows 10 Pro')).toBe('poste')
    expect(classifierParTypeEtOs('VMware', 'macOS 14')).toBe('poste')
  })
  it('PC portable → poste (mais pas « appareil mobile »)', () => {
    expect(classifierParTypeEtOs('Notebook', 'Ubuntu 24.04')).toBe('poste')
    expect(classifierParTypeEtOs('Laptop', 'Rocky Linux 9')).toBe('poste')
  })
  it('tablette / iPad / smartphone → appareil mobile', () => {
    expect(classifierParTypeEtOs('Tablette', null)).toBe('appareil_mobile')
    expect(classifierParTypeEtOs('Tablet', null)).toBe('appareil_mobile')
    // iPad reconnu au nom même sans type ni OS.
    expect(classifierParTypeEtOs(null, null, 'iPad-Bureau-Doyen')).toBe('appareil_mobile')
    // Modèles de tablettes Lenovo qui fuitent dans le type.
    expect(classifierParTypeEtOs('Lenovo TB-X306F', null)).toBe('appareil_mobile')
    expect(classifierParTypeEtOs('TB310FU', null)).toBe('appareil_mobile')
    // Android / iPadOS.
    expect(classifierParTypeEtOs('', 'Android 14', 'SM-T500')).toBe('appareil_mobile')
  })
  it('Raspberry Pi & assimilés → IoT', () => {
    expect(classifierParTypeEtOs('Raspberry Pi 5 Model B', 'Debian 12')).toBe('iot')
    expect(classifierParTypeEtOs(null, null, 'rpi-capteur-salle3')).toBe('iot')
  })
  it('châssis de bureau lève l\'ambiguïté OS vers poste', () => {
    expect(classifierParTypeEtOs('Desktop', 'Debian GNU/Linux 12')).toBe('poste')
    expect(classifierParTypeEtOs('All in One', 'Ubuntu 24.04')).toBe('poste')
    expect(classifierParTypeEtOs('Mini PC', 'Fedora Linux 40')).toBe('poste')
  })
  it('l\'OS net prime sur un châssis de bureau', () => {
    // Desktop sous Windows Server = petit serveur → serveur (l'OS net gagne).
    expect(classifierParTypeEtOs('Desktop', 'Windows Server 2022')).toBe('serveur')
    // Desktop sous Windows 11 → poste.
    expect(classifierParTypeEtOs('Desktop', 'Windows 11 Pro')).toBe('poste')
  })
  it('reste « à classer » si type et OS sont tous deux ambigus', () => {
    expect(classifierParTypeEtOs('Other', 'Linux')).toBe('a_classer')
    expect(classifierParTypeEtOs(null, null)).toBe('a_classer')
    expect(classifierParTypeEtOs('', 'Ubuntu 24.04')).toBe('a_classer')
    expect(classifierParTypeEtOs('(vide)', 'Debian 12', 'poste-labo-42')).toBe('a_classer')
  })
})
