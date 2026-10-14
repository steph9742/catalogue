import { Elysia, t } from 'elysia'
import { type PgColumn } from 'drizzle-orm/pg-core'
import { asc, ilike, or, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  actifInformationnel,
  actifSmsi,
  appareilMobile,
  application,
  composante,
  equipementReseau,
  exigenceNis2,
  iot,
  lieu,
  logicielPoste,
  machineIndus,
  mesureSmsi,
  partiePrenante,
  personne,
  posteTravail,
  processusMetier,
  risqueSmsi,
  serveur,
  sourceRisque,
  technologie,
  tiers,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { readableCategories, accesDe } from '../utils/access'
import { urlPublique } from '../utils/urlPublique'

// Recherche globale — alimente la palette (Cmd+K) ET le champ de recherche visible.

type Cible = {
  cat: string // catégorie RBAC
  type: string // libellé affiché du type
  icon: string
  base: string // préfixe d'URL de la fiche
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any
  id: PgColumn
  libelle: PgColumn
  // Colonnes supplémentaires interrogées (email, hostname…).
  extra?: PgColumn[]
}

const CIBLES: Cible[] = [
  { cat: 'applications', type: 'Application', icon: 'lucide:app-window', base: '/applications', table: application, id: application.id, libelle: application.nom },
  { cat: 'serveurs', type: 'Serveur', icon: 'lucide:server', base: '/serveurs', table: serveur, id: serveur.id, libelle: serveur.hostname, extra: [serveur.ip] },
  { cat: 'postes-travail', type: 'Poste', icon: 'lucide:monitor', base: '/postes-travail', table: posteTravail, id: posteTravail.id, libelle: posteTravail.nom },
  { cat: 'appareils-mobiles', type: 'Appareil mobile', icon: 'lucide:tablet-smartphone', base: '/appareils-mobiles', table: appareilMobile, id: appareilMobile.id, libelle: appareilMobile.nom },
  { cat: 'iot', type: 'IoT', icon: 'lucide:cctv', base: '/iot', table: iot, id: iot.id, libelle: iot.nom },
  { cat: 'machines-indus', type: 'Machine indus.', icon: 'lucide:factory', base: '/machines-indus', table: machineIndus, id: machineIndus.id, libelle: machineIndus.nom },
  { cat: 'equipements-reseau', type: 'Équipement réseau', icon: 'lucide:router', base: '/equipements-reseau', table: equipementReseau, id: equipementReseau.id, libelle: equipementReseau.nom },
  { cat: 'lieux', type: 'Lieu', icon: 'lucide:map-pin', base: '/lieux', table: lieu, id: lieu.id, libelle: lieu.nom },
  { cat: 'composantes', type: 'Composante', icon: 'lucide:building', base: '/composantes', table: composante, id: composante.id, libelle: composante.nom, extra: [composante.sigle] },
  { cat: 'personnes', type: 'Personne', icon: 'lucide:user-round', base: '/personnes', table: personne, id: personne.id, libelle: personne.nom, extra: [personne.prenom, personne.email] },
  { cat: 'tiers', type: 'Prestataire', icon: 'lucide:building-2', base: '/tiers', table: tiers, id: tiers.id, libelle: tiers.nom },
  { cat: 'technologies', type: 'Technologie', icon: 'lucide:cpu', base: '/technologies', table: technologie, id: technologie.id, libelle: technologie.nom },
  { cat: 'postes', type: 'Logiciel poste', icon: 'lucide:monitor-smartphone', base: '/postes', table: logicielPoste, id: logicielPoste.id, libelle: logicielPoste.nom },
  { cat: 'actifs-informationnels', type: 'Actif informationnel', icon: 'lucide:database', base: '/actifs-informationnels', table: actifInformationnel, id: actifInformationnel.id, libelle: actifInformationnel.nom },
  { cat: 'processus', type: 'Processus', icon: 'lucide:workflow', base: '/processus', table: processusMetier, id: processusMetier.id, libelle: processusMetier.nom },
  { cat: 'actifs-smsi', type: 'Actif SMSI', icon: 'lucide:shield-check', base: '/actifs-smsi', table: actifSmsi, id: actifSmsi.id, libelle: actifSmsi.nom },
  { cat: 'risques-smsi', type: 'Risque', icon: 'lucide:triangle-alert', base: '/risques-smsi', table: risqueSmsi, id: risqueSmsi.id, libelle: risqueSmsi.nom },
  { cat: 'mesures-smsi', type: 'Mesure (SoA)', icon: 'lucide:list-checks', base: '/mesures-smsi', table: mesureSmsi, id: mesureSmsi.id, libelle: mesureSmsi.intitule, extra: [mesureSmsi.reference] },
  { cat: 'exigences-nis2', type: 'Exigence NIS 2', icon: 'lucide:clipboard-check', base: '/exigences-nis2', table: exigenceNis2, id: exigenceNis2.id, libelle: exigenceNis2.intitule, extra: [exigenceNis2.reference] },
  { cat: 'sources-risque', type: 'Source de risque', icon: 'lucide:crosshair', base: '/sources-risque', table: sourceRisque, id: sourceRisque.id, libelle: sourceRisque.nom },
  { cat: 'parties-prenantes', type: 'Partie prenante', icon: 'lucide:share-2', base: '/parties-prenantes', table: partiePrenante, id: partiePrenante.id, libelle: partiePrenante.nom },
]

export type ResultatRecherche = {
  id: string
  libelle: string
  type: string
  icon: string
  url: string
  // URL ABSOLUE. Un appelant servi sur un autre domaine ne peut pas reconstruire l'origine de
  // façon fiable, et se retrouverait à citer une référence sur laquelle personne ne peut
  // cliquer.
  urlAbsolue: string
  cat: string
  // FRAÎCHEUR de la fiche. Sans elle, une donnée de six mois s'affiche avec le même aplomb
  // qu'une donnée du matin — et un appelant qui cite sans dater trompe sans mentir.
  majLe: string | null
}

export const rechercheRouter = new Elysia({ name: 'recherche' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Pilotage'] } })
  .get('/api/recherche', async (ctx) => {
    const { query } = ctx
    const terme = (query.q ?? '').trim()
    if (terme.length < 2) return { total: 0, terme, tri: 'préfixe d\'abord, puis libellé', resultats: [] as ResultatRecherche[] }

    // Utilisateur OU compte de service : voir `accesDe`.
    const user = accesDe(ctx)
    const cats = await readableCategories(user)
    const motif = `%${terme}%`
    const parType = Math.min(6, Math.max(1, Number(query.parType) || 5))

    const cibles = CIBLES.filter(c => cats.has(c.cat))
    const lots = await Promise.all(cibles.map(async (c) => {
      const colonnes = [c.libelle, ...(c.extra ?? [])]
      const rows = await db
        .select({ id: c.id, libelle: c.libelle, majLe: sql<string | null>`cast(${c.table}."updated_at" as text)` })
        .from(c.table)
        .where(or(...colonnes.map(col => ilike(sql`cast(${col} as text)`, motif))))
        .orderBy(asc(c.libelle))
        .limit(parType)
      return rows.map(r => ({
        id: String(r.id),
        libelle: String(r.libelle ?? r.id),
        type: c.type,
        icon: c.icon,
        cat: c.cat,
        url: `${c.base}/${r.id}`,
        urlAbsolue: urlPublique(`${c.base}/${r.id}`),
        majLe: r.majLe ?? null,
      }))
    }))

    // Les correspondances qui COMMENCENT par le terme sont les plus pertinentes.
    const bas = terme.toLowerCase()
    const resultats = lots.flat().sort((a, b) => {
      const pa = a.libelle.toLowerCase().startsWith(bas) ? 0 : 1
      const pb = b.libelle.toLowerCase().startsWith(bas) ? 0 : 1
      return pa !== pb ? pa - pb : a.libelle.localeCompare(b.libelle)
    })
    // Le total est celui des correspondances TROUVÉES, et la troncature est annoncée.
    return {
      total: resultats.length,
      tronque: resultats.length > 40,
      exhaustif: false,
      tri: 'correspondances par préfixe d\'abord, puis libellé alphabétique',
      terme,
      resultats: resultats.slice(0, 40),
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    query: t.Object({ q: t.Optional(t.String()), parType: t.Optional(t.String()) }),
    detail: {
      summary: 'Trouve une entité par son nom, dans les catégories que l\'appelant a le droit de lire.',
      description: 'Recherche par LIBELLÉ uniquement, au plus `parType` résultats par type d\'entité : '
        + 'utile pour retrouver une fiche, jamais pour compter. `total` est le nombre de correspondances '
        + 'trouvées, et `exhaustif` vaut toujours false. Pour une question d\'état (ce qui expire, ce qui '
        + 'manque, ce qui a changé), utiliser le point d\'entrée dédié.',
    },
  })
