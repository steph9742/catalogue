// JETON HARFANGLAB — ce que l'en-tête reçoit, pas ce qui a été collé. Constaté en production :
// « Invalid token header.
import { normaliserJeton, testerConnexionHarfanglab } from '../src/utils/harfanglabClient'

let ko = 0
const dire = (ok: boolean, quoi: string) => {
  console.log(`${ok ? '✓' : '✗'} ${quoi}`)
  if (!ok) ko++
}

const J = '0123456789abcdef0123456789abcdef01234567'

console.log('\nLes formes collées se ramènent au jeton seul')
dire(normaliserJeton(J) === J, 'un jeton propre reste intact')
dire(normaliserJeton(`  ${J}\n`) === J, 'les blancs autour disparaissent')
dire(normaliserJeton(`${J.slice(0, 20)}\n${J.slice(20)}`) === J, 'un retour à la ligne AU MILIEU disparaît aussi')
dire(normaliserJeton(`${J.slice(0, 20)} ${J.slice(20)}`) === J, 'et un espace au milieu')
dire(normaliserJeton(`Token ${J}`) === J, '« Token » collé devant est retiré')
dire(normaliserJeton(`Bearer ${J}`) === J, '« Bearer » aussi')
dire(normaliserJeton(`Authorization: Token ${J}`) === J, 'et la ligne d\'en-tête entière')

console.log('\nUn jeton absent reste absent')
dire(normaliserJeton('') === '' && normaliserJeton('   ') === '', 'des blancs seuls ne font pas un jeton')
dire(normaliserJeton(null) === '' && normaliserJeton(undefined) === '', 'ni null, ni undefined')
// Un jeton qui COMMENCE par « token » sans blanc derrière n'est pas un préfixe.
dire(normaliserJeton('tokenabc123') === 'tokenabc123', '« token » sans blanc derrière fait partie du jeton')

console.log('\nL\'en-tête envoyé passe la règle de HarfangLab')
{
  let recu = ''
  const srv = Bun.serve({
    port: 0,
    fetch(req) {
      recu = req.headers.get('authorization') ?? ''
      const morceaux = recu.split(/\s+/).filter(Boolean)
      // La règle de l'outil, telle qu'il la rend.
      if (morceaux.length > 2) {
        return Response.json({ detail: 'Invalid token header. Token string should not contain spaces.' }, { status: 401 })
      }
      if (morceaux[0] !== 'Token' || morceaux[1] !== J) {
        return Response.json({ detail: 'Invalid token.' }, { status: 401 })
      }
      return Response.json({ count: 3, results: [] })
    },
  })
  const url = `http://127.0.0.1:${srv.port}`

  const r = await testerConnexionHarfanglab({ url, jeton: `Token ${J.slice(0, 20)}\n${J.slice(20)}` })
  dire(r.ok, 'un jeton mal collé DÉJÀ ENREGISTRÉ passe sans être ressaisi')
  dire(recu === `Token ${J}`, 'l\'en-tête porte exactement deux morceaux')

  const faux = await testerConnexionHarfanglab({ url, jeton: 'faux' })
  dire(!faux.ok && faux.message.includes('Invalid token'),
    'un refus rend la réponse de l\'outil, pas seulement « HTTP 401 »')

  srv.stop(true)
}

console.log(ko ? `\n${ko} CONTRÔLE(S) EN ÉCHEC` : '\nTOUS LES CONTRÔLES PASSENT')
process.exit(ko ? 1 : 0)
