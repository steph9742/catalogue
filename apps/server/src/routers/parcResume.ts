import { Elysia } from 'elysia'
import { count, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  appCriticite, appareilMobile, composante, connecteurGlpi, connecteurHarfanglab, criticiteSurete,
  departement, glpiMachine, machineIndus, posteTravail, serveur, service,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { partitionAvecNul } from '../utils/partition'
import { ventiler } from '../utils/ventilation'

// RÉSUMÉ DU PARC — les décomptes que l'assistant cite au lieu de les calculer.

/**
 * 1. CHAQUE COMPTE DIT SON DÉNOMINATEUR.
 */
type Compte = { nombre: number, sur: number }
const compte = (nombre: number | undefined, sur: number | undefined): Compte =>
  ({ nombre: nombre ?? 0, sur: sur ?? 0 })

/**
 * 2. « JAMAIS RELEVÉ » NE SE CONFOND PAS AVEC « ZÉRO ».
 */
type EtatSource = {
  actif: boolean
  dernierSyncAt: Date | string | null
  dernierStatut: string
  exploitable: boolean
  avertissement: string | null
}
function etatSource(nom: string, actif: boolean | undefined, at: Date | null | undefined, statut: string): EtatSource {
  const jamais = !at
  const exploitable = !!actif && !jamais && statut !== 'erreur'
  return {
    actif: !!actif,
    dernierSyncAt: at ?? null,
    dernierStatut: statut,
    exploitable,
    avertissement: !actif
      ? `Le connecteur ${nom} est inactif. Les chiffres ci-dessous sont figés à la dernière synchronisation, ou absents.`
      : jamais
        ? `Le connecteur ${nom} n'a jamais abouti. Un compteur à zéro sur cette source ne signifie pas « aucun cas » : il signifie « rien n'a été relevé ».`
        : statut === 'erreur'
          ? `Le dernier relevé ${nom} a échoué. Les chiffres décrivent l'état au relevé précédent.`
          : null,
  }
}

export const parcResumeRouter = new Elysia({ name: 'parc-resume', prefix: '/api/parc' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/resume', async (ctx) => {
    const cats = await readableCategories(accesDe(ctx))
    const lisible = async <T>(categorie: string, f: () => Promise<T>) =>
      (cats.has(categorie) ? await f() : null)

    const [cfgGlpi, cfgHl, srv, pst, ind, inv] = await Promise.all([
      db.select().from(connecteurGlpi).limit(1).then(r => r[0]),
      db.select().from(connecteurHarfanglab).limit(1).then(r => r[0]),
      lisible('serveurs', async () => (await db.select({
        total: count(),
        critiques: sql<number>`count(*) filter (where ${serveur.criticite} in ('vitale', 'critique'))::int`,
        sansResponsable: sql<number>`count(*) filter (where ${serveur.responsableMetierId} is null)::int`,
        sansCriticite: sql<number>`count(*) filter (where ${serveur.criticite} is null)::int`,
        // PARTITION COMPLÈTE de la criticité : `critiques` et `sansCriticite` en donnaient deux
        // tranches sur six, et « combien de serveurs essentiels » n'avait pas de réponse.
        parCriticite: { ...partitionAvecNul(serveur.criticite, appCriticite.enumValues, 'non_renseignee') },
      }).from(serveur))[0]),
      lisible('postes-travail', async () => (await db.select({
        total: count(),
        sansCriticite: sql<number>`count(*) filter (where ${posteTravail.criticite} is null)::int`,
        parCriticite: { ...partitionAvecNul(posteTravail.criticite, appCriticite.enumValues, 'non_renseignee') },
      }).from(posteTravail))[0]),
      // `criticiteSurete` N'EST PAS `criticite`. Les machines industrielles portent une
      // criticité de SÛRETÉ — ce que casse une défaillance dans le monde physique — et non la
      // criticité métier des serveurs.
      lisible('machines-indus', async () => (await db.select({
        total: count(),
        sansResponsable: sql<number>`count(*) filter (where ${machineIndus.responsableId} is null)::int`,
        sansCriticiteSurete: sql<number>`count(*) filter (where ${machineIndus.criticiteSurete} is null)::int`,
        // Vocabulaire DISTINCT de `appCriticite` : criticité de SÛRETÉ, quatre valeurs.
        parCriticiteSurete: { ...partitionAvecNul(machineIndus.criticiteSurete, criticiteSurete.enumValues, 'non_renseignee') },
      }).from(machineIndus))[0]),
      lisible('serveurs', async () => (await db.select({
        fiches: count(),
        // MÊME REQUÊTE que la lacune `doublons_inventaire` : deux fiches portant le même
        // numéro de série sont une seule machine physique.
        doublons: sql<number>`(
          select coalesce(sum(n - 1), 0)::int from (
            select count(*) as n from ${glpiMachine}
            where coalesce(trim(${glpiMachine.numeroSerie}), '') <> ''
            group by lower(trim(${glpiMachine.numeroSerie}))
            having count(*) > 1
          ) t)`,
      }).from(glpiMachine))[0]),
    ])

    // VENTILATION PAR AXE ORGANISATIONNEL — « combien de serveurs à l'UFR ST ».
    const parAxe = async (table: typeof serveur | typeof posteTravail | typeof machineIndus | typeof appareilMobile, cols: { composanteId: never, serviceId: never, departementId: never }) => ({
      parComposante: await ventiler(table, cols.composanteId, composante, composante.id, composante.nom, '/api/composantes'),
      parService: await ventiler(table, cols.serviceId, service, service.id, service.nom, '/api/services'),
      parDepartement: await ventiler(table, cols.departementId, departement, departement.id, departement.nom, '/api/departements'),
    })

    const [axesServeurs, axesPostes, axesIndus, axesMobiles] = await Promise.all([
      cats.has('serveurs') ? parAxe(serveur, serveur as never) : null,
      cats.has('postes-travail') ? parAxe(posteTravail, posteTravail as never) : null,
      cats.has('machines-indus') ? parAxe(machineIndus, machineIndus as never) : null,
      cats.has('appareils-mobiles') ? parAxe(appareilMobile, appareilMobile as never) : null,
    ])

    return {
      // L'état des sources vient AVANT les chiffres : il conditionne leur lecture.
      sources: {
        glpi: etatSource('GLPI', cfgGlpi?.actif, cfgGlpi?.dernierSyncAt, cfgGlpi?.dernierStatut ?? 'jamais'),
        harfanglab: etatSource('HarfangLab', cfgHl?.actif, cfgHl?.dernierSyncAt, cfgHl?.dernierStatut ?? 'jamais'),
      },
      serveurs: srv && {
        total: srv.total,
        critiques: compte(srv.critiques, srv.total),
        sansResponsable: compte(srv.sansResponsable, srv.total),
        sansCriticite: compte(srv.sansCriticite, srv.total),
        parCriticite: srv.parCriticite,
        ...(axesServeurs ?? {}),
      },
      postesTravail: pst && {
        total: pst.total,
        sansCriticite: compte(pst.sansCriticite, pst.total),
        parCriticite: pst.parCriticite,
        ...(axesPostes ?? {}),
      },
      machinesIndus: ind && {
        total: ind.total,
        sansResponsable: compte(ind.sansResponsable, ind.total),
        // Nom distinct à dessein : c'est une criticité de sûreté, pas la criticité métier.
        sansCriticiteSurete: compte(ind.sansCriticiteSurete, ind.total),
        parCriticiteSurete: ind.parCriticiteSurete,
        ...(axesIndus ?? {}),
      },

      /**
       * 3. LE TOTAL DE FICHES N'EST PAS UN NOMBRE DE MACHINES.
       */
      inventaireGlpi: inv && {
        fiches: inv.fiches,
        doublonsSerie: compte(inv.doublons, inv.fiches),
        machinesPhysiquesEstimees: Math.max(0, inv.fiches - (inv.doublons ?? 0)),
        avertissement: 'Un total de fiches ne peut pas être présenté comme un nombre de machines physiques. '
          + `${inv.doublons ?? 0} fiche(s) portent un numéro de série déjà présent ailleurs, et surévaluent `
          + 'tous les décomptes de parc d\'autant. Les fiches sans numéro de série ne sont pas rapprochables : '
          + 'l\'écart réel peut être plus grand, jamais plus petit.',
      },

      // Le support des OS et la couverture EDR ont chacun leur point d'entrée, avec leurs
      // propres réserves.
      appareilsMobiles: axesMobiles && { ...axesMobiles },
      voirAussi: {
        supportDesOs: '/api/eol/etat',
        couvertureEdr: '/api/harfanglab/couverture',
        anglesMorts: '/api/lacunes?domaine=parc',
      },
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    detail: {
      summary: 'Décomptes du parc : serveurs, postes, machines industrielles, inventaire GLPI.',
      description: 'Chaque compte porte son DÉNOMINATEUR (`{ nombre, sur }`) : « 12 sans responsable » ne '
        + 'veut pas dire la même chose sur 8 800 machines et sur 40. `sources` dit si le relevé a abouti — '
        + 'un compteur à zéro sur un connecteur qui n\'a jamais tourné signifie « rien n\'a été relevé », '
        + 'jamais « aucun cas », et `avertissement` est alors non nul et doit être répercuté. Un bloc `null` '
        + 'signifie que l\'appelant n\'a pas le droit de lire cette catégorie, ce qui n\'est PAS un parc vide. '
        + '`inventaireGlpi.fiches` n\'est pas un nombre de machines : les doublons de numéro de série sont '
        + 'répétés ici plutôt que renvoyés ailleurs, parce que c\'est le chiffre le plus rond de la réponse.',
    },
  })
