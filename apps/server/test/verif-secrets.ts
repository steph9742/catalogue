// VÉRIFICATION — chiffrement des secrets de connecteur. À lancer : bun run
// apps/server/test/verif-secrets.ts CE QUI EST EN JEU.
process.env.SETTINGS_ENCRYPTION_KEY ||= 'cle-dessai-du-controle-des-secrets'

// `export {}` : sans lui, ce fichier n'est pas un module et l'import dynamique de
// premier niveau est refusé par TypeScript.
export {}

const { chiffrer, dechiffrer, estChiffre } = await import('../src/utils/secrets')

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

console.log('\nAller-retour')
for (const v of ['sk_abcdef123456', 'jeton-avec-accents-éàü', 'a', 'x'.repeat(4000), '{"json":"aussi"}']) {
  const c = chiffrer(v)
  dire(dechiffrer(c) === v, `« ${v.slice(0, 28)}${v.length > 28 ? '…' : ''} » revient intact`)
}

console.log('\nLe chiffré ne ressemble jamais au clair')
const secret = 'sk_ne_doit_pas_apparaitre'
const chiffre = chiffrer(secret)
dire(!chiffre.includes(secret), 'la valeur d\'origine n\'apparaît pas dans le résultat')
dire(estChiffre(chiffre), 'le résultat se reconnaît à son préfixe de version')
dire(chiffrer(secret) !== chiffrer(secret), 'deux chiffrements du MÊME secret diffèrent (vecteur aléatoire)')

console.log('\nTolérance au texte clair — c\'est ce qui évite une migration de données')
dire(dechiffrer('jeton-en-clair-existant') === 'jeton-en-clair-existant', 'une valeur non chiffrée traverse telle quelle')
dire(!estChiffre('jeton-en-clair-existant'), 'et elle n\'est pas prise pour du chiffré')
dire(dechiffrer(null) === null, 'une valeur absente rend null')
dire(dechiffrer('') === null, 'une valeur vide rend null')

console.log('\nClé changée : on rend null, on ne devine pas')
// Un chiffré valide dans sa forme, mais dont le contenu ne correspond à aucune clé connue.
const faux = chiffre.slice(0, -8) + 'AAAAAAAA'
dire(dechiffrer(faux) === null, 'un chiffré non déchiffrable rend null (jamais des octets illisibles)')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
