import { Elysia, t } from 'elysia'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  composante, connecteurSlowpoke, glpiMachine, harfanglabAgent, posteTravail, serveur, whitelist,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'
import { lireIncidents, lireMachinesIncident, motifClotureSoc, type SlowpokeIncident } from '../utils/slowpokeClient'
import { dechiffrer } from '../utils/secrets'

// INCIDENTS CROISÉS — l'incident replacé dans son contexte. Sniff sait qu'un incident existe et
// sur quelles machines. ⚠️ LIMITE STRUCTURELLE, rappelée dans chaque réponse.

const SINGLETON = 'connecteur-slowpoke-singleton'
const CRITIQUES = ['vitale', 'critique', 'essentielle']
const PLAFOND = 100

type MachineTouchee = {
  nom: string
  glpiId: string | null
  rapprochee: boolean
  fiche: string | null
  ficheType: 'serveur' | 'poste' | null
  criticite: string | null
  composante: string | null
  entiteGlpi: string | null
  groupeGlpi: string | null
  agentEdr: 'present' | 'absent' | 'inconnu'
  url: string | null
  urlAbsolue: string | null
}

export const incidentsCroisesRouter = new Elysia({ name: 'incidents-croises', prefix: '/api/incidents' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Connecteurs'] } })

  .get('/croisement', async (ctx) => {
    const { query, status } = ctx
    const cats = await readableCategories(accesDe(ctx))

    const [cfg] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON)).limit(1)
    const cle = dechiffrer(cfg?.cleService)
    if (!cfg?.url || !cle || !cfg.actif) {
      // Un connecteur éteint ne rend pas « zéro incident » : il rend « je ne sais pas ».
      return status(503, {
        message: 'Le connecteur Sniff est inactif ou non configuré.',
        consequence: 'Aucun incident ne peut être lu. Ce n\'est PAS l\'absence d\'incident.',
      })
    }

    const acces = { url: cfg.url, cleService: cle }
    const plafond = Math.min(PLAFOND, Math.max(1, Number(query.limite) || 50))

    let incidents: SlowpokeIncident[]
    try {
      incidents = await lireIncidents(acces, { pageSize: plafond, ...(query.statut ? { status: String(query.statut) } : {}) })
    }
    catch (e) {
      return status(502, {
        message: e instanceof Error ? e.message : String(e),
        consequence: 'Sniff n\'a pas répondu. Aucune conclusion sur les incidents ne peut être tirée.',
      })
    }

    // Machines de chaque incident. Le sens de lecture est INVERSÉ à dessein : on demande les
    // machines de quelques dizaines d'incidents, plutôt que les incidents de plusieurs milliers
    // de machines.
    const parIncident = new Map<string, { nom: string, glpiId: string | null }[]>()
    for (const i of incidents) {
      try { parIncident.set(i.id, await lireMachinesIncident(acces, i.id)) }
      catch { parIncident.set(i.id, []) }
    }

    const glpiIds = [...new Set([...parIncident.values()].flat().map(m => m.glpiId).filter((x): x is string => !!x))]

    // Le contexte, en trois lectures groupées plutôt qu'une par machine.
    const machinesGlpi = glpiIds.length
      ? await db.select().from(glpiMachine).where(inArray(glpiMachine.glpiId, glpiIds))
      : []
    const parGlpiId = new Map(machinesGlpi.map(m => [m.glpiId, m]))

    const cibles = machinesGlpi.map(m => m.cibleId).filter((x): x is string => !!x)
    const serveurs = cibles.length && cats.has('serveurs')
      ? await db.select({ id: serveur.id, nom: serveur.hostname, criticite: serveur.criticite, composante: composante.nom })
        .from(serveur).leftJoin(composante, eq(composante.id, serveur.composanteId)).where(inArray(serveur.id, cibles))
      : []
    const postes = cibles.length && cats.has('postes')
      ? await db.select({ id: posteTravail.id, nom: posteTravail.nom, criticite: posteTravail.criticite, composante: composante.nom })
        .from(posteTravail).leftJoin(composante, eq(composante.id, posteTravail.composanteId)).where(inArray(posteTravail.id, cibles))
      : []
    const parCible = new Map<string, { type: 'serveur' | 'poste', nom: string | null, criticite: string | null, composante: string | null }>()
    for (const s of serveurs) parCible.set(s.id, { type: 'serveur', nom: s.nom, criticite: s.criticite, composante: s.composante })
    for (const p of postes) parCible.set(p.id, { type: 'poste', nom: p.nom, criticite: p.criticite, composante: p.composante })

    const agents = await db.select({ hostname: harfanglabAgent.hostname, serial: harfanglabAgent.machineSerial }).from(harfanglabAgent)
    const edrConnu = agents.length > 0
    const hotesEdr = new Set(agents.map(a => (a.hostname ?? '').toLowerCase().trim()).filter(Boolean))
    const seriesEdr = new Set(agents.map(a => (a.serial ?? '').toLowerCase().trim()).filter(Boolean))

    // Listes blanches nées d'un incident : « qu'a-t-on cessé de regarder à cause de ça ? »
    const wl = cats.has('whitelists')
      ? await db.select({
        id: whitelist.id, libelle: whitelist.libelle, incident: whitelist.sniffIncidentId,
        active: whitelist.active, motif: whitelist.motif,
      }).from(whitelist)
      : []
    const wlParIncident = new Map<string, typeof wl>()
    for (const w of wl) {
      if (!w.incident) continue
      wlParIncident.set(w.incident, [...(wlParIncident.get(w.incident) ?? []), w])
    }

    const resultats = incidents.map((i) => {
      const machines: MachineTouchee[] = (parIncident.get(i.id) ?? []).map((m) => {
        const g = m.glpiId ? parGlpiId.get(m.glpiId) : undefined
        const cible = g?.cibleId ? parCible.get(g.cibleId) : undefined
        const surveille = hotesEdr.has((m.nom ?? '').toLowerCase().trim())
          || (!!g?.numeroSerie && seriesEdr.has(g.numeroSerie.toLowerCase().trim()))
        const t: MachineTouchee = {
          nom: m.nom,
          glpiId: m.glpiId,
          // Le fait décisif : sans identifiant GLPI, aucun contexte n'est atteignable.
          rapprochee: !!g,
          fiche: cible?.nom ?? null,
          ficheType: cible?.type ?? null,
          criticite: cible?.criticite ?? null,
          composante: cible?.composante ?? null,
          entiteGlpi: g?.entite ?? null,
          groupeGlpi: g?.groupe ?? null,
          agentEdr: !edrConnu ? 'inconnu' : surveille ? 'present' : 'absent',
          url: g?.cibleId && cible ? `/${cible.type === 'serveur' ? 'serveurs' : 'postes'}/${g.cibleId}` : null,
          urlAbsolue: g?.cibleId && cible ? urlPublique(`/${cible.type === 'serveur' ? 'serveurs' : 'postes'}/${g.cibleId}`) : null,
        }
        return t
      })

      const listesBlanches = (wlParIncident.get(i.id) ?? []).map(w => ({
        id: w.id, libelle: w.libelle, active: w.active, motif: w.motif,
        urlAbsolue: urlPublique(`/whitelists?id=${w.id}`),
      }))

      return {
        id: i.id,
        type: i.type,
        gravite: i.severity,
        statut: i.status,
        resolution: i.resolution,
        // `resolution: null` ne veut pas dire « bénin » : depuis la mise à jour du vocabulaire
        // de Sniff, une fiche close pour « pas de risque de sécurité » ou « sans objet » n'a
        // plus de résolution déduite.
        motifClotureSoc: motifClotureSoc(i),
        description: i.description,
        source: i.source,
        creeLe: i.createdAt,
        majLe: i.updatedAt,
        machines,
        // Les trois croisements qui font l'intérêt de cette route.
        toucheDuCritique: machines.some(m => CRITIQUES.includes(m.criticite ?? '')),
        machinesSansAgent: machines.filter(m => m.agentEdr === 'absent').length,
        machinesNonRapprochees: machines.filter(m => !m.rapprochee).length,
        listesBlanches,
      }
    })

    const filtres = query.critiques === 'true' ? resultats.filter(r => r.toucheDuCritique) : resultats

    const avertissements = [
      'Les machines saisies librement dans Sniff n\'ont pas d\'identifiant GLPI et ne peuvent être rapprochées '
      + 'd\'aucune fiche : `rapprochee: false`. Un incident sans contexte n\'est pas un incident sans enjeu.',
    ]
    if (!edrConnu) {
      avertissements.push('Aucun agent EDR n\'est connu : `agentEdr` vaut « inconnu » partout, ce qui ne veut pas dire « absent ».')
    }
    if (incidents.length >= plafond) {
      avertissements.push(`Relevé PARTIEL : ${plafond} incidents lus, plafond atteint. Il en existe probablement d'autres.`)
    }
    if (!cats.has('whitelists')) {
      avertissements.push('Les listes blanches ne sont pas lisibles par cet appelant : le champ `listesBlanches` est vide par manque de droits, pas par absence.')
    }

    return {
      total: filtres.length,
      tri: 'ordre rendu par Sniff — les plus récemment MODIFIÉS d\'abord, ce qui n\'est pas « les plus récents »',
      lus: incidents.length,
      plafond,
      comptes: {
        touchantDuCritique: resultats.filter(r => r.toucheDuCritique).length,
        avecMachineSansAgent: resultats.filter(r => r.machinesSansAgent > 0).length,
        avecListeBlanche: resultats.filter(r => r.listesBlanches.length > 0).length,
        machinesNonRapprochees: resultats.reduce((n, r) => n + r.machinesNonRapprochees, 0),
      },
      avertissements,
      resultats: filtres,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({
      statut: t.Optional(t.String()),
      critiques: t.Optional(t.String()),
      limite: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Incidents Sniff replacés dans leur contexte : criticité, surveillance EDR, listes blanches.',
      description: 'TOUS les incidents par défaut, pas seulement les ouverts — `statut=` filtre. Chaque '
        + 'incident porte ses machines avec leur criticité, leur composante, leur groupe GLPI et la présence '
        + 'd\'un agent EDR, plus les listes blanches nées de cet incident. ATTENTION AU TRI : Sniff ordonne '
        + 'par date de MODIFICATION, donc « les 3 derniers » veut dire « les 3 derniers modifiés », ce qui '
        + 'n\'est presque jamais l\'intention — le dire dans la réponse. Lire `avertissements` avant de citer '
        + 'un chiffre : un connecteur éteint rend une erreur 503, jamais une liste vide.',
    },
  })
