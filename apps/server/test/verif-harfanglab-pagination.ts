// PAGINATION HARFANGLAB — le lien `next`, et ce qu'il peut valoir en vrai.
import { parcourirAgents } from '../src/utils/harfanglabClient'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const agents = (offset: number, n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    id: `a${offset + i}`, hostname: `h${offset + i}`, status: 'online',
    policy: { id: 'p1', name: 'P', yara_mode: 2 },
  }))

/** Sert deux pages, avec la forme de `next` demandée. */
function serveur(forme: 'relatif' | 'absolu' | 'autre-origine' | 'illisible', port: number) {
  return Bun.serve({
    port,
    fetch(req) {
      const u = new URL(req.url)
      if (u.pathname !== '/api/data/endpoint/Agent/') return new Response('nf', { status: 404 })
      const offset = Number(u.searchParams.get('offset')) || 0
      const suite = offset >= 2
        ? null
        : forme === 'relatif' ? `/api/data/endpoint/Agent/?limit=2&offset=2`
          : forme === 'absolu' ? `http://localhost:${port}/api/data/endpoint/Agent/?limit=2&offset=2`
            : forme === 'autre-origine' ? `http://exemple.invalide/api/data/endpoint/Agent/?limit=2&offset=2`
              : 'pas une url du tout'
      return Response.json({ count: 4, next: suite, results: agents(offset) })
    },
  })
}

async function compter(forme: 'relatif' | 'absolu' | 'autre-origine' | 'illisible', port: number) {
  const srv = serveur(forme, port)
  let vus = 0
  try {
    const r = await parcourirAgents({ url: `http://localhost:${port}`, jeton: 'k' }, async (lot) => { vus += lot.length })
    return { vus, pages: r.pages, erreur: null as string | null }
  }
  catch (e) {
    return { vus, pages: 0, erreur: e instanceof Error ? e.message : String(e) }
  }
  finally { srv.stop(true) }
}

console.log('\nFormes du lien de page suivante')

// LE CAS DE PRODUCTION. Sans résolution contre l'origine, `fetch` refuse la valeur.
let r = await compter('relatif', 9191)
dire(r.erreur === null && r.vus === 4 && r.pages === 2,
  'un `next` RELATIF est suivi — c\'est le cas qui cassait la synchronisation en production')

r = await compter('absolu', 9192)
dire(r.erreur === null && r.vus === 4 && r.pages === 2,
  'un `next` ABSOLU, la forme du swagger, marche toujours')

// Un lien vers une autre origine ferait sortir le jeton de son domaine : on s'arrête, et
// la troncature est ANNONCÉE plutôt que silencieuse.
r = await compter('autre-origine', 9193)
dire(r.erreur === null && r.vus === 2,
  'un `next` vers une AUTRE origine arrête la pagination : le jeton ne sort pas de son domaine')

// Un `next` qui n'est pas une URL n'est PAS ignoré : `new URL(valeur, base)` le résout en
// chemin relatif, l'instance répond 404, et le relevé échoue — bruyamment, avec l'adresse
// nommée.
r = await compter('illisible', 9194)
dire(r.erreur !== null && r.erreur.includes('Adresse :'),
  'un `next` illisible fait ÉCHOUER le relevé, avec l\'adresse fautive dans le message')
dire(!!r.erreur?.includes('404'),
  'et le code HTTP y figure : la cause est diagnosticable sans relire le code')

console.log('\n« Tronqué » ne doit vouloir dire qu\'une chose')

// LE DÉFAUT DE PRODUCTION : « relevé INCOMPLET pour : ioc » sur un parcours pourtant complet.
const finPageVide = Bun.serve({
  port: 9195,
  fetch(req) {
    const u = new URL(req.url)
    if (u.pathname !== '/api/data/endpoint/Agent/') return new Response('nf', { status: 404 })
    const offset = Number(u.searchParams.get('offset')) || 0
    // Dernière page VIDE, avec un `next` toujours renseigné : le cas fautif.
    if (offset >= 2) return Response.json({ count: 2, next: `/api/data/endpoint/Agent/?limit=2&offset=4`, results: [] })
    return Response.json({ count: 2, next: `/api/data/endpoint/Agent/?limit=2&offset=2`, results: agents(offset) })
  },
})
let vusFin = 0
const rFin = await parcourirAgents({ url: 'http://localhost:9195', jeton: 'k' }, async (lot) => { vusFin += lot.length })
finPageVide.stop(true)
dire(rFin.tronque === false,
  'une dernière page VIDE termine le parcours : ce n\'est PAS une troncature')
dire(vusFin === 2, 'et les lignes lues avant elle sont conservées')

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
