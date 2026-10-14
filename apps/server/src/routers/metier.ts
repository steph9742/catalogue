import { Elysia, t } from 'elysia'
import { asc, eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  application, contact, fluxApplicatif, logicielPoste,
  logicielPostePopulation, population, tiers,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'

// TROIS VUES MÉTIER : les flux entre applications, le poste de travail par population, et les
// prestataires.

const CRITIQUES = ['vitale', 'critique', 'essentielle']

export const metierRouter = new Elysia({ name: 'metier' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Cartographie'] } })

  /**
   * FLUX APPLICATIFS — qui échange quoi, avec qui, comment. Le champ qui compte est `donnees` :
   * un flux qui transporte des données personnelles ou sensibles engage le RGPD, indépendamment
   * de la criticité des deux applications.
   */
  .get('/api/flux-applicatifs/carte', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    if (!cats.has('flux-applicatifs')) {
      return { total: 0, lisible: false, tri: 'nom', resultats: [], avertissements: ['Catégorie « flux-applicatifs » hors de la portée de l\'appelant.'] }
    }

    const src = { id: application.id, nom: application.nom, criticite: application.criticite, exposition: application.exposition }
    const source = db.select(src).from(application).as('source')
    const destination = db.select(src).from(application).as('destination')

    const rows = await db.select({
      id: fluxApplicatif.id, nom: fluxApplicatif.nom, protocole: fluxApplicatif.protocole,
      port: fluxApplicatif.port, donnees: fluxApplicatif.donnees, sens: fluxApplicatif.sens,
      frequence: fluxApplicatif.frequence, description: fluxApplicatif.description,
      sourceNom: source.nom, sourceCriticite: source.criticite, sourceExposition: source.exposition,
      destinationNom: destination.nom, destinationCriticite: destination.criticite, destinationExposition: destination.exposition,
      sourceId: fluxApplicatif.sourceApplicationId, destinationId: fluxApplicatif.destinationApplicationId,
    })
      .from(fluxApplicatif)
      .leftJoin(source, eq(source.id, fluxApplicatif.sourceApplicationId))
      .leftJoin(destination, eq(destination.id, fluxApplicatif.destinationApplicationId))
      .orderBy(asc(fluxApplicatif.nom))

    const resultats = rows.map(r => ({
      ...r,
      toucheDuCritique: CRITIQUES.includes(r.sourceCriticite ?? '') || CRITIQUES.includes(r.destinationCriticite ?? ''),
      urlSource: r.sourceId ? urlPublique(`/applications/${r.sourceId}`) : null,
      urlDestination: r.destinationId ? urlPublique(`/applications/${r.destinationId}`) : null,
      urlAbsolue: urlPublique(`/flux-applicatifs/${r.id}`),
    }))

    const filtres = query.critiques === 'true' ? resultats.filter(r => r.toucheDuCritique) : resultats

    return {
      total: filtres.length,
      lisible: true,
      tri: 'nom du flux',
      comptes: {
        touchantDuCritique: resultats.filter(r => r.toucheDuCritique).length,
        // La catégorie de données est un texte libre : on ne l'interprète pas, on compte
        // seulement ceux qui n'en portent aucune — un flux dont on ignore ce qu'il transporte
        // ne peut être ni qualifié ni protégé.
        sansNatureDeDonnees: resultats.filter(r => !r.donnees?.trim()).length,
        sansSource: resultats.filter(r => !r.sourceNom).length,
        sansDestination: resultats.filter(r => !r.destinationNom).length,
      },
      avertissements: [
        'Un flux dont la source ou la destination est vide désigne une application hors du catalogue, ou un lien mal saisi.',
        'La nature des données transportées est un texte LIBRE : ne pas en déduire une qualification RGPD sans lire le contenu.',
      ],
      resultats: filtres,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ critiques: t.Optional(t.String()) }),
    detail: {
      summary: 'Flux applicatifs : qui échange quoi avec qui, et la criticité des deux bouts.',
      description: 'Chaque flux porte son protocole, son port, sa fréquence, le sens et la NATURE DES DONNÉES '
        + 'transportées (texte libre). La criticité et l\'exposition de la source et de la destination sont '
        + 'jointes : un flux entre deux applications vitales n\'a pas la même portée qu\'entre deux applications '
        + 'd\'appoint. `critiques=true` ne garde que les flux touchant au moins une application critique.',
    },
  })

  /**
   * POSTE DE TRAVAIL PAR POPULATION — ce qui est réellement installé, et chez qui.
   */
  .get('/api/postes/par-population', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    if (!cats.has('postes')) {
      return { total: 0, lisible: false, tri: 'nom', resultats: [], populations: [] }
    }

    const logiciels = await db.select().from(logicielPoste).orderBy(asc(logicielPoste.nom))
    const liens = await db.select({
      logicielPosteId: logicielPostePopulation.logicielPosteId,
      populationId: logicielPostePopulation.populationId,
      populationNom: population.nom,
    })
      .from(logicielPostePopulation)
      .leftJoin(population, eq(population.id, logicielPostePopulation.populationId))

    const parLogiciel = new Map<string, string[]>()
    const parPopulation = new Map<string, { nom: string, logiciels: string[] }>()
    for (const l of liens) {
      const nomPop = l.populationNom ?? '(population inconnue)'
      parLogiciel.set(l.logicielPosteId, [...(parLogiciel.get(l.logicielPosteId) ?? []), nomPop])
      const acc = parPopulation.get(l.populationId) ?? { nom: nomPop, logiciels: [] }
      acc.logiciels.push(logiciels.find(x => x.id === l.logicielPosteId)?.nom ?? l.logicielPosteId)
      parPopulation.set(l.populationId, acc)
    }

    let resultats = logiciels.map(l => ({
      id: l.id, nom: l.nom, editeur: l.editeur, version: l.version,
      categorie: l.categorie, typeLicence: l.typeLicence, installation: l.installation,
      statut: l.statut, url: l.url, description: l.description,
      populations: (parLogiciel.get(l.id) ?? []).sort(),
      // Un logiciel rattaché à aucune population est déployé « on ne sait chez qui » :
      // ni retirable proprement, ni recensable dans une revue de licences.
      sansPopulation: !(parLogiciel.get(l.id) ?? []).length,
      urlAbsolue: urlPublique(`/postes/${l.id}`),
    }))

    if (query.population) {
      const p = String(query.population).toLowerCase()
      resultats = resultats.filter(r => r.populations.some(x => x.toLowerCase().includes(p)))
    }
    if (query.categorie) resultats = resultats.filter(r => (r.categorie ?? '').toLowerCase() === String(query.categorie).toLowerCase())

    return {
      total: resultats.length,
      lisible: true,
      tri: 'nom du logiciel',
      comptes: {
        sansPopulation: resultats.filter(r => r.sansPopulation).length,
        sansVersion: resultats.filter(r => !r.version?.trim()).length,
      },
      // La lecture inverse : par population, ce qui est installé.
      populations: [...parPopulation.values()]
        .map(p => ({ population: p.nom, logiciels: [...new Set(p.logiciels)].sort(), total: new Set(p.logiciels).size }))
        .sort((a, b) => b.total - a.total),
      avertissements: [
        'Ce catalogue décrit ce qui est DÉCLARÉ comme déployé, pas ce que l\'inventaire constate sur les machines.',
        'Un logiciel sans version rattachée ne peut pas être confronté à une fin de support.',
      ],
      resultats,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ population: t.Optional(t.String()), categorie: t.Optional(t.String()) }),
    detail: {
      summary: 'Logiciels du poste de travail par population : qui a quoi, et quelle population a quoi.',
      description: 'Les deux sens de lecture sont rendus : `resultats` liste les logiciels avec leurs '
        + 'populations, `populations` liste chaque population avec ses logiciels. `sansPopulation` marque un '
        + 'logiciel déployé « on ne sait chez qui » — ni retirable proprement, ni recensable en revue de '
        + 'licences. ATTENTION : ce catalogue est DÉCLARATIF, il ne reflète pas ce que l\'inventaire constate.',
    },
  })

  /**
   * PRESTATAIRES — et surtout ce qui manque à leur dossier. Un prestataire critique au sens NIS
   * 2 sans DPA signé, sans clauses de sécurité ou sans date de revue est un risque de chaîne
   * d'approvisionnement documenté nulle part.
   */
  .get('/api/tiers/dossier', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    if (!cats.has('tiers')) {
      return { total: 0, lisible: false, tri: 'nom', resultats: [] }
    }

    const rows = await db.select().from(tiers).orderBy(asc(tiers.nom))
    const contacts = await db.select({
      tiersId: contact.tiersId, nom: contact.nom, email: contact.email,
      telephone: contact.telephone, fonction: contact.fonction, principal: contact.principal,
    }).from(contact)
    const parTiers = new Map<string, typeof contacts>()
    for (const c of contacts) {
      if (!c.tiersId) continue
      parTiers.set(c.tiersId, [...(parTiers.get(c.tiersId) ?? []), c])
    }

    const aujourdhui = new Date().toISOString().slice(0, 10)
    let resultats = rows.map((t2) => {
      const manques: string[] = []
      if (t2.critiqueNis2 && !t2.dpaSigne) manques.push('Prestataire critique NIS 2 sans DPA signé.')
      if (t2.critiqueNis2 && !t2.clausesSecurite) manques.push('Prestataire critique NIS 2 sans clauses de sécurité.')
      if (!t2.dateRevue) manques.push('Aucune date de revue : le dossier ne sera jamais rouvert.')
      if (t2.niveauAcces && !t2.notesSecurite?.trim()) manques.push('Un accès est déclaré sans aucune note de sécurité.')
      return {
        id: t2.id, nom: t2.nom, type: t2.type, activite: t2.activite,
        critiqueNis2: t2.critiqueNis2, niveauAcces: t2.niveauAcces,
        dpaSigne: t2.dpaSigne, clausesSecurite: t2.clausesSecurite,
        contratRef: t2.contratRef,
        contratFin: t2.contratFin ? String(t2.contratFin) : null,
        contratEchu: !!(t2.contratFin && String(t2.contratFin) < aujourdhui),
        dateRevue: t2.dateRevue ? String(t2.dateRevue) : null,
        revueEchue: !!(t2.dateRevue && String(t2.dateRevue) < aujourdhui),
        notesSecurite: t2.notesSecurite,
        contacts: parTiers.get(t2.id) ?? [],
        manques,
        urlAbsolue: urlPublique(`/tiers/${t2.id}`),
      }
    })

    if (query.critiques === 'true') resultats = resultats.filter(r => r.critiqueNis2)
    if (query.incomplets === 'true') resultats = resultats.filter(r => r.manques.length > 0)

    return {
      total: resultats.length,
      lisible: true,
      tri: 'nom du prestataire',
      comptes: {
        critiquesNis2: resultats.filter(r => r.critiqueNis2).length,
        // Le croisement qui compte pour la chaîne d'approvisionnement.
        critiquesSansDpa: resultats.filter(r => r.critiqueNis2 && !r.dpaSigne).length,
        contratsEchus: resultats.filter(r => r.contratEchu).length,
        revuesEchues: resultats.filter(r => r.revueEchue).length,
        sansContact: resultats.filter(r => !r.contacts.length).length,
      },
      avertissements: [
        'Un prestataire sans contact déclaré ne peut pas être joint en cas d\'incident : c\'est une lacune opérationnelle, pas administrative.',
      ],
      resultats,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ critiques: t.Optional(t.String()), incomplets: t.Optional(t.String()) }),
    detail: {
      summary: 'Prestataires : criticité NIS 2, DPA, clauses de sécurité, contrats, contacts et lacunes.',
      description: '`comptes.critiquesSansDpa` est le chiffre de la chaîne d\'approvisionnement : un '
        + 'prestataire critique au sens NIS 2 sans accord de traitement signé. Chaque ligne porte un champ '
        + '`manques` qui énumère ce qui n\'est pas au dossier. `incomplets=true` ne garde que les dossiers '
        + 'incomplets.',
    },
  })
