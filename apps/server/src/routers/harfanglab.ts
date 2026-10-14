import { Elysia, t } from 'elysia'
import { asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { composante, connecteurGlpi, correspondanceEntiteEdr, departement, entite, connecteurHarfanglab, glpiMachine, harfanglabAgent, harfanglabMoteurSnapshot, pole, service } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { chiffrer, dechiffrer } from '../utils/secrets'
import { normaliserJeton, testerConnexionHarfanglab } from '../utils/harfanglabClient'
import { lireConfigHarfanglab, synchroniserHarfanglab } from '../utils/harfanglabSync'
import { syncEnCours } from '../utils/syncEtat'
import { criticiteDuGroupe, lireReglesCriticite } from '../utils/glpiSync'
import { rapprocher } from '../utils/harfanglabRapprochement'
import { rapprocherParc, ventilerCouverture } from '../utils/couvertureParUnite'
import { CIBLES_EDR, cleEntiteEdr, libelleCible, rattachementEffectif, resoudreUnite, type CibleEdr } from '../utils/entitesEdr'

// Connecteur HarfangLab (EDR) — administration réservée aux ADMIN. Deux questions auxquelles
// rien ne répondait : quelles machines DEVRAIENT être surveillées et ne le sont pas, et est-ce
// qu'un moteur s'est éteint sans qu'on le sache.

const SINGLETON = 'connecteur-harfanglab-singleton'
const SINGLETON_GLPI = 'connecteur-glpi-singleton'

/** Les unités du Catalogue, pour placer les agents EDR et proposer les cibles. */
async function chargerReferentiels() {
  const [entites, composantes, services, departements, poles] = await Promise.all([
    db.select({ id: entite.id, nom: entite.nom }).from(entite),
    db.select({ id: composante.id, nom: composante.nom, sigle: composante.sigle, entiteId: composante.entiteId }).from(composante),
    db.select({ id: service.id, nom: service.nom, composanteId: service.composanteId }).from(service),
    db.select({ id: departement.id, nom: departement.nom, composanteId: departement.composanteId }).from(departement),
    db.select({ id: pole.id, nom: pole.nom, serviceId: pole.serviceId }).from(pole),
  ])
  return { entites, composantes, services, departements, poles }
}

async function chargerDeclarations(): Promise<Map<string, CibleEdr>> {
  const lignes = await db.select().from(correspondanceEntiteEdr)
  return new Map(lignes.map(l => [cleEntiteEdr(l.valeur), { type: l.cibleType, id: l.cibleId }]))
}

function masquer(c: Awaited<ReturnType<typeof lireConfigHarfanglab>>) {
  if (!c) return null
  const { jeton, ...reste } = c
  return { ...reste, jetonDefini: !!jeton }
}

export const harfanglabRouter = new Elysia({ name: 'harfanglab', prefix: '/api/harfanglab' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Connecteurs'] } })

  .get('/config', async () => masquer(await lireConfigHarfanglab()), { auth: ['admin'] })

  .put('/config', async ({ body }) => {
    const c = await lireConfigHarfanglab()
    await db.update(connecteurHarfanglab)
      .set({
        url: body.url?.trim() || null,
        // Chiffré à l'enregistrement ; vide = inchangé. Normalisé AVANT chiffrement : un
        // blanc au milieu du jeton suffit à faire refuser l'en-tête par HarfangLab.
        jeton: normaliserJeton(body.jeton) ? chiffrer(normaliserJeton(body.jeton)) : c?.jeton,
        actif: body.actif ?? false,
        frequenceHeures: Math.max(0, Number(body.frequenceHeures) || 0),
        // Marqueurs des règles TECHNIQUES.
        marqueursTechniques: body.marqueursTechniques
          ? body.marqueursTechniques.map(m => m.trim()).filter(Boolean)
          : c?.marqueursTechniques,
        updatedAt: new Date(),
      })
      .where(eq(connecteurHarfanglab.id, SINGLETON))
    return masquer(await lireConfigHarfanglab())
  }, {
    auth: ['admin'],
    body: t.Object({
      url: t.Optional(t.String()),
      jeton: t.Optional(t.String()),
      actif: t.Optional(t.Boolean()),
      frequenceHeures: t.Optional(t.Number()),
      marqueursTechniques: t.Optional(t.Array(t.String())),
    }),
  })

  .post('/test', async ({ body }) => {
    const c = await lireConfigHarfanglab()
    const url = body.url?.trim() || c?.url
    const jeton = normaliserJeton(body.jeton) || dechiffrer(c?.jeton)
    if (!url || !jeton) return { ok: false, message: 'URL et jeton requis.' }
    return testerConnexionHarfanglab({ url, jeton })
  }, {
    auth: ['admin'],
    body: t.Object({ url: t.Optional(t.String()), jeton: t.Optional(t.String()) }),
  })

  /**
   * SYNCHRONISATION EN ARRIÈRE-PLAN. Elle tenait la requête ouverte pendant tout le relevé —
   * agents, moteurs, jeux de règles, règles.
   */
  .post('/sync', async ({ status }) => {
    const cfg = await lireConfigHarfanglab()
    if (!cfg?.url || !cfg.jeton) {
      return status(400, { ok: false as const, message: 'Connecteur HarfangLab non configuré (URL et jeton requis).' })
    }
    if (syncEnCours(cfg)) {
      return status(409, { ok: false as const, message: 'Une synchronisation HarfangLab est déjà en cours.' })
    }
    void synchroniserHarfanglab().catch(e => console.error('[harfanglab] synchronisation en échec —', e instanceof Error ? e.message : e))
    return { ok: true as const, demarre: true }
  }, {
    auth: ['admin'],
    detail: {
      summary: 'Lance la synchronisation HarfangLab en arrière-plan.',
      description: 'Rend la main immédiatement. L\'avancement se lit sur `dernierStatut` de GET /config : '
        + '`en_cours`, puis `ok` ou `erreur` avec `dernierMessage`. Une synchronisation « en cours » depuis plus '
        + 'de deux heures est tenue pour morte et peut être relancée.',
    },
  })

  .get('/agents', async ({ query }) => {
    const where = query.statut ? eq(harfanglabAgent.statut, query.statut) : undefined
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50))
    const [rows, compte] = await Promise.all([
      db.select().from(harfanglabAgent).where(where)
        .orderBy(desc(harfanglabAgent.lastseen), asc(harfanglabAgent.hostname))
        .limit(pageSize).offset((page - 1) * pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(harfanglabAgent).where(where),
    ])
    return { rows, total: Number(compte[0]?.n ?? 0), page, pageSize }
  }, {
    auth: ['admin'],
    query: t.Object({ statut: t.Optional(t.String()), page: t.Optional(t.String()), pageSize: t.Optional(t.String()) }),
  })

  // ÉCART DE COUVERTURE — le cœur du lot. Deux sens, et ils ne se valent pas : • machine du
  // groupe critique SANS agent qui remonte → c'est l'écart qui compte ; • agent qui remonte sur
  // une machine hors du groupe critique → information.
  /**
   * L'écart de couverture EDR : machines critiques SANS agent. Ouvert aux comptes de service —
   * c'est l\'une des deux questions auxquelles rien ne répondait.
   */
  .get('/couverture', async () => {
    const cfgHl = await lireConfigHarfanglab()
    const [cfgGlpi] = await db.select().from(connecteurGlpi).where(eq(connecteurGlpi.id, SINGLETON_GLPI)).limit(1)
    const regles = lireReglesCriticite(cfgGlpi?.groupesCriticite)

    const machines = await db
      .select({ glpiId: glpiMachine.glpiId, nom: glpiMachine.nom, serie: glpiMachine.numeroSerie, groupe: glpiMachine.groupe, entite: glpiMachine.entite })
      .from(glpiMachine)
    const critiques = machines.filter(m => criticiteDuGroupe(m.groupe, regles) !== null)

    const agents = await db
      .select({ agentId: harfanglabAgent.agentId, hostname: harfanglabAgent.hostname, serie: harfanglabAgent.machineSerial, statut: harfanglabAgent.statut, lastseen: harfanglabAgent.lastseen })
      .from(harfanglabAgent)

    const res = rapprocher(
      critiques.map(m => ({ cle: m.glpiId, nom: m.nom, numeroSerie: m.serie })),
      agents.map(a => ({ cle: a.agentId, hostname: a.hostname, machineSerial: a.serie })),
    )

    const parGlpiId = new Map(critiques.map(m => [m.glpiId, m]))
    const parAgent = new Map(agents.map(a => [a.agentId, a]))

    return {
      // TÉMOIN D'ACTIVITÉ : un écart à zéro doit se distinguer d'une synchro en panne.
      // Sans cette date, une couverture parfaite et un connecteur mort se ressemblent.
      dernierSyncAt: cfgHl?.dernierSyncAt ?? null,
      dernierStatut: cfgHl?.dernierStatut ?? 'jamais',
      reglesDeclarees: regles.length,
      comptes: res.comptes,
      sansAgent: res.machinesSansAgent.slice(0, 500).map(id => parGlpiId.get(id) ?? { glpiId: id }),
      ambigus: res.ambigus.slice(0, 200).map(a => ({ machine: parGlpiId.get(a.machine) ?? { glpiId: a.machine }, agents: a.agents, motif: a.motif })),
      agentsHorsPerimetre: res.agentsSansMachine.slice(0, 200).map(id => parAgent.get(id) ?? { agentId: id }),
    }
  }, {
    // Ouvert au-delà des administrateurs : c'est l'une des deux questions auxquelles rien ne
    // répondait, et la réponse ne vaut que si on peut la poser depuis ailleurs.
    can: { category: 'edr-regles', level: 'read' },
    detail: {
      summary: 'Machines critiques qui devraient être surveillées par l\'EDR et ne le sont pas.',
      description: 'Confronte les machines marquées critiques par leur groupe GLPI aux agents qui remontent. '
        + '`comptes.ambigus` compte les rapprochements NON TRANCHÉS : c\'est ce chiffre qui dit ce que valent '
        + 'les autres. `dernierSyncAt` et `dernierStatut` accompagnent toujours le résultat — sans eux, une '
        + 'couverture parfaite et un connecteur en panne se ressemblent. Si `reglesDeclarees` vaut 0, aucun '
        + 'groupe critique n\'est déclaré et l\'écart ne veut rien dire.',
    },
  })

  /**
   * LA MÊME COUVERTURE, VENTILÉE PAR COMPOSANTE. « 217 machines critiques sans agent » n'engage
   * personne.
   */
  .get('/couverture/par-composante', async () => {
    const cfgHl = await lireConfigHarfanglab()
    const [cfgGlpi] = await db.select().from(connecteurGlpi).where(eq(connecteurGlpi.id, SINGLETON_GLPI)).limit(1)
    const regles = lireReglesCriticite(cfgGlpi?.groupesCriticite)

    const machines = await db
      .select({ glpiId: glpiMachine.glpiId, nom: glpiMachine.nom, serie: glpiMachine.numeroSerie, groupe: glpiMachine.groupe, entite: glpiMachine.entite })
      .from(glpiMachine)
    const parc = machines.map(m => ({
      glpiId: m.glpiId, entite: m.entite, nom: m.nom, numeroSerie: m.serie,
      critique: criticiteDuGroupe(m.groupe, regles) !== null,
    }))
    const critiques = parc.filter(m => m.critique)
    const nonCritiques = parc.filter(m => !m.critique)

    const agents = await db
      .select({ agentId: harfanglabAgent.agentId, hostname: harfanglabAgent.hostname, serie: harfanglabAgent.machineSerial, entiteEdr: harfanglabAgent.entiteEdr })
      .from(harfanglabAgent)
    const parAgent = new Map(agents.map(a => [a.agentId, a]))

    // LE MÊME RAPPROCHEMENT que /couverture pour le parc critique : c'est la première passe de
    // `rapprocherParc`, sur les mêmes entrées.
    const r = rapprocherParc(parc, agents.map(a => ({ cle: a.agentId, hostname: a.hostname, machineSerial: a.serie })))
    const res = r.critiques
    const sansAgent = new Set(res.machinesSansAgent)
    const ambigus = new Set(res.ambigus.map(x => x.machine))

    const refs = await chargerReferentiels()
    const { composantes, services, departements, poles } = refs
    // LES AGENTS SANS MACHINE GLPI, placés par leur entité EDR : déclaration d'abord,
    // rapprochement exact ensuite, ligne nommée à défaut.
    const declarations = await chargerDeclarations()
    const horsGlpi = r.agentsSansMachineGlpi.map((agentId) => {
      const entiteEdr = parAgent.get(agentId)?.entiteEdr ?? null
      const e = rattachementEffectif(entiteEdr, declarations, refs)
      return { agentId, entiteEdr, unite: e.cible ? resoudreUnite(e.cible, refs) : null }
    })
    const vent = ventilerCouverture(critiques, sansAgent, ambigus, { composantes, services, departements, poles }, {
      machines: nonCritiques, avecAgent: r.nonCritiques.avecAgent, ambigus: r.nonCritiques.ambigus,
    }, horsGlpi)

    return {
      dernierSyncAt: cfgHl?.dernierSyncAt ?? null,
      dernierStatut: cfgHl?.dernierStatut ?? 'jamais',
      reglesDeclarees: regles.length,
      // Le TOTAL à côté du détail : la somme des lignes doit pouvoir se vérifier, et
      // l'appelant ne doit jamais avoir à la calculer pour savoir s'il lit tout.
      total: {
        critiques: critiques.length,
        avecAgent: critiques.length - sansAgent.size - ambigus.size,
        sansAgent: sansAgent.size,
        ambigus: ambigus.size,
        nonCritiques: nonCritiques.length,
        nonCritiquesAvecAgent: r.nonCritiques.avecAgent.size,
        nonCritiquesSansAgent: r.nonCritiques.machinesSansAgent.length,
        nonCritiquesAmbigus: r.nonCritiques.ambigus.size,
        machinesGlpi: parc.length,
      },
      // LA PARTITION DES AGENTS : cinq cases disjointes dont la somme fait `total`.
      agents: { ...r.agents, sansMachineGlpiRattaches: horsGlpi.filter(a => a.unite).length },
      // Les agents sans machine GLPI NE SE VENTILENT PAS : ils n'ont aucune entité GLPI, donc
      // aucune composante. Les ranger quelque part inventerait un rattachement.
      agentsSansMachineGlpi: horsGlpi.slice(0, 200).map(a => ({ agentId: a.agentId, hostname: parAgent.get(a.agentId)?.hostname ?? null, entiteEdr: a.entiteEdr, rattache: !!a.unite })),
      // TROIS VUES DE LA MÊME POPULATION, jamais trois populations : la même machine est dans
      // sa composante, dans son service ET dans son pôle.
      lignes: vent.composantes,
      sousUnites: vent.sousUnites,
      poles: vent.poles,
    }
  }, {
    can: { category: 'edr-regles', level: 'read' },
    detail: {
      summary: 'Couverture EDR des machines critiques, ventilée par composante.',
      description: 'Même population et même rapprochement que /api/harfanglab/couverture, ventilés sur le '
        + '2e segment du chemin d\'entité GLPI. La ventilation ne se fait PAS par entité : le 1er segment '
        + 'est l\'établissement, et il n\'y en a qu\'un, donc '
        + 'cet axe rendrait une ligne unique égale au total. La ligne « (sans composante dans GLPI) » '
        + 'compte les machines dont le chemin n\'en nomme aucune : sans elle, la somme des lignes serait '
        + 'inférieure au total sans que rien ne le signale. `sousUnites` descend au 3e segment (service ou '
        + 'département) : c\'est la MÊME population vue autrement, et les deux tableaux ne s\'additionnent '
        + 'PAS. Chaque ligne porte aussi le parc NON critique (`nonCritiques`, `nonCritiquesAvecAgent`, '
        + '`nonCritiquesSansAgent`, `nonCritiquesAmbigus`), rapproché dans une seconde passe avec les agents que le parc '
        + 'critique n\'a pas pris : les chiffres critiques restent ceux de /couverture. `agents` partitionne tous les '
        + 'agents en cinq cases disjointes ; `agentsSansMachineGlpi` ne se ventile pas, faute d\'entité GLPI. '
        + '`poles` descend au 4e segment quand il existe — toutes les unités n\'ont pas de pôle, et une '
        + 'sous-unité qui n\'en a aucun rend une ligne unique « sans pôle » qui vaut son total. Troisième vue '
        + 'de la même population, elle ne s\'additionne pas davantage aux deux autres. `ambigus` est compté à part et n\'entre ni dans '
        + '`avecAgent` ni dans `sansAgent` — un rapprochement non tranché n\'est pas une couverture.',
    },
  })

  // --- ENTITÉS EDR : rattachement à une unité du Catalogue ---------------------------
  // Chaque valeur d'`additional_info1` rencontrée, avec son nombre d'agents, ce qui la rattache
  // (déclaration ou rapprochement exact) et pourquoi elle ne l'est pas.
  .get('/entites-edr', async () => {
    const [agents, refs, declarations, lignesDeclarees] = await Promise.all([
      db.select({ entiteEdr: harfanglabAgent.entiteEdr }).from(harfanglabAgent),
      chargerReferentiels(),
      chargerDeclarations(),
      db.select({ valeur: correspondanceEntiteEdr.valeur }).from(correspondanceEntiteEdr),
    ])
    const parValeur = new Map<string, number>()
    let sansEntite = 0
    for (const a of agents) {
      if (!a.entiteEdr) {
        sansEntite++
        continue
      }
      parValeur.set(a.entiteEdr, (parValeur.get(a.entiteEdr) ?? 0) + 1)
    }
    const nomComposante = (id: string | null) => (id ? refs.composantes.find(c => c.id === id)?.nom ?? '?' : '(sans composante)')
    const trier = <T extends { libelle: string }>(l: T[]) => l.sort((a, b) => a.libelle.localeCompare(b.libelle))
    return {
      agents: agents.length,
      sansEntite,
      valeurs: [...parValeur].map(([valeur, n]) => {
        const e = rattachementEffectif(valeur, declarations, refs)
        const declaree = declarations.get(valeur) ?? null
        return {
          valeur,
          agents: n,
          source: e.source,
          motif: e.motif,
          cible: e.cible ?? declaree,
          libelle: e.cible ? libelleCible(e.cible, refs) : null,
          attendue: false,
        }
      }).concat(
        // LES DÉCLARATIONS EN ATTENTE : une étiquette pas encore posée dans HarfangLab (un pôle
        // à venir). Listées à zéro agent, pour se relire et se corriger avant qu'elles servent.
        lignesDeclarees
          .filter(d => ![...parValeur.keys()].some(v => cleEntiteEdr(v) === cleEntiteEdr(d.valeur)))
          .map((d) => {
            const e = rattachementEffectif(d.valeur, declarations, refs)
            return { valeur: d.valeur, agents: 0, source: e.source, motif: e.motif, cible: e.cible ?? declarations.get(cleEntiteEdr(d.valeur)) ?? null, libelle: e.cible ? libelleCible(e.cible, refs) : null, attendue: true }
          }),
      ).sort((a, b) => b.agents - a.agents || a.valeur.localeCompare(b.valeur)),
      options: {
        // Sans composante : où GLPI range les machines laissées à la racine (services centraux…).
        etablissements: trier(refs.entites.map(e => ({ id: e.id, libelle: `${e.nom} — sans composante` }))),
        composantes: trier(refs.composantes.map(c => ({ id: c.id, libelle: c.nom }))),
        services: trier(refs.services.map(x => ({ id: x.id, libelle: `${nomComposante(x.composanteId)} › ${x.nom}` }))),
        departements: trier(refs.departements.map(x => ({ id: x.id, libelle: `${nomComposante(x.composanteId)} › ${x.nom}` }))),
        poles: trier(refs.poles.map(x => ({ id: x.id, libelle: libelleCible({ type: 'pole', id: x.id }, refs) ?? x.nom }))),
      },
    }
  }, {
    auth: ['admin'],
    detail: {
      summary: 'Valeurs d\'entité EDR (additional_info1) et leur rattachement à une unité du Catalogue.',
      description: '`source` : `declaree` (table de correspondance) ou `automatique` (nom exactement identique, et unique). '
        + '`motif` dit pourquoi une valeur n\'est pas rattachée : `ambigu` (plusieurs unités portent ce nom), `aucun`, '
        + '`cible_disparue` (l\'unité déclarée a été supprimée).',
    },
  })

  .post('/entites-edr', async ({ body, user, status }) => {
    const valeur = body.valeur.trim()
    if (!valeur) return status(400, 'Valeur d\'entité EDR vide.')
    // `cible: null` retire la déclaration : la valeur revient au rapprochement automatique.
    if (!body.cible) {
      await db.delete(correspondanceEntiteEdr).where(eq(correspondanceEntiteEdr.valeur, valeur))
      return { ok: true, valeur, source: 'automatique' }
    }
    const cible = body.cible as CibleEdr
    if (!resoudreUnite(cible, await chargerReferentiels())) return status(400, 'Unité introuvable : elle a peut-être été supprimée.')
    // DEUX ÉCRITURES D'UNE MÊME ÉTIQUETTE ne font qu'une clé : la seconde déclaration
    // contredirait la première sans qu'on sache laquelle s'applique.
    const homonyme = (await db.select({ valeur: correspondanceEntiteEdr.valeur }).from(correspondanceEntiteEdr))
      .find(d => d.valeur !== valeur && cleEntiteEdr(d.valeur) === cleEntiteEdr(valeur))
    if (homonyme) return status(409, `« ${homonyme.valeur} » est déjà déclarée et désigne la même étiquette que « ${valeur} ». Modifiez-la plutôt.`)
    const maintenant = new Date()
    await db.insert(correspondanceEntiteEdr)
      .values({ valeur, cibleType: cible.type, cibleId: cible.id, note: body.note?.trim() || null, declarePar: user?.email ?? null })
      .onConflictDoUpdate({
        target: correspondanceEntiteEdr.valeur,
        set: { cibleType: cible.type, cibleId: cible.id, note: body.note?.trim() || null, declarePar: user?.email ?? null, updatedAt: maintenant },
      })
    return { ok: true, valeur, source: 'declaree' }
  }, {
    auth: ['admin'],
    body: t.Object({
      valeur: t.String(),
      cible: t.Nullable(t.Object({ type: t.Union(CIBLES_EDR.map(c => t.Literal(c))), id: t.String() })),
      note: t.Optional(t.String()),
    }),
    detail: { summary: 'Déclare l\'unité d\'une entité EDR, ou la rend au rapprochement automatique (`cible: null`).' },
  })

  // ÉTAT DES MOTEURS, par politique, avec ce qui a changé depuis le relevé précédent. ⚠️ Les
  // modes sont des ENTIERS dont la sémantique n'est documentée nulle part chez l'éditeur.
  .get('/moteurs', async () => {
    const derniers = await db.execute(sql`
      select distinct on (politique_id) politique_id, politique_nom, releve_le, modes, revisions, changements
      from ${harfanglabMoteurSnapshot}
      order by politique_id, releve_le desc
    `)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((derniers as any).rows ?? derniers) as Record<string, unknown>[]
    return rows.map(r => ({
      politiqueId: String(r.politique_id),
      politiqueNom: r.politique_nom as string | null,
      releveLe: r.releve_le,
      modes: r.modes,
      revisions: r.revisions,
      changements: r.changements,
    }))
  }, {
    can: { category: 'edr-regles', level: 'read' },
    detail: {
      summary: 'État des moteurs de détection par politique, et ce qui a changé depuis le relevé précédent.',
      description: 'Un moteur qui s\'éteint ne produit pas d\'erreur : il produit du silence. ATTENTION — les '
        + 'valeurs de `modes` sont des ENTIERS dont la signification n\'est documentée nulle part chez '
        + 'l\'éditeur : ne jamais les traduire en « activé » ou « désactivé ». Seuls les CHANGEMENTS sont '
        + 'exploitables. `changements: null` signifie « premier relevé, rien à comparer », ce qui est '
        + 'différent de `[]` qui signifie « comparé, rien n\'a changé ».',
    },
  })

  // Politiques rencontrées, avec le nombre d'agents — utile pour situer un changement.
  .get('/politiques', async () => {
    return db.select({
      politiqueId: harfanglabAgent.politiqueId,
      politiqueNom: harfanglabAgent.politiqueNom,
      agents: sql<number>`count(*)::int`,
    })
      .from(harfanglabAgent)
      .where(isNotNull(harfanglabAgent.politiqueId))
      .groupBy(harfanglabAgent.politiqueId, harfanglabAgent.politiqueNom)
      .orderBy(desc(sql`count(*)`))
  }, { auth: ['admin'] })
