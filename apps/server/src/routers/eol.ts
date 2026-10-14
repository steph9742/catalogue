import { Elysia, t } from 'elysia'
import { and, eq, inArray, isNotNull, isNull, lt, ne, or, sql, type Column } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { glpiMachine, posteTravail, serveur, technologie } from '@catalogue/database/tables'
import { machinesSousIncident, type MarqueIncident } from '../utils/incidentsOuverts'
import { betterAuth } from '../middleware/auth'
import { eolConnu } from '../utils/eolConnu'
import { cleTechnologie, cyclePourOs, cyclesDuProduit, estContinue, produitDe, type CycleEol } from '../utils/eolApi'
import { partitionEnMemoire } from '../utils/partition'
import { enrichirTechnologie } from '../utils/eolTechnologie'
import { FAMILLES_DU_GROUPE, FAMILLES_OS, GROUPES_OS, familleOs, groupeOs, type FamilleOs } from '../utils/familleOs'

// FIN DE VIE DES SYSTÈMES — référentiel construit depuis le parc réel. Le problème résolu : la
// table `technologie` porte un champ « fin de vie » exploité par les alertes et le tableau de
// bord, mais personne ne va saisir à la main les systèmes de 8800 machines.

const CATEGORIE_OS = 'os' as const

// Statut de support d'une référence du référentiel OS — logique UNIQUE, partagée entre la page
// « Fin de vie », la décoration des catalogues machines et les périmètres.
type RefEol = { finDeVie: string | null, finDeVieEtendue: string | null, sourceEol: string | null }
/**
 * Les six statuts, DÉCLARÉS PLUTÔT QUE DÉCRITS. C'était une union de littéraux, et le filtre
 * `?eolStatut=` en recopiait la liste : une union de types ne s'énumère pas à l\'exécution.
 */
export const STATUTS_EOL = ['depasse', 'etendu', 'bientot', 'ok', 'supporte', 'inconnu'] as const

/**
 * LES STATUTS PAR GRAVITÉ DÉCROISSANTE — le seul ordre qui serve à agréger.
 */
export const GRAVITE_EOL = ['depasse', 'bientot', 'etendu', 'inconnu', 'ok', 'supporte'] as const

/** Le pire statut d'un ensemble. `null` quand l\'ensemble est vide — jamais « supporté ». */
export function pireStatutEol(statuts: readonly StatutEol[]): StatutEol | null {
  return GRAVITE_EOL.find(g => statuts.includes(g)) ?? null
}
export type StatutEol = typeof STATUTS_EOL[number]

export function statutEol(ref: RefEol | undefined, aujourdhui: string, dansUnAn: string): StatutEol {
  const finDeVie = ref?.finDeVie ?? null
  // Ordre d'évaluation : sans date → inconnu (sauf source qui confirme l'absence de date :
  // supporté) ; standard dépassée mais étendue en cours → « sous contrat étendu » (et non hors
  // support) ; sinon dépassé/bientôt/ok.
  if (!finDeVie) return ref?.sourceEol === 'api' ? 'supporte' : 'inconnu'
  if (finDeVie < aujourdhui) {
    return ref?.finDeVieEtendue && ref.finDeVieEtendue >= aujourdhui ? 'etendu' : 'depasse'
  }
  return finDeVie < dansUnAn ? 'bientot' : 'ok'
}

/**
 * LE MÊME STATUT, EN SQL — pour filtrer et dénombrer, ce que la version JavaScript ne permet
 * pas.
 */
export function expressionEolStatut(cle: Column, aujourdhui: string, dansUnAn: string) {
  return sql<StatutEol | null>`(
    select case
      when t.fin_de_vie is null then case when t.source_eol = 'api' then 'supporte' else 'inconnu' end
      when t.fin_de_vie < ${aujourdhui} then
        case when t.fin_de_vie_etendue is not null and t.fin_de_vie_etendue >= ${aujourdhui}
          then 'etendu' else 'depasse' end
      when t.fin_de_vie < ${dansUnAn} then 'bientot'
      else 'ok'
    end
    from ${technologie} t
    where t.nom = ${cle} and t.categorie = ${CATEGORIE_OS}
    limit 1)`
}

// Marque les lignes dont la machine porte un incident ouvert dans Sniff.
async function decorerIncidents(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (!rows.length) return rows
  const sousIncident = await machinesSousIncident()
  if (!sousIncident.size) return rows

  // Une fiche peut être visée par plusieurs entrées d'inventaire : on les prend toutes.
  const ids = rows.map(r => String(r.id)).filter(Boolean)
  const liens = await db
    .select({ cibleId: glpiMachine.cibleId, glpiId: glpiMachine.glpiId })
    .from(glpiMachine)
    .where(inArray(glpiMachine.cibleId, ids))

  const parCible = new Map<string, MarqueIncident>()
  for (const l of liens) {
    if (!l.cibleId) continue
    const marque = sousIncident.get(l.glpiId)
    if (!marque) continue
    const deja = parCible.get(l.cibleId)
    const ordre = ['critical', 'high', 'medium', 'low']
    if (!deja || ordre.indexOf(marque.gravite) < ordre.indexOf(deja.gravite)) parCible.set(l.cibleId, marque)
  }
  if (!parCible.size) return rows

  return rows.map((r) => {
    const marque = parCible.get(String(r.id))
    return marque ? { ...r, incidentOuvert: true, incidentGravite: marque.gravite, incidentStatut: marque.statut } : r
  })
}

export const bornes = () => ({
  aujourdhui: new Date().toISOString().slice(0, 10),
  dansUnAn: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
})

// Décoration des lignes d'un catalogue machines (serveurs, postes) : ajoute à chaque ligne
// portant un OS son statut de support (`eolStatut`) et les dates du référentiel.
export async function decorerEol(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  rows = await decorerIncidents(rows)
  if (!rows.some(r => r.os)) return rows
  const refs = await db
    .select({ nom: technologie.nom, finDeVie: technologie.finDeVie, finDeVieEtendue: technologie.finDeVieEtendue, sourceEol: technologie.sourceEol })
    .from(technologie).where(eq(technologie.categorie, CATEGORIE_OS))
  const parNom = new Map(refs.map(r => [r.nom, r]))
  const { aujourdhui, dansUnAn } = bornes()
  return rows.map((r) => {
    if (!r.os) return r
    const ref = parNom.get(cleTechnologie(r.os as string, r.osVersion as string | null))
    return {
      ...r,
      eolStatut: statutEol(ref, aujourdhui, dansUnAn),
      eolFinDeVie: ref?.finDeVie ?? null,
      eolFinDeVieEtendue: ref?.finDeVieEtendue ?? null,
    }
  })
}

/** OS distincts du parc, avec leur nombre de machines. */
async function osDuParc(): Promise<{ os: string, versionOs: string | null, machines: number }[]> {
  // Regroupement sur (nom, version) puis agrégation par CLÉ de référentiel : les systèmes dont
  // le nom ne porte pas la version (« macOS ») sont éclatés par version majeure, sans quoi une
  // seule ligne devrait représenter des situations de support opposées.
  const rows = await db
    .select({ os: glpiMachine.os, version: glpiMachine.osVersion, n: sql<number>`count(*)::int` })
    .from(glpiMachine)
    .where(isNotNull(glpiMachine.os))
    .groupBy(glpiMachine.os, glpiMachine.osVersion)

  const parCle = new Map<string, { os: string, versionOs: string | null, machines: number }>()
  for (const r of rows) {
    const nom = (r.os ?? '').trim()
    if (!nom) continue
    const cle = cleTechnologie(nom, r.version)
    const deja = parCle.get(cle)
    if (deja) deja.machines += Number(r.n)
    else parCle.set(cle, { os: cle, versionOs: r.version ?? null, machines: Number(r.n) })
  }
  return [...parCle.values()].sort((a, b) => b.machines - a.machines)
}

export const eolRouter = new Elysia({ name: 'eol' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Pilotage'] } })

  // Construit (ou complète) le référentiel des OS. Idempotent : ne recrée pas l'existant
  // et n'ÉCRASE JAMAIS une date déjà saisie — la décision humaine prime sur la table interne.
  .post('/api/eol/construire', async () => {
    const parc = await osDuParc()
    const existantes = await db
      .select({ id: technologie.id, nom: technologie.nom, finDeVie: technologie.finDeVie })
      .from(technologie)
      .where(eq(technologie.categorie, CATEGORIE_OS))
    const parNom = new Map(existantes.map(t => [t.nom, t]))

    let crees = 0
    let datesAjoutees = 0
    let sansDate = 0

    for (const { os } of parc) {
      const connu = eolConnu(os)
      const deja = parNom.get(os)

      if (!deja) {
        await db.insert(technologie)
          .values({ nom: os, categorie: CATEGORIE_OS, finDeVie: connu?.finDeVie ?? null, sourceEol: connu ? 'interne' : null })
          .onConflictDoNothing()
        crees++
        if (connu) datesAjoutees++
        else sansDate++
        continue
      }
      // Complète uniquement si la date manque (on ne réécrit pas une saisie existante).
      if (!deja.finDeVie && connu) {
        await db.update(technologie).set({ finDeVie: connu.finDeVie, sourceEol: 'interne', updatedAt: new Date() }).where(eq(technologie.id, deja.id))
        datesAjoutees++
      }
      else if (!deja.finDeVie) { sansDate++ }
    }

    return { ok: true as const, osDistincts: parc.length, crees, datesAjoutees, sansDate }
  }, { can: { category: 'technologies', level: 'write' } })

  /**
   * COMPLÈTE LES TECHNOLOGIES HORS SYSTÈMES depuis endoflife.date. `/api/eol/synchroniser` ne
   * regarde que la catégorie `os` : les technologies détectées sur les sites n'étaient
   * enrichies qu'au moment d\'un relevé, et une date de fin de support publiée entre deux
   * relevés n'apparaissait nulle part.
   */
  .post('/api/eol/enrichir-technologies', async () => {
    // `ne()` seul exclurait les lignes à catégorie NULLE, qui sont précisément celles qu'aucun
    // classement n'a encore touchées — donc celles qui ont le plus besoin d'être enrichies.
    const lignes = await db.select().from(technologie)
      .where(or(isNull(technologie.categorie), ne(technologie.categorie, CATEGORIE_OS)))

    let manuelles = 0
    let fraiches = 0
    let sansCorrespondance = 0
    let renseignees = 0

    for (const l of lignes) {
      if (l.sourceEol === 'manuel') { manuelles++; continue }
      if (l.derniereVersionReleveeLe && Date.now() - l.derniereVersionReleveeLe.getTime() < 24 * 3600 * 1000) {
        fraiches++
        continue
      }
      if (!produitDe(l.nom)) { sansCorrespondance++; continue }

      const avant = `${l.finDeVie ?? ''}|${l.finDeVieEtendue ?? ''}|${l.derniereVersionBranche ?? ''}`
      const categorie = (l.categorie ?? 'autre') as 'serveur_web' | 'langage' | 'framework' | 'autre'
      await enrichirTechnologie(l.nom, l.nom, l.version, categorie)
      // On RELIT plutôt que de croire l'appel : il ne rend qu'un identifiant, et compter une
      // réussite sans l'avoir constatée annoncerait des dates qui n'ont pas été écrites —
      // l'erreur exacte qu'on corrige ailleurs.
      const [apres] = await db.select({
        finDeVie: technologie.finDeVie,
        finDeVieEtendue: technologie.finDeVieEtendue,
        derniereVersionBranche: technologie.derniereVersionBranche,
      }).from(technologie).where(eq(technologie.id, l.id)).limit(1)
      if (apres && `${apres.finDeVie ?? ''}|${apres.finDeVieEtendue ?? ''}|${apres.derniereVersionBranche ?? ''}` !== avant) {
        renseignees++
      }
    }

    return {
      ok: true as const,
      technologies: lignes.length,
      renseignees,
      manuelles,
      fraiches,
      sansCorrespondance,
    }
  }, {
    can: { category: 'technologies', level: 'write' },
    detail: {
      summary: 'Complète les technologies hors systèmes depuis endoflife.date.',
      description: 'Ne touche jamais une date saisie à la main, ne réinterroge pas une ligne relevée '
        + 'depuis moins de 24 h, et n\'efface rien si la source est injoignable. '
        + '`sansCorrespondance` compte les technologies qu\'endoflife.date ne connaît pas : leur date '
        + 'doit être saisie à la main, et leur absence de date se lit « inconnu », jamais « supporté ».',
    },
  })

  // Complète les dates depuis endoflife.date (source publique tenue à jour).
  .post('/api/eol/synchroniser', async () => {
    const parc = await osDuParc()
    const refs = await db.select().from(technologie).where(eq(technologie.categorie, CATEGORIE_OS))
    const parNom = new Map(refs.map(r => [r.nom, r]))

    // Parc vide : il n'y a aucun système à rechercher. À distinguer absolument d'un échec
    // réseau — le message précédent accusait endoflife.date alors qu'il n'y avait rien à
    // interroger, ce qui envoyait chercher un problème de connectivité inexistant.
    if (!parc.length) {
      return {
        ok: false as const,
        message: "Aucun système d'exploitation dans l'inventaire : lancez d'abord une synchronisation GLPI, puis construisez le référentiel.",
      }
    }

    // Un appel par PRODUIT (et non par OS) : 97 systèmes se ramènent à ~8 produits.
    const produits = [...new Set(parc.map(p => produitDe(p.os)).filter(Boolean) as string[])]
    if (!produits.length) {
      return {
        ok: false as const,
        message: `Aucun des ${parc.length} systèmes du parc ne correspond à un produit connu d'endoflife.date (Windows, Debian, Ubuntu, macOS…). Les dates doivent être saisies à la main.`,
      }
    }

    const cycles = new Map<string, CycleEol[] | null>()
    for (const p of produits) cycles.set(p, await cyclesDuProduit(p))

    // Vrai échec réseau : des produits à interroger, mais AUCUNE réponse exploitable.
    const joignable = [...cycles.values()].some(c => c !== null)
    if (!joignable) {
      return {
        ok: false as const,
        message: `endoflife.date est injoignable (${produits.length} produit(s) à interroger) — les dates déjà connues sont conservées.`,
      }
    }

    let majStandard = 0
    let majEtendue = 0
    let preserveesManuelles = 0
    let nonTrouves = 0
    let datesRetirees = 0
    let supportesSansDate = 0

    for (const { os, versionOs } of parc) {
      // Publication continue (Arch, EndeavourOS…) : pas de version figée, donc pas de
      // date de fin. On l'enregistre comme tel plutôt que de laisser croire à un trou.
      if (estContinue(os)) {
        const deja = parNom.get(os)
        if (deja && deja.sourceEol !== 'manuel') {
          await db.update(technologie).set({ sourceEol: 'api', updatedAt: new Date() }).where(eq(technologie.id, deja.id))
        }
        supportesSansDate++
        continue
      }

      const produit = produitDe(os)
      const liste = produit ? cycles.get(produit) : null
      // Résolu AVANT le test de cycle : c'est lui qui permet de retirer une date devenue
      // injustifiable, et une saisie manuelle doit être écartée avant toute écriture.
      const deja = parNom.get(os)
      if (deja?.sourceEol === 'manuel') { preserveesManuelles++; continue }
      if (!produit || !liste) { nonTrouves++; continue }

      const cycle = cyclePourOs(liste, produit, os, versionOs)
      if (!cycle) {
        nonTrouves++
        // DATE DEVENUE INJUSTIFIABLE : on la RETIRE, on ne se contente pas de ne pas la
        // réécrire.
        if (deja?.finDeVie || deja?.finDeVieEtendue) {
          await db.update(technologie)
            .set({ finDeVie: null, finDeVieEtendue: null, sourceEol: null, updatedAt: new Date() })
            .where(eq(technologie.id, deja.id))
          datesRetirees++
        }
        continue
      }

      // Cycle reconnu mais AUCUNE date : l'éditeur n'en a pas encore annoncé (cas de macOS,
      // dont Apple ne publie pas les fins de support à l'avance).
      if (!cycle.eol && !cycle.etendu) {
        if (cycle.supporteSansDate) {
          if (deja) await db.update(technologie).set({ sourceEol: 'api', updatedAt: new Date() }).where(eq(technologie.id, deja.id))
          supportesSansDate++
        }
        else { nonTrouves++ }
        continue
      }

      const patch: Record<string, unknown> = { sourceEol: 'api', updatedAt: new Date() }
      if (cycle.eol) { patch.finDeVie = cycle.eol; majStandard++ }
      if (cycle.etendu) { patch.finDeVieEtendue = cycle.etendu; majEtendue++ }

      if (deja) await db.update(technologie).set(patch).where(eq(technologie.id, deja.id))
      else await db.insert(technologie).values({ nom: os, categorie: CATEGORIE_OS, ...patch } as never).onConflictDoNothing()
    }

    return { ok: true as const, produits: produits.length, majStandard, majEtendue, preserveesManuelles, supportesSansDate, nonTrouves, datesRetirees }
  }, { can: { category: 'technologies', level: 'write' } })

  // Corriger une date depuis la page « Fin de vie », sans passer par la fiche technologie :
  // c'est là qu'on voit le trou, c'est là qu'on doit pouvoir le combler.
  .patch('/api/eol/date', async ({ body, status }) => {
    const nom = body.os.trim()
    if (!nom) return status(422, { message: 'Système non précisé.' })
    const [existant] = await db.select({ id: technologie.id }).from(technologie)
      .where(and(eq(technologie.categorie, CATEGORIE_OS), eq(technologie.nom, nom))).limit(1)

    if (existant) {
      await db.update(technologie)
        .set({
          finDeVie: body.finDeVie || null,
          ...(body.finDeVieEtendue !== undefined ? { finDeVieEtendue: body.finDeVieEtendue || null } : {}),
          // Marquée « manuel » : plus aucune actualisation automatique ne l'écrasera.
          sourceEol: 'manuel',
          updatedAt: new Date(),
        })
        .where(eq(technologie.id, existant.id))
    }
    else {
      // L'OS existe dans le parc mais pas encore au référentiel (construction non lancée).
      await db.insert(technologie)
        .values({ nom, categorie: CATEGORIE_OS, finDeVie: body.finDeVie || null, finDeVieEtendue: body.finDeVieEtendue || null, sourceEol: 'manuel' })
        .onConflictDoNothing()
    }
    return { ok: true as const, os: nom, finDeVie: body.finDeVie || null }
  }, {
    can: { category: 'technologies', level: 'write' },
    body: t.Object({ os: t.String(), finDeVie: t.Optional(t.String()), finDeVieEtendue: t.Optional(t.String()) }),
  })

  // État du parc au regard du support : par OS, la date connue et le nombre de machines.
  .get('/api/eol/etat', async () => {
    const [parc, refs] = await Promise.all([
      osDuParc(),
      db.select({ nom: technologie.nom, finDeVie: technologie.finDeVie, finDeVieEtendue: technologie.finDeVieEtendue, sourceEol: technologie.sourceEol })
        .from(technologie).where(eq(technologie.categorie, CATEGORIE_OS)),
    ])
    const refParNom = new Map(refs.map(r => [r.nom, r]))
    const { aujourdhui, dansUnAn } = bornes()

    const lignes = parc.map(({ os, machines }) => {
      const ref = refParNom.get(os)
      return {
        os,
        machines,
        finDeVie: ref?.finDeVie ?? null,
        finDeVieEtendue: ref?.finDeVieEtendue ?? null,
        eolStatut: statutEol(ref, aujourdhui, dansUnAn),
        source: ref?.sourceEol ?? null,
        connuAutomatiquement: !!eolConnu(os),
      }
    })

    // LA PARTITION EST DÉRIVÉE DE `STATUTS_EOL`, PLUS ÉCRITE UNE PAR UNE. Les compteurs étaient
    // énumérés à la main, et il en MANQUAIT un : `ok` — soit l'état le plus nombreux du parc.
    const machinesParStatut = partitionEnMemoire(lignes, STATUTS_EOL, l => l.eolStatut, l => l.machines)
    const osParStatut = partitionEnMemoire(lignes, STATUTS_EOL, l => l.eolStatut)
    const machinesTotal = lignes.reduce((n, l) => n + l.machines, 0)

    // REGROUPEMENT PAR FAMILLE, calculé depuis la CLÉ versionnée. « Combien de Windows 10
    // dépassés » obligeait l'appelant à regrouper lui-même des libellés d'OS, donc à décider
    // sur des chaînes qu'il n'a pas écrites ce qui est « un Windows 10 ».
    const machinesParFamille = partitionEnMemoire(lignes, FAMILLES_OS, l => familleOs(l.os), l => l.machines)
    const osParFamille = partitionEnMemoire(lignes, FAMILLES_OS, l => familleOs(l.os))

    // NIVEAU DE REGROUPEMENT — « combien de Debian », toutes versions confondues.
    const machinesParGroupe = partitionEnMemoire(lignes, GROUPES_OS, l => groupeOs(l.os), l => l.machines)
    const osParGroupe = partitionEnMemoire(lignes, GROUPES_OS, l => groupeOs(l.os))
    const machinesParGroupeEtStatut = Object.fromEntries(
      GROUPES_OS.map(g => [
        g,
        partitionEnMemoire(lignes.filter(l => groupeOs(l.os) === g), STATUTS_EOL, l => l.eolStatut, l => l.machines),
      ]),
    ) as Record<string, Record<StatutEol, number>>

    // LE CROISEMENT, qui est la question réelle. Les valeurs sont des OBJETS et non des
    // nombres : chaque famille porte sa propre partition d'état de support.
    const machinesParFamilleEtStatut = Object.fromEntries(
      FAMILLES_OS.map(f => [
        f,
        partitionEnMemoire(lignes.filter(l => familleOs(l.os) === f), STATUTS_EOL, l => l.eolStatut, l => l.machines),
      ]),
    ) as Record<FamilleOs, Record<StatutEol, number>>

    // `autre` INSPECTABLE, et non seulement compté. Le vocabulaire des familles est écrit à la
    // main : un système qui apparaît demain ne crée pas de famille, il tombe ici.
    const nonReconnues = lignes
      .filter(l => familleOs(l.os) === 'autre')
      .map(l => ({ cle: l.os, machines: l.machines }))
      .sort((x, y) => y.machines - x.machines)

    return {
      lignes,
      resume: {
        osDistincts: lignes.length,
        // Le TOTAL, pour que chaque catégorie se rapporte à lui sans que l'appelant somme
        // les lignes — ce que la doctrine lui interdit par ailleurs.
        machinesTotal,
        // La partition COMPLÈTE, un compteur par état déclaré.
        machinesParStatut,
        osParStatut,
        machinesParGroupe,
        osParGroupe,
        machinesParGroupeEtStatut,
        machinesParFamille,
        osParFamille,
        machinesParFamilleEtStatut,
        // Quelles familles composent chaque groupe : le rapprochement entre les deux
        // niveaux devient vérifiable au lieu d'être supposé.
        famillesDuGroupe: FAMILLES_DU_GROUPE,
        famillesNonReconnues: {
          systemes: nonReconnues.length,
          machines: nonReconnues.reduce((n, x) => n + x.machines, 0),
          // Les cinquante premières, du plus nombreux au moins nombreux : au-delà, c'est
          // l'inventaire entier qu'il faut reprendre, pas une famille à ajouter.
          cles: nonReconnues.slice(0, 50),
          tronque: nonReconnues.length > 50,
        },
        // Noms historiques, conservés : les rompre casserait les appelants en place.
        machinesDepassees: machinesParStatut.depasse,
        machinesBientot: machinesParStatut.bientot,
        machinesInconnues: machinesParStatut.inconnu,
        machinesEtendues: machinesParStatut.etendu,
        machinesSupportees: machinesParStatut.supporte,
        machinesOk: machinesParStatut.ok,
        osSansDate: osParStatut.inconnu,
        referentielConstruit: refs.length > 0,
        // LE DÉCOMPTE DES DÉPASSÉS EST UN MINORANT, ET IL LE DIT. Annoncer « 412 machines
        // dépassées » sans cette réserve laisse entendre un total, alors que c'est un plancher.
        avertissement: machinesParStatut.inconnu > 0
          ? `${machinesParStatut.inconnu} machine(s) portent un système sans date de fin de support connue. `
            + 'Elles ne sont comptées ni parmi les dépassées ni parmi les supportées : '
            + '`machinesDepassees` est donc un MINORANT, pas un total.'
          : null,
      },
    }
  }, { can: { category: 'technologies', level: 'read' } })

// Liste des OS hors support à ce jour (chaînes exactes) — sert aux filtres de périmètre.
export async function osHorsSupport(): Promise<{ nom: string, finDeVie: string }[]> {
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const rows = await db
    .select({ nom: technologie.nom, finDeVie: technologie.finDeVie, etendue: technologie.finDeVieEtendue })
    .from(technologie)
    .where(and(
      eq(technologie.categorie, CATEGORIE_OS),
      isNotNull(technologie.finDeVie),
      lt(technologie.finDeVie, aujourdhui),
    ))
  // Le support ÉTENDU (ESU, ESM) prolonge la couverture : tant qu'il court, la machine
  // est encore supportée — la compter « hors support » serait un faux positif.
  return rows
    .filter(r => !r.etendue || r.etendue < aujourdhui)
    .map(r => ({ nom: r.nom, finDeVie: r.finDeVie as string }))
}

// Nombre de machines dont l'OS est hors support, d'après les DATES du référentiel (et non
// des motifs codés en dur). Réutilisé par le tableau de bord et par les périmètres.
export async function machinesHorsSupport(): Promise<{ nombre: number, sur: number }> {
  // UNE SEULE DÉFINITION, et non une troisième. Cette fonction recalculait `cleTechnologie(os,
  // osVersion)` en JavaScript à chaque appel, là où /api/technologies/parc lit la clé
  // MATÉRIALISÉE.
  const { aujourdhui, dansUnAn } = bornes()
  const compter = async (table: typeof serveur | typeof posteTravail, cle: Column) => {
    const [r] = await db
      .select({
        depasse: sql<number>`count(*) filter (where ${expressionEolStatut(cle, aujourdhui, dansUnAn)} = 'depasse')::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(table)
    return { depasse: r?.depasse ?? 0, total: r?.total ?? 0 }
  }
  const [s, p] = await Promise.all([
    compter(serveur, serveur.technologieCle),
    compter(posteTravail, posteTravail.technologieCle),
  ])
  // LE DÉNOMINATEUR EST RENDU AVEC LE NOMBRE. « 580 machines hors support » sur une tuile sans
  // population ne se rapporte à rien, et l'écran voisin en affiche un autre sur une autre
  // population : le lecteur conclut à une incohérence là où il y a deux questions.
  return { nombre: s.depasse + p.depasse, sur: s.total + p.total }
}

// OS présents dans le parc mais absents du référentiel ou sans date : le « trou » à combler.
export async function osSansDate(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(technologie)
    .where(and(eq(technologie.categorie, CATEGORIE_OS), isNull(technologie.finDeVie)))
  return Number(r?.n ?? 0)
}
