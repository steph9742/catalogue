// PORTÉE D'UN COMPTE DE SERVICE. Ce contrôle existe parce que la portée totale d'un compte de
// service venait d'un TEST DE NULLITÉ : le middleware ne renseigne pas `ctx.user` pour un
// compte de service, et `readableCategories` traitait « pas d'utilisateur » comme «
// administrateur ».
import { accesDe, porteeService } from '../src/utils/access'
import { CATEGORY_KEYS } from '../src/utils/categories'

let echecs = 0
const verifie = (nom: string, condition: boolean) => {
  if (!condition) { echecs++; console.error(`  ✗ ${nom}`) }
  else console.log(`  ✓ ${nom}`)
}

console.log('\nPortée d\'un compte de service')

verifie('`read` ouvre toutes les catégories — c\'est l\'arbitrage, désormais écrit',
  porteeService(['read']).size === CATEGORY_KEYS.length)

verifie('`admin` aussi',
  porteeService(['admin']).size === CATEGORY_KEYS.length)

// LE POINT CENTRAL : avant, un compte sans aucun scope lisait tout le Catalogue.
verifie('aucun scope → AUCUNE catégorie (et non plus toutes)',
  porteeService([]).size === 0)
verifie('scopes indéfinis → aucune catégorie',
  porteeService(undefined).size === 0)
verifie('`write` seul ne donne pas la lecture par accident',
  porteeService(['write']).size === 0)

const restreint = porteeService(['read', 'cat:whitelists', 'cat:applications'])
verifie('des scopes `cat:` restreignent, même en présence de `read`',
  restreint.size === 2 && restreint.has('whitelists') && restreint.has('applications'))

verifie('une catégorie inconnue dans un scope `cat:` est ignorée, pas inventée',
  porteeService(['cat:whitelists', 'cat:nexistepas']).size === 1)

console.log('\nRésolution de l\'accès porté par la requête')

verifie('une session l\'emporte et passe telle quelle',
  accesDe({ user: { id: 'u1', role: 'admin' } })?.role === 'admin')

const svc = accesDe({ service_account: { id: 'sa1', name: 'assistant', scopes: ['read'] } })
verifie('un compte de service devient un accès de rôle `service`',
  svc?.role === 'service' && svc?.id === 'sa1')
verifie('ses scopes sont conservés',
  (svc?.scopes ?? []).includes('read'))

verifie('ni session ni compte → aucun accès',
  accesDe({}) === undefined)

// Un compte de service ne doit surtout pas être confondu avec un administrateur : son
// identifiant n'existe pas dans la table `user`, et le journal d'audit n'y verrait personne.
verifie('un compte de service n\'est jamais `admin`',
  svc?.role !== 'admin')

console.log('\nGarde par catégorie — ce que la portée autorise')

// La garde `can` laissait passer TOUTE clé valide sans regarder les scopes : le même
// raisonnement fautif que dans `readableCategories`, au même endroit — « authentifié » confondu
// avec « autorisé ».
const autorise = (scopes: string[], categorie: string, niveau: 'read' | 'write') => {
  if (!porteeService(scopes).has(categorie)) return false
  if (niveau === 'write' && !scopes.includes('write') && !scopes.includes('admin')) return false
  return true
}

verifie('lecture autorisée sur une catégorie dans la portée',
  autorise(['read'], 'whitelists', 'read'))
verifie('lecture REFUSÉE hors de la portée déclarée',
  !autorise(['read', 'cat:applications'], 'whitelists', 'read'))
verifie('écriture refusée à un compte de lecture, même dans sa portée',
  !autorise(['read'], 'whitelists', 'write'))
verifie('écriture autorisée avec `write`',
  autorise(['read', 'write'], 'whitelists', 'write'))
verifie('une clé valide sans scope n\'ouvre plus rien',
  !autorise([], 'whitelists', 'read'))

console.log(echecs === 0 ? '\n✓ Portée de service : tout est conforme\n' : `\n✗ ${echecs} échec(s)\n`)
process.exit(echecs === 0 ? 0 : 1)
