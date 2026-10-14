// LE DIALECTE ARTEMIS — ce que la traduction doit garantir. À lancer : bun
// apps/server/test/verif-artemis.ts Trois propriétés, et chacune a un coût précis quand elle
// tombe : - la CLÉ est stable d'un relevé à l'autre, sinon l'inventaire se remplit de doublons
// et chaque décision prise (accepté…
import { cibleDe, cleStable, faitStable, modulesConnus, traduireResultats } from '../src/utils/artemis'
import { CATEGORIES_CONSTAT, GRAVITES_CONSTAT, lireConstat } from '../src/utils/constatCycle'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const resultat = (x: Record<string, unknown> = {}) => ({
  status: 'INTERESTING',
  id: crypto.randomUUID(),
  receiver: 'port_scanner',
  status_reason: 'Found ports: 443 (service: http ssl: True, version: nginx), 80 (service: http ssl: False, version: nginx)',
  created_at: '2026-10-13T08:54:42.916028',
  task: { payload: { domain: 'cyber.exemple.fr' }, payload_persistent: { original_target: 'cyber.exemple.fr' } },
  ...x,
})

console.log('\nLa cible : hôte, et port quand il est dit')
dire(cibleDe(resultat())?.hote === 'cyber.exemple.fr', 'le domaine de la charge utile')
dire(cibleDe(resultat({ task: { payload: { url: 'https://www.exemple.fr:8443/x' } } }))?.port === 8443, 'une URL donne son port')
dire(cibleDe(resultat({ task: { payload: { url: 'https://www.exemple.fr/x' } } }))?.port === 443, 'https sans port vaut 443')
dire(cibleDe(resultat({ task: { payload: {}, payload_persistent: { original_target: 'MSHE.Exemple.fr.' } } }))?.hote === 'mshe.exemple.fr',
  'la cible d\'origine sert de repli, en minuscules et sans point final')
dire(cibleDe(resultat({ task: { payload: {} } })) === null, 'sans cible lisible, rien n\'est fabriqué')

console.log('\nLA CLÉ STABLE — ce qui ne doit pas bouger d\'un relevé à l\'autre')
// Le cas qui compte : nginx est mis à jour, la liste des ports n'a pas changé.
const avant = faitStable('port_scanner', 'Found ports: 443 (service: http ssl: True, version: nginx), 80 (service: http ssl: False, version: nginx)')
const apres = faitStable('port_scanner', 'Found ports: 80 (service: http ssl: False, version: nginx/1.27.2), 443 (service: http ssl: True, version: nginx/1.27.2)')
dire(avant === apres, 'même ensemble de ports, version du serveur changée et ordre inversé : même fait')
dire(faitStable('port_scanner', 'Found ports: 443 (service: http)') !== avant, 'un port qui disparaît fait un AUTRE constat')
dire(faitStable('humble', 'Missing header: Content-Security-Policy, scan took 12.4 seconds')
  === faitStable('humble', 'Missing header: Content-Security-Policy, scan took 3.1 seconds'),
'une durée de scan ne distingue pas deux constats')
dire(faitStable('ssl_checks', 'Certificate expires 2026-11-02') === faitStable('ssl_checks', 'Certificate expires 2027-01-15'),
  'une date dans le texte ne distingue pas deux constats — c\'est le même fait, pas un nouveau')
const k = cleStable('port_scanner', 'cyber.exemple.fr', null, avant)
dire(k === cleStable('port_scanner', 'cyber.exemple.fr', null, avant) && k.length === 64, 'la clé est déterministe, et tient dans le champ')
dire(k !== cleStable('port_scanner', 'autre.exemple.fr', null, avant), 'deux hôtes ne partagent pas une clé')
dire(k !== cleStable('nuclei', 'cyber.exemple.fr', null, avant), 'deux modules non plus')

console.log('\nLa traduction passe par la MÊME validation que le contrat')
{
  const t = traduireResultats([resultat()], null)
  dire(t.constats.length === 1, 'un résultat intéressant donne un constat')
  const l = lireConstat(t.constats[0])
  dire(l.ok, `le constat traduit est accepté par lireConstat (${l.ok ? '' : l.motif})`)
  if (l.ok) {
    dire(l.constat.categorie === 'port' && l.constat.gravite === 'info', 'un port ouvert est un fait : catégorie `port`, gravité `info`')
    dire(l.constat.reference === 'artemis:port_scanner', 'le module reste lisible dans le constat')
    dire(l.constat.releveLe.toISOString() === '2026-10-13T08:54:42.916Z', 'la date sans fuseau est lue en UTC, pas en heure locale')
  }
}

console.log('\nCE QUI N\'EST PAS TRADUIT est compté et NOMMÉ')
{
  const t = traduireResultats([
    resultat({ receiver: 'module_inconnu_42' }),
    resultat({ receiver: 'module_inconnu_42' }),
    resultat({ status: 'OK' }),
  ], null)
  dire(t.constats.length === 0, 'rien n\'est rangé au hasard')
  dire(t.modulesInconnus.module_inconnu_42 === 2, 'le module inconnu est compté, avec son nom')
  dire(t.sansInteret === 1, 'ce qu\'Artemis ne tient pas pour intéressant est écarté, et dit')
}

console.log('\nLE CURSEUR FILTRE ICI — Artemis accepte `created_at_gt` et l\'ignore')
{
  const t = traduireResultats([
    resultat({ created_at: '2026-10-10T00:00:00' }),
    resultat({ created_at: '2026-10-14T00:00:00', task: { payload: { domain: 'neuf.exemple.fr' } } }),
  ], new Date('2026-10-12T00:00:00Z'))
  dire(t.constats.length === 1, 'un résultat antérieur au curseur ne revient pas')
  dire(t.actifsReleves.length === 1 && t.actifsReleves[0]!.hote === 'neuf.exemple.fr',
    'et l\'actif relevé qui l\'accompagne non plus')
}

console.log('\nLes actifs relevés : ce qui permet de confirmer une correction')
{
  const t = traduireResultats([
    resultat({ status: 'OK' }),
    resultat({ status: 'OK', task: { payload: { domain: 'cyber.exemple.fr' } } }),
  ], null)
  dire(t.actifsReleves.length === 1, 'un actif relevé deux fois ne compte qu\'une fois')
  dire(t.constats.length === 0 && t.actifsReleves[0]!.hote === 'cyber.exemple.fr',
    'un actif SANS constat est quand même rendu comme relevé — sinon aucune correction ne se confirme')
}

console.log('\nLa table de rangement ne peut pas désigner l\'inconnu')
{
  const mauvais = modulesConnus().filter(m => !(CATEGORIES_CONSTAT as readonly string[]).includes(m.categorie)
    || !(GRAVITES_CONSTAT as readonly string[]).includes(m.gravite))
  dire(mauvais.length === 0,
    `les ${modulesConnus().length} modules rangés le sont dans des catégories et gravités qui existent${mauvais.length ? ` — ${mauvais.map(m => m.module).join(', ')}` : ''}`)
}

console.log('\nUne réponse qui n\'est pas une liste est une ERREUR, pas « zéro résultat »')
{
  let leve = false
  try { traduireResultats({ detail: 'Not Found' }, null) }
  catch { leve = true }
  dire(leve, 'un objet d\'erreur ne se lit pas comme un parc sain')
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
