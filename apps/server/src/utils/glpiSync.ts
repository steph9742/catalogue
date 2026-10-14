import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  connecteurGlpi,
  glpiMachine,
  serveur,
  posteTravail,
  appareilMobile,
  iot,
  entite,
  service,
  departement,
  lieu,
  composante,
  pole,
} from '@catalogue/database/tables'
import { parcourirComputers, type GlpiComputer } from './glpiClient'
import { classifierParTypeEtOs } from './glpiClassify'
import { dechiffrer } from './secrets'
import { reconcilierClesTechnologie } from './technologieCle'

// Moteur de synchronisation GLPI → Catalogue. Principes : - IDEMPOTENT : réidentifie chaque
// machine par son glpiId, ne crée jamais de doublon.

const SINGLETON = 'connecteur-glpi-singleton'

export type CompteursSync = {
  total: number, serveurs: number, postes: number, mobiles: number, iot: number
  aClasser: number, ignores: number, criticites: number, conflitsNom: number, echecs: number
  // ÉCART entre l'inventaire et le catalogue : combien de machines GLPI n'ont pas de fiche à
  // elles parce qu'une autre porte déjà leur nom.
  doublons: number
  fiches: number
  // Clés de technologie réécrites par la réconciliation. Rendu au compte rendu : une
  // reprise silencieuse est une reprise qu'on croit faite.
  clesEcrites: number
}

// --- Résolution de la composante depuis le chemin d'entité GLPI ----------------------
// On lie à l'existant (rapprochement normalisé : casse/tirets/espaces/ accents ignorés), sinon
// on crée.
type CacheOrg = {
  entites: Map<string, string>
  composantes: Map<string, string>
  services: Map<string, string> // clé : composanteId + nom normalisé
  departements: Map<string, string> // idem
  poles: Map<string, string> // clé : serviceId + nom normalisé
  lieux: Map<string, string> // clé : chemin GLPI complet du nœud
  reglesCriticite: RegleCriticite[] // correspondance « groupe GLPI → criticité »
}

export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

// Table d'alias LOCALE : un établissement renommé apparaît sous ses deux noms dans GLPI
// selon l'ancienneté des enregistrements. Sans elle, deux établissements et deux arbres de
// lieux concurrents. À adapter à son propre cas.
const RENOMMAGES: Record<string, string> = { ufc: 'UMLP', umlp: 'UMLP' }
export function nomCanonique(nom: string): string {
  return RENOMMAGES[normaliser(nom)] ?? nom
}

export function segmentsDe(chemin: string | null | undefined): string[] {
  return (chemin ?? '').split('>').map(s => s.trim()).filter(Boolean).map(nomCanonique)
}

async function chargerCacheOrg(): Promise<CacheOrg> {
  const [es, cs, ss, ds, ps, ls, cfg] = await Promise.all([
    db.select({ id: entite.id, nom: entite.nom }).from(entite),
    db.select({ id: composante.id, nom: composante.nom }).from(composante),
    db.select({ id: service.id, nom: service.nom, composanteId: service.composanteId }).from(service),
    db.select({ id: departement.id, nom: departement.nom, composanteId: departement.composanteId }).from(departement),
    db.select({ id: pole.id, nom: pole.nom, serviceId: pole.serviceId }).from(pole),
    db.select({ id: lieu.id, chemin: lieu.cheminGlpi }).from(lieu),
    db.select({ regles: connecteurGlpi.groupesCriticite }).from(connecteurGlpi).where(eq(connecteurGlpi.id, SINGLETON)).limit(1),
  ])
  return {
    entites: new Map(es.map(e => [normaliser(e.nom), e.id])),
    composantes: new Map(cs.map(c => [normaliser(c.nom), c.id])),
    services: new Map(ss.map(s => [`${s.composanteId}|${normaliser(s.nom)}`, s.id])),
    departements: new Map(ds.map(d => [`${d.composanteId}|${normaliser(d.nom)}`, d.id])),
    poles: new Map(ps.map(x => [`${x.serviceId}|${normaliser(x.nom)}`, x.id])),
    lieux: new Map(ls.filter(l => l.chemin).map(l => [l.chemin as string, l.id])),
    reglesCriticite: lireReglesCriticite(cfg[0]?.regles),
  }
}

// Entité (1er segment) → composante (2e) → département OU service (3e) → pôle d'un service
// (4e).
const MOTIF_DEPARTEMENT = /^(dept|dpt|departement)/

export function estDepartement(nom: string): boolean {
  return MOTIF_DEPARTEMENT.test(normaliser(nom))
}

/**
 * LE PÔLE d'un chemin d\'entité GLPI : le 4e segment, sous un SERVICE. Sous un département, rien
 * : le schéma n'admet de pôle que dans un service, et ranger « Dept-INFO > X » ailleurs
 * inventerait un rattachement.
 */
export function poleDuChemin(chemin: string | null | undefined): string | null {
  const segments = segmentsDe(chemin)
  const unite = segments[2]
  const nomPole = segments[3]
  if (!unite || !nomPole || estDepartement(unite)) return null
  return nomPole
}

// NOMS QUI N'IDENTIFIENT RIEN. Ce ne sont pas des noms, ce sont des valeurs de repli.
const NOMS_NON_IDENTIFIANTS = new Set([
  'localhost', 'localhostlocaldomain', 'macos', 'unknown', 'inconnu',
  'ordinateur', 'computer', 'pc', 'desktop', 'laptop', 'nouveaunom', 'changeme',
])

export function nomIdentifie(nom: string | null | undefined): boolean {
  const n = normaliser(nom ?? '')
  return n !== '' && !NOMS_NON_IDENTIFIANTS.has(n)
}

// NUMÉROS DE SÉRIE QUI N'EN SONT PAS. Le même piège que les noms de repli, en pire : les cartes
// mères non renseignées par l'assembleur renvoient une chaîne générique du BIOS — « To be
// filled by O.E.M.
const SERIES_NON_IDENTIFIANTES = new Set([
  'tobefilledbyoem', 'tobefilledbyoem', 'defaultstring', 'systemserialnumber',
  'serialnumber', 'none', 'na', 'notspecified', 'notapplicable', 'unknown',
  'inconnu', '0', '00000000', '123456789', 'oem', 'chassisserialnumber',
])

export function serieIdentifie(serie: string | null | undefined): boolean {
  const s = normaliser(serie ?? '')
  // Moins de quatre caractères utiles : rien d'assez discriminant pour conclure.
  return s.length >= 4 && !SERIES_NON_IDENTIFIANTES.has(s)
}

type Rattachement = { composanteId: string | null, serviceId: string | null, departementId: string | null }

async function resoudreOrganisation(chemin: string | null | undefined, cache: CacheOrg): Promise<Rattachement> {
  const segments = segmentsDe(chemin)
  if (segments.length < 2) return { composanteId: null, serviceId: null, departementId: null }
  const nomEntite = segments[0]!
  const nomComposante = segments[1]!

  const kE = normaliser(nomEntite)
  let entiteId = cache.entites.get(kE)
  if (!entiteId) {
    const [row] = await db.insert(entite).values({ nom: nomEntite }).returning({ id: entite.id })
    entiteId = row!.id
    cache.entites.set(kE, entiteId)
  }

  const kC = normaliser(nomComposante)
  let composanteId = cache.composantes.get(kC)
  if (!composanteId) {
    const [row] = await db.insert(composante)
      .values({ nom: nomComposante, entiteId, type: 'autre', sourceGlpi: true })
      .returning({ id: composante.id })
    composanteId = row!.id
    cache.composantes.set(kC, composanteId)
  }

  let serviceId: string | null = null
  let departementId: string | null = null
  const nomUnite = segments[2]
  if (nomUnite) {
    const cle = `${composanteId}|${normaliser(nomUnite)}`
    if (estDepartement(nomUnite)) {
      departementId = cache.departements.get(cle) ?? null
      if (!departementId) {
        // `type` est obligatoire : « enseignement » est le défaut le plus juste (les
        // départements GLPI observés sont ceux des IUT), requalifiable à la main.
        const cree = await db.insert(departement)
          .values({ nom: nomUnite, composanteId, type: 'enseignement', sourceGlpi: true })
          .returning({ id: departement.id })
        departementId = cree[0]?.id ?? null
        if (departementId) cache.departements.set(cle, departementId)
      }
    }
    else {
      serviceId = cache.services.get(cle) ?? null
      if (!serviceId) {
        const cree = await db.insert(service)
          .values({ nom: nomUnite, composanteId, sourceGlpi: true })
          .returning({ id: service.id })
        serviceId = cree[0]?.id ?? null
        if (serviceId) cache.services.set(cle, serviceId)
      }

      // LE PÔLE, 4e niveau, créé comme le service l'est au 3e.
      const nomPole = poleDuChemin(chemin)
      if (serviceId && nomPole) {
        const clePole = `${serviceId}|${normaliser(nomPole)}`
        if (!cache.poles.has(clePole)) {
          const [p] = await db.insert(pole)
            .values({ nom: nomPole, serviceId, type: 'autre', sourceGlpi: true })
            .returning({ id: pole.id })
          if (p) cache.poles.set(clePole, p.id)
        }
      }
    }
  }
  return { composanteId, serviceId, departementId }
}

// --- Résolution du LIEU depuis l'arborescence des lieux GLPI --------------------------
// Le chemin complet de chaque nœud sert de clé d'identité (« E005 » seul n'est pas unique : la
// même salle existe sur plusieurs sites).

// Faux lieux : GLPI sert parfois de fourre-tout (catégories déguisées en emplacements).
// Un chemin qui en contient un est ignoré — mieux vaut aucun lieu qu'un lieu faux.
const FAUX_LIEUX = new Set([
  'mobilepersonnel', 'mobile', 'personnel', 'inconnu', 'adefinir', 'adeterminer',
  'sansaffectation', 'nonaffecte', 'divers', 'autre', 'stock', 'reserve',
])

// Type déduit du NOM (plus fiable que la profondeur : les arbres n'ont pas tous le même
// nombre de niveaux). À défaut, on retombe sur la profondeur.
export function typeDeLieu(nom: string, profondeur: number): 'site' | 'batiment' | 'salle' | 'baie' {
  const n = normaliser(nom)
  if (/^baie|rack|armoire/.test(n)) return 'baie'
  if (/^bat|batiment|bloc|halle/.test(n)) return 'batiment'
  if (/^salle|bureau|etage|labo|amphi/.test(n) || /^[a-z]{1,2}\d{2,4}$/.test(n)) return 'salle'
  if (profondeur >= 5) return 'salle'
  if (profondeur === 4) return 'batiment'
  return 'site'
}

export function estFauxLieu(chemin: string | null | undefined): boolean {
  return segmentsDe(chemin).some(s => FAUX_LIEUX.has(normaliser(s)))
}

async function resoudreLieu(chemin: string | null | undefined, cache: CacheOrg, composanteId: string | null): Promise<string | null> {
  const segments = segmentsDe(chemin)
  if (!segments.length) return null
  if (estFauxLieu(chemin)) return null

  let parentId: string | null = null
  for (let i = 0; i < segments.length; i++) {
    const nom = segments[i]!
    // Clé d'identité = chemin complet jusqu'à ce nœud.
    const cle = segments.slice(0, i + 1).join(' > ')
    const connu = cache.lieux.get(cle)
    if (connu) { parentId = connu; continue }

    const cree: { id: string }[] = await db.insert(lieu)
      .values({
        nom,
        type: typeDeLieu(nom, i + 1),
        parentId,
        // La composante n'est portée que par les nœuds à partir du 2e niveau (le 1er
        // est l'établissement, commun à tout le monde).
        composanteId: i >= 1 ? composanteId : null,
        sourceGlpi: true,
        cheminGlpi: cle,
      })
      .returning({ id: lieu.id })
    const nouvelId: string | undefined = cree[0]?.id
    if (!nouvelId) return parentId
    cache.lieux.set(cle, nouvelId)
    parentId = nouvelId
  }
  return parentId
}

// --- Criticité déduite du groupe GLPI ------------------------------------------------
// GLPI n'attache aucun sens à ses groupes : c'est l'établissement qui en donne un.
export const CRITICITES = ['vitale', 'critique', 'essentielle', 'importante', 'secondaire'] as const
export type Criticite = typeof CRITICITES[number]
export type RegleCriticite = { groupe: string, criticite: Criticite }

/** Valide et nettoie la correspondance stockée en base (jsonb, donc à ne pas croire). */
export function lireReglesCriticite(brut: unknown): RegleCriticite[] {
  if (!Array.isArray(brut)) return []
  return brut.flatMap((r) => {
    const groupe = typeof r?.groupe === 'string' ? r.groupe.trim() : ''
    const criticite = r?.criticite
    if (!groupe || !CRITICITES.includes(criticite)) return []
    return [{ groupe, criticite: criticite as Criticite }]
  })
}

// SÉPARATEUR des groupes multiples, tel que le client l'écrit (`texte()` dans glpiClient.ts).
export const SEPARATEUR_GROUPES = ' ; '

/** Les groupes d'une machine, un par entrée. Une valeur vide donne une liste vide. */
export function groupesDeLaMachine(valeur: string | null | undefined): string[] {
  return (valeur ?? '').split(SEPARATEUR_GROUPES).map(g => g.trim()).filter(Boolean)
}

/**
 * Criticité d'une machine d\'après ses groupes GLPI, `null` si aucune règle ne s\'applique.
 */
export function criticiteDuGroupe(groupe: string | null | undefined, regles: RegleCriticite[]): Criticite | null {
  if (!regles.length) return null

  let meilleure: { specificite: number, criticite: Criticite } | null = null

  for (const chemin of groupesDeLaMachine(groupe)) {
    const segments = segmentsDe(chemin).map(normaliser).filter(Boolean)
    if (!segments.length) continue

    for (const regle of regles) {
      const attendus = segmentsDe(regle.groupe).map(normaliser).filter(Boolean)
      if (!attendus.length) continue

      // La règle s'applique si ses segments apparaissent d'un seul tenant dans le chemin
      // de la machine : celle-ci est alors DANS ce groupe, ou dessous.
      let trouve = false
      for (let i = 0; i + attendus.length <= segments.length && !trouve; i++) {
        trouve = attendus.every((a, j) => a === segments[i + j])
      }
      if (!trouve) continue

      const specificite = attendus.length
      const plusSpecifique = !meilleure || specificite > meilleure.specificite
      const aussiSpecifiqueEtPlusGrave = !!meilleure
        && specificite === meilleure.specificite
        && CRITICITES.indexOf(regle.criticite) < CRITICITES.indexOf(meilleure.criticite)
      if (plusSpecifique || aussiSpecifiqueEtPlusGrave) {
        meilleure = { specificite, criticite: regle.criticite }
      }
    }
  }
  return meilleure?.criticite ?? null
}

// Applique le classement d'une machine à sa cible (crée/maj serveur, poste, appareil mobile ou
// IoT, ou rien).
type Liens = { composanteId: string | null, serviceId: string | null, departementId: string | null, lieuId: string | null, criticite: Criticite | null }

// LE NOM D'UNE CIBLE EST UNIQUE, ET GLPI NE LE SAIT PAS. `serveur.hostname`,
// `poste_travail.nom`, `iot.nom`, `appareil_mobile.nom` portent une contrainte d'unicité.
async function nomDejaPris(table: never, colonneNom: never, colonneId: never, nom: string, idCible: string): Promise<boolean> {
  const lignes: { id: string }[] = await db
    .select({ id: colonneId })
    .from(table)
    .where(and(eq(colonneNom, nom as never), ne(colonneId, idCible as never)))
    .limit(1)
  return lignes.length > 0
}

type ResultatCible = 'ok' | 'conflit_nom'

async function appliquerCible(m: typeof glpiMachine.$inferSelect, liens: Liens): Promise<ResultatCible> {
  const { composanteId, serviceId, departementId, lieuId, criticite } = liens
  // On ne réécrit un rattachement que s'il est connu : une valeur absente côté GLPI ne doit
  // jamais effacer une saisie faite à la main dans le catalogue.
  const majComposante = {
    ...(composanteId ? { composanteId } : {}),
    ...(serviceId ? { serviceId } : {}),
    ...(departementId ? { departementId } : {}),
    ...(lieuId ? { lieuId } : {}),
    ...(criticite ? { criticite } : {}),
  }

  if (m.classement === 'serveur') {
    if (m.cibleId) {
      const pris = await nomDejaPris(serveur as never, serveur.hostname as never, serveur.id as never, m.nom, m.cibleId)
      const [maj] = await db.update(serveur)
        .set({ ...(pris ? {} : { hostname: m.nom }), os: m.os, osVersion: m.osVersion, ...majComposante })
        .where(eq(serveur.id, m.cibleId)).returning({ id: serveur.id })
      if (maj) return pris ? 'conflit_nom' : 'ok'
    }
    // type='physique' par défaut (GLPI ne tranche pas vm/physique de façon fiable ici).
    const [row] = await db.insert(serveur)
      .values({ hostname: m.nom, type: 'physique', sourceGlpi: true, os: m.os, osVersion: m.osVersion, composanteId, serviceId, departementId, lieuId, criticite })
      .onConflictDoNothing({ target: serveur.hostname })
      .returning({ id: serveur.id })
    const cibleId = row?.id ?? (await db.select({ id: serveur.id }).from(serveur).where(eq(serveur.hostname, m.nom)).limit(1))[0]?.id
    if (cibleId) await db.update(glpiMachine).set({ cibleId }).where(eq(glpiMachine.id, m.id))
    return 'ok'
  }

  if (m.classement === 'poste') {
    if (m.cibleId) {
      const pris = await nomDejaPris(posteTravail as never, posteTravail.nom as never, posteTravail.id as never, m.nom, m.cibleId)
      const [maj] = await db.update(posteTravail)
        .set({ ...(pris ? {} : { nom: m.nom }), os: m.os, osVersion: m.osVersion, ...majComposante })
        .where(eq(posteTravail.id, m.cibleId)).returning({ id: posteTravail.id })
      if (maj) return pris ? 'conflit_nom' : 'ok'
    }
    const [row] = await db.insert(posteTravail)
      .values({ nom: m.nom, sourceGlpi: true, os: m.os, osVersion: m.osVersion, composanteId, serviceId, departementId, lieuId, criticite })
      .onConflictDoNothing({ target: posteTravail.nom })
      .returning({ id: posteTravail.id })
    const cibleId = row?.id ?? (await db.select({ id: posteTravail.id }).from(posteTravail).where(eq(posteTravail.nom, m.nom)).limit(1))[0]?.id
    if (cibleId) await db.update(glpiMachine).set({ cibleId }).where(eq(glpiMachine.id, m.id))
    return 'ok'
  }

  if (m.classement === 'appareil_mobile') {
    if (m.cibleId) {
      const pris = await nomDejaPris(appareilMobile as never, appareilMobile.nom as never, appareilMobile.id as never, m.nom, m.cibleId)
      const [maj] = await db.update(appareilMobile)
        .set({ ...(pris ? {} : { nom: m.nom }), type: m.type, os: m.os, osVersion: m.osVersion, ...majComposante })
        .where(eq(appareilMobile.id, m.cibleId)).returning({ id: appareilMobile.id })
      if (maj) return pris ? 'conflit_nom' : 'ok'
    }
    const [row] = await db.insert(appareilMobile)
      .values({ nom: m.nom, type: m.type, sourceGlpi: true, os: m.os, osVersion: m.osVersion, composanteId, serviceId, departementId, lieuId, criticite })
      .onConflictDoNothing({ target: appareilMobile.nom })
      .returning({ id: appareilMobile.id })
    const cibleId = row?.id ?? (await db.select({ id: appareilMobile.id }).from(appareilMobile).where(eq(appareilMobile.nom, m.nom)).limit(1))[0]?.id
    if (cibleId) await db.update(glpiMachine).set({ cibleId }).where(eq(glpiMachine.id, m.id))
    return 'ok'
  }

  if (m.classement === 'iot') {
    if (m.cibleId) {
      const pris = await nomDejaPris(iot as never, iot.nom as never, iot.id as never, m.nom, m.cibleId)
      const [maj] = await db.update(iot)
        .set({ ...(pris ? {} : { nom: m.nom }), os: m.os, ...majComposante })
        .where(eq(iot.id, m.cibleId)).returning({ id: iot.id })
      if (maj) return pris ? 'conflit_nom' : 'ok'
    }
    const [row] = await db.insert(iot)
      .values({ nom: m.nom, sourceGlpi: true, os: m.os, composanteId, serviceId, departementId, lieuId, criticite })
      .onConflictDoNothing({ target: iot.nom })
      .returning({ id: iot.id })
    const cibleId = row?.id ?? (await db.select({ id: iot.id }).from(iot).where(eq(iot.nom, m.nom)).limit(1))[0]?.id
    if (cibleId) await db.update(glpiMachine).set({ cibleId }).where(eq(glpiMachine.id, m.id))
    return 'ok'
  }

  // « à classer » / « ignore » : pas de cible. Si une cible existait (reclassement),
  // on ne la supprime pas (perte de l'enrichissement cyber) ; on coupe seulement le lien.
  if (m.cibleId) await db.update(glpiMachine).set({ cibleId: null }).where(eq(glpiMachine.id, m.id))
  return 'ok'
}

// Traite un lot de machines GLPI : upsert du staging + classement + composante + cible.
async function traiterLot(lot: GlpiComputer[], compteurs: CompteursSync, cache: CacheOrg): Promise<void> {
  for (const c of lot) {
    // UNE MACHINE QUI ÉCHOUE NE DOIT PAS EMPORTER LES 8 800 AUTRES. Sans ce filet, la moindre
    // écriture refusée — un nom en doublon, une contrainte violée, une donnée inattendue sur
    // UNE machine — interrompait la synchronisation entière : les machines déjà traitées
    // restaient à jour, les suivantes n'étaient…
    try {
      await traiterMachine(c, compteurs, cache)
    }
    catch (e) {
      compteurs.echecs++
      compteurs.total++
      const motif = e instanceof Error ? e.message : String(e)
      console.error(`[glpi] machine ${c.glpiId} (${c.nom}) ignorée : ${motif.slice(0, 300)}`)
    }
  }
}

async function traiterMachine(c: GlpiComputer, compteurs: CompteursSync, cache: CacheOrg): Promise<void> {
  const [existant] = await db.select().from(glpiMachine).where(eq(glpiMachine.glpiId, c.glpiId)).limit(1)

  // Classement : conserver la décision humaine, sinon (re)déduire de type + OS + nom.
  const classement = existant?.classementManuel
    ? existant.classement
    : nomIdentifie(c.nom) ? classifierParTypeEtOs(c.type, c.os, c.nom) : 'a_classer'

  let ligne: typeof glpiMachine.$inferSelect
  if (existant) {
    const [maj] = await db.update(glpiMachine)
      .set({ nom: c.nom, type: c.type, os: c.os, osVersion: c.osVersion, entite: c.entite, lieu: c.lieu, groupe: c.groupe, groupeTechnique: c.groupeTechnique, numeroSerie: c.numeroSerie, classement, vuAuSync: true, updatedAt: new Date() })
      .where(eq(glpiMachine.id, existant.id))
      .returning()
    ligne = maj!
  }
  else {
    const [cree] = await db.insert(glpiMachine)
      .values({ glpiId: c.glpiId, nom: c.nom, type: c.type, os: c.os, osVersion: c.osVersion, entite: c.entite, lieu: c.lieu, groupe: c.groupe, groupeTechnique: c.groupeTechnique, numeroSerie: c.numeroSerie, classement, vuAuSync: true })
      .returning()
    ligne = cree!
  }

  const { composanteId, serviceId, departementId } = await resoudreOrganisation(c.entite, cache)
  const lieuId = await resoudreLieu(c.lieu, cache, composanteId)
  const criticite = criticiteDuGroupe(c.groupe, cache.reglesCriticite)
  const resultat = await appliquerCible(ligne, { composanteId, serviceId, departementId, lieuId, criticite })
  if (resultat === 'conflit_nom') {
    compteurs.conflitsNom++
    // NOMMER la machine, pas seulement la compter : un nombre dans le compte rendu
    // n'indique pas quelle fiche arbitrer, et la trouver demanderait une requête SQL.
    console.warn(`[glpi] conflit de nom : « ${c.nom} » (${c.glpiId}) est déjà porté par une autre fiche — renommage non appliqué sur ${ligne.cibleId ?? 'sa cible'}, le reste est à jour.`)
  }
  if (criticite) compteurs.criticites++

  if (ligne.classement === 'serveur') compteurs.serveurs++
  else if (ligne.classement === 'poste') compteurs.postes++
  else if (ligne.classement === 'appareil_mobile') compteurs.mobiles++
  else if (ligne.classement === 'iot') compteurs.iot++
  else if (ligne.classement === 'ignore') compteurs.ignores++
  else compteurs.aClasser++
  compteurs.total++
}

// Lance une synchronisation complète. Renvoie les compteurs, ou lève en cas d'échec.
export async function synchroniserGlpi(): Promise<CompteursSync> {
  const [cfg] = await db.select().from(connecteurGlpi).where(eq(connecteurGlpi.id, SINGLETON)).limit(1)
  if (!cfg?.url || !cfg.appToken || !cfg.userToken) {
    throw new Error('Connecteur GLPI non configuré (URL, App-Token et User-Token requis).')
  }
  // Un déchiffrement qui échoue rend `null` : on refuse plutôt que d'appeler GLPI avec
  // un jeton vide, ce qui produirait un 401 dont personne ne devinerait la cause.
  const jetonGlpi = dechiffrer(cfg.appToken)
  const jetonUtilisateur = dechiffrer(cfg.userToken)
  if (!jetonGlpi || !jetonUtilisateur) {
    throw new Error('Jetons GLPI illisibles : la clé de chiffrement a-t-elle changé ? Ressaisissez-les dans les réglages.')
  }

  await db.update(connecteurGlpi).set({ dernierStatut: 'en_cours' }).where(eq(connecteurGlpi.id, SINGLETON))
  // Marque toutes les machines comme « non vues » : ce qui reste non vu après le parcours
  // a disparu de GLPI (déclassé/retiré) et pourra être signalé.
  await db.update(glpiMachine).set({ vuAuSync: false })

  const cache = await chargerCacheOrg()
  const compteurs: CompteursSync = { total: 0, serveurs: 0, postes: 0, mobiles: 0, iot: 0, aClasser: 0, ignores: 0, criticites: 0, conflitsNom: 0, echecs: 0, doublons: 0, fiches: 0, clesEcrites: 0 }
  try {
    await parcourirComputers(
      { url: cfg.url, appToken: jetonGlpi, userToken: jetonUtilisateur },
      lot => traiterLot(lot, compteurs, cache),
    )

    // Écart mesuré une fois le parcours terminé : combien de machines rattachées, pour combien
    // de fiches distinctes.
    const [ecart] = await db
      .select({
        rattachees: sql<number>`count(${glpiMachine.cibleId})::int`,
        fiches: sql<number>`count(distinct ${glpiMachine.cibleId})::int`,
      })
      .from(glpiMachine)
    compteurs.fiches = Number(ecart?.fiches ?? 0)
    compteurs.doublons = Number(ecart?.rattachees ?? 0) - compteurs.fiches

    // CLÉ DE TECHNOLOGIE : réconciliée sur TOUT le parc, pas seulement sur ce qui vient d'être
    // touché.
    const cles = await reconcilierClesTechnologie()
    compteurs.clesEcrites = cles.reduce((n, r) => n + r.ecrites, 0)
    await db.update(connecteurGlpi)
      .set({ dernierStatut: 'ok', dernierMessage: [
        `${compteurs.total} machine(s) synchronisée(s)`,
        compteurs.criticites ? `${compteurs.criticites} marquée(s) critique(s) par leur groupe GLPI` : '',
        // Signalés explicitement : ces deux nombres décrivent du travail à faire, et
        // un compte rendu qui n'en dirait rien laisserait croire à une reprise complète.
        compteurs.conflitsNom ? `${compteurs.conflitsNom} nom(s) déjà pris — renommage non appliqué, à arbitrer` : '',
        compteurs.echecs ? `${compteurs.echecs} machine(s) en échec (voir les journaux du serveur)` : '',
        compteurs.clesEcrites ? `${compteurs.clesEcrites} clé(s) de technologie mise(s) à jour` : '',
        compteurs.doublons ? `${compteurs.doublons} entrée(s) GLPI en doublon derrière ${compteurs.fiches} fiche(s)` : '',
      ].filter(Boolean).join(' · ') + '.', dernierSyncAt: new Date(), dernierComptes: compteurs })
      .where(eq(connecteurGlpi.id, SINGLETON))
    return compteurs
  }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.update(connecteurGlpi)
      .set({ dernierStatut: 'erreur', dernierMessage: message, dernierSyncAt: new Date() })
      .where(eq(connecteurGlpi.id, SINGLETON))
    throw e
  }
}

// Reclassement manuel d'une machine (depuis la file « à classer »). Mémorisé : les
// re-syncs ne le réécraseront plus. La composante est (re)dérivée de l'entité stockée.
export async function reclasserMachine(machineId: string, classement: 'serveur' | 'poste' | 'appareil_mobile' | 'iot' | 'ignore' | 'a_classer'): Promise<void> {
  const [m] = await db.update(glpiMachine)
    .set({ classement, classementManuel: classement !== 'a_classer' })
    .where(eq(glpiMachine.id, machineId))
    .returning()
  if (m) {
    const cache = await chargerCacheOrg()
    const { composanteId, serviceId, departementId } = await resoudreOrganisation(m.entite, cache)
    const lieuId = await resoudreLieu(m.lieu, cache, composanteId)
    // Le reclassement crée la cible : elle doit naître avec sa criticité, sinon une machine
    // sortie de la file « à classer » perdrait le marquage porté par son groupe jusqu'à la
    // prochaine synchronisation.
    const criticite = criticiteDuGroupe(m.groupe, cache.reglesCriticite)
    await appliquerCible(m, { composanteId, serviceId, departementId, lieuId, criticite })
  }
}
