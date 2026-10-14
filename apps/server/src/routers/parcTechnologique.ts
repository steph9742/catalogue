import { Elysia, t } from 'elysia'
import { asc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  application, applicationTechnologie, composante, posteTravail, serveur, serveurTechnologie,
  serviceExpose, serviceTechnologie, technologie,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'
import { STATUTS_EOL, statutEol, type StatutEol } from './eol'
import { partitionEnMemoire } from '../utils/partition'

// PARC TECHNOLOGIQUE — quelles technologies, quelles versions, jusqu'à quand, et OÙ.

export const parcTechnologiqueRouter = new Elysia({ name: 'parc-technologique', prefix: '/api/technologies' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/parc', async (ctx) => {
    const { status } = ctx
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    if (!cats.has('technologies')) {
      return { total: 0, lisible: false, tri: 'fin de vie croissante', resultats: [], avertissements: [] }
    }

    const aujourdhui = new Date().toISOString().slice(0, 10)
    const dansUnAn = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)

    const technos = await db.select().from(technologie).orderBy(asc(technologie.nom), asc(technologie.version))

    // Usages : applications et serveurs qui déclarent la technologie. Deux tables de liaison
    // distinctes, et c'est normal — une bibliothèque sert une application, un intergiciel
    // équipe un serveur.
    const parApp = await db.select({
      technologieId: applicationTechnologie.technologieId,
      applications: sql<number>`count(distinct ${application.id})::int`,
    })
      .from(applicationTechnologie)
      .innerJoin(application, eq(application.id, applicationTechnologie.applicationId))
      .groupBy(applicationTechnologie.technologieId)
    const appsParTechno = new Map(parApp.map(r => [r.technologieId, r.applications]))

    const parServeur = await db.select({
      technologieId: serveurTechnologie.technologieId,
      composante: composante.nom,
      serveurs: sql<number>`count(distinct ${serveur.id})::int`,
    })
      .from(serveurTechnologie)
      .innerJoin(serveur, eq(serveur.id, serveurTechnologie.serveurId))
      .leftJoin(composante, eq(composante.id, serveur.composanteId))
      .groupBy(serveurTechnologie.technologieId, composante.nom)
    const serveursParTechno = new Map<string, { composante: string, n: number }[]>()
    for (const r of parServeur) {
      const acc = serveursParTechno.get(r.technologieId) ?? []
      acc.push({ composante: r.composante ?? '(composante non renseignée)', n: r.serveurs })
      serveursParTechno.set(r.technologieId, acc)
    }

    // Les SITES ET SERVICES exposés. Troisième usage, et le seul qui soit DÉTECTÉ plutôt que
    // déclaré : une technologie qu'aucune application ni aucun serveur ne mentionne peut très
    // bien tourner en façade sur Internet.
    const parService = await db.select({
      technologieId: serviceTechnologie.technologieId,
      services: sql<number>`count(distinct ${serviceExpose.id})::int`,
    })
      .from(serviceTechnologie)
      .innerJoin(serviceExpose, eq(serviceExpose.id, serviceTechnologie.serviceId))
      .where(isNotNull(serviceTechnologie.technologieId))
      .groupBy(serviceTechnologie.technologieId)
    const servicesParTechno = new Map(parService.map(r => [r.technologieId!, r.services]))

    // VOCABULAIRE UNIFIÉ — cette fonction rendait `hors_support`, `bientot`, `supporte`,
    // `inconnu`, là où `statutEol()` rend `depasse`, `etendu`, `bientot`, `ok`, `supporte`,
    // `inconnu`.
    const statut = (t2: { finDeVie: unknown, finDeVieEtendue: unknown, sourceEol: string | null }): StatutEol =>
      statutEol(
        {
          finDeVie: t2.finDeVie ? String(t2.finDeVie) : null,
          finDeVieEtendue: t2.finDeVieEtendue ? String(t2.finDeVieEtendue) : null,
          sourceEol: t2.sourceEol,
        },
        aujourdhui, dansUnAn,
      )

    let resultats = technos.map((t2) => {
      const repartition = (serveursParTechno.get(t2.id) ?? []).sort((a, b) => b.n - a.n)
      return {
        id: t2.id,
        nom: t2.nom,
        version: t2.version,
        categorie: t2.categorie,
        finDeVie: t2.finDeVie ? String(t2.finDeVie) : null,
        // La fin de support ÉTENDUE prolonge la vie utile : l'ignorer ferait déclarer
        // obsolète une technologie encore couverte par contrat.
        finDeVieEtendue: t2.finDeVieEtendue ? String(t2.finDeVieEtendue) : null,
        eolStatut: statut(t2),
        source: t2.sourceEol,
        applications: appsParTechno.get(t2.id) ?? 0,
        serveurs: repartition.reduce((n, r) => n + r.n, 0),
        services: servicesParTechno.get(t2.id) ?? 0,
        // LA répartition : c'est elle qui désigne un interlocuteur.
        parComposante: repartition,
        urlAbsolue: urlPublique(`/technologies/${t2.id}`),
      }
    })

    // Une valeur hors vocabulaire rendait zéro ligne, ce qui se lit « aucune technologie dans
    // cet état » — une réponse rassurante et fausse.
    const demande = query.eolStatut ?? query.statut
    if (demande && !(STATUTS_EOL as readonly string[]).includes(demande)) {
      return status(422, `eolStatut inconnu : « ${demande} ». Valeurs : ${STATUTS_EOL.join(', ')}.`)
    }
    if (demande) resultats = resultats.filter(r => r.eolStatut === demande)
    if (query.categorie) resultats = resultats.filter(r => (r.categorie ?? '').toLowerCase() === String(query.categorie).toLowerCase())
    if (query.utilisees === 'true') resultats = resultats.filter(r => r.applications + r.serveurs + r.services > 0)

    // --- Le parc de machines, vu par OS ------------------------------------------------
    // Les OS du parc ne passent PAS par la table des technologies : GLPI remonte une chaîne
    // libre.
    const osServeurs = cats.has('serveurs')
      ? await db.select({
        cle: serveur.technologieCle, os: serveur.os, composante: composante.nom,
        machines: sql<number>`count(*)::int`,
      }).from(serveur).leftJoin(composante, eq(composante.id, serveur.composanteId))
        .groupBy(serveur.technologieCle, serveur.os, composante.nom)
      : []
    const osPostes = cats.has('postes')
      ? await db.select({
        cle: posteTravail.technologieCle, os: posteTravail.os, composante: composante.nom,
        machines: sql<number>`count(*)::int`,
      }).from(posteTravail).leftJoin(composante, eq(composante.id, posteTravail.composanteId))
        .groupBy(posteTravail.technologieCle, posteTravail.os, composante.nom)
      : []

    // Toutes les technologies, pas seulement celles qui portent une date : une technologie
    // connue SANS date se lit `inconnu`, ce qui n'est pas la même chose qu'une machine qu'on
    // n'a pas su rapprocher.
    const eolParCle = new Map(technos.map(t2 => [t2.nom, t2]))
    const eolDe = (cle: string | null) => (cle ? eolParCle.get(cle) ?? null : null)

    // Groupé par CLÉ et non par nom d'OS : deux releases du même produit portent le même
    // `os` et des clés distinctes, et les fondre ici annulerait la correction.
    const parOs = new Map<string, { cle: string | null, os: string, eolStatut: StatutEol, finDeVie: string | null, total: number, parComposante: Record<string, number> }>()
    let machinesSansCle = 0
    for (const r of [...osServeurs, ...osPostes]) {
      const os = r.cle ?? r.os ?? '(OS non renseigné)'
      if (!r.cle) machinesSansCle += r.machines
      const ref = eolDe(r.cle)
      const fin = ref?.finDeVie ? String(ref.finDeVie) : null
      const acc = parOs.get(os) ?? {
        cle: r.cle,
        // Le libellé reste l'OS brut : c'est ce que le lecteur reconnaît. La clé, elle,
        // porte la release et sert au rapprochement.
        os: r.os ?? '(OS non renseigné)',
        eolStatut: statut(ref ?? { finDeVie: null, finDeVieEtendue: null, sourceEol: null }),
        finDeVie: fin,
        total: 0,
        parComposante: {},
      }
      acc.total += r.machines
      const c = r.composante ?? '(composante non renseignée)'
      acc.parComposante[c] = (acc.parComposante[c] ?? 0) + r.machines
      parOs.set(os, acc)
    }
    const machinesParOs = [...parOs.values()]
      .map(x => ({ ...x, parComposante: Object.entries(x.parComposante).map(([composante2, machines]) => ({ composante: composante2, machines })).sort((a, b) => b.machines - a.machines) }))
      .sort((a, b) => b.total - a.total)

    const avertissements = [
      'Le rapprochement entre l\'OS remonté par l\'inventaire et le référentiel de fin de vie se fait sur le NOM. '
      + 'Un OS nommé autrement dans le référentiel ressort en statut « inconnu » — ce qui ne veut pas dire « supporté ».',
      'Une technologie sans date de fin de vie est en statut « inconnu » : personne n\'a renseigné sa date, '
      + 'ce n\'est pas une garantie de maintenance.',
    ]
    if (!cats.has('serveurs') || !cats.has('postes')) {
      avertissements.push('Une partie du parc (serveurs ou postes) est hors de la portée de l\'appelant : les répartitions sont incomplètes.')
    }

    return {
      total: resultats.length,
      lisible: true,
      tri: 'nom, puis version',
      comptes: {
        // PARTITION COMPLÈTE, dérivée — les compteurs nommés ci-dessous n'en couvraient
        // que quatre sur six : `ok` et `supporte` manquaient, soit la majorité du parc.
        parEolStatut: partitionEnMemoire(resultats, STATUTS_EOL, r => r.eolStatut),
        machinesParEolStatut: partitionEnMemoire(machinesParOs, STATUTS_EOL, o => o.eolStatut, o => o.total),
        machinesTotal: machinesParOs.reduce((n, o) => n + o.total, 0),
        // Machines dont la clé de technologie n'est pas encore calculée. Elles tombent dans
        // `inconnu` faute de mieux, mais ce n'est pas « support inconnu » : c'est « pas encore
        // rapproché ».
        machinesSansCle,
        horsSupport: resultats.filter(r => r.eolStatut === 'depasse').length,
        // Distinct de `horsSupport` : une technologie couverte par un contrat étendu n'est
        // pas hors support, et la confondre effacerait le renouvellement à venir.
        sousSupportEtendu: resultats.filter(r => r.eolStatut === 'etendu').length,
        bientotHorsSupport: resultats.filter(r => r.eolStatut === 'bientot').length,
        sansDate: resultats.filter(r => r.eolStatut === 'inconnu').length,
        machinesHorsSupport: machinesParOs.filter(o => o.eolStatut === 'depasse').reduce((n, o) => n + o.total, 0),
        machinesSousSupportEtendu: machinesParOs.filter(o => o.eolStatut === 'etendu').reduce((n, o) => n + o.total, 0),
      },
      avertissements,
      resultats,
      // La réponse à « la répartition entre les composantes ».
      machinesParOs,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({
      eolStatut: t.Optional(t.String()),
      // Nom précédent, conservé le temps que les appelants basculent.
      statut: t.Optional(t.String()),
      categorie: t.Optional(t.String()),
      utilisees: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Parc technologique : technologies, versions, fins de vie, et répartition par composante.',
      description: 'Une technologie est un couple NOM + VERSION — « PHP » n\'a pas de fin de vie, « PHP 7.4 » '
        + 'en a une. `eolStatut` (anciennement `statut`, toujours accepté en paramètre) prend les valeurs de `STATUTS_EOL`, publiées avec leur lecture dans '
        + '/api/lectures sous `technologie.eolStatut` : depasse, etendu, bientot, ok, supporte, inconnu. '
        + 'Une valeur hors de cette liste est refusée en 422, jamais filtrée à vide. '
        + '`inconnu` signifie qu\'aucune date n\'est renseignée et NON que la technologie est maintenue ; '
        + '`etendu` signifie que le support standard est dépassé mais qu\'un contrat étendu court encore — '
        + 'à ne pas compter parmi les technologies hors support. '
        + '`machinesParOs` donne la répartition du parc par système et par composante — c\'est elle qui '
        + 'transforme un constat en interlocuteur. La fin de support ÉTENDUE prime sur la fin de support '
        + 'standard quand elle existe.',
    },
  })
