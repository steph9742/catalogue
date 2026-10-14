import { Elysia, t } from 'elysia'
import { sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { competence, competenceDomaine, personneCompetence } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'

// COMPÉTENCES — « avons-nous les compétences pour traiter un ransomware ?

/**
 * sans_detenteur : aucune personne n'est rattachée. Trou total.
 */
const ETATS_COMPETENCE = ['sans_detenteur', 'non_evaluee', 'sous_niveau', 'couverte', 'sans_exigence'] as const
export type EtatCompetence = typeof ETATS_COMPETENCE[number]
export { ETATS_COMPETENCE }

// L'ORDRE DES NIVEAUX VIENT DE L'ÉNUMÉRATION ELLE-MÊME. `enum_range` rend les valeurs dans leur
// ordre de déclaration, et `array_position` en donne le rang.
const rang = (col: string) => sql.raw(`array_position(enum_range(null::competence_niveau), ${col})`)

export const competencesResumeRouter = new Elysia({ name: 'competences-resume', prefix: '/api/competences' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/resume', async ({ query, status }) => {
    const domaines = competenceDomaine.enumValues as readonly string[]
    if (query.domaine !== undefined && !domaines.includes(query.domaine)) {
      return status(422, `domaine inconnu : « ${query.domaine} ». Valeurs : ${domaines.join(', ')}.`)
    }
    const filtre = query.domaine
      ? sql`where c.domaine = ${query.domaine}`
      : sql``

    // Une ligne par compétence du RÉFÉRENTIEL — y compris celles que personne ne détient.
    const reponse = await db.execute<{
      id: string
      nom: string
      domaine: string | null
      niveau_requis: string | null
      detenteurs: number
      evalues: number
      au_niveau: number
      etat: EtatCompetence
    }>(sql`
      select
        c.id, c.nom, c.domaine, c.niveau_requis,
        count(pc.id)::int as detenteurs,
        count(pc.niveau)::int as evalues,
        count(*) filter (
          where pc.niveau is not null and c.niveau_requis is not null
            and ${rang('pc.niveau')} >= ${rang('c.niveau_requis')}
        )::int as au_niveau,
        case
          when c.niveau_requis is null then 'sans_exigence'
          when count(pc.id) = 0 then 'sans_detenteur'
          when count(pc.niveau) = 0 then 'non_evaluee'
          when count(*) filter (
            where pc.niveau is not null and ${rang('pc.niveau')} >= ${rang('c.niveau_requis')}
          ) = 0 then 'sous_niveau'
          else 'couverte'
        end as etat
      from ${competence} c
      left join ${personneCompetence} pc on pc.competence_id = c.id
      ${filtre}
      group by c.id, c.nom, c.domaine, c.niveau_requis
      order by c.domaine nulls last, c.nom
    `)

    // `db.execute` rend une enveloppe de pilote (`QueryResult`) et non un tableau : selon le
    // pilote, les lignes sont dans `.rows` ou directement itérables.
    const lignes = (Array.isArray(reponse) ? reponse : reponse.rows) as Array<{
      id: string
      nom: string
      domaine: string | null
      niveau_requis: string | null
      detenteurs: number
      evalues: number
      au_niveau: number
      etat: EtatCompetence
    }>

    const par = (e: EtatCompetence) => lignes.filter(l => l.etat === e).length
    const jugeables = lignes.filter(l => l.etat !== 'sans_exigence').length

    return {
      total: lignes.length,
      // Le dénominateur EXCLUT `sans_exigence` : sans barre déclarée, ni couverture ni
      // manque ne se constatent, et les inclure ferait bouger un taux sans rien mesurer.
      jugeables,
      etats: {
        couverte: par('couverte'),
        sousNiveau: par('sous_niveau'),
        nonEvaluee: par('non_evaluee'),
        sansDetenteur: par('sans_detenteur'),
        sansExigence: par('sans_exigence'),
      },
      // RISQUE DE CONTINUITÉ, demandé par l'ISO 27001 comme par EBIOS : une compétence
      // tenue par une seule personne au niveau requis s'éteint avec son départ.
      detenteurUnique: lignes.filter(l => l.etat === 'couverte' && l.au_niveau === 1)
        .map(l => ({ id: l.id, nom: l.nom, domaine: l.domaine })),
      avertissement: par('non_evaluee') || par('sans_exigence')
        ? [
            par('non_evaluee')
              ? `${par('non_evaluee')} compétence(s) rattachées à quelqu'un dont le niveau n'a jamais été évalué : `
                + 'elles ne sont comptées ni parmi les couvertes ni parmi les insuffisantes. Elles appellent une '
                + 'évaluation, pas une formation.'
              : '',
            par('sans_exigence')
              ? `${par('sans_exigence')} compétence(s) sans niveau requis déclaré : leur suffisance n'est pas `
                + 'jugeable, et elles sont hors du dénominateur.'
              : '',
          ].filter(Boolean).join(' ')
        : null,
      resultats: lignes.map(l => ({
        id: l.id, nom: l.nom, domaine: l.domaine,
        niveauRequis: l.niveau_requis,
        detenteurs: l.detenteurs,
        evalues: l.evalues,
        auNiveauRequis: l.au_niveau,
        etat: l.etat,
      })),
    }
  }, {
    can: { category: 'competences', level: 'read' },
    query: t.Object({ domaine: t.Optional(t.String()) }),
    detail: {
      summary: 'Compétences : ce qui est couvert, ce qui manque, et ce que personne n\'a évalué.',
      description: 'Part du RÉFÉRENTIEL et non des personnes : une compétence que personne ne détient y '
        + 'figure, là où /api/matrice-competences ne pouvait pas la montrer. `etat` prend les valeurs '
        + 'publiées dans /api/lectures sous `competence.etat`. `non_evaluee` n\'est PAS `sous_niveau` : la '
        + 'première appelle une évaluation, la seconde une formation — ni le même acte ni le même budget, et '
        + 'un taux qui les agrège est faux. `sans_exigence` est hors du dénominateur `jugeables` : sans '
        + 'niveau requis déclaré, ni couverture ni manque ne se constatent. `?domaine=` filtre sur un '
        + 'vocabulaire fermé ; une valeur hors liste est refusée en 422.',
    },
  })
