import { Elysia, t } from 'elysia'
import { asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurGlpi, glpiMachine } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { chiffrer, dechiffrer } from '../utils/secrets'
import { testerConnexionGlpi } from '../utils/glpiClient'
import { synchroniserGlpi, reclasserMachine, lireReglesCriticite, serieIdentifie, groupesDeLaMachine, CRITICITES } from '../utils/glpiSync'

// Connecteur GLPI — administration réservée aux ADMIN (secrets d'API + déclenchement de
// synchronisations lourdes).
const SINGLETON = 'connecteur-glpi-singleton'

async function getConfig() {
  const [row] = await db.select().from(connecteurGlpi).where(eq(connecteurGlpi.id, SINGLETON)).limit(1)
  if (row) return row
  const [created] = await db.insert(connecteurGlpi).values({ id: SINGLETON }).onConflictDoNothing().returning()
  return created ?? (await db.select().from(connecteurGlpi).where(eq(connecteurGlpi.id, SINGLETON)).limit(1))[0]
}

// Ne jamais renvoyer les jetons en clair : on signale seulement s'ils sont renseignés.
function masquer(c: Awaited<ReturnType<typeof getConfig>>) {
  if (!c) return null
  const { appToken, userToken, ...reste } = c
  return { ...reste, appTokenDefini: !!appToken, userTokenDefini: !!userToken }
}

export const glpiRouter = new Elysia({ name: 'glpi', prefix: '/api/glpi' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Connecteurs'] } })

  .get('/config', async () => masquer(await getConfig()), { auth: ['admin'] })

  .put('/config', async ({ body }) => {
    const c = await getConfig()
    // Un jeton vide dans le formulaire = « inchangé » (on ne l'efface pas par mégarde).
    await db.update(connecteurGlpi)
      .set({
        url: body.url?.trim() || null,
        // Chiffrés à l'enregistrement. Un jeton laissé vide dans le formulaire vaut « inchangé
        // » : on conserve alors la valeur en base telle quelle, déjà chiffrée ou encore en
        // clair — elle le sera à la prochaine saisie.
        appToken: body.appToken?.trim() ? chiffrer(body.appToken.trim()) : c?.appToken,
        userToken: body.userToken?.trim() ? chiffrer(body.userToken.trim()) : c?.userToken,
        actif: body.actif ?? false,
        frequenceHeures: Math.max(0, Number(body.frequenceHeures) || 0),
        // Correspondance « groupe GLPI → criticité » : revalidée ici (le corps est typé, mais
        // on retire les lignes vides que l'interface laisse traîner quand on ajoute une ligne
        // sans la remplir).
        ...(body.groupesCriticite !== undefined
          ? { groupesCriticite: lireReglesCriticite(body.groupesCriticite) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(connecteurGlpi.id, SINGLETON))
    return masquer(await getConfig())
  }, {
    auth: ['admin'],
    body: t.Object({
      url: t.Optional(t.String()),
      appToken: t.Optional(t.String()),
      userToken: t.Optional(t.String()),
      actif: t.Optional(t.Boolean()),
      frequenceHeures: t.Optional(t.Number()),
      groupesCriticite: t.Optional(t.Array(t.Object({
        groupe: t.String(),
        criticite: t.Union(CRITICITES.map(c => t.Literal(c))),
      }))),
    }),
  })

  // Groupes GLPI RÉELLEMENT RENCONTRÉS, avec leur volumétrie. Sans cette liste, déclarer une
  // correspondance revient à recopier un nom de groupe de mémoire — et une faute de frappe
  // produit une règle qui ne s'applique jamais, en silence.
  .get('/groupes', async () => {
    const lignes = await db.select({ groupe: glpiMachine.groupe }).from(glpiMachine).where(isNotNull(glpiMachine.groupe))
    // Une ligne = une machine, avec la liste de SES groupes.
    const parMachine = lignes.map(l => groupesDeLaMachine(l.groupe))

    const direct = new Map<string, number>()
    for (const groupes of parMachine) {
      // `new Set` : une machine ne compte qu'une fois par groupe, même si la source
      // répète la valeur.
      for (const g of new Set(groupes)) direct.set(g, (direct.get(g) ?? 0) + 1)
    }

    // Total sous-arbre : le nombre de MACHINES DISTINCTES que la règle marquerait si on
    // déclarait ce nœud.
    const segments = (chemin: string) => chemin.split('>').map(x => x.trim()).filter(Boolean)
    const contient = (cible: string[], candidat: string[]) => {
      for (let i = 0; i + cible.length <= candidat.length; i++) {
        if (cible.every((a, j) => a === candidat[i + j])) return true
      }
      return false
    }
    const sousArbre = (cle: string) => {
      const attendus = segments(cle)
      return parMachine.filter(gs => gs.some(g => contient(attendus, segments(g)))).length
    }

    return [...direct.entries()]
      .map(([groupe, machines]) => ({ groupe, machines, machinesSousArbre: sousArbre(groupe) }))
      .sort((a, b) => b.machinesSousArbre - a.machinesSousArbre || a.groupe.localeCompare(b.groupe))
  }, { auth: ['admin'] })

  // Test de connexion avec les paramètres ENREGISTRÉS (ou fournis pour un essai).
  .post('/test', async ({ body }) => {
    const c = await getConfig()
    const url = body.url?.trim() || c?.url
    const appToken = body.appToken?.trim() || dechiffrer(c?.appToken)
    const userToken = body.userToken?.trim() || dechiffrer(c?.userToken)
    if (!url || !appToken || !userToken) {
      return { ok: false, message: 'URL, App-Token et User-Token requis.' }
    }
    return testerConnexionGlpi({ url, appToken, userToken })
  }, {
    auth: ['admin'],
    body: t.Object({ url: t.Optional(t.String()), appToken: t.Optional(t.String()), userToken: t.Optional(t.String()) }),
  })

  // Synchronisation manuelle immédiate.
  .post('/sync', async ({ status }) => {
    try {
      const compteurs = await synchroniserGlpi()
      return { ok: true as const, compteurs }
    }
    catch (e) {
      return status(422, { ok: false as const, message: e instanceof Error ? e.message : String(e) })
    }
  }, { auth: ['admin'] })

  // File « à classer » (+ filtre optionnel par classement pour l'onglet correspondant).
  .get('/machines', async ({ query }) => {
    const where = query.classement
      ? eq(glpiMachine.classement, query.classement as never)
      : undefined
    const paginated = query.page !== undefined
    const orderBy = [desc(glpiMachine.updatedAt), asc(glpiMachine.nom)]
    if (!paginated) {
      return db.select().from(glpiMachine).where(where).orderBy(...orderBy).limit(500)
    }
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50))
    const [rows, compte] = await Promise.all([
      db.select().from(glpiMachine).where(where).orderBy(...orderBy).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(glpiMachine).where(where),
    ])
    return { rows, total: Number(compte[0]?.n ?? 0), page, pageSize }
  }, {
    auth: ['admin'],
    query: t.Object({
      classement: t.Optional(t.String()),
      page: t.Optional(t.String()),
      pageSize: t.Optional(t.String()),
    }),
  })

  // Compteurs par classement (pour les badges d'onglets).
  .get('/machines/compteurs', async () => {
    const rows = await db
      .select({ classement: glpiMachine.classement, n: sql<number>`count(*)::int` })
      .from(glpiMachine)
      .groupBy(glpiMachine.classement)
    const out: Record<string, number> = { a_classer: 0, serveur: 0, poste: 0, appareil_mobile: 0, iot: 0, ignore: 0 }
    for (const r of rows) out[r.classement] = Number(r.n)
    return out
  }, { auth: ['admin'] })

  // DOUBLONS D'INVENTAIRE — la liste à purger dans GLPI. Deux entrées qui partagent un NUMÉRO
  // DE SÉRIE sont la même machine physique : c'est une preuve, pas un indice.
  .get('/doublons', async () => {
    const machines = await db
      .select({
        glpiId: glpiMachine.glpiId, nom: glpiMachine.nom, entite: glpiMachine.entite,
        numeroSerie: glpiMachine.numeroSerie, cibleId: glpiMachine.cibleId,
        classement: glpiMachine.classement, updatedAt: glpiMachine.updatedAt,
      })
      .from(glpiMachine)

    const grouper = (cle: (m: typeof machines[number]) => string | null) => {
      const paquets = new Map<string, typeof machines>()
      for (const m of machines) {
        const k = cle(m)
        if (!k) continue
        const acc = paquets.get(k) ?? []
        acc.push(m)
        paquets.set(k, acc)
      }
      return [...paquets.entries()]
        .filter(([, v]) => v.length > 1)
        .sort((a, b) => b[1].length - a[1].length)
    }

    const parSerie = grouper(m => serieIdentifie(m.numeroSerie) ? m.numeroSerie : null)
    const serviesParSerie = new Set(parSerie.flatMap(([, v]) => v.map(m => m.glpiId)))
    // Un doublon déjà prouvé par son numéro de série n'a pas à réapparaître en soupçon.
    const parNom = grouper(m => m.nom).filter(([, v]) => v.some(m => !serviesParSerie.has(m.glpiId)))

    return {
      certains: parSerie.slice(0, 200).map(([serie, m]) => ({ cle: serie, machines: m })),
      probables: parNom.slice(0, 200).map(([nom, m]) => ({ cle: nom, machines: m })),
      resume: {
        machines: machines.length,
        entreesCertaines: parSerie.reduce((n, [, v]) => n + v.length - 1, 0),
        entreesProbables: parNom.reduce((n, [, v]) => n + v.length - 1, 0),
        sansSerie: machines.filter(m => !serieIdentifie(m.numeroSerie)).length,
      },
    }
  }, { auth: ['admin'] })

  // Reclassement manuel (mémorisé, survit aux re-syncs).
  .patch('/machines/:id', async ({ params, body }) => {
    await reclasserMachine(params.id, body.classement)
    return { ok: true as const }
  }, {
    auth: ['admin'],
    params: t.Object({ id: t.String() }),
    body: t.Object({ classement: t.Union([t.Literal('serveur'), t.Literal('poste'), t.Literal('appareil_mobile'), t.Literal('iot'), t.Literal('ignore'), t.Literal('a_classer')]) }),
  })
