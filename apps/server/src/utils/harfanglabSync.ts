// Moteur de synchronisation HarfangLab → Catalogue. LECTURE SEULE.
import { and, eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  connecteurHarfanglab, connecteurSlowpoke, harfanglabAgent, harfanglabMoteurSnapshot, whitelist,
  edrRegle, edrRuleset,
} from '@catalogue/database/tables'
import {
  parcourirAgents, parcourirRegles, parcourirRulesets,
  type HarfanglabAgent, type MoteurEdr,
} from './harfanglabClient'
import { lireReglesHarfanglab, lireRevuesListesBlanches, type RevueListeBlancheSniff, type RegleHarfanglabSniff } from './slowpokeClient'
import { estTechnique, echeanceDeSniff, etatEcheance } from './whitelistsEcheance'
import { dechiffrer } from './secrets'

const SINGLETON = 'connecteur-harfanglab-singleton'
const SINGLETON_SNIFF = 'connecteur-slowpoke-singleton'

export type CompteursHarfanglab = {
  agents: number
  agentsEnLigne: number
  pages: number
  tronque: boolean
  whitelistsHarfanglab: number
  exclusionsSniff: number
  whitelistsTotal: number
  whitelistsRapprochees: number
  whitelistsAmbigues: number
  whitelistsSansMotif: number
  whitelistsEchues: number
  whitelistsTechniques: number
  whitelistsEditeur: number
  whitelistsSansDate: number
  whitelistsDisparues: number
  whitelistsDisparuesAvecExclusion: number
  whitelistsTronquees: boolean
  whitelistsErreur: string | null
  whitelistsEtatSniff: string | null
  /** Règles dont l'échéance vient d\'une revue isolée de Sniff (règle posée hors incident). */
  whitelistsRevuesSniff: number
  /** `true` : l'instance Sniff ne connaît pas encore les revues isolées ; le Catalogue garde ses échéances. */
  revuesSniffIndisponibles: boolean
  rulesets: number
  regles: Record<string, number>
  reglesTronquees: string[]
  politiques: number
  changementsMoteurs: number
}

export async function lireConfigHarfanglab() {
  const [row] = await db.select().from(connecteurHarfanglab).where(eq(connecteurHarfanglab.id, SINGLETON)).limit(1)
  if (row) return row
  const [cree] = await db.insert(connecteurHarfanglab).values({ id: SINGLETON }).onConflictDoNothing().returning()
  return cree ?? (await db.select().from(connecteurHarfanglab).where(eq(connecteurHarfanglab.id, SINGLETON)).limit(1))[0]
}

const dateOuNull = (s: string | null | undefined) => {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

// --- Flotte -------------------------------------------------------------------------
async function enregistrerAgents(lot: HarfanglabAgent[], compteurs: CompteursHarfanglab): Promise<void> {
  for (const a of lot) {
    const valeurs = {
      hostname: a.hostname, machineSerial: a.machineSerial, hardwareAddress: a.hardwareAddress,
      statut: a.statut, lastseen: dateOuNull(a.lastseen), version: a.version, ostype: a.ostype,
      politiqueId: a.politiqueId, politiqueNom: a.politiqueNom,
      entiteEdr: a.entiteEdr, infosAdditionnelles: a.infosAdditionnelles,
      modes: a.modes, revisions: a.revisions, vuAuSync: true, updatedAt: new Date(),
    }
    const maj = await db.update(harfanglabAgent).set(valeurs).where(eq(harfanglabAgent.agentId, a.agentId)).returning({ id: harfanglabAgent.id })
    if (!maj.length) {
      await db.insert(harfanglabAgent).values({ agentId: a.agentId, ...valeurs }).onConflictDoNothing({ target: harfanglabAgent.agentId })
    }
    compteurs.agents++
    if (a.statut === 'online') compteurs.agentsEnLigne++
  }
}

// --- Instantané des moteurs ----------------------------------------------------------
// Un instantané par POLITIQUE, comparé au précédent de la même politique.
type Changement = { champ: string, avant: unknown, apres: unknown }

export function comparerMoteurs(avant: Record<string, unknown> | null, apres: Record<string, unknown>): Changement[] {
  // Premier relevé : on ne compare rien. `null` (jamais comparé) et `[]` (comparé, rien
  // n'a bougé) ne doivent surtout pas se confondre.
  if (!avant) return []
  const champs = new Set([...Object.keys(avant), ...Object.keys(apres)])
  const out: Changement[] = []
  for (const champ of champs) {
    const a = avant[champ] ?? null
    const b = apres[champ] ?? null
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ champ, avant: a, apres: b })
  }
  return out
}

async function releverMoteurs(agents: HarfanglabAgent[], compteurs: CompteursHarfanglab): Promise<void> {
  // Une politique est décrite à l'identique sur tous ses agents : un exemplaire suffit.
  const parPolitique = new Map<string, HarfanglabAgent>()
  for (const a of agents) if (a.politiqueId && !parPolitique.has(a.politiqueId)) parPolitique.set(a.politiqueId, a)
  compteurs.politiques = parPolitique.size

  for (const [politiqueId, exemplaire] of parPolitique) {
    const [precedent] = await db.select().from(harfanglabMoteurSnapshot)
      .where(eq(harfanglabMoteurSnapshot.politiqueId, politiqueId))
      .orderBy(harfanglabMoteurSnapshot.releveLe)
      .limit(1)

    const modes = exemplaire.modes as unknown as Record<string, unknown>
    const changements = comparerMoteurs((precedent?.modes ?? null) as Record<string, unknown> | null, modes)
    compteurs.changementsMoteurs += changements.length

    await db.insert(harfanglabMoteurSnapshot).values({
      politiqueId,
      politiqueNom: exemplaire.politiqueNom,
      modes,
      revisions: exemplaire.revisions,
      // `null` au premier relevé, tableau (même vide) ensuite : la nuance se lit.
      changements: precedent ? changements : null,
    })
  }
}

// --- Listes blanches ------------------------------------------------------------------
// LA SOURCE EST SNIFF, plus HarfangLab directement. Le rapprochement règle ↔ exclusion est un
// jugement, y compris manuel.
async function enregistrerWhitelists(
  regles: RegleHarfanglabSniff[],
  marqueurs: string[],
  compteurs: CompteursHarfanglab,
  /** Revues isolées de Sniff, par référence de règle. `null` : instance Sniff qui ne les connaît pas. */
  revues: Map<string, RevueListeBlancheSniff> | null,
): Promise<void> {
  compteurs.whitelistsTotal = regles.length

  await db.update(whitelist).set({ vueAuSync: false })
  const maintenant = new Date()

  for (const r of regles) {
    const [existante] = await db.select().from(whitelist)
      .where(eq(whitelist.harfanglabId, r.ref)).limit(1)

    const libelle = r.libelle ?? r.commentaire ?? `Règle ${r.ref}`

    // LE MOTIF NE VIENT QUE DE L'EXCLUSION. L'EDR n'en stocke aucun.
    const dateCreation = dateOuNull(r.creeeLe)
    // L'exclusion d'abord, la revue isolée à défaut : l'arbitrage est écrit une seule fois.
    const porteur = echeanceDeSniff(r.exclusion, revues?.get(r.ref))
    const echeanceSniff = porteur.echeance
    const motif = porteur.motif
    if (porteur.origine === 'revue') compteurs.whitelistsRevuesSniff++

    // La prolongation décidée ICI ne survit que tant que le Catalogue porte l'échéance.
    const dateRevision = echeanceSniff ? null : (existante?.dateRevision ?? null)

    const etat = etatEcheance({
      dateCreation,
      dateRevision,
      technique: estTechnique(r.tags ?? [], marqueurs),
      fourniParEditeur: r.fourniParEditeur,
      presente: r.presente,
      echeanceSniff,
    })

    const valeurs = {
      source: (r.exclusion ? 'les_deux' : 'harfanglab') as 'les_deux' | 'harfanglab',
      harfanglabId: r.ref,
      sniffExclusionId: r.exclusion?.id ?? null,
      sniffIncidentId: r.exclusion?.incidentId ?? null,
      // L'appariement vient de Sniff : il est CERTAIN ou il n'existe pas. Plus d'indice.
      certitudeRapprochement: (r.exclusion ? 'certain' : null) as 'certain' | null,
      libelle,
      criteres: (r.criteres ?? null) as never,
      cible: r.cible,
      regleSigma: null,
      regleCorrelation: null,
      motif,
      active: r.active,
      dateCreation,
      dateRevision,
      dateExpirationOutil: null,
      technique: etat.sansEcheance === 'technique',
      fourniParEditeur: r.fourniParEditeur,
      presente: r.presente,
      echeanceSniff,
      sniffRevueId: porteur.revueId,
      tags: r.tags ?? [],
      champTags: r.champTags,
      vueAuSync: true,
      updatedAt: maintenant,
    }
    if (existante) await db.update(whitelist).set(valeurs).where(eq(whitelist.id, existante.id))
    else await db.insert(whitelist).values(valeurs)

    if (r.exclusion) compteurs.whitelistsRapprochees++
    // Seules les règles de l'établissement : un « sans motif » qui compte les règles de
    // l'éditeur ne peut jamais descendre, donc ne se lit plus.
    if (!r.fourniParEditeur && !motif?.trim()) compteurs.whitelistsSansMotif++
    if (r.fourniParEditeur) compteurs.whitelistsEditeur++
    if (etat.sansEcheance === 'technique') compteurs.whitelistsTechniques++
    if (etat.sansEcheance === 'sans_date') compteurs.whitelistsSansDate++
    if (!r.presente) compteurs.whitelistsDisparues++
    // Une règle disparue de l'EDR mais encore rattachée à une exclusion active : une
    // détection est revenue sans que personne l'ait décidé.
    if (!r.presente && r.exclusion) compteurs.whitelistsDisparuesAvecExclusion++
    if (r.active && etat.echeance && etat.echeance < maintenant) compteurs.whitelistsEchues++
  }
}

// --- Contenu des moteurs : jeux de règles et règles ----------------------------------
// Ce volet n'a NI durée de validité NI revue, et c'est délibéré : une règle de détection n'est
// pas un angle mort qu'on ouvre pour un temps, elle EST la couverture.
const MOTEURS: MoteurEdr[] = ['yara', 'sigma', 'ioc', 'correlation', 'driverblock']

async function releverContenuMoteurs(acces: { url: string, jeton: string }, compteurs: CompteursHarfanglab) {
  // Les jeux de règles d'abord : ils portent le nom lisible auquel les règles renvoient.
  const rulesets = await parcourirRulesets(acces)
  compteurs.rulesets = rulesets.length
  for (const r of rulesets) {
    const valeurs = {
      moteur: r.moteur, nom: r.nom, description: r.description, actif: r.actif,
      detectionPoste: r.detectionPoste, blocageAgent: r.blocageAgent,
      quarantaineAgent: r.quarantaineAgent, compteurs: r.compteurs, politiques: r.politiques,
      dateCreation: dateOuNull(r.dateCreation), dateMaj: dateOuNull(r.dateMaj),
      vuAuSync: new Date(),
    }
    const [existant] = await db.select().from(edrRuleset).where(eq(edrRuleset.rulesetId, r.rulesetId)).limit(1)
    if (existant) await db.update(edrRuleset).set(valeurs).where(eq(edrRuleset.id, existant.id))
    else await db.insert(edrRuleset).values({ rulesetId: r.rulesetId, ...valeurs })
  }

  for (const moteur of MOTEURS) {
    // L'échec d'UN moteur ne doit pas emporter les quatre autres. Le moteur en échec garde son
    // état précédent, et le message de synchronisation le NOMME : un relevé partiel annoncé
    // vaut mieux qu'un relevé partiel qui se prend pour complet.
    try {
      const { regles, tronque } = await parcourirRegles(acces, moteur)
      compteurs.regles[moteur] = regles.length
      if (tronque) compteurs.reglesTronquees.push(moteur)
      for (const r of regles) {
        const valeurs = {
          nom: r.nom, description: r.description, contenu: r.contenu,
          typeIndicateur: r.typeIndicateur, valeur: r.valeur, actif: r.actif,
          etat: r.etat, etatEffectif: r.etatEffectif, sourceId: r.sourceId,
          sourceNom: r.sourceNom, fourniParEditeur: r.fourniParEditeur,
          rulesets: r.rulesets, brut: r.brut,
          dateCreation: dateOuNull(r.dateCreation), dateMaj: dateOuNull(r.dateMaj),
          vuAuSync: new Date(),
        }
        const [existante] = await db.select().from(edrRegle)
          .where(and(eq(edrRegle.moteur, moteur), eq(edrRegle.harfanglabId, r.harfanglabId)))
          .limit(1)
        if (existante) await db.update(edrRegle).set(valeurs).where(eq(edrRegle.id, existante.id))
        else await db.insert(edrRegle).values({ moteur, harfanglabId: r.harfanglabId, ...valeurs })
      }
    }
    catch (e) {
      compteurs.reglesTronquees.push(`${moteur} (échec)`)
      console.warn(`[harfanglab] lecture des règles ${moteur} en échec :`, e instanceof Error ? e.message : e)
    }
  }
}

/** Synchronisation complète. Lève en cas d'échec, après avoir noté le motif. */
export async function synchroniserHarfanglab(): Promise<CompteursHarfanglab> {
  const cfg = await lireConfigHarfanglab()
  const jeton = dechiffrer(cfg?.jeton)
  if (!cfg?.url || !jeton) {
    throw new Error('Connecteur HarfangLab non configuré (URL et jeton requis).')
  }

  await db.update(connecteurHarfanglab).set({ dernierStatut: 'en_cours' }).where(eq(connecteurHarfanglab.id, SINGLETON))
  await db.update(harfanglabAgent).set({ vuAuSync: false })

  const compteurs: CompteursHarfanglab = {
    agents: 0, agentsEnLigne: 0, pages: 0, tronque: false,
    whitelistsHarfanglab: 0, exclusionsSniff: 0, whitelistsTotal: 0,
    whitelistsRapprochees: 0, whitelistsAmbigues: 0, whitelistsSansMotif: 0, whitelistsEchues: 0, whitelistsTechniques: 0,
    whitelistsEditeur: 0, whitelistsSansDate: 0, whitelistsDisparues: 0,
    whitelistsDisparuesAvecExclusion: 0, whitelistsTronquees: false,
    whitelistsErreur: null, whitelistsEtatSniff: null,
    whitelistsRevuesSniff: 0, revuesSniffIndisponibles: false,
    politiques: 0, changementsMoteurs: 0,
    rulesets: 0, regles: {}, reglesTronquees: [],
  }

  try {
    const acces = { url: cfg.url, jeton }
    // Marqueurs des règles techniques, déclarés dans les réglages du connecteur.
    const marqueurs = (cfg.marqueursTechniques ?? []) as string[]
    const tous: HarfanglabAgent[] = []
    const parcours = await parcourirAgents(acces, async (lot) => {
      tous.push(...lot)
      await enregistrerAgents(lot, compteurs)
    })
    compteurs.pages = parcours.pages
    compteurs.tronque = parcours.tronque
    if (parcours.tronque) {
      // Une troncature muette ferait passer un relevé partiel pour complet.
      console.warn(`[harfanglab] pagination interrompue au plafond de pages : le relevé des agents est PARTIEL (${compteurs.agents} sur ${parcours.total}).`)
    }

    await releverMoteurs(tous, compteurs)
    await releverContenuMoteurs(acces, compteurs)

    // LISTES BLANCHES : lues chez SNIFF, plus chez HarfangLab. Sniff est la source unique de la
    // lecture de l'EDR et de l'appariement.
    const [cfgSniff] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, SINGLETON_SNIFF)).limit(1)
    const cleSniff = dechiffrer(cfgSniff?.cleService)
    if (cfgSniff?.url && cleSniff && cfgSniff.actif) {
      try {
        const inv = await lireReglesHarfanglab({ url: cfgSniff.url, cleService: cleSniff })
        compteurs.whitelistsHarfanglab = inv.total
        compteurs.whitelistsTronquees = inv.tronque
        compteurs.whitelistsEtatSniff = inv.etat?.dernierBilan ?? null
        // Les revues isolées : la moitié du registre que Sniff porte depuis 1fae1c7.
        const revues = await lireRevuesListesBlanches({ url: cfgSniff.url, cleService: cleSniff })
        compteurs.revuesSniffIndisponibles = revues === null
        await enregistrerWhitelists(inv.regles, marqueurs, compteurs, revues)
      }
      catch (e) {
        // Sniff injoignable ne fait pas échouer le reste du relevé EDR — agents, moteurs et
        // contenu des règles restent lus.
        compteurs.whitelistsErreur = e instanceof Error ? e.message : String(e)
        console.warn(`[harfanglab] inventaire des listes blanches indisponible chez Sniff : ${compteurs.whitelistsErreur}`)
      }
    }
    else {
      compteurs.whitelistsErreur = 'Connecteur Sniff inactif ou non configuré : les listes blanches ne peuvent pas être relevées.'
    }

    const message = [
      `${compteurs.agents} agent(s) — ${compteurs.agentsEnLigne} en ligne`,
      `${compteurs.whitelistsTotal} liste(s) blanche(s) dont ${compteurs.whitelistsRapprochees} rapprochée(s) de Sniff`,
      compteurs.whitelistsEchues ? `${compteurs.whitelistsEchues} ÉCHUE(S)` : '',
      compteurs.whitelistsEditeur ? `${compteurs.whitelistsEditeur} fournie(s) par l'éditeur, sans échéance` : '',
      compteurs.whitelistsSansDate ? `${compteurs.whitelistsSansDate} sans date de création` : '',
      compteurs.whitelistsDisparuesAvecExclusion ? `${compteurs.whitelistsDisparuesAvecExclusion} DISPARUE(S) de l'EDR mais encore exclue(s)` : '',
      compteurs.whitelistsErreur ? `listes blanches NON RELEVÉES : ${compteurs.whitelistsErreur}` : '',
      compteurs.whitelistsTronquees ? 'inventaire des listes blanches PARTIEL' : '',
      compteurs.changementsMoteurs ? `${compteurs.changementsMoteurs} CHANGEMENT(S) de moteur` : '',
      `${compteurs.rulesets} jeu(x) de règles, ${Object.values(compteurs.regles).reduce((a, b) => a + b, 0)} règle(s)`,
      compteurs.reglesTronquees.length ? `relevé INCOMPLET pour : ${compteurs.reglesTronquees.join(', ')}` : '',
      compteurs.tronque ? 'relevé PARTIEL (plafond de pages atteint)' : '',
    ].filter(Boolean).join(' · ') + '.'

    await db.update(connecteurHarfanglab)
      .set({ dernierStatut: 'ok', dernierMessage: message, dernierSyncAt: new Date(), dernierComptes: compteurs })
      .where(eq(connecteurHarfanglab.id, SINGLETON))
    return compteurs
  }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.update(connecteurHarfanglab)
      .set({ dernierStatut: 'erreur', dernierMessage: message, dernierSyncAt: new Date() })
      .where(eq(connecteurHarfanglab.id, SINGLETON))
    throw e
  }
}
