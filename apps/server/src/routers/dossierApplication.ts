import { Elysia, t } from 'elysia'
import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  application, applicationExigenceRgpd, applicationRgpd, applicationTechnologie,
  exigenceRgpd, personne, pole, technologie, tiers,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'

// DOSSIER D'UNE APPLICATION — tout ce qu'on demande à son sujet, en un appel.

const CRITIQUES = ['vitale', 'critique', 'essentielle']

export const dossierApplicationRouter = new Elysia({ name: 'dossier-application', prefix: '/api/dossier' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/application/:cle', async (ctx) => {
    const { params, status } = ctx
    const cats = await readableCategories(accesDe(ctx))
    if (!cats.has('applications')) return status(403, { message: 'Catégorie « applications » hors de la portée de l\'appelant.' })

    const cle = decodeURIComponent(params.cle).trim()
    const [app] = await db.select().from(application)
      .where(or(eq(application.id, cle), sql`lower(${application.nom}) = ${cle.toLowerCase()}`))
      .limit(1)

    if (!app) {
      // Plutôt que 404 sec : proposer les noms proches.
      const proches = await db.select({ id: application.id, nom: application.nom })
        .from(application).where(ilike(application.nom, `%${cle}%`)).limit(8)
      return status(404, {
        message: `Aucune application nommée « ${cle} ».`,
        suggestions: proches,
      })
    }

    const [responsableTech] = app.responsableId
      ? await db.select({ nom: personne.nom, prenom: personne.prenom, email: personne.email, fonction: personne.fonction }).from(personne).where(eq(personne.id, app.responsableId)).limit(1)
      : []
    const [responsableMetier] = app.responsableMetierId
      ? await db.select({ nom: personne.nom, prenom: personne.prenom, email: personne.email, fonction: personne.fonction }).from(personne).where(eq(personne.id, app.responsableMetierId)).limit(1)
      : []
    const [polePorteur] = app.poleId
      ? await db.select({ nom: pole.nom }).from(pole).where(eq(pole.id, app.poleId)).limit(1)
      : []
    const [editeur] = app.editeurId
      ? await db.select({ nom: tiers.nom }).from(tiers).where(eq(tiers.id, app.editeurId)).limit(1)
      : []

    // --- Volet RGPD : l'AIPD et l'état exigence par exigence ---------------------------
    const [bloc] = await db.select().from(applicationRgpd).where(eq(applicationRgpd.applicationId, app.id)).limit(1)
    const exigences = cats.has('exigences-rgpd')
      ? await db.select({
        reference: exigenceRgpd.reference, article: exigenceRgpd.article,
        intitule: exigenceRgpd.intitule, ordre: exigenceRgpd.ordre,
        etat: applicationExigenceRgpd.etat, justification: applicationExigenceRgpd.justification,
      })
        .from(exigenceRgpd)
        .leftJoin(applicationExigenceRgpd, and(
          eq(applicationExigenceRgpd.exigenceRgpdId, exigenceRgpd.id),
          eq(applicationExigenceRgpd.applicationId, app.id),
        ))
        .where(or(eq(exigenceRgpd.portee, 'application'), eq(exigenceRgpd.portee, 'les_deux')))
        .orderBy(asc(exigenceRgpd.ordre))
      : []

    const aujourdhui = new Date().toISOString().slice(0, 10)
    const revue = bloc?.aipdRevueDate ? String(bloc.aipdRevueDate) : null

    // --- Technologies et fin de vie ----------------------------------------------------
    const technos = cats.has('technologies')
      ? await db.select({
        nom: technologie.nom, version: technologie.version, categorie: technologie.categorie,
        finDeVie: technologie.finDeVie, finDeVieEtendue: technologie.finDeVieEtendue,
        sourceEol: technologie.sourceEol,
      })
        .from(applicationTechnologie)
        .innerJoin(technologie, eq(technologie.id, applicationTechnologie.technologieId))
        .where(eq(applicationTechnologie.applicationId, app.id))
        .orderBy(asc(technologie.nom))
      : []
    const technosEnrichies = technos.map((t2) => {
      const fin = t2.finDeVieEtendue ?? t2.finDeVie
      return {
        ...t2,
        finDeVie: t2.finDeVie ? String(t2.finDeVie) : null,
        finDeVieEtendue: t2.finDeVieEtendue ? String(t2.finDeVieEtendue) : null,
        horsSupport: !!(fin && String(fin) < aujourdhui),
      }
    })

    // CE QUI N'EST PAS RENSEIGNÉ, DIT EXPLICITEMENT. Un champ vide dans une réponse d'API se
    // lit trop facilement comme un « non » : « pas de données personnelles » et « la question
    // n'a pas été posée » ne s'écrivent pas de la même façon.
    const manques: string[] = []
    if (!app.criticite) manques.push('Criticité non renseignée : cette application échappe à tout classement par criticité.')
    if (!app.responsableId && !app.responsableMetierId) manques.push('Aucun responsable désigné, ni technique ni métier.')
    if (!app.hebergement) manques.push('Hébergement non renseigné.')
    if (app.donneesPersonnelles === null) manques.push('La question « traite-t-elle des données personnelles ? » n\'a jamais été tranchée — ce n\'est PAS un « non ».')
    if (!bloc) manques.push('Aucun volet RGPD ouvert : la nécessité d\'une AIPD n\'a même pas été examinée.')
    else if (bloc.aipdStatut === 'terminee' && !revue) manques.push('AIPD terminée sans date de réexamen : elle ne se rouvrira jamais (RGPD art. 35.11).')
    if (exigences.length && exigences.every(e => !e.etat)) manques.push('Aucune exigence RGPD n\'a été évaluée pour cette application.')
    if (app.homologuee && !app.dateRevueHomologation) manques.push('Application homologuée sans date de revue d\'homologation.')
    if (!technos.length) manques.push('Aucune technologie rattachée : on ne peut rien dire de son obsolescence.')

    return {
      identite: {
        id: app.id, nom: app.nom, description: app.description,
        categorie: app.categorie, statut: app.statut,
        url: app.url, siteWeb: app.siteWeb,
        editeur: editeur?.nom ?? null,
        openSource: app.openSource, devInterne: app.devInterne,
        dateMiseEnService: app.dateMiseEnService ? String(app.dateMiseEnService) : null,
        urlAbsolue: urlPublique(`/applications/${app.id}`),
      },
      criticite: {
        niveau: app.criticite,
        // La question « est-elle critique ? » attend un oui/non, pas une étiquette à
        // interpréter. `null` quand la criticité n'est pas renseignée : ni oui, ni non.
        estCritique: app.criticite ? CRITIQUES.includes(app.criticite) : null,
        dureeIndisponibiliteTolerable: app.dureeIndisponibiliteTolerable,
        sensibilite: app.sensibilite,
      },
      responsables: {
        technique: responsableTech ? { nom: `${responsableTech.prenom ?? ''} ${responsableTech.nom}`.trim(), email: responsableTech.email, fonction: responsableTech.fonction } : null,
        metier: responsableMetier ? { nom: `${responsableMetier.prenom ?? ''} ${responsableMetier.nom}`.trim(), email: responsableMetier.email, fonction: responsableMetier.fonction } : null,
        pole: polePorteur?.nom ?? null,
      },
      hebergement: {
        type: app.hebergement,
        exposition: app.exposition,
        // Champ MULTIPLE : une application peut accepter plusieurs modes. La précision
        // libre n'a de sens que si « autre » figure parmi eux.
        authentification: app.authentification ?? [],
        authentificationAutre: (app.authentification ?? []).includes('autre') ? app.authentificationAutre : null,
        maintenueAJour: app.maintenueAJour,
        dateFinDeSupport: app.dateFinDeSupport ? String(app.dateFinDeSupport) : null,
        horsSupport: !!(app.dateFinDeSupport && String(app.dateFinDeSupport) < aujourdhui),
      },
      homologation: {
        homologuee: app.homologuee,
        dateHomologation: app.dateHomologation ? String(app.dateHomologation) : null,
        dateRevue: app.dateRevueHomologation ? String(app.dateRevueHomologation) : null,
        revueEchue: !!(app.dateRevueHomologation && String(app.dateRevueHomologation) < aujourdhui),
      },
      donneesPersonnelles: {
        // Trois valeurs et non deux : `null` veut dire « jamais tranché ».
        traite: app.donneesPersonnelles,
        aipd: bloc
          ? {
              statut: bloc.aipdStatut,
              motif: bloc.aipdMotif, motifPrecision: bloc.aipdMotifPrecision,
              // LE résultat de l'AIPD, qui est ce qu'on cherche vraiment.
              conclusion: bloc.aipdConclusion,
              conclusionDetail: bloc.aipdConclusionDetail,
              date: bloc.aipdDate ? String(bloc.aipdDate) : null,
              dateRevue: revue,
              revueEchue: !!(revue && revue < aujourdhui),
            }
          : null,
        exigences: exigences.map(e => ({
          reference: e.reference, article: e.article, intitule: e.intitule,
          // `null` = non évaluée pour cette application. Ne jamais compter du côté conforme.
          etat: e.etat, justification: e.justification,
        })),
        comptes: {
          total: exigences.length,
          evaluees: exigences.filter(e => !!e.etat).length,
          nonEvaluees: exigences.filter(e => !e.etat).length,
        },
      },
      technologies: technosEnrichies,
      technologiesHorsSupport: technosEnrichies.filter(t2 => t2.horsSupport).length,
      manques,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    params: t.Object({ cle: t.String() }),
    detail: {
      summary: 'Dossier complet d\'une application : criticité, responsables, hébergement, AIPD, RGPD, technologies.',
      description: 'Désignée par son identifiant OU par son nom. Répond en un appel à « est-elle critique ? », '
        + '« qui en est responsable ? », « où est-elle hébergée ? », « a-t-elle eu une AIPD et qu\'a-t-elle '
        + 'conclu ? », « respecte-t-elle les exigences RGPD ? », « ses technologies sont-elles encore '
        + 'maintenues ? ». ATTENTION : `donneesPersonnelles.traite` a TROIS valeurs — true, false, et `null` '
        + 'qui signifie « jamais tranché » et ne doit JAMAIS être lu comme un non. De même, une exigence RGPD '
        + 'sans `etat` est non évaluée, pas conforme. Le champ `manques` énumère ce qui n\'est pas renseigné : '
        + 'le répercuter dans la réponse. Un 404 propose des noms proches.',
    },
  })
