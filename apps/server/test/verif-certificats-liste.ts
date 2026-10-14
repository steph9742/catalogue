// ANALYSE D'UNE LISTE DE SITES À SURVEILLER. Cette fonction est le point d'entrée d'un import :
// ce qu'elle laisse passer devient une cible scannée.
import { analyserListeSites } from '../src/utils/certificatScan'

let echecs = 0
const verifie = (nom: string, condition: boolean) => {
  if (!condition) { echecs++; console.error(`  ✗ ${nom}`) }
  else console.log(`  ✓ ${nom}`)
}

console.log('\nAnalyse d\'une liste de sites')

const simple = analyserListeSites('www.example.org')
verifie('un nom d\'hôte seul prend le port 443',
  simple.entrees.length === 1 && simple.entrees[0]!.port === 443)

const url = analyserListeSites('https://ent.example.org/portail?a=1')
verifie('une URL complète est découpée — on n\'exige pas de l\'utilisateur qu\'il le fasse',
  url.entrees[0]!.hote === 'ent.example.org' && url.entrees[0]!.port === 443)

verifie('le port d\'une URL l\'emporte',
  analyserListeSites('https://srv.example.org:8443/').entrees[0]!.port === 8443)

verifie('`hote:port` est accepté tel quel',
  analyserListeSites('mail.example.org:993').entrees[0]!.port === 993)

const avecLibelle = analyserListeSites('ldap.example.org:636 ; Annuaire')
verifie('un séparateur fournit le libellé — coller un extrait de tableur suffit',
  avecLibelle.entrees[0]!.libelle === 'Annuaire')

verifie('la virgule sert aussi de séparateur',
  analyserListeSites('a.example.org,Portail').entrees[0]!.libelle === 'Portail')

// LE POINT QUI COMPTE : une ligne de titre ne doit jamais devenir une cible.
const rejet = analyserListeSites('Nom du site ; Libellé')
verifie('une ligne de titre est rejetée, pas scannée',
  rejet.entrees.length === 0 && rejet.rejets.length === 1)

verifie('un port hors bornes est rejeté',
  analyserListeSites('a.example.org:99999').entrees.length === 0)

verifie('les commentaires et les lignes vides sont ignorés sans devenir des rejets',
  analyserListeSites('# titre\n\n\na.example.org').rejets.length === 0)

const doublons = analyserListeSites('WWW.EXAMPLE.ORG\nwww.example.org\nwww.example.org:443')
verifie('un doublon (casse ou port explicite compris) ne crée qu\'une entrée',
  doublons.entrees.length === 1 && doublons.rejets.length === 0)

verifie('le nom d\'hôte est normalisé en minuscules',
  doublons.entrees[0]!.hote === 'www.example.org')

// Un nom sans point n'est pas rejeté par excès de zèle : c'est le format d'un hôte
// interne non qualifié, qu'on ne veut PAS scanner par erreur depuis un conteneur.
verifie('un nom non qualifié (sans point) est rejeté',
  analyserListeSites('srv-web').entrees.length === 0)

console.log(echecs === 0 ? '\n✓ Analyse de liste : tout est conforme\n' : `\n✗ ${echecs} échec(s)\n`)
process.exit(echecs === 0 ? 0 : 1)
