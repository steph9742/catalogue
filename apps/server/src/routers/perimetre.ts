import { Elysia, t } from 'elysia'
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  actifInformationnel,
  appareilMobile,
  composante,
  departement,
  entite,
  equipementReseau,
  glpiMachine,
  iot,
  lieu,
  machineIndus,
  posteTravail,
  service,
  serveur,
} from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { readableCategories, accesDe } from '../utils/access'
import { osHorsSupport } from './eol'
import { cleTechnologie } from '../utils/eolApi'

// PÉRIMÈTRE — lecture TRANSVERSE du SI, générique. La navigation ordinaire est verticale (par
// type d'objet : serveurs, postes…).

export type TypePerimetre = 'composante' | 'service' | 'departement' | 'lieu'

const LIMITE = 50 // échantillon d'éléments listés par bloc

// Colonne de rattachement de chaque table d'actifs, selon l'axe demandé.
const COLONNES = {
  composante: {
    serveur: serveur.composanteId, posteTravail: posteTravail.composanteId, appareilMobile: appareilMobile.composanteId,
    iot: iot.composanteId, machineIndus: machineIndus.composanteId, equipementReseau: equipementReseau.composanteId,
    actifInformationnel: actifInformationnel.composanteId,
  },
  service: {
    serveur: serveur.serviceId, posteTravail: posteTravail.serviceId, appareilMobile: appareilMobile.serviceId,
    iot: iot.serviceId, machineIndus: machineIndus.serviceId, equipementReseau: equipementReseau.serviceId,
    actifInformationnel: actifInformationnel.serviceId,
  },
  departement: {
    serveur: serveur.departementId, posteTravail: posteTravail.departementId, appareilMobile: appareilMobile.departementId,
    iot: iot.departementId, machineIndus: machineIndus.departementId, equipementReseau: equipementReseau.departementId,
    actifInformationnel: actifInformationnel.departementId,
  },
  lieu: {
    serveur: serveur.lieuId, posteTravail: posteTravail.lieuId, appareilMobile: appareilMobile.lieuId,
    iot: iot.lieuId, machineIndus: machineIndus.lieuId, equipementReseau: equipementReseau.lieuId,
    actifInformationnel: null, // un actif informationnel n'a pas d'emplacement physique
  },
} as const

const BLOCS = [
  { cle: 'serveurs', cat: 'serveurs', label: 'Serveurs', icon: 'lucide:server', base: '/serveurs', table: serveur, id: serveur.id, nom: serveur.hostname, colonne: 'serveur' },
  { cle: 'postes-travail', cat: 'postes-travail', label: 'Postes de travail', icon: 'lucide:monitor', base: '/postes-travail', table: posteTravail, id: posteTravail.id, nom: posteTravail.nom, colonne: 'posteTravail' },
  { cle: 'appareils-mobiles', cat: 'appareils-mobiles', label: 'Appareils mobiles', icon: 'lucide:tablet-smartphone', base: '/appareils-mobiles', table: appareilMobile, id: appareilMobile.id, nom: appareilMobile.nom, colonne: 'appareilMobile' },
  { cle: 'iot', cat: 'iot', label: 'IoT & objets connectés', icon: 'lucide:cctv', base: '/iot', table: iot, id: iot.id, nom: iot.nom, colonne: 'iot' },
  { cle: 'machines-indus', cat: 'machines-indus', label: 'Machines industrielles', icon: 'lucide:factory', base: '/machines-indus', table: machineIndus, id: machineIndus.id, nom: machineIndus.nom, colonne: 'machineIndus' },
  { cle: 'equipements-reseau', cat: 'equipements-reseau', label: 'Équipements réseau', icon: 'lucide:router', base: '/equipements-reseau', table: equipementReseau, id: equipementReseau.id, nom: equipementReseau.nom, colonne: 'equipementReseau' },
  { cle: 'actifs-informationnels', cat: 'actifs-informationnels', label: 'Actifs informationnels', icon: 'lucide:database', base: '/actifs-informationnels', table: actifInformationnel, id: actifInformationnel.id, nom: actifInformationnel.nom, colonne: 'actifInformationnel' },
] as const

// Descendants d'un lieu, lui compris (l'arbre peut avoir n niveaux : site > bâtiment >
// salle > baie). Sans ça, le périmètre d'un bâtiment serait vide.
async function lieuxDuSousArbre(racineId: string): Promise<string[]> {
  const rows = await db.execute(sql`
    with recursive sous_arbre as (
      select id from ${lieu} where id = ${racineId}
      union all
      select l.id from ${lieu} l join sous_arbre s on l.parent_id = s.id
    )
    select id from sous_arbre
  `)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lignes = (rows as any).rows ?? rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (lignes as any[]).map(r => String(r.id))
}

// Identité de la cible + un sous-titre situant le périmètre dans sa hiérarchie.
async function chargerCible(type: TypePerimetre, id: string) {
  if (type === 'composante') {
    const [r] = await db.select({ id: composante.id, nom: composante.nom, sousTitre: entite.nom, sigle: composante.sigle })
      .from(composante).leftJoin(entite, eq(entite.id, composante.entiteId)).where(eq(composante.id, id)).limit(1)
    return r
  }
  if (type === 'service') {
    const [r] = await db.select({ id: service.id, nom: service.nom, sousTitre: composante.nom, sigle: sql<string | null>`null` })
      .from(service).leftJoin(composante, eq(composante.id, service.composanteId)).where(eq(service.id, id)).limit(1)
    return r
  }
  if (type === 'departement') {
    const [r] = await db.select({ id: departement.id, nom: departement.nom, sousTitre: composante.nom, sigle: sql<string | null>`null` })
      .from(departement).leftJoin(composante, eq(composante.id, departement.composanteId)).where(eq(departement.id, id)).limit(1)
    return r
  }
  const [r] = await db.select({ id: lieu.id, nom: lieu.nom, sousTitre: lieu.cheminGlpi, sigle: sql<string | null>`null` })
    .from(lieu).where(eq(lieu.id, id)).limit(1)
  return r
}

export const perimetreRouter = new Elysia({ name: 'perimetre' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Pilotage'] } })
  .get('/api/perimetre/:type/:id', async ({ params, status, ...ctx }) => {
    const type = params.type as TypePerimetre
    if (!['composante', 'service', 'departement', 'lieu'].includes(type)) {
      return status(422, { message: 'Type de périmètre inconnu.' })
    }
    const cible = await chargerCible(type, params.id)
    if (!cible) return status(404, { message: 'Périmètre introuvable.' })

    // Utilisateur OU compte de service : voir `accesDe`.
    const user = accesDe(ctx)
    const cats = await readableCategories(user)

    // Pour un lieu, on filtre sur TOUT le sous-arbre ; sinon sur l'identifiant seul.
    const sousArbre = type === 'lieu' ? await lieuxDuSousArbre(params.id) : null
    const filtre = (col: never) => (sousArbre ? inArray(col, sousArbre as never[]) : eq(col, params.id))

    const blocs = []
    for (const b of BLOCS) {
      if (!cats.has(b.cat)) continue
      const colonne = COLONNES[type][b.colonne as keyof (typeof COLONNES)['composante']]
      if (!colonne) continue // axe sans rattachement pour ce type d'actif
      const compte: { n: number }[] = await db.select({ n: sql<number>`count(*)::int` }).from(b.table as never).where(filtre(colonne as never))
      const total = Number(compte[0]?.n ?? 0)
      const items = total
        ? await db.select({ id: b.id as never, nom: b.nom as never }).from(b.table as never)
            .where(filtre(colonne as never)).orderBy(asc(b.nom as never)).limit(LIMITE)
        : []
      blocs.push({ cle: b.cle, label: b.label, icon: b.icon, base: b.base, data: { total, items: items as { id: string, nom: string }[] } })
    }

    // Sous-lieux du périmètre (uniquement pour une composante ou un lieu).
    if ((type === 'composante' || type === 'lieu') && cats.has('lieux')) {
      const colonne = type === 'composante' ? lieu.composanteId : lieu.parentId
      const compte = await db.select({ n: sql<number>`count(*)::int` }).from(lieu).where(eq(colonne, params.id))
      const total = Number(compte[0]?.n ?? 0)
      const items = total
        ? await db.select({ id: lieu.id, nom: lieu.nom }).from(lieu).where(eq(colonne, params.id)).orderBy(asc(lieu.nom)).limit(LIMITE)
        : []
      blocs.push({
        cle: 'lieux',
        label: type === 'lieu' ? 'Emplacements contenus' : 'Lieux',
        icon: 'lucide:map-pin', base: '/lieux',
        data: { total, items },
      })
    }

    const total = blocs.reduce((s, b) => s + b.data.total, 0)

    // --- Posture du périmètre -----------------------------------------------------------
    // Fin de support : établie sur les DATES du référentiel OS (technologie.finDeVie), pas sur
    // des motifs codés en dur — sinon on rate des familles entières (ce fut le cas de Windows
    // 10, 1185 machines).
    const colServeur = COLONNES[type].serveur
    const colPoste = COLONNES[type].posteTravail
    const obsoletes = await osHorsSupport()
    const nomsObsoletes = obsoletes.map(o => o.nom)
    const dateDe = new Map(obsoletes.map(o => [o.nom, o.finDeVie]))

    let finDeSupport: { total: number, items: { id: string, nom: string, base: string, os: string | null, finDeVie: string | null }[] } = { total: 0, items: [] }
    if (nomsObsoletes.length) {
      // Rapprochement sur la CLÉ de référentiel et non sur le nom brut : « macOS » seul ne dit
      // pas si la machine est supportée — c'est sa version qui tranche.
      const aObsolete = new Set(nomsObsoletes)
      const [sv, pt] = await Promise.all([
        db.select({ id: serveur.id, nom: serveur.hostname, os: serveur.os, v: serveur.osVersion }).from(serveur)
          .where(and(filtre(colServeur as never), isNotNull(serveur.os))).orderBy(asc(serveur.hostname)),
        db.select({ id: posteTravail.id, nom: posteTravail.nom, os: posteTravail.os, v: posteTravail.osVersion }).from(posteTravail)
          .where(and(filtre(colPoste as never), isNotNull(posteTravail.os))).orderBy(asc(posteTravail.nom)),
      ])
      const items = [
        ...sv.map(m => ({ ...m, base: '/serveurs' })),
        ...pt.map(m => ({ ...m, base: '/postes-travail' })),
      ]
        .map(m => ({ ...m, cle: cleTechnologie(m.os, m.v) }))
        .filter(m => aObsolete.has(m.cle))
        .map(m => ({ id: m.id, nom: m.nom, base: m.base, os: m.os, finDeVie: dateDe.get(m.cle) ?? null }))
      finDeSupport = { total: items.length, items: items.slice(0, LIMITE) }
    }

    const [horsGlpi] = await db.select({ n: sql<number>`count(*)::int` }).from(serveur)
      .where(and(filtre(colServeur as never), eq(serveur.sourceGlpi, false)))

    let aClasser = 0
    if (type === 'composante') {
      const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(glpiMachine)
        .where(and(eq(glpiMachine.classement, 'a_classer'), sql`${glpiMachine.entite} ilike ${'%' + (cible.nom ?? '') + '%'}`))
      aClasser = Number(r?.n ?? 0)
    }

    return {
      type,
      cible: { ...cible, sousLieux: sousArbre ? sousArbre.length - 1 : 0 },
      blocs,
      total,
      limite: LIMITE,
      posture: {
        aClasser,
        obsoletes: finDeSupport.total,
        serveursHorsGlpi: Number(horsGlpi?.n ?? 0),
      },
      finDeSupport,
    }
  }, {
    auth: ['user', 'admin', 'svc'],
    params: t.Object({ type: t.String(), id: t.String() }),
  })

  // Index des quatre axes, avec volumétrie machines (serveurs + postes + mobiles + IoT).
  .get('/api/perimetres', async (ctx) => {
    // Utilisateur OU compte de service : voir `accesDe`.
    const user = accesDe(ctx)
    const cats = await readableCategories(user)

    // Machines HORS SUPPORT par périmètre, sur les quatre axes en une seule passe : on charge
    // (axes, os, version) des serveurs et postes, on calcule la clé de référentiel de chacun
    // (même fonction que partout ailleurs), et on incrémente chaque axe renseigné.
    const obsoletes = new Set((await osHorsSupport()).map(o => o.nom))
    const horsSupportPar: Record<string, Map<string, number>> = {
      composante: new Map(), service: new Map(), departement: new Map(), lieu: new Map(),
    }
    if (obsoletes.size) {
      const machines = [
        ...await db.select({ os: serveur.os, v: serveur.osVersion, composante: serveur.composanteId, service: serveur.serviceId, departement: serveur.departementId, lieu: serveur.lieuId })
          .from(serveur).where(isNotNull(serveur.os)),
        ...await db.select({ os: posteTravail.os, v: posteTravail.osVersion, composante: posteTravail.composanteId, service: posteTravail.serviceId, departement: posteTravail.departementId, lieu: posteTravail.lieuId })
          .from(posteTravail).where(isNotNull(posteTravail.os)),
      ]
      for (const m of machines) {
        if (!obsoletes.has(cleTechnologie(m.os, m.v))) continue
        for (const axe of ['composante', 'service', 'departement', 'lieu'] as const) {
          const id = m[axe]
          if (id) horsSupportPar[axe]!.set(id, (horsSupportPar[axe]!.get(id) ?? 0) + 1)
        }
      }
    }

    const compter = async (colonnes: { table: never, col: never }[]) => {
      const map = new Map<string, number>()
      for (const { table, col } of colonnes) {
        const rows: { cid: string, n: number }[] = await db.select({ cid: col, n: sql<number>`count(*)::int` }).from(table).where(isNotNull(col)).groupBy(col)
        for (const r of rows) {
          const k = String(r.cid)
          map.set(k, (map.get(k) ?? 0) + Number(r.n))
        }
      }
      return map
    }

    const axe = async (
      cle: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lignes: Promise<any[]>,
      colonnes: { table: never, col: never }[],
    ) => {
      const [rows, comptes] = await Promise.all([lignes, compter(colonnes)])
      return rows.map(r => ({
        id: r.id,
        nom: r.nom,
        sousTitre: r.sousTitre ?? null,
        total: comptes.get(r.id) ?? 0,
        horsSupport: horsSupportPar[cle]?.get(r.id) ?? 0,
        cle,
      })).sort((a, b) => b.total - a.total)
    }

    const [composantes, services, departements, lieux] = await Promise.all([
      cats.has('composantes')
        ? axe('composante', db.select({ id: composante.id, nom: composante.nom, sousTitre: entite.nom }).from(composante).leftJoin(entite, eq(entite.id, composante.entiteId)), [
            { table: serveur as never, col: serveur.composanteId as never },
            { table: posteTravail as never, col: posteTravail.composanteId as never },
            { table: appareilMobile as never, col: appareilMobile.composanteId as never },
            { table: iot as never, col: iot.composanteId as never },
          ])
        : [],
      cats.has('services')
        ? axe('service', db.select({ id: service.id, nom: service.nom, sousTitre: composante.nom }).from(service).leftJoin(composante, eq(composante.id, service.composanteId)), [
            { table: serveur as never, col: serveur.serviceId as never },
            { table: posteTravail as never, col: posteTravail.serviceId as never },
            { table: appareilMobile as never, col: appareilMobile.serviceId as never },
            { table: iot as never, col: iot.serviceId as never },
          ])
        : [],
      cats.has('departements')
        ? axe('departement', db.select({ id: departement.id, nom: departement.nom, sousTitre: composante.nom }).from(departement).leftJoin(composante, eq(composante.id, departement.composanteId)), [
            { table: serveur as never, col: serveur.departementId as never },
            { table: posteTravail as never, col: posteTravail.departementId as never },
            { table: appareilMobile as never, col: appareilMobile.departementId as never },
            { table: iot as never, col: iot.departementId as never },
          ])
        : [],
      cats.has('lieux')
        ? axe('lieu', db.select({ id: lieu.id, nom: lieu.nom, sousTitre: lieu.cheminGlpi }).from(lieu), [
            { table: serveur as never, col: serveur.lieuId as never },
            { table: posteTravail as never, col: posteTravail.lieuId as never },
            { table: appareilMobile as never, col: appareilMobile.lieuId as never },
            { table: iot as never, col: iot.lieuId as never },
          ])
        : [],
    ])

    return { composantes, services, departements, lieux }
  }, { auth: ['user', 'admin', 'svc'] })

