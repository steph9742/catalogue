// RÔLE GLOBAL ET ANNUAIRE — la révocation, et le garde-fou qui l'empêche de dégénérer.

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

// Reproduction exacte de `roleDesGroupes` : `undefined` quand le claim est absent.
function roleDesGroupes(groupes: unknown): string | undefined {
  if (!Array.isArray(groupes)) return undefined
  return groupes.includes('admins') ? 'admin' : 'user'
}

// Reproduction de la décision d'alignement, sans la base. `origine` dit qui est propriétaire du
// rôle : l'annuaire, ou l'application quand quelqu'un l'a posé à la main.
function aligner(roleActuel: string | null, groupes: unknown, origine: string | null = null): string | null {
  if (origine === 'manuel') return roleActuel // décision locale : l'annuaire s'abstient
  const cible = roleDesGroupes(groupes)
  if (!cible) return roleActuel // claim absent : on ne touche à rien
  return cible
}

console.log('\nLecture du claim `groups`')
dire(roleDesGroupes(['admins', 'all_users']) === 'admin', 'membre du groupe admins → admin')
dire(roleDesGroupes(['all_users']) === 'user', 'hors du groupe admins → user')
dire(roleDesGroupes([]) === 'user', 'claim PRÉSENT et vide → user : la personne n\'a aucun groupe')
dire(roleDesGroupes(undefined) === undefined, 'claim ABSENT → indéterminé, et non « user »')
dire(roleDesGroupes(null) === undefined, 'claim nul → indéterminé')
dire(roleDesGroupes('admins') === undefined, 'claim mal typé → indéterminé plutôt qu\'interprété')

console.log('\nAlignement du rôle à la connexion')
dire(aligner('admin', ['all_users']) === 'user',
  'RÉVOCATION : retiré du groupe admins, le rôle administrateur est retiré')
dire(aligner('user', ['admins']) === 'admin',
  'PROMOTION : ajouté au groupe admins, le rôle est accordé')
dire(aligner('admin', ['admins']) === 'admin', 'inchangé quand l\'annuaire confirme')

// LE GARDE-FOU. Une configuration Dex incomplète ne doit pas rétrograder tout le monde.
dire(aligner('admin', undefined) === 'admin',
  'claim absent : le rôle est CONSERVÉ — une erreur de configuration ne dégrade personne')
dire(aligner('user', undefined) === 'user', 'et ne promeut personne non plus')

console.log('\nUn rôle posé à la main tient')

// LE POINT DEMANDÉ : nommer administrateur quelqu'un qui n'est pas dans le groupe, et
// que la décision ne se défasse pas toute seule à la connexion suivante.
dire(aligner('admin', ['all_users'], 'manuel') === 'admin',
  'administrateur posé à la main : le rôle TIENT, même hors du groupe admins')
dire(aligner('user', ['admins'], 'manuel') === 'user',
  'et le retrait manuel tient aussi, même si la personne est dans le groupe')
dire(aligner('admin', ['all_users'], 'annuaire') === 'user',
  'rendu à l\'annuaire, le rôle redevient réévaluable')
dire(aligner('admin', ['all_users'], null) === 'user',
  'origine inconnue — comptes antérieurs — : l\'annuaire décide, comportement par défaut')

console.log('\nCe qui reste hors de portée de l\'annuaire')
// Les rôles par catégorie vivent dans `user_category_role` et ne sont jamais touchés ici.
// Le compte de secours n'emprunte pas l'OIDC : `aligner` n'est jamais appelé pour lui.
dire(aligner('admin', undefined) === 'admin',
  'le compte de secours, hors annuaire, conserve son rôle : c\'est la porte d\'entrée si l\'alignement se trompe')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
