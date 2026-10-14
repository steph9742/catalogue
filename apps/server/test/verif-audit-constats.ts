import { dateDeRetest, integrer, lireConstat, lireResultats, transition, type ConstatRecu, type EtatConstat } from '../src/utils/constatCycle'
import { adresseMoteur, envoyerPerimetre, lireListeDomaines, lireListePlages, recupererResultats, testerConnexionAudit, type Perimetre } from '../src/utils/auditClient'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const brut = (x: Record<string, unknown> = {}) => ({
  actif: { hote: 'PAIEMENT.EXAMPLE.ORG', port: 443, url: 'https://paiement.example.org/paiement' },
  releve_le: '2026-09-14T02:00:00Z',
  categorie: 'outil_expose',
  gravite: 'elevee',
  titre: 'Adminer accessible publiquement',
  detail: 'Page de connexion Adminer servie sans restriction.',
  preuve: 'https://paiement.example.org/adminer.php',
  reference: 'nuclei:adminer-panel',
  cle_stable: 'abc123',
  ...x,
})
const MAINTENANT = new Date('2026-09-15T00:00:00Z')

console.log('\nUn constat au format §9 est lu, normalisé')
{
  const l = lireConstat(brut(), MAINTENANT)
  dire(l.ok, 'le constat conforme est accepté')
  dire(l.ok && l.constat.actif.hote === 'paiement.example.org', 'l\'hôte est ramené en minuscules — sinon deux clés pour un même site')
}

console.log('\nCE QUI SORT DU FORMAT EST REFUSÉ, avec son motif')
{
  const refus = (x: Record<string, unknown>) => {
    const l = lireConstat(brut(x), MAINTENANT)
    return l.ok ? null : l.motif
  }
  dire(refus({ categorie: 'autre' })?.includes('catégorie inconnue') ?? false, 'une catégorie hors liste n\'est pas rangée en « autre »')
  dire(refus({ gravite: 'haute' })?.includes('gravité inconnue') ?? false, 'une gravité hors liste est refusée')
  dire(refus({ cle_stable: '' }) === 'cle_stable absente', 'sans cle_stable, pas de suivi possible : refusé')
  dire(!!refus({ actif: { hote: 'x y; rm -rf', port: 443 } }), 'un hôte qui n\'est pas un nom d\'hôte est refusé')
  dire(!!refus({ actif: { hote: 'a.fr', port: 70000 } }), 'un port hors bornes est refusé')
  dire(!!refus({ releve_le: '2026-09-20T00:00:00Z' }), 'un relevé daté dans le futur est refusé — il bloquerait le curseur')
  dire(!!refus({ titre: '   ' }), 'un titre vide est refusé')
}

console.log('\nLe contenu est BORNÉ, et une URL non http n\'est pas gardée')
{
  const l = lireConstat(brut({ detail: 'x'.repeat(100_000), actif: { hote: 'a.fr', port: 443, url: 'javascript:alert(1)' } }), MAINTENANT)
  dire(l.ok && (l.constat.detail?.length ?? 0) <= 4000, 'un détail de 100 Ko est tronqué')
  dire(l.ok && l.constat.actif.url === null, 'une URL javascript: ne devient pas un lien')
}

console.log('\nL\'enveloppe des résultats')
{
  dire(lireResultats([brut()]).constats.length === 1 && lireResultats([brut()]).actifsReleves === null,
    'une liste nue est lue comme des constats, sans liste d\'actifs relevés')
  const o = lireResultats({ constats: [brut()], actifs: [{ hote: 'A.fr', port: null, releve_le: '2026-09-14T03:00:00Z' }, { hote: '' }], jusqu_a: '2026-09-14T04:00:00Z' })
  dire(o.actifsReleves?.length === 1 && o.actifsReleves[0]!.hote === 'a.fr', 'les actifs relevés illisibles sont écartés, les autres normalisés')
  dire(o.jusquA?.toISOString() === '2026-09-14T04:00:00.000Z', 'jusqu_a est lu')
  let leve = false
  try { lireResultats({ resultats: [] }) }
  catch { leve = true }
  dire(leve, 'une réponse sans « constats » est une erreur, pas « zéro constat »')
}

const recu = (jour: number, x: Partial<ConstatRecu> = {}): ConstatRecu => {
  const l = lireConstat(brut({ releve_le: `2026-09-${String(jour).padStart(2, '0')}T02:00:00Z` }), MAINTENANT)
  if (!l.ok) throw new Error(l.motif)
  return { ...l.constat, ...x }
}
const etat = (x: Partial<EtatConstat> = {}): EtatConstat => ({
  statut: 'ouvert', dernierReleveLe: new Date('2026-09-07T02:00:00Z'), corrigeLe: null, retesteLe: null,
  acceptationEcheance: null, observations: 1, ...x,
})

console.log('\nIDEMPOTENCE : relire la même page ne compte pas deux observations')
{
  dire(integrer(etat(), recu(7), '2026-09-15').action === 'ignorer', 'un relevé à la même date est ignoré')
  dire(integrer(etat(), recu(5), '2026-09-15').action === 'ignorer', 'un relevé antérieur est ignoré')
  const i = integrer(etat(), recu(14), '2026-09-15')
  dire(i.action === 'mettre_a_jour' && i.patch.observations === 2 && !i.reouvert, 'un relevé postérieur compte une observation, sans changer le statut')
}

console.log('\nUN CONSTAT QUI REVIENT SE ROUVRE')
{
  const corrige = integrer(etat({ statut: 'corrige', corrigeLe: new Date('2026-09-10T00:00:00Z') }), recu(14), '2026-09-15')
  dire(corrige.action === 'mettre_a_jour' && corrige.reouvert && corrige.patch.statut === 'ouvert',
    'corrigé le 10, revu le 14 : la correction n\'a pas tenu, il se rouvre')
  const reteste = integrer(etat({ statut: 'reteste', retesteLe: new Date('2026-09-12T00:00:00Z') }), recu(14), '2026-09-15')
  dire(reteste.action === 'mettre_a_jour' && reteste.reouvert, 'confirmé corrigé le 12, revu le 14 : il se rouvre')
}

console.log('\nUNE ACCEPTATION TIENT JUSQU\'À SON ÉCHÉANCE, pas au-delà')
{
  const dans = integrer(etat({ statut: 'accepte', acceptationEcheance: '2026-12-31' }), recu(14), '2026-09-15')
  dire(dans.action === 'mettre_a_jour' && !dans.reouvert, 'revu dans l\'échéance, il reste accepté — c\'est ce qui a été décidé')
  const echue = integrer(etat({ statut: 'accepte', acceptationEcheance: '2026-09-01' }), recu(14), '2026-09-15')
  dire(echue.action === 'mettre_a_jour' && echue.reouvert, 'revu après l\'échéance, il se rouvre')
}

console.log('\nUNE CORRECTION NE SE CONFIRME PAS SUR UNE ABSENCE')
{
  const c = { statut: 'corrige' as const, corrigeLe: new Date('2026-09-10T00:00:00Z'), actifHote: 'a.fr', actifPort: 443, cleStable: 'k' }
  const apres = [{ hote: 'a.fr', port: 443, releveLe: new Date('2026-09-14T02:00:00Z') }]
  dire(dateDeRetest(c, apres, new Set())?.toISOString() === '2026-09-14T02:00:00.000Z',
    'actif relevé après la correction, constat absent : correction confirmée')
  dire(dateDeRetest(c, null, new Set()) === null, 'sans liste des actifs relevés, rien n\'est confirmé')
  dire(dateDeRetest(c, [{ hote: 'a.fr', port: 443, releveLe: new Date('2026-09-09T00:00:00Z') }], new Set()) === null,
    'un relevé ANTÉRIEUR à la correction ne confirme rien')
  dire(dateDeRetest(c, [{ hote: 'b.fr', port: 443, releveLe: new Date('2026-09-14T00:00:00Z') }], new Set()) === null,
    'le relevé d\'un autre hôte ne confirme rien')
  dire(dateDeRetest(c, apres, new Set(['k'])) === null, 'le constat vu dans la même réponse n\'est pas confirmé corrigé')
  dire(dateDeRetest(c, [{ hote: 'a.fr', port: null, releveLe: new Date('2026-09-14T00:00:00Z') }], new Set()) !== null,
    'un relevé de l\'hôte entier couvre le port')
}

console.log('\nLes décisions humaines suivent le cycle')
dire(transition('ouvert', 'accepter') === 'accepte', 'ouvert → accepté')
dire(transition('corrige', 'accepter') === null, 'on n\'accepte pas un constat déjà déclaré corrigé')
dire(transition('corrige', 'verifier') === 'reteste', 'corrigé → vérifié')
dire(transition('ouvert', 'verifier') === null, 'on ne vérifie pas une correction qui n\'a pas été déclarée')
dire(transition('reteste', 'rouvrir') === 'ouvert', 'vérifié → rouvert')
dire(transition('ouvert', 'rouvrir') === null, 'un constat ouvert ne se rouvre pas')

console.log('\nLe périmètre déclaré')
{
  const d = lireListeDomaines(['example.org', '*.exemple.fr', 'EXAMPLE.ORG', 'pas un domaine', ''])
  dire(d.valides.join() === 'example.org,exemple.fr', 'les domaines sont normalisés et dédoublonnés, le joker retiré')
  dire(d.rejets.join() === 'pas un domaine', 'et le refus est nommé')
  const p = lireListePlages(['193.52.1.0/24', '10.0.0.0/8', '192.168.1.0/24', '2001:660:1::/48', '300.1.1.1/24'])
  dire(p.valides.join() === '193.52.1.0/24,2001:660:1::/48', 'les plages publiques sont gardées')
  dire(p.rejets.includes('10.0.0.0/8') && p.rejets.includes('192.168.1.0/24'),
    'UNE PLAGE PRIVÉE EST REFUSÉE — depuis le portail, elle ferait balayer le réseau interne')
}

console.log('\nL\'adresse du moteur')
dire(!adresseMoteur('http://audit.exemple.fr').ok, 'http vers une adresse publique est refusé : le jeton circulerait en clair')
dire(adresseMoteur('https://audit.exemple.fr/').ok, 'https est accepté')
dire(adresseMoteur('http://127.0.0.1:8080').ok && adresseMoteur('http://172.18.0.5:8080').ok, 'http local ou privé est admis (phase de test)')

console.log('\nLe client : jeton, périmètre, curseur, aucune redirection')
{
  let recuAuth = ''
  let recuCorps: Perimetre | null = null
  let recuDepuis: string | null = null
  const srv = Bun.serve({
    port: 0,
    async fetch(req) {
      const u = new URL(req.url)
      recuAuth = req.headers.get('authorization') ?? ''
      if (u.pathname === '/perimetre' && req.method === 'POST') {
        recuCorps = await req.json() as Perimetre
        return new Response(null, { status: 204 })
      }
      if (u.pathname === '/resultats') {
        recuDepuis = u.searchParams.get('depuis')
        return Response.json({ constats: [brut()] })
      }
      if (u.pathname === '/ailleurs/resultats') return Response.redirect('https://exemple.invalide/resultats', 302)
      // Le 301 des serveurs d'applications : même chemin, barre oblique finale en plus.
      if (u.pathname === '/barre/resultats') return Response.redirect(`${u.origin}/barre/resultats/`, 301)
      if (u.pathname === '/barre/resultats/') {
        recuDepuis = u.searchParams.get('depuis')
        return Response.json({ constats: [brut()] })
      }
      // Une redirection vers une page de connexion : même origine, autre chemin.
      if (u.pathname === '/connexion/resultats') return Response.redirect(`${u.origin}/login`, 302)
      return new Response('?', { status: 404 })
    },
  })
  const cfg = { url: `http://127.0.0.1:${srv.port}`, jeton: 'Token abc 123' }
  await envoyerPerimetre(cfg, { version: 1, genere_le: 'x', domaines: ['example.org'], plages: [], actifs: [] })
  dire(recuAuth === 'Bearer abc123', 'le jeton part normalisé, en Bearer')
  dire((recuCorps as Perimetre | null)?.domaines?.[0] === 'example.org', 'le périmètre arrive en JSON')
  const r = await recupererResultats(cfg, new Date('2026-09-14T00:00:00Z'))
  dire(recuDepuis === '2026-09-14T00:00:00.000Z', 'le curseur part en `depuis`')
  dire(Array.isArray((r as { constats: unknown[] }).constats), 'la réponse est rendue telle quelle, pour lireResultats')
  let refuse = false
  try { await recupererResultats({ ...cfg, url: `${cfg.url}/ailleurs` }, null) }
  catch { refuse = true }
  dire(refuse, 'une redirection n\'est pas suivie — le jeton ne part pas ailleurs')

  // La barre oblique finale : seule redirection suivie, et le curseur la traverse.
  recuDepuis = null
  const parBarre = await recupererResultats({ ...cfg, url: `${cfg.url}/barre` }, new Date('2026-09-14T00:00:00Z'))
  dire(Array.isArray((parBarre as { constats: unknown[] }).constats),
    'une redirection qui n\'ajoute que la barre oblique finale est suivie')
  dire(recuDepuis === '2026-09-14T00:00:00.000Z', 'et le curseur arrive quand même')

  let motifConnexion = ''
  try { await recupererResultats({ ...cfg, url: `${cfg.url}/connexion` }, null) }
  catch (e) { motifConnexion = e instanceof Error ? e.message : String(e) }
  dire(motifConnexion.includes('/login'), 'une redirection vers une autre adresse est refusée EN LA NOMMANT')
  srv.stop(true)
}

console.log('\nArtemis : toutes les pages, et pas seulement l\'intéressant')
{
  const pagesDemandees: number[] = []
  let interessantSeulement: string | null = ''
  const srv = Bun.serve({
    port: 0,
    fetch(req) {
      const u = new URL(req.url)
      if (u.pathname !== '/api/task-results') return new Response('?', { status: 404 })
      interessantSeulement = u.searchParams.get('only_interesting')
      const page = Number(u.searchParams.get('page') ?? 1)
      const taille = Number(u.searchParams.get('page_size') ?? 100)
      pagesDemandees.push(page)
      // 1 200 résultats : deux pages pleines, puis une partielle.
      const restant = Math.max(0, Math.min(taille, 1200 - (page - 1) * taille))
      return Response.json(Array.from({ length: restant }, (_, i) => ({
        status: 'OK', receiver: 'port_scanner', created_at: '2026-10-13T08:00:00',
        task: { payload: { domain: `h${(page - 1) * taille + i}.exemple.fr` } },
      })))
    },
  })
  const cfg = { url: `http://127.0.0.1:${srv.port}`, jeton: 'abc', dialecte: 'artemis' as const }
  const corps = await recupererResultats(cfg, null) as { data: unknown[], tronque: boolean }
  dire(corps.data.length === 1200, `les pages sont enchaînées jusqu'au bout (${corps.data.length} résultats)`)
  dire(pagesDemandees.join() === '1,2,3', 'une page incomplète arrête la lecture : pas d\'appel de trop')
  dire(interessantSeulement === 'false',
    'tout est demandé, pas seulement « intéressant » — sinon aucun actif sain ne remonte, et aucune correction ne se confirme')
  dire(corps.tronque === false, 'et la lecture n\'est pas annoncée tronquée quand elle est complète')
  srv.stop(true)
}

console.log('\nLe dialecte Artemis : autre en-tête, autres routes')
{
  let entete = ''
  let corpsAdd: { targets?: string[] } | null = null
  let cheminLu = ''
  const srv = Bun.serve({
    port: 0,
    async fetch(req) {
      const u = new URL(req.url)
      entete = req.headers.get('x-api-token') ?? ''
      if (u.pathname === '/api/add') { corpsAdd = await req.json() as { targets?: string[] }; return Response.json({ ok: true }) }
      if (u.pathname === '/api/task-results') { cheminLu = u.pathname; return Response.json([]) }
      // Toute autre route : c'est que le dialecte n'a pas été respecté.
      return new Response('route inattendue', { status: 418 })
    },
  })
  const cfg = { url: `http://127.0.0.1:${srv.port}`, jeton: 'abc123', dialecte: 'artemis' as const }
  await envoyerPerimetre(cfg, { version: 1, genere_le: 'x', domaines: ['example.org'], plages: ['203.0.113.0/24'], actifs: [] })
  dire(entete === 'abc123', 'le jeton part en `x-api-token`, sans Bearer')
  dire((corpsAdd as { targets?: string[] } | null)?.targets?.[0] === 'example.org', 'les cibles partent en { targets: [...] } sur /api/add')
  await recupererResultats(cfg, new Date('2026-09-14T00:00:00Z'))
  dire(cheminLu === '/api/task-results', 'les résultats se lisent sur /api/task-results')

  // L'adresse se saisit à la racine ; un `/api` déjà présent ne doit pas être doublé.
  cheminLu = ''
  await recupererResultats({ ...cfg, url: `${cfg.url}/api` }, null)
  dire(cheminLu === '/api/task-results', 'une adresse saisie avec /api ne donne pas /api/api')

  // « Tester la connexion » doit éprouver LA ROUTE QUI SERVIRA. Sans le dialecte, il appelait
  // /resultats sur un Artemis qui redirige vers /login, et déclarait en échec une configuration
  // qui fonctionne — la synchronisation, elle, passait.
  cheminLu = ''
  const essai = await testerConnexionAudit(cfg)
  dire(essai.ok && cheminLu === '/api/task-results', `le test éprouve la route d'Artemis (${essai.message})`)
  srv.stop(true)
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
