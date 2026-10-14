// VÉRIFICATION — les noms qui n'identifient pas une machine. À lancer : bun run
// apps/server/test/verif-glpi-noms.ts POURQUOI.
import { nomIdentifie, serieIdentifie } from '../src/utils/glpiSync'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nNoms de repli — ne doivent JAMAIS servir de clé')
for (const n of ['localhost', 'LOCALHOST', 'localhost.localdomain', 'macOS', 'macos', 'unknown', 'inconnu', 'PC', 'desktop']) {
  dire(!nomIdentifie(n), `« ${n} » n'identifie pas`)
}
dire(!nomIdentifie(''), 'un nom vide n\'identifie pas')
dire(!nomIdentifie(null), 'un nom absent n\'identifie pas')
dire(!nomIdentifie('  localhost  '), 'les espaces autour ne changent rien')

console.log('\nVrais noms — ne doivent JAMAIS être écartés')
for (const n of [
  '912e106-01', 'gaco-port207', 'ksup-appli-preprod1', 'srv-ent-01', 'PORT-CH-07',
  '110K-07', 'VM-PIAM-TEST', 'ubuntu24test', '25-030-P', 'MoodleData',
  // Pièges : ils CONTIENNENT un mot de la liste sans être un nom de repli.
  'pc-salle-204', 'localhost-relais', 'desktop-A12', 'mac-os-lab3', 'PC42',
]) {
  dire(nomIdentifie(n), `« ${n} » identifie bien`)
}

console.log('\nNuméros de série de repli — le piège serait pire que celui des noms')
for (const s of ['To be filled by O.E.M.', 'Default string', 'System Serial Number', 'None', 'N/A', '0', '00000000', 'Not Specified', '']) {
  dire(!serieIdentifie(s), `« ${s || '(vide)'} » n'identifie pas`)
}
dire(!serieIdentifie(null), 'un numéro absent n\'identifie pas')
dire(!serieIdentifie('ABC'), 'trop court pour conclure (moins de 4 caractères utiles)')

console.log('\nVrais numéros de série')
for (const s of ['5CG7192XYZ', 'JQ7ZKM3', 'VMware-42 1a 2b 3c', 'C02XL0AAJGH5', 'PF2M9K7L']) {
  dire(serieIdentifie(s), `« ${s} » identifie bien`)
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
