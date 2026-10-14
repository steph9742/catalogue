import { Elysia, t } from 'elysia'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { actifDependance, actifSmsi, personne } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { accesDe, readableCategories } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'

// CHAÎNE D'IMPACT — « si ceci tombe, qu'est-ce qui s'arrête ? » La question qu'on pose en
// cellule de crise, et à laquelle aucune autre source ne répond.

const PROFONDEUR_MAX = 6

type Noeud = {
  id: string
  nom: string
  categorie: string | null
  perimetreSmsi: boolean | null
  proprietaire: string | null
  profondeur: number
  // Le chemin qui mène de l'actif interrogé à celui-ci. Sans lui, un impact à trois sauts
  // est une affirmation qu'on ne peut ni vérifier ni expliquer.
  chemin: string[]
  url: string
  urlAbsolue: string
}

export const impactRouter = new Elysia({ name: 'impact', prefix: '/api/impact' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/:id', async (ctx) => {
    const { params, query, status } = ctx
    const cats = await readableCategories(accesDe(ctx))
    if (!cats.has('actifs-smsi')) return status(403, { message: 'Catégorie « actifs-smsi » hors de la portée de l\'appelant.' })

    const [racine] = await db.select().from(actifSmsi).where(eq(actifSmsi.id, params.id)).limit(1)
    if (!racine) return status(404, { message: 'Actif inconnu.' })

    const sens = query.sens === 'amont' ? 'amont' : 'aval'
    const profondeurMax = Math.min(PROFONDEUR_MAX, Math.max(1, Number(query.profondeur) || PROFONDEUR_MAX))

    const liens = await db.select().from(actifDependance)
    // `actifId` dépend de `supportId`. Donc : l'AVAL de X (ce qui tombe si X tombe) se lit
    // en remontant les liens dont X est le support.
    const suivants = new Map<string, string[]>()
    for (const l of liens) {
      const de = sens === 'aval' ? l.supportId : l.actifId
      const vers = sens === 'aval' ? l.actifId : l.supportId
      if (!de || !vers) continue
      suivants.set(de, [...(suivants.get(de) ?? []), vers])
    }

    // Parcours en largeur. `vus` empêche une boucle de dépendance de faire tourner le parcours
    // indéfiniment — et le fait qu'une boucle EXISTE est une information : elle est rapportée
    // plutôt qu'absorbée en silence.
    const vus = new Set<string>([racine.id])
    const chemins = new Map<string, string[]>([[racine.id, []]])
    const boucles: string[] = []
    let frontiere = [racine.id]
    const parProfondeur: { id: string, profondeur: number }[] = []
    let tronque = false

    for (let d = 1; d <= profondeurMax && frontiere.length; d++) {
      const suivante: string[] = []
      for (const courant of frontiere) {
        for (const voisin of suivants.get(courant) ?? []) {
          if (voisin === racine.id) { boucles.push(courant); continue }
          if (vus.has(voisin)) continue
          vus.add(voisin)
          chemins.set(voisin, [...(chemins.get(courant) ?? []), courant])
          parProfondeur.push({ id: voisin, profondeur: d })
          suivante.push(voisin)
        }
      }
      frontiere = suivante
      if (d === profondeurMax && frontiere.length) tronque = true
    }

    const ids = parProfondeur.map(x => x.id)
    const fiches = ids.length
      ? await db.select({
        id: actifSmsi.id, nom: actifSmsi.nom, categorie: actifSmsi.categorie,
        perimetreSmsi: actifSmsi.perimetreSmsi, proprietaire: personne.nom,
      })
        .from(actifSmsi)
        .leftJoin(personne, eq(personne.id, actifSmsi.proprietaireId))
        .where(inArray(actifSmsi.id, ids))
        .orderBy(asc(actifSmsi.nom))
      : []
    const parId = new Map(fiches.map(f => [f.id, f]))
    const nomDe = new Map([...fiches.map(f => [f.id, f.nom] as const), [racine.id, racine.nom] as const])

    const resultats: Noeud[] = parProfondeur.map(({ id, profondeur }) => {
      const f = parId.get(id)
      return {
        id,
        nom: f?.nom ?? id,
        categorie: f?.categorie ?? null,
        perimetreSmsi: f?.perimetreSmsi ?? null,
        proprietaire: f?.proprietaire ?? null,
        profondeur,
        chemin: (chemins.get(id) ?? []).map(x => nomDe.get(x) ?? x),
        url: `/actifs-smsi/${id}`,
        urlAbsolue: urlPublique(`/actifs-smsi/${id}`),
      }
    }).sort((a, b) => a.profondeur - b.profondeur || a.nom.localeCompare(b.nom))

    return {
      actif: { id: racine.id, nom: racine.nom, urlAbsolue: urlPublique(`/actifs-smsi/${racine.id}`) },
      sens,
      total: resultats.length,
      profondeurMax,
      tri: 'profondeur croissante, puis nom',
      // Une chaîne coupée au plafond n'est PAS une chaîne complète. Le dire.
      tronque,
      boucles: [...new Set(boucles)].map(x => nomDe.get(x) ?? x),
      // Une dépendance non SAISIE est invisible ici, et c'est la limite majeure : ce
      // graphe ne décrit que ce que quelqu'un a pris la peine de déclarer.
      avertissement: 'Ce graphe ne contient que les dépendances DÉCLARÉES. Un actif sans dépendance saisie '
        + 'apparaît comme sans impact, ce qui n\'est pas la même chose que « vérifié sans impact ».',
      resultats,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    params: t.Object({ id: t.String() }),
    query: t.Object({ sens: t.Optional(t.String()), profondeur: t.Optional(t.String()) }),
    detail: {
      summary: 'Chaîne d\'impact d\'un actif : ce qui tombe s\'il tombe (aval), ou ce qui peut le faire tomber (amont).',
      description: '`sens=aval` (défaut) répond à « si cet actif tombe, qu\'est-ce qui s\'arrête ? » ; '
        + '`sens=amont` à « qu\'est-ce qui peut le faire tomber ? ». Chaque résultat porte son `chemin`, la '
        + 'suite d\'actifs qui mène jusqu\'à lui — un impact à trois sauts sans son chemin est une '
        + 'affirmation invérifiable. `tronque: true` signale une chaîne coupée au plafond de profondeur. '
        + 'LIMITE MAJEURE : seules les dépendances saisies existent ici.',
    },
  })
