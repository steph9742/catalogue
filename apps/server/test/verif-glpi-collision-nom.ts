// VÉRIFICATION — une collision de nom ne casse plus la synchronisation. À lancer, base locale
// montée : bun run apps/server/test/verif-glpi-collision-nom.ts CE QUI S'EST PASSÉ EN
// PRODUCTION.
import { db } from '@catalogue/database'
import { posteTravail } from '@catalogue/database/tables'
import { eq, inArray } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const NOMS = ['zz-verif-collision-a', 'zz-verif-collision-b']
await db.delete(posteTravail).where(inArray(posteTravail.nom, NOMS))

const [pA] = await db.insert(posteTravail).values({ nom: NOMS[0]!, os: 'ancien' }).returning()
const [pB] = await db.insert(posteTravail).values({ nom: NOMS[1]!, os: 'ancien' }).returning()

// 1. Le renommage nu échoue bien — c'est le défaut d'origine, reproduit.
let refuse = false
try {
  await db.update(posteTravail).set({ nom: NOMS[0]! }).where(eq(posteTravail.id, pB!.id))
}
catch { refuse = true }
dire(refuse, 'renommer vers un nom déjà pris est bien refusé par la base (défaut d\'origine)')

// 2. La parade employée par la synchronisation : tout mettre à jour SAUF le nom.
await db.update(posteTravail).set({ os: 'Debian GNU/Linux 13 (trixie)', osVersion: '13.6' }).where(eq(posteTravail.id, pB!.id))
const [apres] = await db.select().from(posteTravail).where(eq(posteTravail.id, pB!.id))
dire(apres?.nom === NOMS[1], 'le nom d\'origine est conservé — aucune fiche n\'est volée à l\'autre')
dire(apres?.os === 'Debian GNU/Linux 13 (trixie)', 'le système EST mis à jour : la machine ne reste pas en arrière')
dire(apres?.osVersion === '13.6', 'la version aussi')

// 3. La détection de collision, telle que l'emploie `appliquerCible`.
const pris = await db.select({ id: posteTravail.id }).from(posteTravail)
  .where(sql`${posteTravail.nom} = ${NOMS[0]} and ${posteTravail.id} <> ${pB!.id}`).limit(1)
dire(pris.length === 1, 'la collision est détectable AVANT l\'écriture (nom pris par une autre ligne)')
const libre = await db.select({ id: posteTravail.id }).from(posteTravail)
  .where(sql`${posteTravail.nom} = ${NOMS[1]} and ${posteTravail.id} <> ${pB!.id}`).limit(1)
dire(libre.length === 0, 'son propre nom n\'est jamais vu comme une collision')

await db.delete(posteTravail).where(inArray(posteTravail.nom, NOMS))
void pA
console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
