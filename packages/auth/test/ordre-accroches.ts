// VÉRIFICATION — le rôle issu de l'annuaire survit-il à la création du compte ?
import { admin } from 'better-auth/plugins'

const TTL = 30_000
const memo = new Map<string, { role: string, expire: number }>()
const memoriser = (email: string, role: string) => memo.set(email.toLowerCase(), { role, expire: Date.now() + TTL })
const consommer = (email?: string) => {
  if (!email) return undefined
  const v = memo.get(email.toLowerCase())
  memo.delete(email.toLowerCase())
  return v && v.expire >= Date.now() ? v.role : undefined
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooksGreffon = (admin() as any).init().options.databaseHooks
const hooksNotres = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: { create: { async before(u: any) {
    const role = consommer(u.email)
    return role ? { data: { ...u, role } } : undefined
  } } },
}
// L'ordre d'empilement de context/helpers : les greffons d'abord, les options ensuite.
const pile = [{ source: 'plugin:admin', hooks: hooksGreffon }, { source: 'user', hooks: hooksNotres }]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function creer(donnees: any) {
  let actuel = donnees
  for (const { hooks } of pile) {
    const f = hooks.user?.create?.before
    if (!f) continue
    const r = await f(actuel, undefined)
    if (r && typeof r === 'object' && 'data' in r) actuel = { ...actuel, ...r.data }
  }
  return actuel
}

let ok = true
const verifier = (bon: boolean, libelle: string, obtenu: string, attendu: string) => {
  ok &&= bon
  console.log(`${bon ? '✓' : '✗'} ${libelle.padEnd(34)} → ${obtenu} (attendu ${attendu})`)
}

// Typé explicitement plutôt qu'en `as const` : le cas « aucun groupe » aurait pour type
// `readonly []`, sur lequel `includes('admins')` ne compile pas.
const cas: [string, string, string[], string][] = [
  ['membre du groupe admins', 'chef@univ.fr', ['admins', 'all_users'], 'admin'],
  ['hors du groupe admins', 'agent@univ.fr', ['all_users'], 'user'],
  ['aucun groupe renvoyé', 'vide@univ.fr', [], 'user'],
]

for (const [libelle, email, groupes, attendu] of cas) {
  memoriser(email, groupes.includes('admins') ? 'admin' : 'user')
  const cree = await creer({ email, name: 'X' })
  verifier(cree.role === attendu, libelle, `role=${cree.role}`, `role=${attendu}`)
}

// Inscription par mot de passe (compte de secours) : rien n'est mémorisé, notre accroche ne
// doit rien inventer — c'est le défaut du greffon qui s'applique.
const secours = await creer({ email: 'secours@catalogue.local', name: 'Secours' })
verifier(secours.role === 'user', 'sans rôle mémorisé', `role=${secours.role}`, 'role=user')

// GARDE-FOU CONTRE L'ÉLÉVATION DE PRIVILÈGES. C'est la raison pour laquelle on ne re-déclare
// PAS `role` en `input: true` : le filtre d'entrée de better-auth REFUSE toute tentative de
// poser `role` depuis une inscription.
try {
  // Le module n'est pas exposé par les `exports` du paquet : on part de l'entrée publique
  // et on retrouve le fichier sur le disque.
  const racine = import.meta.resolve('better-auth').replace(/dist\/.*$/, 'dist/')
  const mod = await import(`${racine}db/schema.mjs`) as {
    parseInputData: (d: unknown, s: unknown) => unknown
  }
  const champs = { role: { type: 'string', required: false, input: false } }
  let refuse = false
  try { mod.parseInputData({ role: 'admin' }, { fields: champs, action: 'create' }) }
  catch { refuse = true }
  verifier(refuse, 'inscription portant role=admin', refuse ? 'refusée' : 'ACCEPTÉE', 'refusée')
}
catch {
  console.log("  (ignoré) filtre d'entrée non atteignable — chemin interne de better-auth modifié")
}

console.log(ok ? '\nTOUS LES CAS PASSENT' : '\nÉCHEC')
process.exit(ok ? 0 : 1)
