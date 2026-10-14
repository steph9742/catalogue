import { Elysia, t } from 'elysia'
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { composante, connecteurAudit, connecteurSlowpoke, constat, glpiMachine, personne, serviceExpose } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { auteurDecision } from '../utils/auteurDecision'
import { chiffrer, dechiffrer } from '../utils/secrets'
import { normaliserJeton } from '../utils/harfanglabClient'
import { adresseMoteur, lireListeDomaines, lireListePlages, testerConnexionAudit } from '../utils/auditClient'
import { construirePerimetre, lireConfigAudit, SINGLETON_AUDIT, synchroniserAudit } from '../utils/auditSync'
import { CATEGORIES_CONSTAT, GRAVITES_CONSTAT, STATUTS_CONSTAT, transition, type StatutConstat } from '../utils/constatCycle'
import { lireIncidentsMachine } from '../utils/slowpokeClient'
import { lignesRapport, matrice, type ConstatRapport } from '../utils/tableauAudit'
import { estSensible } from '../utils/classement'
import { paginerEnMemoire, SCHEMA_PAGINATION } from '../utils/pagination'

// AUDIT DE SURFACE EXTERNE — configuration du moteur, constats, découvertes.

const TRAITEMENTS = ['a_valider', 'inscrit', 'ecarte', 'deja_inventorie'] as const

function masquer(c: Awaited<ReturnType<typeof lireConfigAudit>>) {
  if (!c) return null
  const { jeton, ...reste } = c
  return { ...reste, jetonDefini: !!jeton }
}

/**
 * Les constats d'un ou plusieurs statuts, avec ce qui les rattache à un interlocuteur :
 * service, classement, propriétaire, composante du propriétaire.
 */
async function constatsPourRapport(statuts: StatutConstat[]): Promise<ConstatRapport[]> {
  const lignes = await db.select({
    id: constat.id, gravite: constat.gravite, categorie: constat.categorie, titre: constat.titre, statut: constat.statut,
    hote: constat.actifHote, port: constat.actifPort, serviceId: constat.serviceId,
    premierReleveLe: constat.premierReleveLe, dernierReleveLe: constat.dernierReleveLe,
    acceptationEcheance: constat.acceptationEcheance, sniffIncidentId: constat.sniffIncidentId,
    classement: serviceExpose.classement, verificationInterieureLe: serviceExpose.verificationInterieureLe,
    proprietaireId: serviceExpose.proprietaireId, proprietaireNom: personne.nom, proprietairePrenom: personne.prenom,
    composante: composante.nom,
  }).from(constat)
    .leftJoin(serviceExpose, eq(serviceExpose.id, constat.serviceId))
    .leftJoin(personne, eq(personne.id, serviceExpose.proprietaireId))
    .leftJoin(composante, eq(composante.id, personne.composanteId))
    .where(and(ne(constat.categorie, 'decouverte'), inArray(constat.statut, statuts)))
  return lignes.map(({ proprietaireNom, proprietairePrenom, ...l }) => ({
    ...l,
    proprietaire: proprietaireNom ? `${proprietairePrenom ? `${proprietairePrenom} ` : ''}${proprietaireNom}` : null,
  }))
}

const dansListe = <T extends string>(liste: readonly T[], v: string | undefined): v is T => !!v && (liste as readonly string[]).includes(v)

export const auditSurfaceRouter = new Elysia({ name: 'audit-surface', prefix: '/api/audit-surface' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Audit de surface externe'] } })

  // --- Configuration du moteur -------------------------------------------------------
  .get('/config', async () => masquer(await lireConfigAudit()), { auth: ['admin'] })

  .put('/config', async ({ body, status }) => {
    const c = await lireConfigAudit()
    if (body.url?.trim()) {
      const a = adresseMoteur(body.url)
      if (!a.ok) return status(400, a.message)
    }
    // Les refus sont RENDUS : un domaine mal saisi qui disparaît en silence réduirait le
    // périmètre sans que personne ne le sache.
    const d = lireListeDomaines(body.domaines ?? c?.domaines ?? [])
    const p = lireListePlages(body.plages ?? c?.plages ?? [])
    const jeton = normaliserJeton(body.jeton)
    await db.update(connecteurAudit).set({
      url: body.url?.trim() || null,
      jeton: jeton ? chiffrer(jeton) : c?.jeton,
      actif: body.actif ?? false,
      dialecte: body.dialecte === 'artemis' ? 'artemis' : 'contrat',
      frequenceHeures: Math.max(1, Math.round(Number(body.frequenceHeures) || 24)),
      domaines: d.valides,
      plages: p.valides,
      updatedAt: new Date(),
    }).where(eq(connecteurAudit.id, SINGLETON_AUDIT))
    return { ...masquer(await lireConfigAudit()), rejets: { domaines: d.rejets, plages: p.rejets } }
  }, {
    auth: ['admin'],
    body: t.Object({
      url: t.Optional(t.String()),
      jeton: t.Optional(t.String()),
      actif: t.Optional(t.Boolean()),
      dialecte: t.Optional(t.String()),
      frequenceHeures: t.Optional(t.Number()),
      domaines: t.Optional(t.Array(t.String())),
      plages: t.Optional(t.Array(t.String())),
    }),
    detail: {
      summary: 'Configure le moteur d\'audit : adresse, jeton, périmètre autorisé.',
      description: 'Domaines et plages sont validés ; les plages privées sont refusées (invisibles depuis Internet). '
        + 'Les valeurs refusées sont rendues dans `rejets`. Jeton vide = inchangé. `dialecte` vaut `contrat` (le moteur '
        + 'porte /perimetre et /resultats) ou `artemis` (le Catalogue parle à Artemis directement, en attendant).',
    },
  })

  .post('/test', async ({ body }) => {
    const c = await lireConfigAudit()
    const url = body.url?.trim() || c?.url
    const jeton = normaliserJeton(body.jeton) || dechiffrer(c?.jeton)
    if (!url || !jeton) return { ok: false, message: 'Adresse et jeton requis.' }
    // LE DIALECTE EST CELUI QU'ON ÉPROUVE, pas celui par défaut. Sans lui, « Tester la
    // connexion » appelait /resultats sur un Artemis qui redirige vers sa page de connexion, et
    // rendait en échec une configuration qui fonctionne.
    const dialecte = body.dialecte === 'artemis' ? 'artemis' as const
      : body.dialecte === 'contrat' ? 'contrat' as const
        : (c?.dialecte === 'artemis' ? 'artemis' as const : 'contrat' as const)
    return testerConnexionAudit({ url, jeton, dialecte })
  }, { auth: ['admin'], body: t.Object({ url: t.Optional(t.String()), jeton: t.Optional(t.String()), dialecte: t.Optional(t.String()) }) })

  .post('/synchroniser', async () => {
    const c = await lireConfigAudit()
    // Une synchronisation interrompue (redémarrage) laisse `en_cours` : au-delà de trente
    // minutes, on la tient pour morte plutôt que de bloquer le connecteur indéfiniment.
    if (c?.dernierStatut === 'en_cours' && c.updatedAt && Date.now() - new Date(c.updatedAt).getTime() < 30 * 60 * 1000) {
      return { ok: false as const, message: 'Une synchronisation est déjà en cours.' }
    }
    try {
      const comptes = await synchroniserAudit()
      return { ok: true as const, message: (await lireConfigAudit())?.dernierMessage ?? 'Synchronisation terminée.', comptes }
    }
    catch (e) {
      return { ok: false as const, message: e instanceof Error ? e.message : String(e) }
    }
  }, { auth: ['admin'], detail: { summary: 'Envoie le périmètre au moteur et récupère ses constats.' } })

  /** Ce qui partirait au moteur, pour le relire avant d'activer. */
  .get('/perimetre', async () => {
    const c = await lireConfigAudit()
    const p = await construirePerimetre({ domaines: c?.domaines ?? null, plages: c?.plages ?? null })
    return { domaines: p.domaines, plages: p.plages, actifs: p.actifs.length }
  }, { auth: ['admin'] })

  // --- Constats ----------------------------------------------------------------------
  .get('/resume', async () => {
    const c = await lireConfigAudit()
    const lignes = await db.select({
      statut: constat.statut, gravite: constat.gravite, categorie: constat.categorie,
      traitement: constat.traitement, n: sql<number>`count(*)::int`,
    }).from(constat).groupBy(constat.statut, constat.gravite, constat.categorie, constat.traitement)

    const ouvertsParGravite: Record<string, number> = {}
    const parStatut: Record<string, number> = {}
    let decouvertesAValider = 0
    for (const l of lignes) {
      // Les découvertes ne sont pas des constats de sécurité : les compter parmi les
      // « ouverts » gonflerait le chiffre qui sert à juger l'exposition.
      if (l.categorie === 'decouverte') {
        if (l.traitement === 'a_valider') decouvertesAValider += l.n
        continue
      }
      parStatut[l.statut] = (parStatut[l.statut] ?? 0) + l.n
      if (l.statut === 'ouvert') ouvertsParGravite[l.gravite] = (ouvertsParGravite[l.gravite] ?? 0) + l.n
    }
    return {
      configure: !!(c?.url && c?.jeton),
      dernierSyncAt: c?.dernierSyncAt ?? null,
      dernierStatut: c?.dernierStatut ?? 'jamais',
      dernierMessage: c?.dernierMessage ?? null,
      ouvertsParGravite,
      parStatut,
      decouvertesAValider,
    }
  }, {
    can: { category: 'audit-surface', level: 'read' },
    detail: {
      summary: 'Compteurs de l\'audit de surface : constats ouverts par gravité, statuts, découvertes à valider.',
      description: 'Les découvertes sont comptées à part (`decouvertesAValider`) et n\'entrent pas dans les constats. '
        + '`configure: false` signifie qu\'aucun constat ne peut arriver — zéro constat ne veut alors rien dire.',
    },
  })

  .get('/constats', async ({ query, status }) => {
    if (query.statut && !dansListe(STATUTS_CONSTAT, query.statut)) return status(400, `Statut inconnu : ${query.statut}`)
    if (query.gravite && !dansListe(GRAVITES_CONSTAT, query.gravite)) return status(400, `Gravité inconnue : ${query.gravite}`)
    if (query.categorie && !dansListe(CATEGORIES_CONSTAT, query.categorie)) return status(400, `Catégorie inconnue : ${query.categorie}`)

    const conditions = [sql`${constat.categorie} <> 'decouverte'`]
    if (dansListe(STATUTS_CONSTAT, query.statut)) conditions.push(eq(constat.statut, query.statut))
    if (dansListe(GRAVITES_CONSTAT, query.gravite)) conditions.push(eq(constat.gravite, query.gravite))
    if (dansListe(CATEGORIES_CONSTAT, query.categorie)) conditions.push(eq(constat.categorie, query.categorie))
    if (query.serviceId) conditions.push(eq(constat.serviceId, query.serviceId))

    // La gravité d'abord, dans l'ordre du format et non l'ordre alphabétique : « critique »
    // avant « élevée », pas « critique » avant « faible » avant « info » avant « moyenne ».
    const lignes = await db.select().from(constat).where(and(...conditions))
      .orderBy(sql`array_position(array['critique','elevee','moyenne','faible','info']::text[], ${constat.gravite}::text)`, desc(constat.dernierReleveLe))
    const page = paginerEnMemoire(query, lignes)
    return Array.isArray(page)
      ? { total: lignes.length, resultats: page }
      : { total: page.total, page: page.page, pageSize: page.pageSize, resultats: page.rows }
  }, {
    can: { category: 'audit-surface', level: 'read' },
    query: t.Object({
      ...SCHEMA_PAGINATION,
      statut: t.Optional(t.String()),
      gravite: t.Optional(t.String()),
      categorie: t.Optional(t.String()),
      serviceId: t.Optional(t.String()),
    }),
    detail: { summary: 'Constats du moteur, hors découvertes, par gravité décroissante.' },
  })

  .post('/constats/:id/decision', async ({ params, body, request, status }) => {
    const [c] = await db.select().from(constat).where(eq(constat.id, params.id)).limit(1)
    if (!c) return status(404, 'Constat introuvable')
    if (c.categorie === 'decouverte') return status(400, 'Une découverte se traite par « inscrire » ou « écarter ».')
    const vers = transition(c.statut, body.action)
    if (!vers) return status(409, `Action « ${body.action} » impossible depuis le statut « ${c.statut} ».`)

    const maintenant = new Date()
    const patch: Partial<typeof constat.$inferInsert> = {
      statut: vers, decisionPar: await auteurDecision(request.headers), decisionLe: maintenant, updatedAt: maintenant,
    }
    if (body.action === 'accepter') {
      // UNE ACCEPTATION SANS MOTIF NI ÉCHÉANCE N'EST PAS UNE DÉCISION, c'est un oubli daté.
      const motif = body.motif?.trim()
      const echeance = body.echeance?.trim()
      if (!motif) return status(400, 'Accepter un risque demande un motif.')
      if (!echeance || !/^\d{4}-\d{2}-\d{2}$/.test(echeance) || echeance <= maintenant.toISOString().slice(0, 10)) {
        return status(400, 'Accepter un risque demande une échéance future : une acceptation n\'est pas perpétuelle.')
      }
      patch.acceptationMotif = motif
      patch.acceptationEcheance = echeance
    }
    if (body.action === 'corriger') patch.corrigeLe = maintenant
    if (body.action === 'verifier') patch.retesteLe = maintenant
    if (body.action === 'rouvrir') patch.reouvertLe = maintenant

    const [maj] = await db.update(constat).set(patch).where(eq(constat.id, c.id)).returning()
    return maj
  }, {
    can: { category: 'audit-surface', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({
      action: t.Union([t.Literal('accepter'), t.Literal('corriger'), t.Literal('verifier'), t.Literal('rouvrir')]),
      motif: t.Optional(t.String()),
      echeance: t.Optional(t.String()),
    }),
    detail: {
      summary: 'Décision sur un constat : accepter le risque, déclarer corrigé, vérifier la correction, rouvrir.',
      description: '`accepter` exige un motif et une échéance future. `corriger` est une déclaration : la correction '
        + 'n\'est confirmée que par le moteur (actif re-relevé sans le constat) ou par `verifier`. Un constat corrigé '
        + 'que le moteur revoit se rouvre de lui-même.',
    },
  })

  // --- Découvertes ---------------------------------------------------------------------
  .get('/decouvertes', async ({ query, status }) => {
    const traitement = query.traitement ?? 'a_valider'
    if (!dansListe(TRAITEMENTS, traitement)) return status(400, `Traitement inconnu : ${traitement}`)
    return db.select().from(constat)
      .where(and(eq(constat.categorie, 'decouverte'), eq(constat.traitement, traitement)))
      .orderBy(desc(constat.dernierReleveLe))
  }, {
    can: { category: 'audit-surface', level: 'read' },
    query: t.Object({ traitement: t.Optional(t.String()) }),
    detail: { summary: 'Découvertes du moteur, à valider par défaut.' },
  })

  .post('/decouvertes/:id/inscrire', async ({ params, body, request, status }) => {
    const [d] = await db.select().from(constat).where(eq(constat.id, params.id)).limit(1)
    if (!d || d.categorie !== 'decouverte') return status(404, 'Découverte introuvable')
    if (d.traitement !== 'a_valider') return status(409, `Découverte déjà traitée (${d.traitement}).`)
    // LE PROPRIÉTAIRE EST OBLIGATOIRE À L'ENTRÉE. Un site inscrit sans propriétaire est un
    // site dont personne ne répondra le jour où il faudra agir.
    const [p] = await db.select({ id: personne.id }).from(personne).where(eq(personne.id, body.proprietaireId)).limit(1)
    if (!p) return status(400, 'Un propriétaire est obligatoire, et doit exister dans l\'annuaire.')

    const port = d.actifPort ?? 443
    const [cree] = await db.insert(serviceExpose).values({
      hote: d.actifHote, port, libelle: body.libelle?.trim() || null, proprietaireId: p.id,
      notes: `Inscrit depuis une découverte du moteur d'audit : ${d.titre}`,
    }).onConflictDoNothing().returning({ id: serviceExpose.id })
    const serviceId = cree?.id
      ?? (await db.select({ id: serviceExpose.id }).from(serviceExpose)
        .where(and(eq(serviceExpose.hote, d.actifHote), eq(serviceExpose.port, port))).limit(1))[0]?.id
      ?? null

    const maintenant = new Date()
    await db.update(constat).set({
      traitement: 'inscrit', serviceId,
      traitementMotif: cree ? 'Inscrit dans les sites et services.' : 'Déjà présent dans les sites et services au moment de l\'inscription.',
      decisionPar: await auteurDecision(request.headers), decisionLe: maintenant, updatedAt: maintenant,
    }).where(eq(constat.id, d.id))
    // Les autres constats du même hôte rejoignent la fiche qu'on vient de créer.
    if (serviceId) {
      await db.update(constat).set({ serviceId })
        .where(and(eq(constat.actifHote, d.actifHote), isNull(constat.serviceId), or(isNull(constat.actifPort), eq(constat.actifPort, port))))
    }
    return { ok: true, serviceId, cree: !!cree }
  }, {
    can: { category: 'audit-surface', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ proprietaireId: t.String(), libelle: t.Optional(t.String()) }),
    detail: { summary: 'Inscrit une découverte dans les sites et services, avec son propriétaire.' },
  })

  .post('/decouvertes/:id/ecarter', async ({ params, body, request, status }) => {
    const [d] = await db.select().from(constat).where(eq(constat.id, params.id)).limit(1)
    if (!d || d.categorie !== 'decouverte') return status(404, 'Découverte introuvable')
    if (d.traitement !== 'a_valider') return status(409, `Découverte déjà traitée (${d.traitement}).`)
    const motif = body.motif.trim()
    // Écarter sans motif, c'est oublier : dans un an, personne ne saura si l'actif était
    // hors périmètre, chez un tiers, ou simplement ignoré.
    if (!motif) return status(400, 'Écarter une découverte demande un motif.')
    const maintenant = new Date()
    await db.update(constat).set({
      traitement: 'ecarte', traitementMotif: motif,
      decisionPar: await auteurDecision(request.headers), decisionLe: maintenant, updatedAt: maintenant,
    }).where(eq(constat.id, d.id))
    return { ok: true }
  }, {
    can: { category: 'audit-surface', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ motif: t.String() }),
    detail: { summary: 'Écarte une découverte, avec son motif.' },
  })

  // --- Tableau de bord, rapport, incidents --------------------------------------------------
  .get('/tableau', async () => {
    const constats = await constatsPourRapport(['ouvert'])
    // « Vérifié de l'intérieur » sur les services SENSIBLES : c'est là que l'absence de
    // vérification compte. La règle de sensibilité est celle des signalements, pas une copie.
    const services = await db.select({
      classement: serviceExpose.classement, paiementEnLigne: serviceExpose.paiementEnLigne,
      donneesPersonnelles: serviceExpose.donneesPersonnelles, verificationInterieureLe: serviceExpose.verificationInterieureLe,
    }).from(serviceExpose).where(eq(serviceExpose.surveille, true))
    const sensibles = services.filter(sv => estSensible(sv))
    return {
      ouverts: constats.length,
      parComposante: matrice(constats, 'composante'),
      parProprietaire: matrice(constats, 'proprietaire'),
      parClassement: matrice(constats, 'classement'),
      verificationInterieure: {
        services: services.length,
        verifies: services.filter(sv => sv.verificationInterieureLe).length,
        sensibles: sensibles.length,
        sensiblesVerifies: sensibles.filter(sv => sv.verificationInterieureLe).length,
      },
    }
  }, {
    can: { category: 'audit-surface', level: 'read' },
    detail: {
      summary: 'Constats ouverts par composante, par propriétaire et par classement, et vérifications de l\'intérieur.',
      description: 'Trois partitions des mêmes constats ouverts (hors découvertes) : la somme des `total` de chacune '
        + 'vaut `ouverts`. La composante est celle du propriétaire du service. Les manques ont leur ligne : '
        + '« (hors inventaire) », « (sans propriétaire désigné) », « (propriétaire sans composante) », « (non classé) ».',
    },
  })

  .get('/rapport', async ({ query, status }) => {
    const par = query.par === 'proprietaire' ? 'proprietaire' as const : 'composante' as const
    const statuts = (query.statuts ?? 'ouvert,accepte,corrige').split(',').map(x => x.trim()).filter(Boolean)
    const inconnu = statuts.find(x => !dansListe(STATUTS_CONSTAT, x))
    if (inconnu) return status(400, `Statut inconnu : ${inconnu}`)
    return {
      par,
      statuts,
      genereLe: new Date().toISOString(),
      lignes: lignesRapport(await constatsPourRapport(statuts as StatutConstat[]), par),
    }
  }, {
    can: { category: 'audit-surface', level: 'read' },
    query: t.Object({ par: t.Optional(t.String()), statuts: t.Optional(t.String()) }),
    detail: {
      summary: 'Rapport des constats par composante ou par propriétaire, prêt à exporter.',
      description: 'Par défaut : ouverts, acceptés et déclarés corrigés — un risque accepté fait partie de ce qu\'on '
        + 'transmet. Les groupes nommés (hors inventaire, sans propriétaire) viennent en fin.',
    },
  })

  /**
   * LES INCIDENTS SNIFF où ce constat pourrait se rattacher. La jointure est celle qui relie
   * déjà les deux applications : l'identifiant GLPI de la machine.
   */
  .get('/constats/:id/incidents', async ({ params, status }) => {
    const [c] = await db.select({ id: constat.id, serviceId: constat.serviceId }).from(constat).where(eq(constat.id, params.id)).limit(1)
    if (!c) return status(404, 'Constat introuvable')
    if (!c.serviceId) {
      return { rapprochable: false, motif: 'Constat hors inventaire : aucun service, donc aucun serveur ni identifiant GLPI pour interroger Sniff.', incidents: [] }
    }
    const [sv] = await db.select({ serveurId: serviceExpose.serveurId }).from(serviceExpose).where(eq(serviceExpose.id, c.serviceId)).limit(1)
    if (!sv?.serveurId) {
      return { rapprochable: false, motif: 'Le service n\'est rattaché à aucun serveur : renseignez son serveur sur la fiche pour retrouver ses incidents Sniff.', incidents: [] }
    }
    const [machine] = await db.select({ glpiId: glpiMachine.glpiId }).from(glpiMachine).where(eq(glpiMachine.cibleId, sv.serveurId)).limit(1)
    if (!machine) {
      return { rapprochable: false, motif: 'Le serveur du service ne vient pas de GLPI : sans identifiant GLPI, il n\'a pas de correspondant chez Sniff.', incidents: [] }
    }
    const [cfg] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, 'connecteur-slowpoke-singleton')).limit(1)
    const cle = dechiffrer(cfg?.cleService)
    if (!cfg?.url || !cle || !cfg.actif) {
      return status(503, 'Le connecteur Sniff est inactif ou non configuré : les incidents ne peuvent pas être lus. Ce n\'est pas l\'absence d\'incident.')
    }
    try {
      const incidents = await lireIncidentsMachine({ url: cfg.url, cleService: cle }, machine.glpiId, { limite: 50 })
      return { rapprochable: true, glpiId: machine.glpiId, motif: null, incidents }
    }
    catch (e) {
      return status(502, e instanceof Error ? e.message : String(e))
    }
  }, {
    can: { category: 'audit-surface', level: 'read' },
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Incidents Sniff de la machine qui porte le service du constat (jointure par identifiant GLPI).' },
  })

  .post('/constats/:id/incident', async ({ params, body, request, status }) => {
    const [c] = await db.select({ id: constat.id }).from(constat).where(eq(constat.id, params.id)).limit(1)
    if (!c) return status(404, 'Constat introuvable')
    const id = body.sniffIncidentId?.trim() || null
    if (id && id.length > 100) return status(400, 'Identifiant d\'incident invalide.')
    const maintenant = new Date()
    const [maj] = await db.update(constat).set({
      sniffIncidentId: id,
      incidentLiePar: id ? await auteurDecision(request.headers) : null,
      incidentLieLe: id ? maintenant : null,
      updatedAt: maintenant,
    }).where(eq(constat.id, c.id)).returning()
    return maj
  }, {
    can: { category: 'audit-surface', level: 'write' },
    params: t.Object({ id: t.String() }),
    body: t.Object({ sniffIncidentId: t.Nullable(t.String()) }),
    detail: {
      summary: 'Relie un constat à un incident Sniff existant, ou le délie (`null`).',
      description: 'Le Catalogue ne crée pas d\'incident : le connecteur Sniff est en lecture seule. L\'incident se déclare '
        + 'dans Sniff, puis se relie ici. Auteur et date de la liaison sont gardés.',
    },
  })
