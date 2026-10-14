import { Elysia, t } from 'elysia'
import { eq, isNotNull } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  composante, harfanglabAgent, posteTravail, serveur, technologie,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'

// PARC EXPOSÉ — le croisement « hors support × criticité × surveillance ».

const CRITIQUES = ['vitale', 'critique', 'essentielle'] as const

type Ligne = {
  type: 'serveur' | 'poste'
  id: string
  nom: string | null
  os: string | null
  osVersion: string | null
  criticite: string | null
  composante: string | null
  finDeVie: string | null
  horsSupport: boolean
  // Trois états, et le troisième n'est PAS le deuxième : « aucun agent », « un agent »,
  // et « on ne peut pas savoir » quand le connecteur EDR n'a jamais tourné.
  agentEdr: 'present' | 'absent' | 'inconnu'
  score: number
  url: string
  urlAbsolue: string
}

export const parcExposeRouter = new Elysia({ name: 'parc-expose', prefix: '/api/parc' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/expose', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    const peutServeurs = cats.has('serveurs')
    const peutPostes = cats.has('postes')
    if (!peutServeurs && !peutPostes) {
      return { total: 0, tri: 'score décroissant', lisible: false, resultats: [], avertissements: [] }
    }

    const aujourdhui = new Date().toISOString().slice(0, 10)

    // Référentiel de fin de vie, indexé par nom d'OS. La correspondance se fait sur le nom
    // tel que GLPI le remonte : imparfaite, et c'est dit plus bas.
    const refs = await db.select({ nom: technologie.nom, finDeVie: technologie.finDeVie, finDeVieEtendue: technologie.finDeVieEtendue })
      .from(technologie).where(isNotNull(technologie.finDeVie))
    const eolParOs = new Map(refs.map(r => [r.nom.toLowerCase().trim(), r]))
    const eolDe = (os: string | null) => {
      if (!os) return null
      const exact = eolParOs.get(os.toLowerCase().trim())
      if (exact) return exact
      // Correspondance par préfixe : « Debian GNU/Linux 13 (trixie) » face à « Debian 13 ».
      for (const [nom, r] of eolParOs) {
        if (os.toLowerCase().includes(nom) || nom.includes(os.toLowerCase())) return r
      }
      return null
    }

    // Flotte EDR. Un ensemble VIDE ne veut pas dire « aucune machine surveillée » : il
    // peut vouloir dire « le connecteur n'a jamais tourné ». Les deux se distinguent ici.
    const agents = await db.select({ hostname: harfanglabAgent.hostname, serial: harfanglabAgent.machineSerial }).from(harfanglabAgent)
    const edrConnu = agents.length > 0
    const hotesEdr = new Set(agents.map(a => (a.hostname ?? '').toLowerCase().trim()).filter(Boolean))
    const seriesEdr = new Set(agents.map(a => (a.serial ?? '').toLowerCase().trim()).filter(Boolean))

    const lignes: Ligne[] = []

    if (peutServeurs) {
      const rows = await db.select({
        id: serveur.id, nom: serveur.hostname, os: serveur.os, osVersion: serveur.osVersion,
        criticite: serveur.criticite, composante: composante.nom,
      }).from(serveur).leftJoin(composante, eq(composante.id, serveur.composanteId))
      for (const r of rows) {
        const ref = eolDe(r.os)
        const fin = ref?.finDeVieEtendue ?? ref?.finDeVie ?? null
        const horsSupport = !!(fin && String(fin) < aujourdhui)
        const surveille = hotesEdr.has((r.nom ?? '').toLowerCase().trim())
        lignes.push({
          type: 'serveur', id: r.id, nom: r.nom, os: r.os, osVersion: r.osVersion,
          criticite: r.criticite, composante: r.composante,
          finDeVie: fin ? String(fin) : null, horsSupport,
          agentEdr: !edrConnu ? 'inconnu' : surveille ? 'present' : 'absent',
          score: 0, url: `/serveurs/${r.id}`, urlAbsolue: urlPublique(`/serveurs/${r.id}`),
        })
      }
    }

    if (peutPostes) {
      const rows = await db.select({
        id: posteTravail.id, nom: posteTravail.nom, os: posteTravail.os, osVersion: posteTravail.osVersion,
        criticite: posteTravail.criticite, numeroSerie: posteTravail.numeroSerie, composante: composante.nom,
      }).from(posteTravail).leftJoin(composante, eq(composante.id, posteTravail.composanteId))
      for (const r of rows) {
        const ref = eolDe(r.os)
        const fin = ref?.finDeVieEtendue ?? ref?.finDeVie ?? null
        const horsSupport = !!(fin && String(fin) < aujourdhui)
        // Le numéro de série d'abord : c'est une preuve, le nom d'hôte n'est qu'un indice.
        const surveille = seriesEdr.has((r.numeroSerie ?? '').toLowerCase().trim())
          || hotesEdr.has((r.nom ?? '').toLowerCase().trim())
        lignes.push({
          type: 'poste', id: r.id, nom: r.nom, os: r.os, osVersion: r.osVersion,
          criticite: r.criticite, composante: r.composante,
          finDeVie: fin ? String(fin) : null, horsSupport,
          agentEdr: !edrConnu ? 'inconnu' : surveille ? 'present' : 'absent',
          score: 0, url: `/postes/${r.id}`, urlAbsolue: urlPublique(`/postes/${r.id}`),
        })
      }
    }

    // Le score n'ordonne pas une gravité absolue : il ordonne le CUMUL des trois faits.
    for (const l of lignes) {
      l.score = (l.horsSupport ? 3 : 0)
        + ((CRITIQUES as readonly string[]).includes(l.criticite ?? '') ? 2 : 0)
        + (l.agentEdr === 'absent' ? 2 : 0)
    }

    let retenues = lignes.filter(l => l.score > 0)
    if (query.horsSupport === 'true') retenues = retenues.filter(l => l.horsSupport)
    if (query.sansAgent === 'true') retenues = retenues.filter(l => l.agentEdr === 'absent')
    if (query.critiques === 'true') retenues = retenues.filter(l => (CRITIQUES as readonly string[]).includes(l.criticite ?? ''))
    if (query.composante) retenues = retenues.filter(l => (l.composante ?? '').toLowerCase().includes(String(query.composante).toLowerCase()))

    const avertissements: string[] = []
    if (!edrConnu) {
      avertissements.push('Aucun agent EDR n\'est connu du Catalogue : le connecteur HarfangLab n\'a probablement jamais tourné. '
        + '`agentEdr` vaut « inconnu » partout — ne surtout pas le lire comme « aucune machine surveillée ».')
    }
    if (!refs.length) {
      avertissements.push('Le référentiel de fin de vie est vide : aucune machine ne peut être déclarée hors support.')
    }
    avertissements.push('La correspondance entre l\'OS remonté par GLPI et le référentiel de fin de vie se fait sur le NOM. '
      + 'Un OS nommé autrement que dans le référentiel n\'est pas rapproché et apparaît comme supporté.')

    return {
      total: retenues.length,
      tri: 'score décroissant (cumul hors support + criticité + absence d\'agent), puis nom',
      lisible: true,
      comptes: {
        horsSupport: retenues.filter(l => l.horsSupport).length,
        critiquesSansAgent: retenues.filter(l => l.agentEdr === 'absent' && (CRITIQUES as readonly string[]).includes(l.criticite ?? '')).length,
        // LE chiffre de cette route : les trois faits réunis sur la même machine.
        lesTrois: retenues.filter(l => l.horsSupport && l.agentEdr === 'absent' && (CRITIQUES as readonly string[]).includes(l.criticite ?? '')).length,
      },
      avertissements,
      resultats: retenues.sort((a, b) => b.score - a.score || (a.nom ?? '').localeCompare(b.nom ?? '')).slice(0, 500),
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({
      horsSupport: t.Optional(t.String()),
      sansAgent: t.Optional(t.String()),
      critiques: t.Optional(t.String()),
      composante: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Machines exposées : hors support × criticité × absence d\'agent EDR, croisés.',
      description: 'Le croisement des trois faits, qui n\'existe nulle part ailleurs : plus de correctifs, '
        + 'importante pour l\'établissement, et personne ne la regarde. `comptes.lesTrois` est LE chiffre de '
        + 'cette route. `agentEdr` a TROIS valeurs : `present`, `absent`, et `inconnu` — cette dernière '
        + 'signifie que le connecteur EDR n\'a jamais tourné et ne doit jamais être lue comme « absent ». '
        + 'Lire `avertissements` avant de citer un chiffre.',
    },
  })
