// ZONE DNS ET TRANSFERT — lire tous les noms, et ne rien laisser passer à `dig` qui n'en soit pas un.
import { lireZone, nomsDeLaZone } from '../src/utils/zoneDns'
import { argumentsDig, diagnostic, fichierCle, verifierParametres } from '../src/utils/axfr'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const SORTIE_AXFR = `
; <<>> DiG 9.18.49 <<>> AXFR example.org @192.0.2.53
;; global options: +cmd
example.org.		3600	IN	SOA	ns.example.org. hostmaster.example.org. 2026091501 3600 900 604800 3600
example.org.		3600	IN	NS	ufc.example.org.
example.org.		3600	IN	A	192.0.2.10
www.example.org.	3600	IN	CNAME	example.org.
moodle.example.org.	300	IN	A	192.0.2.20
moodle.example.org.	300	IN	AAAA	2001:660:3301::20
mail.example.org.	3600	IN	MX	10 mx.example.org.
*.dev.example.org.	3600	IN	A	192.0.2.99
blog.example.org.	3600	IN	CNAME	exemple.github.io.
_dmarc.example.org.	3600	IN	TXT	"v=DMARC1; p=none"
example.org.		3600	IN	SOA	ns.example.org. hostmaster.example.org. 2026091501 3600 900 604800 3600
;; Query time: 12 msec
`

console.log('\nLa sortie de dig AXFR')
{
  const { enregistrements, jokers } = lireZone(SORTIE_AXFR, 'example.org')
  const noms = nomsDeLaZone(enregistrements)
  dire(noms.map(n => n.hote).join() === 'blog.example.org,example.org,moodle.example.org,www.example.org', `quatre noms de sites (${noms.map(n => n.hote).join(', ')})`)
  const moodle = noms.find(n => n.hote === 'moodle.example.org')!
  dire(moodle.adresses.join() === '192.0.2.20,2001:660:3301::20', 'A et AAAA d\'un même nom regroupés')
  dire(noms.find(n => n.hote === 'blog.example.org')?.cnames[0] === 'exemple.github.io', 'un alias hors du domaine est gardé avec sa cible')
  dire(jokers === 1, 'l\'enregistrement joker est compté, pas proposé')
  dire(!noms.some(n => n.hote.startsWith('_') || n.hote.startsWith('mail')), 'TXT et MX ne sont pas des sites')
}

const FICHIER_BIND = `
$ORIGIN example.org.
$TTL 3600
@	IN	SOA	ns1 hostmaster (
		2026091501 ; numéro de série
		3600 900 604800 3600 )
	IN	NS	ns1
	IN	A	192.0.2.10
intranet	IN	A	10.0.0.5 ; interne
pufc		A	192.0.2.30
		AAAA	2001:660::30
$ORIGIN iut.example.org.
geii	CNAME	www
autre.example.com.	IN	A	1.2.3.4
`

console.log('\nUn fichier de zone BIND')
{
  const noms = nomsDeLaZone(lireZone(FICHIER_BIND, 'example.org').enregistrements)
  const h = (x: string) => noms.find(n => n.hote === x)
  dire(h('example.org')?.adresses[0] === '192.0.2.10', '« @ » puis lignes sans nom : le domaine lui-même')
  dire(h('intranet.example.org')?.adresses[0] === '10.0.0.5', 'nom relatif complété par $ORIGIN, commentaire ignoré')
  dire(h('pufc.example.org')?.adresses.join() === '192.0.2.30,2001:660::30', 'une ligne sans nom reprend le nom précédent')
  dire(h('geii.iut.example.org')?.cnames[0] === 'www.iut.example.org', 'un second $ORIGIN s\'applique aux noms et aux cibles')
  dire(!h('autre.example.com'), 'un nom hors du domaine est écarté')
  dire(noms.length === 4, `le SOA sur plusieurs lignes ne produit rien (${noms.length} noms)`)
}

console.log('\nRIEN D\'AUTRE QU\'UN NOM NE PASSE À dig')
dire(verifierParametres('example.org', '192.0.2.53') === null, 'domaine et adresse valides acceptés')
dire(verifierParametres('example.org', 'ufc.example.org') === null, 'un nom de serveur accepté')
dire(verifierParametres('example.org', '-f/etc/passwd') !== null, 'un serveur qui ressemble à une option est refusé')
dire(verifierParametres('example.org', '1.2.3.4; rm -rf /') !== null, 'un serveur avec une commande est refusé')
dire(verifierParametres('example.org --x', '1.2.3.4') !== null, 'un domaine invalide est refusé')
dire(verifierParametres('example.org', '1.2.3.4', { nom: 'catalogue-axfr', algorithme: 'hmac-sha256', secret: 'c2VjcmV0LXRzaWctZGUtdGVzdA==' }) === null, 'une clé TSIG valide acceptée')
dire(verifierParametres('example.org', '1.2.3.4', { nom: 'cle"; };', algorithme: 'hmac-sha256', secret: 'c2VjcmV0' }) !== null, 'un nom de clé qui casserait le fichier est refusé')
dire(verifierParametres('example.org', '1.2.3.4', { nom: 'cle', algorithme: 'rot13', secret: 'c2VjcmV0LXRz' }) !== null, 'un algorithme inconnu est refusé')

console.log('\nLe secret ne passe pas en argument')
{
  const args = argumentsDig('example.org', '192.0.2.53', '/tmp/catalogue-tsig-x/cle.conf')
  dire(args.join(' ') === 'AXFR example.org @192.0.2.53 +time=10 +tries=1 -k /tmp/catalogue-tsig-x/cle.conf', 'la clé est un chemin de fichier, jamais le secret')
  dire(fichierCle({ nom: 'catalogue-axfr', algorithme: 'hmac-sha256', secret: 'c2VjcmV0' }).includes('algorithm hmac-sha256;'), 'le fichier de clé est au format attendu par dig')
}

console.log('\nChaque échec dit à qui s\'adresser')
dire(diagnostic('; Transfer failed.')?.includes('allow-transfer') ?? false, 'refus : configuration du serveur DNS')
dire(diagnostic(';; Couldn\'t verify signature: tsig verify failure (BADSIG)')?.includes('TSIG') ?? false, 'clé refusée : secret ou horloge')
dire(diagnostic(';; communications error to 192.0.2.53#53: timed out')?.includes('injoignable') ?? false, 'serveur injoignable : réseau')
dire(diagnostic(SORTIE_AXFR) === null, 'un transfert complet n\'est pas un échec')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
