import { Elysia, t } from 'elysia'
import { eq, notInArray, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { clauseIso27001, exigenceNis2, exigenceNis2Iso, exigenceNis2Mesure, exigenceRgpd, exigenceRgpdLien, mesureSmsi, objectifNis2, population, sectionCnu } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { chargerCorrespondanceIso, rapprocher, referenceSoa } from '../utils/correspondanceIso'
import { chargerReferentielNis2, objectifsDuReferentiel } from '../utils/referentielNis2'
import { clausesIso27001 } from '../utils/referentielIso27001'
import { exigencesRgpd, liensRgpd, rgpdSansEquivalent } from '../utils/referentielRgpd'
import { mesuresSoa, populations, sectionsCnu } from '../utils/referentiels'

// RÉFÉRENTIELS — les jeux de données de référence que l'application embarque.

export type EtatReferentiel = {
  cle: string
  nom: string
  source: string
  description: string
  attendus: number | null // volumétrie attendue par la source, null si non déterminable
  enBase: number
  importable: boolean
}

export const referentielsRouter = new Elysia({ name: 'referentiels' })
  .use(betterAuth)
  // Groupe d'affichage dans la documentation d'API (/openapi).
  .guard({ detail: { tags: ['Administration'] } })

  .get('/api/referentiels', async () => {
    const compte = async (t: never) => {
      const r: { n: number }[] = await db.select({ n: sql<number>`count(*)::int` }).from(t)
      return Number(r[0]?.n ?? 0)
    }

    // Le référentiel NIS 2 est lu depuis le fichier : on peut annoncer sa volumétrie réelle.
    let attendusNis2: number | null = null
    let attendusObjectifs: number | null = null
    try {
      const ex = chargerReferentielNis2()
      attendusNis2 = ex.length
      attendusObjectifs = objectifsDuReferentiel(ex).length
    }
    catch { /* fichier absent : l'import signalera l\'erreur */ }

    const etats: EtatReferentiel[] = [
      {
        cle: 'nis2',
        nom: 'Exigences NIS 2 (ReCyF)',
        source: 'ANSSI — fichier officiel « Liste des exigences applicables à NIS2 », versionné dans le dépôt',
        description: attendusObjectifs
          ? `${attendusObjectifs} objectifs de sécurité et leurs exigences, texte réglementaire intégral.`
          : 'Objectifs de sécurité et exigences, texte réglementaire intégral.',
        attendus: attendusNis2,
        enBase: await compte(exigenceNis2 as never),
        importable: attendusNis2 !== null,
      },
      {
        cle: 'iso27002',
        nom: 'Mesures ISO/IEC 27002:2022 (Annexe A)',
        source: 'ISO/IEC 27002:2022 — saisie interne',
        description: `${mesuresSoa.length} mesures de sécurité servant de base à la Déclaration d'Applicabilité (SoA).`,
        attendus: mesuresSoa.length,
        enBase: await compte(mesureSmsi as never),
        importable: true,
      },
      {
        cle: 'iso27001',
        nom: 'Clauses ISO/IEC 27001:2022',
        source: 'ISO/IEC 27001:2022, table des matières officielle française (clauses 4 à 10)',
        description: `${clausesIso27001.length} clauses du système de management. Distinct de l'annexe A (ISO 27002) : un audit de certification demande les deux.`,
        attendus: clausesIso27001.length,
        enBase: await compte(clauseIso27001 as never),
        importable: true,
      },
      {
        cle: 'rgpd',
        nom: 'Exigences de sécurité du RGPD',
        source: 'Règlement (UE) 2016/679 — articles imposant des mesures techniques et organisationnelles',
        description: `${exigencesRgpd.length} exigences (art. 5.1.f, 24, 25, 28, 30, 32, 33, 34, 35), et ${liensRgpd.length} rapprochements PROPOSÉS vers NIS 2 et l'ISO — non officiels, à valider et modifiables.`,
        attendus: exigencesRgpd.length,
        enBase: await compte(exigenceRgpd as never),
        importable: true,
      },
      {
        cle: 'sections-cnu',
        nom: 'Sections CNU',
        source: 'Conseil National des Universités — liste nationale',
        description: 'Sections disciplinaires utilisées par la cartographie humaine.',
        attendus: sectionsCnu.length,
        enBase: await compte(sectionCnu as never),
        importable: true,
      },
      {
        cle: 'populations',
        nom: 'Populations',
        source: 'Spécification de la cellule cyber',
        description: 'Catégories de personnes : enseignant-chercheur, BIATSS, étudiant, doctorant, vacataire, personnel externe.',
        attendus: populations.length,
        enBase: await compte(population as never),
        importable: true,
      },
    ]
    return etats
  }, { auth: ['admin'] })

  // Import d'un référentiel — rejouable à tout moment, sans redémarrer l'application.
  .post('/api/referentiels/:cle/importer', async ({ params, status }) => {
    // --- Populations ------------------------------------------------------------------
    // Simple liste de noms : on ajoute ce qui manque sans toucher à l'existant (une
    // population renommée à la main dans l'application ne doit pas être écrasée).
    if (params.cle === 'populations') {
      await db.insert(population).values(populations.map(nom => ({ nom }))).onConflictDoNothing()
      const total = await db.select({ n: sql<number>`count(*)::int` }).from(population)
      return { ok: true as const, message: `${populations.length} populations vérifiées — ${Number(total[0]?.n ?? 0)} au total en base.` }
    }

    // --- Sections CNU -----------------------------------------------------------------
    // Mise à jour par numéro : les intitulés et groupes évoluent au niveau national.
    if (params.cle === 'sections-cnu') {
      await db.insert(sectionCnu)
        .values(sectionsCnu.map(([numero, intitule, groupe]) => ({ numero, intitule, groupe })))
        .onConflictDoUpdate({
          target: sectionCnu.numero,
          set: { intitule: sql`excluded.intitule`, groupe: sql`excluded.groupe` },
        })
      return { ok: true as const, message: `${sectionsCnu.length} sections CNU importées ou mises à jour.` }
    }

    // --- Mesures ISO/IEC 27002:2022 ---------------------------------------------------
    if (params.cle === 'iso27002') {
      await db.insert(mesureSmsi)
        .values(mesuresSoa)
        .onConflictDoUpdate({
          target: mesureSmsi.reference,
          set: {
            intitule: sql`excluded.intitule`,
            theme: sql`excluded.theme`,
            objectif: sql`excluded.objectif`,
            typeMesure: sql`excluded.type_mesure`,
            conceptsCyber: sql`excluded.concepts_cyber`,
          },
        })
      return { ok: true as const, message: `${mesuresSoa.length} mesures ISO 27002 importées ou mises à jour (applicabilité et justifications conservées).` }
    }

    if (params.cle === 'iso27001') {
      await db.insert(clauseIso27001)
        .values(clausesIso27001.map(c => ({
          reference: c.reference,
          chapitre: c.chapitre,
          intitule: c.intitule,
          intituleEn: c.intituleEn,
          sourceIntitule: c.source,
          exigence: c.exigence,
          amendement: c.amendement ?? null,
          ordre: c.ordre,
        })))
        .onConflictDoUpdate({
          target: clauseIso27001.reference,
          set: {
            chapitre: sql`excluded.chapitre`,
            intitule: sql`excluded.intitule`,
            intituleEn: sql`excluded.intitule_en`,
            sourceIntitule: sql`excluded.source_intitule`,
            exigence: sql`excluded.exigence`,
            amendement: sql`excluded.amendement`,
            ordre: sql`excluded.ordre`,
          },
        })
      const traduites = clausesIso27001.filter(c => c.source === 'traduction').length
      return {
        ok: true as const,
        message: `${clausesIso27001.length} clauses ISO 27001 importées (chapitres 4 à 10),`
          + ` intitulés repris de la table des matières officielle française.`
          + ` L'énoncé de chaque exigence est une FORMULATION et non une citation : la norme reste seule à faire foi.`
          + ` ${clausesIso27001.filter(c => c.amendement).length} clause(s) portent la mention d'un amendement (climat, Amd 1:2024).`
          + (traduites ? ` ${traduites} intitulé(s) restent TRADUITS de l'édition anglaise — à ne pas citer tels quels dans un dossier d'audit.` : ''),
      }
    }

    if (params.cle === 'rgpd') {
      // CHAMPS APPARTENANT À LA SOURCE — réécrits à chaque import. Cette liste unique sert À LA
      // FOIS à construire les lignes et à composer le `set` du conflit : les deux ne peuvent
      // donc plus diverger.
      const CHAMPS_SOURCE = {
        article: 'article',
        intituleArticle: 'intitule_article',
        intitule: 'intitule',
        portee: 'portee',
        ordre: 'ordre',
      } as const

      await db.insert(exigenceRgpd)
        .values(exigencesRgpd.map(e => ({
          reference: e.reference,
          notes: rgpdSansEquivalent[e.reference] ?? null,
          ...Object.fromEntries(Object.keys(CHAMPS_SOURCE).map(k => [k, e[k as keyof typeof e]])),
        })) as never)
        .onConflictDoUpdate({
          target: exigenceRgpd.reference,
          set: Object.fromEntries(
            Object.entries(CHAMPS_SOURCE).map(([champ, colonne]) => [champ, sql.raw(`excluded.${colonne}`)]),
          ),
        })

      const parRef = new Map(
        (await db.select({ id: exigenceRgpd.id, reference: exigenceRgpd.reference }).from(exigenceRgpd))
          .map(r => [r.reference, r.id] as const),
      )
      // Intitulé de la cible, pour que le lien reste lisible sans jointure : objectif ReCyF
      // ou mesure de la déclaration d'applicabilité.
      const objIntitules = new Map(
        (await db.select({ numero: objectifNis2.numero, intitule: objectifNis2.intitule }).from(objectifNis2))
          .map(o => [String(o.numero), o.intitule] as const),
      )
      const soaIntitules = new Map(
        (await db.select({ reference: mesureSmsi.reference, intitule: mesureSmsi.intitule }).from(mesureSmsi))
          .map(m => [m.reference, m.intitule] as const),
      )

      const liens = liensRgpd
        .filter(l => parRef.has(l.reference))
        .map(l => ({
          exigenceRgpdId: parRef.get(l.reference)!,
          cible: l.cible,
          reference: l.cle,
          intitule: l.cible === 'nis2'
            ? (objIntitules.get(l.cle) ?? null)
            : l.cible === 'iso27002' ? (soaIntitules.get(l.cle) ?? null) : null,
          justification: l.justification,
          // Aucune autorité ne publie cette correspondance : elle reste une proposition.
          officiel: false,
        }))
      if (liens.length) {
        await db.insert(exigenceRgpdLien).values(liens).onConflictDoUpdate({
          target: [exigenceRgpdLien.exigenceRgpdId, exigenceRgpdLien.cible, exigenceRgpdLien.reference],
          set: { intitule: sql`excluded.intitule`, justification: sql`excluded.justification` },
        })
      }

      const sansCible = liensRgpd.filter(l => l.cible !== 'iso27001' && !(l.cible === 'nis2' ? objIntitules.has(l.cle) : soaIntitules.has(l.cle)))
      return {
        ok: true as const,
        message: `${exigencesRgpd.length} exigences RGPD et ${liens.length} rapprochements importés.`
          + ` Ces rapprochements ne sont PAS officiels : aucune autorité ne publie de correspondance RGPD ↔ NIS 2 / ISO. À relire et valider dans l'application.`
          + (Object.keys(rgpdSansEquivalent).length ? ` ${Object.keys(rgpdSansEquivalent).length} exigence(s) sans équivalent assumé : ${Object.keys(rgpdSansEquivalent).join(', ')}.` : '')
          + (sansCible.length ? ` ${sansCible.length} rapprochement(s) visent une cible absente de la base : importez d'abord NIS 2 et l'ISO 27002.` : ''),
      }
    }

    if (params.cle !== 'nis2') {
      return status(404, { ok: false as const, message: 'Référentiel inconnu.' })
    }

    let exigences
    try { exigences = chargerReferentielNis2() }
    catch (e) {
      return status(422, { ok: false as const, message: e instanceof Error ? e.message : String(e) })
    }
    const objectifs = objectifsDuReferentiel(exigences)

    const DOMAINES: Record<number, 'gouvernance' | 'protection' | 'defense' | 'resilience'> = {
      1: 'gouvernance', 2: 'gouvernance', 3: 'gouvernance', 4: 'gouvernance', 5: 'protection',
      6: 'protection', 7: 'protection', 8: 'protection', 9: 'protection', 10: 'protection',
      11: 'protection', 12: 'defense', 13: 'resilience', 14: 'resilience', 15: 'resilience',
      16: 'gouvernance', 17: 'gouvernance', 18: 'protection', 19: 'protection', 20: 'defense',
    }

    await db.insert(objectifNis2)
      .values(objectifs.map(o => ({
        numero: o.numero,
        intitule: o.intitule,
        domaine: DOMAINES[o.numero] ?? 'gouvernance',
        applicabilite: o.applicabilite,
      })))
      .onConflictDoUpdate({
        target: objectifNis2.numero,
        set: { intitule: sql`excluded.intitule`, domaine: sql`excluded.domaine`, applicabilite: sql`excluded.applicabilite` },
      })

    const objIds = new Map((await db.select({ id: objectifNis2.id, numero: objectifNis2.numero }).from(objectifNis2)).map(o => [o.numero, o.id]))

    await db.insert(exigenceNis2)
      .values(exigences.map(e => ({
        reference: e.reference,
        objectifNis2Id: objIds.get(e.objectifNumero) ?? null,
        sousSection: e.thematique,
        intitule: e.contenu,
        attenduEi: e.attenduEi,
        attenduEe: e.attenduEe,
        notes: e.anomalieSource,
      })))
      .onConflictDoUpdate({
        target: exigenceNis2.reference,
        set: {
          intitule: sql`excluded.intitule`,
          sousSection: sql`excluded.sous_section`,
          attenduEi: sql`excluded.attendu_ei`,
          attenduEe: sql`excluded.attendu_ee`,
          objectifNis2Id: sql`excluded.objectif_nis2_id`,
          notes: sql`excluded.notes`,
        },
      })

    // Exigences présentes en base mais ABSENTES du fichier officiel : vestiges d'une version
    // antérieure du référentiel.
    const referencesOfficielles = new Set(exigences.map(e => e.reference))
    const obsoletes = (await db.select({ reference: exigenceNis2.reference }).from(exigenceNis2))
      .map(r => r.reference)
      .filter(r => !referencesOfficielles.has(r))

    // --- CORRESPONDANCE OFFICIELLE AVEC L'ISO -----------------------------------------
    // Importée dans la foulée : elle n'a de sens qu'une fois les exigences en place, et la
    // séparer en deux boutons produirait un état intermédiaire où la moitié du référentiel
    // seulement est à jour.
    const resultatIso = await (async () => {
      let corr
      try { corr = chargerCorrespondanceIso() }
      // Absence du fichier : l'import des exigences reste valable, on le dit et on continue.
      catch (e) { return { erreur: e instanceof Error ? e.message : String(e) } }

      const parReference = new Map(
        (await db.select({ id: exigenceNis2.id, reference: exigenceNis2.reference }).from(exigenceNis2))
          .map(r => [r.reference, r.id] as const),
      )
      const parRefSoa = new Map(
        (await db.select({ id: mesureSmsi.id, reference: mesureSmsi.reference }).from(mesureSmsi))
          .map(r => [r.reference, r.id] as const),
      )

      const renvois: { exigenceNis2Id: string, norme: string, reference: string, intitule: string, ordre: number }[] = []
      const liens: { exigenceNis2Id: string, mesureSmsiId: string }[] = []
      const niveaux: { id: string, correspondance: 'elevee' | 'moyenne' | 'faible' | null, observations: string | null }[] = []
      const rapprochees: string[] = []
      const introuvables: string[] = []
      const soaManquantes = new Set<string>()

      for (const c of corr) {
        const cible = rapprocher(c.reference, parReference)
        if (!cible) { introuvables.push(c.reference); continue }
        if (cible.viaNumero) rapprochees.push(c.reference)

        niveaux.push({ id: cible.id, correspondance: c.correspondance, observations: c.observations })
        for (const r of c.renvois) {
          renvois.push({ exigenceNis2Id: cible.id, norme: r.norme, reference: r.reference, intitule: r.intitule, ordre: r.ordre })
          const refSoa = referenceSoa(r)
          if (!refSoa) continue // clause 27001 : aucune mesure d'annexe A à relier
          const mesureId = parRefSoa.get(refSoa)
          if (mesureId) liens.push({ exigenceNis2Id: cible.id, mesureSmsiId: mesureId })
          else soaManquantes.add(refSoa)
        }
      }

      // Niveau + observations sur l'exigence.
      for (const n of niveaux) {
        await db.update(exigenceNis2)
          .set({ correspondanceIso: n.correspondance, observationsIso: n.observations })
          .where(eq(exigenceNis2.id, n.id))
      }
      // Renvois ISO conservés tels quels, 27001 comprises.
      if (renvois.length) {
        await db.insert(exigenceNis2Iso).values(renvois).onConflictDoUpdate({
          target: [exigenceNis2Iso.exigenceNis2Id, exigenceNis2Iso.norme, exigenceNis2Iso.reference],
          set: { intitule: sql`excluded.intitule`, ordre: sql`excluded.ordre` },
        })
      }
      // Déclaration d'applicabilité : on AJOUTE sans rien retirer.
      if (liens.length) {
        await db.insert(exigenceNis2Mesure).values(liens).onConflictDoNothing()
      }

      return {
        exigences: niveaux.length,
        renvois: renvois.length,
        liensSoa: liens.length,
        rapprochees,
        introuvables,
        soaManquantes: [...soaManquantes],
      }
    })()

    const anomalies = exigences.filter(e => e.anomalieSource).length
    const messageIso = 'erreur' in resultatIso
      ? ` Correspondance ISO NON importée : ${resultatIso.erreur}`
      : ` Correspondance ISO : ${resultatIso.renvois} renvois sur ${resultatIso.exigences} exigences,`
        + ` ${resultatIso.liensSoa} liens vers la déclaration d'applicabilité.`
        + (resultatIso.rapprochees.length
          ? ` ${resultatIso.rapprochees.length} référence(s) rapprochée(s) par leur numéro faute de suffixe identique entre les deux fichiers officiels : ${resultatIso.rapprochees.join(', ')}.`
          : '')
        + (resultatIso.introuvables.length
          ? ` ${resultatIso.introuvables.length} référence(s) de la table de comparaison sans exigence correspondante : ${resultatIso.introuvables.join(', ')}.`
          : '')
        + (resultatIso.soaManquantes.length
          ? ` ${resultatIso.soaManquantes.length} mesure(s) ISO citée(s) mais absente(s) de la déclaration d'applicabilité : ${resultatIso.soaManquantes.join(', ')}. Importez le référentiel ISO 27002 d'abord.`
          : '')

    return {
      ok: true as const,
      objectifs: objectifs.length,
      exigences: exigences.length,
      obsoletes,
      anomalies,
      iso: resultatIso,
      message: `${objectifs.length} objectifs et ${exigences.length} exigences importés depuis le fichier officiel.`
        + (anomalies ? ` ${anomalies} anomalie(s) de la source signalée(s) dans les notes.` : '')
        + (obsoletes.length ? ` ${obsoletes.length} exigence(s) en base ne figurent PAS dans le fichier officiel : ${obsoletes.join(', ')}.` : '')
        + messageIso,
    }
  }, { auth: ['admin'], params: t.Object({ cle: t.String() }) })

  // Retire les exigences qui ne figurent plus dans le fichier officiel. Action SÉPARÉE et
  // volontaire : supprimer une exigence emporte le travail qui y est rattaché (conformité
  // déclarée, plan d'action, preuves).
  .post('/api/referentiels/nis2/purger', async ({ status }) => {
    let exigences
    try { exigences = chargerReferentielNis2() }
    catch (e) {
      return status(422, { ok: false as const, message: e instanceof Error ? e.message : String(e) })
    }
    const officielles = exigences.map(e => e.reference)
    const supprimees = await db.delete(exigenceNis2)
      .where(notInArray(exigenceNis2.reference, officielles))
      .returning({ reference: exigenceNis2.reference })

    return {
      ok: true as const,
      supprimees: supprimees.length,
      references: supprimees.map(s => s.reference),
      message: supprimees.length
        ? `${supprimees.length} exigence(s) hors référentiel supprimée(s) : ${supprimees.map(s => s.reference).join(', ')}.`
        : 'Aucune exigence hors référentiel.',
    }
  }, { auth: ['admin'] })
