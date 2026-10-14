import { Elysia } from 'elysia'
import { count, eq, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  application, applicationRgpd, certificat, clauseIso27001, connecteurGlpi, connecteurHarfanglab,
  connecteurSlowpoke, edrRuleset, exigenceNis2, exigenceRgpd, glpiMachine, mesureSmsi,
  posteTravail, risqueSmsi, serveur, sniffEcheance, user, whitelist,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { expressionEtatRgpd } from './rgpd'

// CE QUE LE CATALOGUE NE SAIT PAS. Le point d'entrée le plus important pour un appelant
// automatisé, et le moins évident.

/**
 * LES DOMAINES, ÉNUMÉRÉS ET RENDUS. Sans cette liste, une clé mal devinée par un appelant est
 * indiscernable d'un domaine hors de sa portée : dans les deux cas elle est absente de
 * `domainesExamines`.
 */
export const DOMAINES_LACUNES = [
  'acces',
  'certificats',
  'conformite',
  'connecteurs',
  'edr',
  'listes-blanches',
  'parc',
  'rgpd',
  'risques',
] as const

type DomaineLacune = typeof DOMAINES_LACUNES[number]

/**
 * L'UNITÉ DE `combien`, DÉCLARÉE PLUTÔT QUE DEVINÉE. « 12 serveurs sans responsable ».
 */
const UNITES_LACUNE = ['fiches', 'jours', 'presence'] as const
export type UniteLacune = typeof UNITES_LACUNE[number]
export { UNITES_LACUNE }

type Lacune = {
  domaine: DomaineLacune
  cle: string
  quoi: string
  combien: number
  /** Ce que `combien` compte. Obligatoire : c'est ce qui manquait. */
  unite: UniteLacune
  /** Le dénominateur, et UNIQUEMENT quand `unite` vaut `fiches`. */
  sur: number | null
  /**
   * La date de dernière collecte, quand la lacune porte sur la fraîcheur d'une source.
   */
  depuis: string | null
  gravite: 'aveugle' | 'partiel'
  pourquoi: string
}

const JOURS = 864e5

// Un connecteur muet depuis longtemps est la lacune la plus trompeuse de toutes : les
// données sont là, elles ont l'air fraîches, et elles décrivent un état révolu.
function lacuneConnecteur(
  nom: string, actif: boolean | undefined, dernier: Date | null | undefined, seuilJours: number,
): Lacune | null {
  if (!actif) {
    return {
      domaine: 'connecteurs', cle: `connecteur_${nom}_inactif`,
      quoi: `Le connecteur ${nom} est inactif.`,
      // `1` = « la condition est vraie », jamais « un élément ».
      combien: 1, unite: 'presence', sur: null, depuis: dernier?.toISOString() ?? null, gravite: 'aveugle',
      pourquoi: `Tout ce qui vient de ${nom} est figé à la dernière synchronisation, ou absent. Ne pas présenter ces données comme l'état courant.`,
    }
  }
  if (!dernier) {
    return {
      domaine: 'connecteurs', cle: `connecteur_${nom}_jamais`,
      quoi: `Le connecteur ${nom} n'a jamais tourné.`,
      combien: 1, unite: 'presence', sur: null, depuis: null, gravite: 'aveugle',
      pourquoi: `Aucune donnée ${nom} n'a été relevée. Un compteur à zéro sur ce domaine ne veut RIEN dire.`,
    }
  }
  const jours = Math.floor((Date.now() - dernier.getTime()) / JOURS)
  if (jours >= seuilJours) {
    return {
      domaine: 'connecteurs', cle: `connecteur_${nom}_perime`,
      quoi: `Le connecteur ${nom} n'a rien relevé depuis ${jours} jours.`,
      // `depuis` porte la date elle-même : c'est elle qu'on cite, pas le délai.
      combien: jours, unite: 'jours', sur: null, depuis: dernier.toISOString(), gravite: 'partiel',
      pourquoi: `Les données ${nom} décrivent l'état d'il y a ${jours} jours. Le dire dans toute réponse qui s'appuie dessus.`,
    }
  }
  return null
}

export const lacunesRouter = new Elysia({ name: 'lacunes', prefix: '/api/lacunes' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/', async (ctx) => {
    const cats = await readableCategories(accesDe(ctx))
    const lacunes: Lacune[] = []
    // Domaines RÉELLEMENT examinés — c'est-à-dire ceux que l'appelant a le droit de lire.
    const examines = new Set<DomaineLacune>()
    const ajoute = (l: Lacune | null) => {
      if (!l) return
      examines.add(l.domaine)
      if (l.combien > 0) lacunes.push(l)
    }

    // --- Les sources ------------------------------------------------------------------
    examines.add('connecteurs')
    const [glpi] = await db.select().from(connecteurGlpi).limit(1)
    const [sniff] = await db.select().from(connecteurSlowpoke).limit(1)
    const [hl] = await db.select().from(connecteurHarfanglab).limit(1)
    ajoute(lacuneConnecteur('GLPI', glpi?.actif, glpi?.dernierSyncAt, 3))
    ajoute(lacuneConnecteur('Sniff', sniff?.actif, sniff?.dernierAccesAt, 7))
    ajoute(lacuneConnecteur('HarfangLab', hl?.actif, hl?.dernierSyncAt, 3))

    // La règle qui rend l'écart de couverture EDR calculable. Sans elle, l'écart vaut 0
    // par construction — et zéro écart ressemble à une couverture parfaite.
    const regles = (glpi?.groupesCriticite ?? []) as unknown[]
    if (!regles.length) {
      lacunes.push({
        domaine: 'connecteurs', cle: 'groupes_criticite_non_declares',
        quoi: 'Aucun groupe GLPI n\'est déclaré comme marqueur de criticité.',
        combien: 1, unite: 'fiches', sur: null, depuis: null, gravite: 'aveugle',
        pourquoi: 'L\'écart de couverture EDR vaut alors zéro PAR CONSTRUCTION, ce qui ressemble à une couverture parfaite. Ne jamais l\'annoncer comme un résultat.',
      })
    }

    // --- Les référentiels jamais évalués ---------------------------------------------
    if (cats.has('exigences-nis2')) {
      const [r] = await db.select({
        total: count(),
        vides: sql<number>`count(*) filter (where ${exigenceNis2.conformite} is null)::int`,
      }).from(exigenceNis2)
      ajoute({
        domaine: 'conformite', cle: 'nis2_non_evaluees',
        quoi: 'Exigences NIS 2 jamais évaluées.',
        combien: r?.vides ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'Une exigence non évaluée ne peut être comptabilisée ni comme conforme ni comme non conforme.',
      })
    }
    if (cats.has('clauses-iso27001')) {
      const [r] = await db.select({
        total: count(),
        vides: sql<number>`count(*) filter (where ${clauseIso27001.conformite} is null)::int`,
      }).from(clauseIso27001)
      ajoute({
        domaine: 'conformite', cle: 'iso27001_non_evaluees',
        quoi: 'Clauses ISO 27001 jamais évaluées.',
        combien: r?.vides ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'Une exigence non évaluée ne peut être comptabilisée ni comme conforme ni comme non conforme.',
      })
    }
    if (cats.has('exigences-rgpd')) {
      const [r] = await db.select({
        total: count(),
        vides: sql<number>`count(*) filter (where ${exigenceRgpd.conformite} is null)::int`,
      }).from(exigenceRgpd)
      ajoute({
        domaine: 'conformite', cle: 'rgpd_non_evaluees',
        quoi: 'Exigences RGPD jamais évaluées.',
        combien: r?.vides ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'Une exigence non évaluée ne peut être comptabilisée ni comme conforme ni comme non conforme.',
      })
    }
    if (cats.has('mesures-smsi')) {
      const [r] = await db.select({
        total: count(),
        sansPreuve: sql<number>`count(*) filter (where ${mesureSmsi.applicable} and coalesce(trim(${mesureSmsi.preuve}), '') = '')::int`,
      }).from(mesureSmsi)
      ajoute({
        domaine: 'conformite', cle: 'soa_sans_preuve',
        quoi: 'Mesures déclarées applicables sans aucune preuve.',
        combien: r?.sansPreuve ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'La déclaration d\'applicabilité n\'est étayée par aucune preuve : elle ne peut pas être vérifiée en audit.',
      })
    }
    if (cats.has('risques-smsi')) {
      const [r] = await db.select({
        total: count(),
        sansTraitement: sql<number>`count(*) filter (where ${risqueSmsi.traitement} is null)::int`,
      }).from(risqueSmsi)
      ajoute({
        domaine: 'risques', cle: 'risques_sans_traitement',
        quoi: 'Risques identifiés sans traitement décidé.',
        combien: r?.sansTraitement ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'Le risque est identifié sans traitement décidé. L\'absence de décision ne constitue pas une acceptation, laquelle doit être formalisée.',
      })
    }

    // --- Le parc ----------------------------------------------------------------------
    if (cats.has('serveurs')) {
      const [r] = await db.select({
        total: count(),
        sansResponsable: sql<number>`count(*) filter (where ${serveur.responsableMetierId} is null)::int`,
        sansCriticite: sql<number>`count(*) filter (where ${serveur.criticite} is null)::int`,
      }).from(serveur)
      ajoute({
        domaine: 'parc', cle: 'serveurs_sans_responsable',
        quoi: 'Serveurs sans responsable métier.',
        combien: r?.sansResponsable ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'Aucun interlocuteur n\'est identifié pour ces machines en cas d\'incident.',
      })
      ajoute({
        domaine: 'parc', cle: 'serveurs_sans_criticite',
        quoi: 'Serveurs sans criticité renseignée.',
        combien: r?.sansCriticite ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'Ces machines sont exclues de tout classement par criticité, y compris du calcul de l\'écart de couverture EDR.',
      })
    }
    if (cats.has('postes')) {
      const [r] = await db.select({
        total: count(),
        sansCriticite: sql<number>`count(*) filter (where ${posteTravail.criticite} is null)::int`,
      }).from(posteTravail)
      ajoute({
        domaine: 'parc', cle: 'postes_sans_criticite',
        quoi: 'Postes de travail sans criticité renseignée.',
        combien: r?.sansCriticite ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'Ces postes sont exclus de tout classement par criticité.',
      })
    }

    examines.add('parc')
    // Doublons d'inventaire : deux fiches pour une seule machine physique. Elles gonflent
    // tous les décomptes de parc, dans un sens qu'aucun total ne laisse deviner.
    const [dbl] = await db.select({
      doublons: sql<number>`(
        select coalesce(sum(n - 1), 0)::int from (
          select count(*) as n from ${glpiMachine}
          where coalesce(trim(${glpiMachine.numeroSerie}), '') <> ''
          group by lower(trim(${glpiMachine.numeroSerie}))
          having count(*) > 1
        ) t)`,
      total: count(),
    }).from(glpiMachine)
    ajoute({
      domaine: 'parc', cle: 'doublons_inventaire',
      quoi: 'Entrées GLPI en double : même numéro de série, plusieurs fiches.',
      combien: dbl?.doublons ?? 0, unite: 'fiches', sur: dbl?.total ?? 0, depuis: null, gravite: 'partiel',
      pourquoi: 'Les décomptes de parc sont surévalués d\'autant. Un total de fiches ne peut pas être présenté comme un nombre de machines physiques.',
    })

    // --- Accès ------------------------------------------------------------------------
    if (cats.has('personnes')) {
      const [r] = await db.select({
        admins: sql<number>`count(*) filter (where ${user.role} = 'admin')::int`,
        horsAnnuaire: sql<number>`count(*) filter (where ${user.role} = 'admin' and ${user.roleOrigine} = 'manuel')::int`,
      }).from(user)
      ajoute({
        domaine: 'acces', cle: 'admins_hors_annuaire',
        quoi: 'Comptes administrateurs dont le rôle a été posé à la main.',
        combien: r?.horsAnnuaire ?? 0, unite: 'fiches', sur: r?.admins ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'Le rôle de ces comptes n\'est pas réévalué à la connexion : un retrait du groupe '
          + '« admins » dans l\'annuaire ne le révoque pas. À revoir périodiquement.',
      })
    }

    // --- Compteurs réglementaires --------------------------------------------------
    if (cats.has('incidents')) {
      const [r] = await db.select({
        total: count(),
        aTrancher: sql<number>`count(*) filter (where ${sniffEcheance.applicable} is null and ${sniffEcheance.defaut} = 'a_evaluer')::int`,
      }).from(sniffEcheance)
      ajoute({
        domaine: 'conformite', cle: 'applicabilite_non_tranchee',
        quoi: 'Compteurs réglementaires dont l\'applicabilité n\'a jamais été tranchée.',
        combien: r?.aTrancher ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'Aucun délai n\'est décompté tant que la décision n\'est pas enregistrée, et l\'applicabilité reste indéterminée. La décision se porte dans Sniff, au niveau de l\'incident.',
      })
      if (!(r?.total ?? 0)) {
        lacunes.push({
          domaine: 'conformite', cle: 'compteurs_jamais_releves',
          quoi: 'Aucun compteur réglementaire relevé chez Sniff.',
          combien: 1, unite: 'fiches', sur: null, depuis: null, gravite: 'aveugle',
          pourquoi: 'Aucune donnée relevée : soit aucun incident ne porte de compteur, soit le relevé n\'a jamais abouti. Un décompte nul n\'est pas interprétable tant que la source n\'a pas répondu.',
        })
      }
    }

    // --- Sécurité opérationnelle -------------------------------------------------------
    if (cats.has('certificats')) {
      const [r] = await db.select({
        total: count(),
        jamais: sql<number>`count(*) filter (where ${certificat.dernierStatut} = 'jamais')::int`,
        muets: sql<number>`count(*) filter (where ${certificat.dernierStatut} in ('injoignable', 'tls_erreur'))::int`,
      }).from(certificat).where(eq(certificat.surveille, true))
      ajoute({
        domaine: 'certificats', cle: 'certificats_jamais_releves',
        quoi: 'Certificats inscrits mais jamais relevés.',
        combien: r?.jamais ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'Leur date d\'expiration est inconnue : ils n\'apparaissent dans aucune alerte d\'échéance.',
      })
      ajoute({
        domaine: 'certificats', cle: 'certificats_injoignables',
        quoi: 'Certificats dont l\'hôte ne répond plus au scan.',
        combien: r?.muets ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'La dernière date relevée est conservée mais peut être périmée : le service a pu être renouvelé, déplacé ou arrêté.',
      })
    }
    if (cats.has('whitelists')) {
      const [r] = await db.select({
        total: count(),
        sansMotif: sql<number>`count(*) filter (where not ${whitelist.fourniParEditeur} and coalesce(trim(${whitelist.motif}), '') = '')::int`,
        sansIncident: sql<number>`count(*) filter (where not ${whitelist.fourniParEditeur} and ${whitelist.sniffIncidentId} is null)::int`,
      }).from(whitelist)
      ajoute({
        domaine: 'listes-blanches', cle: 'whitelists_sans_motif',
        quoi: 'Listes blanches de l\'établissement sans motif écrit.',
        combien: r?.sansMotif ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'L\'exclusion est en vigueur sans justification consignée : elle ne peut pas être motivée en revue.',
      })
      ajoute({
        domaine: 'listes-blanches', cle: 'whitelists_sans_incident',
        quoi: 'Listes blanches de l\'établissement non rattachées à un incident Sniff.',
        combien: r?.sansIncident ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'Le rapprochement n\'a pas été établi, ou la règle n\'a pas d\'incident d\'origine. L\'absence de lien ne vaut pas absence de justification.',
      })
    }
    if (cats.has('edr-regles')) {
      const [r] = await db.select({
        total: count(),
        orphelins: sql<number>`count(*) filter (where coalesce(jsonb_array_length(${edrRuleset.politiques}), 0) = 0)::int`,
      }).from(edrRuleset)
      ajoute({
        domaine: 'edr', cle: 'rulesets_sans_politique',
        quoi: 'Jeux de règles EDR rattachés à aucune politique.',
        combien: r?.orphelins ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'Ces jeux de règles ne sont rattachés à aucune politique : ils ne sont appliqués sur aucun poste.',
      })
    }

    // --- RGPD --------------------------------------------------------------------------
    if (cats.has('applications')) {
      const [r] = await db.select({
        total: count(),
        sansRevue: sql<number>`count(*) filter (where ${applicationRgpd.aipdStatut} = 'terminee' and ${applicationRgpd.aipdRevueDate} is null)::int`,
      }).from(applicationRgpd)
      ajoute({
        domaine: 'rgpd', cle: 'aipd_sans_date_de_revue',
        quoi: 'Analyses d\'impact terminées sans date de réexamen.',
        combien: r?.sansRevue ?? 0, unite: 'fiches', sur: r?.total ?? 0, depuis: null, gravite: 'partiel',
        pourquoi: 'Elles sont comptabilisées comme achevées et aucun réexamen n\'est programmé (RGPD art. 35.11).',
      })

      const [a] = await db.select({
        total: count(),
        sansVolet: sql<number>`count(*) filter (where not exists (
          select 1 from ${applicationRgpd} r where r.application_id = ${application}."id"))::int`,
      }).from(application)
      ajoute({
        domaine: 'rgpd', cle: 'applications_sans_volet_rgpd',
        quoi: 'Applications sans volet RGPD ouvert.',
        combien: a?.sansVolet ?? 0, unite: 'fiches', sur: a?.total ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'La nécessité d\'une analyse d\'impact n\'a pas été examinée pour ces applications.',
      })

      // LA MOITIÉ QUI EST BIEN UNE LACUNE. Une application en ÉCART n'a rien à faire ici :
      // c'est un fait mesuré, connu et défavorable, et il se compte dans
      // /api/conformite/resume.
      const [ev] = await db.select({
        concernees: sql<number>`count(*) filter (where ${expressionEtatRgpd()} <> 'hors_perimetre')::int`,
        nonEvaluees: sql<number>`count(*) filter (where ${expressionEtatRgpd()} = 'non_evalue')::int`,
      }).from(application)
      ajoute({
        domaine: 'rgpd', cle: 'applications_rgpd_non_evaluees',
        quoi: 'Applications traitant des données personnelles dont les exigences RGPD ne sont pas évaluées.',
        combien: ev?.nonEvaluees ?? 0, unite: 'fiches', sur: ev?.concernees ?? 0, depuis: null, gravite: 'aveugle',
        pourquoi: 'Leur conformité n\'est ni établie ni infirmée. Elles ne doivent être comptées ni parmi '
          + 'les conformes ni parmi les écarts.',
      })
    }

    const aveugles = lacunes.filter(l => l.gravite === 'aveugle').length
    return {
      total: lacunes.length,
      aveugles,
      tri: 'domaine, puis clé',
      // LES TROIS LISTES, et l'écart entre elles porte le sens. `domainesConnus` — tout ce que
      // ce point d'entrée sait examiner ; `domainesExamines` — ce qu'il a effectivement regardé
      // pour CET appelant ; `domainesAvecLacune` — ce qui a donné quelque chose.
      domainesConnus: [...DOMAINES_LACUNES],
      domainesExamines: [...examines].sort(),
      // CE QUI A DONNÉ QUELQUE CHOSE. Un domaine examiné et absent de cette liste va bien.
      domainesAvecLacune: [...new Set(lacunes.map(l => l.domaine))].sort(),
      avertissement: 'Cette liste ne recense que les lacunes des catégories que l\'appelant a le droit de lire. '
        + 'Une catégorie hors de sa portée n\'apparaît pas — son absence n\'est donc pas une preuve d\'exhaustivité.',
      resultats: lacunes.sort((x, y) => (x.domaine + x.cle).localeCompare(y.domaine + y.cle)),
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    detail: {
      summary: 'CE QUE LE CATALOGUE NE SAIT PAS : les angles morts, à citer avant toute réponse rassurante.',
      description: 'À appeler AVANT d\'affirmer qu\'un domaine va bien. Un référentiel vide et un référentiel '
        + 'sain se ressemblent parfaitement dans les données : seule cette route les distingue. `gravite: '
        + '"aveugle"` signifie qu\'on ne sait rien du tout sur ce point ; `"partiel"` qu\'on sait, mais '
        + 'incomplètement. Chaque lacune porte un champ `pourquoi` qui dit la conséquence sur une réponse '
        + 'fondée là-dessus — c\'est ce champ qu\'il faut répercuter, pas seulement le chiffre. '
        + 'TROIS LISTES DE DOMAINES, et leur écart porte le sens. `domainesConnus` énumère tout ce que '
        + 'ce point d\'entrée sait examiner — une clé absente d\'ici N\'EXISTE PAS. `domainesExamines` '
        + 'donne ce qui a été regardé pour cet appelant : une clé connue mais absente d\'ici est HORS DE '
        + 'SA PORTÉE. `domainesAvecLacune` donne ce qui a donné quelque chose : un domaine examiné et '
        + 'absent d\'ici va bien. Sans la première liste, « clé inconnue » et « domaine inaccessible » '
        + 'seraient indiscernables. '
        + 'LIRE `unite` AVANT `combien`. Trois unités coexistent : `fiches` (un nombre '
        + 'd\'enregistrements, `sur` porte alors le dénominateur), `jours` (un DÉLAI — `depuis` porte la '
        + 'date de dernière collecte, et c\'est elle qu\'il faut citer), et `presence` (la condition est '
        + 'vraie ; `combien` vaut 1 et ne signifie PAS « un élément »). Additionner des lignes d\'unités '
        + 'différentes produit un total qui ne mesure rien.',
    },
  })
