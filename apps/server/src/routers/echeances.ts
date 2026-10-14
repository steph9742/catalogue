import { Elysia, t } from 'elysia'
import { betterAuth } from '../middleware/auth'
import { accesDe, eventCategory, readableCategories } from '../utils/access'
import { computeAlerts } from './alerts'
import { urlPublique } from '../utils/urlPublique'
import { CATEGORIES } from '../utils/categories'

// ÉCHÉANCES — la même matière que `/api/alerts`, mise en forme pour être citée.

const LIBELLE_TYPE: Record<string, string> = {
  vpn_expiration: 'Accès VPN',
  techno_eol: 'Fin de vie de technologie',
  contrat_fin: 'Fin de contrat',
  app_fin_support: 'Fin de support applicatif',
  homologation_revue: 'Revue d\'homologation',
  aipd_revue: 'Réexamen d\'analyse d\'impact (RGPD art. 35.11)',
  tiers_revue: 'Revue de prestataire',
  whitelist_revue: 'Revue de liste blanche',
  certificat_expiration: 'Expiration de certificat TLS',
  certificat_invalide: 'Certificat TLS non validé',
}

export const echeancesRouter = new Elysia({ name: 'echeances', prefix: '/api/echeances' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/', async (ctx) => {
    const { query } = ctx
    const cats = await readableCategories(accesDe(ctx))
    const toutes = await computeAlerts()

    const aujourdhui = new Date().toISOString().slice(0, 10)
    const jours = (d: string | null) => (d ? Math.round((new Date(d).getTime() - Date.now()) / 864e5) : null)

    // Filtrage par droits : une échéance sur une catégorie que l'appelant ne peut pas lire
    // ne doit pas fuiter par le moteur d'alertes.
    const libelleCategorie = new Map<string, string>(CATEGORIES.map(c => [c.key as string, c.label]))
    const lisibles = toutes.filter((a) => {
      const cat = eventCategory(a.type) ?? a.entite
      return !cat || cats.has(cat) || cats.has(a.entite)
    })

    const enrichies = lisibles.map((a) => {
      const cat = eventCategory(a.type) ?? a.entite
      return {
        type: a.type,
        libelleType: LIBELLE_TYPE[a.type] ?? a.type,
        categorie: cat,
        libelleCategorie: libelleCategorie.get(cat ?? '') ?? cat,
        gravite: a.severity,
        message: a.message,
        entite: a.entite,
        entiteId: a.entiteId,
        echeance: a.dueDate,
        // Négatif = dépassé. `null` quand l'alerte décrit un ÉTAT et non une échéance.
        joursRestants: jours(a.dueDate),
        depassee: !!(a.dueDate && a.dueDate < aujourdhui),
        // Une alerte sans date n'est pas une échéance : c'est un état à corriger, qui ne
        // se périme pas et ne se planifie pas.
        estUnEtat: a.dueDate === null,
        urlAbsolue: urlPublique(`/${a.entite}/${a.entiteId}`),
      }
    })

    let resultats = enrichies
    if (query.categorie) resultats = resultats.filter(r => r.categorie === query.categorie)
    if (query.type) resultats = resultats.filter(r => r.type === query.type)
    if (query.depassees === 'true') resultats = resultats.filter(r => r.depassee)
    if (query.jours) {
      const n = Number(query.jours)
      if (Number.isFinite(n)) resultats = resultats.filter(r => r.joursRestants !== null && r.joursRestants <= n)
    }

    const grouper = (cle: 'categorie' | 'type') => {
      const m = new Map<string, number>()
      for (const r of resultats) m.set(String(r[cle] ?? '(sans)'), (m.get(String(r[cle] ?? '(sans)')) ?? 0) + 1)
      return [...m.entries()].map(([k, n]) => ({ [cle]: k, total: n })).sort((a, b) => b.total - a.total)
    }

    return {
      total: resultats.length,
      tri: 'échéance croissante — les états sans date en fin de liste',
      comptes: {
        depassees: resultats.filter(r => r.depassee).length,
        sousUnMois: resultats.filter(r => r.joursRestants !== null && r.joursRestants >= 0 && r.joursRestants <= 30).length,
        etatsSansEcheance: resultats.filter(r => r.estUnEtat).length,
        critiques: resultats.filter(r => r.gravite === 'critical').length,
      },
      parCategorie: grouper('categorie'),
      parType: grouper('type'),
      avertissements: [
        'Les échéances portant sur une catégorie hors de la portée de l\'appelant sont RETIRÉES : ce total '
        + 'n\'est pas nécessairement le total de l\'établissement.',
        'Une entrée avec `estUnEtat: true` n\'a pas d\'échéance — c\'est un état à corriger, pas un compte à '
        + 'rebours. Ne jamais lui inventer de date.',
      ],
      resultats: resultats.sort((a, b) => {
        if (a.echeance && b.echeance) return a.echeance.localeCompare(b.echeance)
        if (a.echeance) return -1
        if (b.echeance) return 1
        return a.type.localeCompare(b.type)
      }),
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({
      categorie: t.Optional(t.String()),
      type: t.Optional(t.String()),
      depassees: t.Optional(t.String()),
      jours: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Toutes les échéances avec leur catégorie, leurs jours restants et leur gravité.',
      description: 'Même matière que `/api/alerts`, mise en forme pour être citée : total compté côté '
        + 'serveur, regroupement `parCategorie` et `parType`, `joursRestants` (négatif = dépassé). Couvre '
        + 'VPN, fins de vie, contrats, fins de support, revues d\'homologation, réexamens d\'AIPD, revues de '
        + 'prestataires, revues de listes blanches et certificats TLS. `estUnEtat: true` marque une alerte '
        + 'SANS date (chaîne de certificat invalide, par exemple) : un état à corriger, jamais un compte à '
        + 'rebours. Filtres : `categorie`, `type`, `depassees=true`, `jours=N`.',
    },
  })
