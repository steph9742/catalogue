import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from '@catalogue/database'
import {
  composante, connecteurLdap, correspondanceUnite, departement, glpiMachine, personne, service, uniteVue,
} from '@catalogue/database/tables'
import {
  booleen, date, parcourirPersonnes, toutes, une, type ConfigLdap, type EntreeLdap,
} from './ldapClient'
import {
  codeUniteRecherche, composanteDuService, composantePrincipale,
  decomposerService, mfaActif, natureDuService, prefixeAffectation,
} from './ldapUnites'
import { normaliser } from './glpiSync'
import { dechiffrer } from './secrets'

// SYNCHRONISATION DES PERSONNES DEPUIS L'ANNUAIRE. Ce que le connecteur apporte : le
// RATTACHEMENT.

export const ATTRIBUTS = [
  'uid', 'sn', 'givenName', 'displayName', 'mail', 'telephoneNumber',
  'ufcFonction', 'ufcCodeComposanteAff', 'supannEntiteAffectation',
  'supannEntiteAffectationPrincipale', 'ufcCodeService', 'ufcService',
  'ufcUniteRecherche', 'ufcCnu', 'ufcEmployeType', 'ufcActivite',
  'ufcDateFinActivite', 'supannListeRouge',
  // Demandé pour sa PRÉSENCE seule : elle dit que la MFA est activée. L'adresse de
  // recours qu'il contient n'est jamais stockée — voir `personne.mfaActif`.
  'ufcMailPersoMFA',
  // DE QUELLE POPULATION relève la personne. `ufcEmployeType` ne dit rien d'un doctorant,
  // qui n'est pas un employé : `eduPersonPrimaryAffiliation` et `ufcEtuType` le nomment.
  'eduPersonPrimaryAffiliation', 'ufcEtuType',
] as const

export type ComptesLdap = {
  lues: number
  creees: number
  majs: number
  desactivees: number
  /**
   * Les personnes qui n'obtiennent AUCUNE composante — le chiffre écrit, pas le chiffre espéré.
   */
  sansRattachement: number
  /** Codes rencontrés qu'aucune ligne de correspondance ne déclare. */
  aRapprocher: number
  /** Unités déclarées dont la composante n'existe pas encore dans le catalogue. */
  unitesACreer: number
  /** Services et départements créés sous leur composante. */
  sousUnitesCreees: number
  /** Personnes rattachées à un service ou un département, pas seulement à sa composante. */
  avecSousUnite: number
  /**
   * Libellés de service rencontrés et NON déclarés — donc non créés. Ce n'est pas un échec :
   * `ufcService` est en texte libre, et beaucoup de ses valeurs ne nomment aucune unité réelle.
   */
  sousUnitesNonDeclarees: number
}

/** Ce qu'une entrée d\'annuaire dit d\'une personne, une fois les codes extraits. */
export type PersonneLue = {
  uid: string
  nom: string
  prenom: string | null
  email: string | null
  telephone: string | null
  fonction: string | null
  codeComposante: string | null
  prefixe: string | null
  codeService: string | null
  libelleService: string | null
  codeLabo: string | null
  valeurLabo: string | null
  cnu: string | null
  population: string | null
  actif: boolean
  listeRouge: boolean
  /** `null` = attribut absent de la réponse, ce qui n'est pas « MFA désactivée ». */
  mfa: boolean | null
  /** Ce que `ufcService` désigne : un département se reconnaît, un site non. */
  natureService: 'departement' | 'service' | null
}

/**
 * Lit une entrée. AUCUN ACCÈS BASE : toute la logique d'extraction est ici, donc vérifiable
 * sans annuaire ni PostgreSQL.
 */
export function lire(e: EntreeLdap): PersonneLue | null {
  const uid = une(e, 'uid')
  const nom = une(e, 'sn')
  // Sans identifiant ni nom, l'entrée ne désigne personne. La créer produirait une fiche
  // vide qu'aucun rapprochement ultérieur ne saurait retrouver.
  if (!uid || !nom) return null

  const labo = une(e, 'ufcUniteRecherche')
  const actif = booleen(e, 'ufcActivite')
  const fin = date(e, 'ufcDateFinActivite')

  return {
    uid,
    nom,
    prenom: une(e, 'givenName'),
    email: une(e, 'mail'),
    telephone: une(e, 'telephoneNumber'),
    fonction: une(e, 'ufcFonction'),
    codeComposante: composantePrincipale(
      une(e, 'supannEntiteAffectationPrincipale'),
      toutes(e, 'supannEntiteAffectation'),
      une(e, 'ufcCodeComposanteAff'),
    ),
    prefixe: prefixeAffectation(
      une(e, 'supannEntiteAffectationPrincipale') ?? toutes(e, 'supannEntiteAffectation')[0],
    ),
    codeService: une(e, 'ufcCodeService'),
    libelleService: une(e, 'ufcService'),
    codeLabo: codeUniteRecherche(labo),
    valeurLabo: labo,
    cnu: une(e, 'ufcCnu'),
    // Un doctorant n'a pas de `ufcEmployeType` : sans repli, sa population serait vide
    // alors que l'annuaire la donne. L'ordre va du plus précis au plus général.
    population: une(e, 'ufcEmployeType') ?? une(e, 'ufcEtuType') ?? une(e, 'eduPersonPrimaryAffiliation'),
    // `ufcActivite` ABSENT ne vaut pas « inactif » : on ne sait pas, donc on garde actif.
    // Une date de fin PASSÉE, elle, est un fait daté.
    actif: actif === false ? false : !(fin && fin.getTime() < Date.now()),
    listeRouge: booleen(e, 'supannListeRouge') === true,
    mfa: mfaActif(e.ufcMailPersoMFA),
    natureService: natureDuService(une(e, 'ufcService')),
  }
}

type Correspondance = typeof correspondanceUnite.$inferSelect

/**
 * Le rattachement d'une personne, résolu contre la table de correspondance.
 */
export function resoudre(
  p: PersonneLue,
  parCode: ReadonlyMap<string, Correspondance>,
): { composanteCode: string | null, laboCode: string | null, ignore: boolean, inconnus: string[] } {
  const inconnus: string[] = []
  let ignore = false

  const chercher = (code: string | null): Correspondance | null => {
    if (!code) return null
    const c = parCode.get(code)
    if (!c) { inconnus.push(code); return null }
    if (c.nature === 'ignorer') { ignore = true; return null }
    return c
  }

  const comp = chercher(p.codeComposante)
  const labo = chercher(p.codeLabo)

  return {
    composanteCode: comp?.code ?? null,
    // Un laboratoire n'est PAS une composante et ne se range sous aucune : une UMR n'a
    // pas de tutelle d'UFR à lui inventer. Les deux rattachements coexistent.
    laboCode: labo?.code ?? null,
    ignore,
    inconnus,
  }
}

/** Enregistre ce que le relevé a vu, avec son effectif — la matière des listes. */
async function noterVue(provenance: 'ldap_composante' | 'ldap_labo' | 'ldap_service', vus: Map<string, { code: string | null, n: number }>) {
  for (const [valeur, { code, n }] of vus) {
    await db.insert(uniteVue)
      .values({ provenance, valeur, code, effectif: n, vuAuSync: true })
      .onConflictDoUpdate({
        target: [uniteVue.provenance, uniteVue.valeur],
        set: { code, effectif: n, vuAuSync: true, updatedAt: new Date() },
      })
  }
}

/**
 * La synchronisation complète. `simuler` rend exactement les mêmes compteurs SANS RIEN ÉCRIRE.
 */
/**
 * La configuration LDAP complète, mot de passe DÉCHIFFRÉ — ou `null` s'il manque quoi que ce
 * soit.
 */
export async function configLdapComplete(): Promise<ConfigLdap | null> {
  const c = await lireConfigLdap()
  const mdp = dechiffrer(c?.motDePasse)
  if (!c?.url || !c.bindDn || !mdp || !c.baseDn || !c.filtre) return null
  return { url: c.url, bindDn: c.bindDn, motDePasse: mdp, baseDn: c.baseDn, filtre: c.filtre }
}

export async function synchroniserLdap(
  cfg: ConfigLdap,
  options: { simuler?: boolean } = {},
): Promise<ComptesLdap & { message: string }> {
  const simuler = options.simuler === true

  const corr = await db.select().from(correspondanceUnite)
  const parCode = new Map(corr.filter(c => c.code).map(c => [c.code!, c]))

  // Les référentiels existants, indexés comme glpiSync les indexe : par nom normalisé.
  const [comps, servs, deps] = await Promise.all([
    db.select({ id: composante.id, nom: composante.nom, codeUnite: composante.codeUnite }).from(composante),
    db.select({ id: service.id, nom: service.nom, composanteId: service.composanteId }).from(service),
    db.select({ id: departement.id, nom: departement.nom, composanteId: departement.composanteId }).from(departement),
  ])
  const compParNom = new Map(comps.map(c => [normaliser(c.nom), c.id]))
  const compParCodeUnite = new Map(comps.filter(c => c.codeUnite).map(c => [c.codeUnite!, c.id]))
  // Clé COMPOSANTE + nom : deux composantes peuvent avoir un « CRI » ou un « Dept-INFO »
  // chacune, et les confondre attribuerait les personnes de l'une à l'autre.
  const servParNom = new Map(servs.map(x => [`${x.composanteId}|${normaliser(x.nom)}`, x.id]))
  const depParNom = new Map(deps.map(x => [`${x.composanteId}|${normaliser(x.nom)}`, x.id]))

  // Les correspondances de niveau service, indexées sur le libellé de l'annuaire — la
  // troisième clé, celle sans laquelle un service ne se rapproche de rien.
  const parLibelle = new Map(corr.filter(x => x.libelleLdap).map(x => [x.libelleLdap!.trim(), x]))
  // Les intitulés de composante connus, pour reconnaître le préfixe d'un libellé.
  const nomsComposantes = [
    ...corr.filter(x => x.nature === 'composante' || x.nature === 'laboratoire').map(x => x.intitule),
    ...corr.filter(x => x.nomGlpi).map(x => x.nomGlpi!),
    ...comps.map(x => x.nom),
  ]

  /**
   * Le service ou département d'une personne, trouvé ou créé sous SA composante.
   */
  async function sousUnite(
    libelle: string | null,
    codeService: string | null,
    composanteId: string | null,
  ): Promise<{ serviceId: string | null, departementId: string | null }> {
    const vide = { serviceId: null, departementId: null }
    if (!libelle || !composanteId) return vide

    // LA FUSION SE SUIT AVANT TOUT LE RESTE. Une ligne fusionnée n'a pas de nature ni
    // d'intitulé propres : elle renvoie à ceux de sa cible, et c'est tout son objet.
    let declaree = parLibelle.get(libelle.trim())
    for (let saut = 0; saut < 3 && declaree?.fusionneeAvec; saut++) {
      const cible = corr.find(x => x.id === declaree!.fusionneeAvec)
      if (!cible || cible.id === declaree.id) break
      declaree = cible
    }
    if (declaree?.nature === 'ignorer') return vide

    const d = decomposerService(libelle, nomsComposantes)

    // LE PARENT EST CELUI QUE LE LIBELLÉ NOMME, pas celui de la personne. « UFR ST départements
    // » dit sous quelle composante vit ce service.
    const parentDeclare = declaree?.composanteCode
      ? corr.find(x => x.code === declaree.composanteCode)
      : null
    const parentId = (parentDeclare ? idDeCorrespondance(parentDeclare) : null)
      ?? (d.composante ? compParNom.get(normaliser(d.composante)) : null)
      ?? composanteId
    // L'intitulé DÉCLARÉ prime sur celui déduit du libellé : c'est tout l'objet de la
    // table. Le nom GLPI prime encore, quand il existe — c'est lui qui porte les machines.
    const nom = declaree?.nomGlpi ?? declaree?.intitule ?? d.unite
    const nature = declaree?.nature === 'service' || declaree?.nature === 'departement'
      ? declaree.nature
      : d.nature
    // Le libellé ne nomme que la composante : la personne y reste, sans sous-unité. Ce
    // n'est pas un manque.
    if (!nom || !nature) return vide

    const cle = `${parentId}|${normaliser(nom)}`
    const carte = nature === 'departement' ? depParNom : servParNom
    const deja = carte.get(cle)
    if (deja) return nature === 'departement' ? { serviceId: null, departementId: deja } : { serviceId: deja, departementId: null }

    // OPTION RETENUE : ON NE CRÉE QUE CE QUI EST DÉCLARÉ. `ufcService` est un champ en texte
    // libre, et le relevé y trouve 268 libellés dont beaucoup ne nomment aucune unité : « UFR
    // SLHS départements » (276 personnes) est un fourre-tout, « CHU MINJOZ » (133) un organisme
    // extérieur, « Uo générique » (60)…
    if (!declaree) {
      aRefusees.add(libelle.trim())
      return vide
    }

    aCreerSous.add(cle)
    // EN SIMULATION, LE RATTACHEMENT EST RÉSOLU SANS ÊTRE ÉCRIT. Rendre `vide` faisait annoncer
    // « 0 personne rattachée à une sous-unité » là où la synchronisation réelle en rattacherait
    // des milliers : la sous-unité n'existe pas ENCORE, mais elle va être créée dans le même
    // passage.
    if (simuler) return { serviceId: nature === 'service' ? cle : null, departementId: nature === 'departement' ? cle : null }

    if (nature === 'departement') {
      const [row] = await db.insert(departement)
        .values({ nom, composanteId: parentId, type: 'enseignement', sourceGlpi: false })
        .onConflictDoNothing().returning({ id: departement.id })
      if (row) depParNom.set(cle, row.id)
      return { serviceId: null, departementId: row?.id ?? null }
    }
    const [row] = await db.insert(service)
      .values({ nom, composanteId: parentId, sourceGlpi: false })
      .onConflictDoNothing().returning({ id: service.id })
    if (row) servParNom.set(cle, row.id)
    return { serviceId: row?.id ?? null, departementId: null }
  }

  // L'ID de composante visé par un code de correspondance : par le code d'unité pour un
  // laboratoire, par l'intitulé faisant foi sinon.
  const idDeCorrespondance = (c: Correspondance): string | null =>
    (c.code ? compParCodeUnite.get(c.code) : null)
    ?? (c.nomGlpi ? compParNom.get(normaliser(c.nomGlpi)) : null)
    ?? compParNom.get(normaliser(c.intitule))
    ?? null

  const existantes = await db.select({
    id: personne.id, uidLdap: personne.uidLdap, email: personne.email,
    composanteId: personne.composanteId, sourceLdap: personne.sourceLdap,
  }).from(personne)
  const parUid = new Map(existantes.filter(x => x.uidLdap).map(x => [x.uidLdap!, x]))
  // Repli UNE SEULE FOIS sur l'adresse : les fiches saisies à la main n'ont pas d'uid, et un
  // doublon créé ici porterait des référents et des responsabilités qui se sépareraient en deux
  // fiches.
  const parEmail = new Map(existantes.filter(x => !x.uidLdap && x.email).map(x => [x.email!.toLowerCase(), x]))

  const c: ComptesLdap = {
    lues: 0, creees: 0, majs: 0, desactivees: 0, sansRattachement: 0,
    aRapprocher: 0, unitesACreer: 0, sousUnitesCreees: 0, avecSousUnite: 0, sousUnitesNonDeclarees: 0,
  }
  // L'entité de rattachement des unités créées.
  const [uneEntite] = await db.select({ id: composante.entiteId }).from(composante).limit(1)
  const aCreer = new Map<string, Correspondance>()
  const aCreerSous = new Set<string>()
  const aRefusees = new Set<string>()
  const vusComposante = new Map<string, { code: string | null, n: number }>()
  const vusLabo = new Map<string, { code: string | null, n: number }>()
  const vusService = new Map<string, { code: string | null, n: number }>()
  const inconnus = new Set<string>()
  const uidsVus = new Set<string>()

  await parcourirPersonnes(cfg, ATTRIBUTS, async (lot) => {
    for (const e of lot) {
      const p = lire(e)
      if (!p) continue
      c.lues++
      uidsVus.add(p.uid)

      const compter = (m: Map<string, { code: string | null, n: number }>, v: string | null, code: string | null) => {
        if (!v) return
        const d = m.get(v) ?? { code, n: 0 }
        d.n++
        m.set(v, d)
      }
      compter(vusComposante, p.codeComposante, p.codeComposante)
      compter(vusLabo, p.valeurLabo, p.codeLabo)
      compter(vusService, p.libelleService, composanteDuService(p.codeService))

      const r = resoudre(p, parCode)
      for (const i of r.inconnus) inconnus.add(i)

      // Le rattachement retenu : le laboratoire d'abord s'il est connu — c'est l'unité de
      // travail réelle d'un chercheur — la composante d'affectation sinon.
      const corrLabo = r.laboCode ? parCode.get(r.laboCode) : null
      const corrComp = r.composanteCode ? parCode.get(r.composanteCode) : null
      const retenue = corrLabo ?? corrComp
      let composanteId = (corrLabo ? idDeCorrespondance(corrLabo) : null)
        ?? (corrComp ? idDeCorrespondance(corrComp) : null)

      // UNE CORRESPONDANCE DÉCLARÉE QUI NE DÉSIGNE RIEN. Le code est connu, mais aucune
      // composante du catalogue ne lui correspond : soit la ligne n'a pas de nom GLPI, soit
      // l'unité n'existe pas encore.
      if (!composanteId && retenue && retenue.nature !== 'ignorer' && uneEntite) {
        aCreer.set(retenue.id, retenue)
        if (!simuler) {
          const [cree] = await db.insert(composante).values({
            nom: retenue.intitule,
            sigle: retenue.sigle,
            entiteId: uneEntite.id,
            type: (retenue.typeComposante ?? (retenue.nature === 'laboratoire' ? 'laboratoire' : 'autre')) as never,
            codeUnite: retenue.nature === 'laboratoire' ? retenue.code : null,
            aRapprocher: true,
          }).onConflictDoNothing().returning({ id: composante.id })
          if (cree) {
            composanteId = cree.id
            compParNom.set(normaliser(retenue.intitule), cree.id)
            if (retenue.code) compParCodeUnite.set(retenue.code, cree.id)
          }
        }
      }

      // LE CHIFFRE ÉCRIT, PAS LE CHIFFRE ESPÉRÉ : compté après la résolution complète.
      if (!composanteId) c.sansRattachement++

      const sous = await sousUnite(p.libelleService, p.codeService, composanteId)
      if (sous.serviceId || sous.departementId) c.avecSousUnite++

      if (simuler) {
        // La résolution ci-dessus rend une clé de travail, pas un identifiant : rien
        // n'est écrit, et la boucle s'arrête ici.
        if (!parUid.has(p.uid) && !(p.email && parEmail.has(p.email.toLowerCase()))) c.creees++
        else c.majs++
        continue
      }

      const champs = {
        nom: p.nom,
        prenom: p.prenom,
        email: p.email,
        telephone: p.telephone,
        fonction: p.fonction,
        prefixeAffectation: p.prefixe,
        serviceId: sous.serviceId,
        departementId: sous.departementId,
        mfaActif: p.mfa,
        actif: p.actif,
        sourceLdap: true,
        uidLdap: p.uid,
        updatedAt: new Date(),
      }

      const deja = parUid.get(p.uid) ?? (p.email ? parEmail.get(p.email.toLowerCase()) : undefined)
      if (deja) {
        // LA DÉCISION HUMAINE PRIME : une composante déjà posée n'est pas réécrite.
        await db.update(personne)
          .set(deja.composanteId
            ? { ...champs, serviceId: undefined, departementId: undefined }
            : { ...champs, composanteId })
          .where(eq(personne.id, deja.id))
        c.majs++
      }
      else {
        await db.insert(personne).values({ ...champs, composanteId }).onConflictDoNothing()
        c.creees++
      }
    }
  })

  // LES VALEURS RENCONTRÉES SONT NOTÉES MÊME EN SIMULATION. « 29 codes inconnus » sans pouvoir
  // les regarder n'apprend rien : il fallait synchroniser pour voir ce qu'on aurait dû déclarer
  // AVANT de synchroniser.
  await noterVue('ldap_composante', vusComposante)
  await noterVue('ldap_labo', vusLabo)
  await noterVue('ldap_service', vusService)

  if (!simuler) {
    // DÉSACTIVER, JAMAIS SUPPRIMER. L'annuaire purge les personnels un an après leur
    // départ : l'absence est le seul signal disponible, et elle ne vaut pas suppression.
    const partis = await db.update(personne)
      .set({ actif: false, updatedAt: new Date() })
      .where(and(
        eq(personne.sourceLdap, true),
        eq(personne.actif, true),
        isNotNull(personne.uidLdap),
        uidsVus.size ? sql`${personne.uidLdap} NOT IN ${[...uidsVus]}` : sql`true`,
      ))
      .returning({ id: personne.id })
    c.desactivees = partis.length
  }

  c.aRapprocher = inconnus.size
  c.unitesACreer = aCreer.size
  c.sousUnitesCreees = aCreerSous.size
  c.sousUnitesNonDeclarees = aRefusees.size
  return {
    ...c,
    message: `${c.lues} entrée(s) lue(s) — ${c.creees} créée(s), ${c.majs} mise(s) à jour, `
      + `${c.desactivees} désactivée(s). `
      + `${c.sansRattachement} personne(s) sans composante`
      + `${c.sansRattachement ? ` (${Math.round((c.sansRattachement / Math.max(1, c.lues)) * 100)} %)` : ''}, `
      + `${c.unitesACreer} composante(s) et ${c.sousUnitesCreees} service(s)/département(s) `
      + `${simuler ? 'à créer' : 'créé(s)'}, ${c.avecSousUnite} personne(s) rattachée(s) à une sous-unité. `
      + `${c.sousUnitesNonDeclarees} libellé(s) de service non déclaré(s) — aucune unité créée pour eux — `
      + `et ${c.aRapprocher} code(s) inconnu(s).`,
  }
}

/** Les identifiants d'unités déjà rapprochées, pour l\'écran des réglages. */
export async function fileARapprocher() {
  const vues = await db.select().from(uniteVue).where(eq(uniteVue.vuAuSync, true))
  const corr = await db.select().from(correspondanceUnite)
  const codes = new Set(corr.filter(x => x.code).map(x => x.code!))
  const libelles = new Set(corr.filter(x => x.libelleLdap).map(x => x.libelleLdap!.trim()))
  return vues
    .filter((v) => {
      // UN SERVICE SE DÉCLARE PAR SON LIBELLÉ, pas par son code. Le `code` d'une valeur de
      // service porte celui de sa COMPOSANTE — déclarée, elle : filtrer là-dessus cachait trois
      // cent cinquante libellés de service qui, eux, ne l'étaient pas.
      if (v.provenance === 'ldap_service') return !libelles.has(v.valeur.trim())
      return !v.code || !codes.has(v.code)
    })
    .sort((a, b) => b.effectif - a.effectif)
}

export { inArray }

const SINGLETON = 'ldap'

/** La configuration, créée au premier accès comme celle des autres connecteurs. */
export async function lireConfigLdap() {
  const [row] = await db.select().from(connecteurLdap).where(eq(connecteurLdap.id, SINGLETON)).limit(1)
  if (row) return row
  const [cree] = await db.insert(connecteurLdap).values({ id: SINGLETON }).onConflictDoNothing().returning()
  return cree ?? (await db.select().from(connecteurLdap).where(eq(connecteurLdap.id, SINGLETON)).limit(1))[0]
}

export { SINGLETON as SINGLETON_LDAP }

/**
 * COUVERTURE MFA PAR UNITÉ — la même mesure que la couverture EDR, sur les personnes.
 */
export async function couvertureMfa() {
  const lignes = await db.select({
    composanteId: personne.composanteId,
    nom: composante.nom,
    entiteId: composante.entiteId,
    type: composante.type,
    mfa: personne.mfaActif,
    n: sql<number>`count(*)::int`,
  })
    .from(personne)
    .leftJoin(composante, eq(composante.id, personne.composanteId))
    .where(eq(personne.actif, true))
    .groupBy(personne.composanteId, composante.nom, composante.entiteId, composante.type, personne.mfaActif)

  type Case = {
    composanteId: string | null
    nom: string
    entiteId: string | null
    type: string | null
    personnes: number
    avecMfa: number
    sansMfa: number
    nonReleve: number
  }
  const par = new Map<string, Case>()
  for (const l of lignes) {
    const cle = l.composanteId ?? '__sans__'
    const c = par.get(cle) ?? {
      composanteId: l.composanteId,
      // Nommée, jamais tue : une personne sans composante existe, et l'écarter ferait une
      // somme inférieure au total sans que rien ne le signale.
      nom: l.nom ?? '(sans rattachement)',
      entiteId: l.entiteId ?? null,
      type: l.type ?? null,
      personnes: 0, avecMfa: 0, sansMfa: 0, nonReleve: 0,
    }
    c.personnes += l.n
    if (l.mfa === true) c.avecMfa += l.n
    else if (l.mfa === false) c.sansMfa += l.n
    else c.nonReleve += l.n
    par.set(cle, c)
  }

  const lignesTriees = [...par.values()].sort((a, b) => b.sansMfa - a.sansMfa || b.personnes - a.personnes)
  const somme = (f: (c: Case) => number) => lignesTriees.reduce((n, c) => n + f(c), 0)
  return {
    total: {
      personnes: somme(c => c.personnes),
      avecMfa: somme(c => c.avecMfa),
      sansMfa: somme(c => c.sansMfa),
      nonReleve: somme(c => c.nonReleve),
    },
    lignes: lignesTriees,
  }
}

/**
 * LES VALEURS QUE GLPI CONTIENT, calculées à la lecture plutôt que stockées.
 */
export async function valeursGlpi() {
  const lignes = await db.select({
    entite: glpiMachine.entite,
    n: sql<number>`count(*)::int`,
  })
    .from(glpiMachine)
    .where(isNotNull(glpiMachine.entite))
    .groupBy(glpiMachine.entite)

  const par = new Map<string, { niveau: 2 | 3 | 4, valeur: string, parent: string | null, machines: number }>()
  for (const l of lignes) {
    const segs = (l.entite ?? '').split('>').map(s => s.trim()).filter(Boolean)
    // Le 1er segment est l'établissement, et il n'y en a qu'un : le proposer ne
    // distinguerait rien.
    for (let i = 1; i < Math.min(segs.length, 4); i++) {
      const niveau = (i + 1) as 2 | 3 | 4
      const valeur = segs[i]!
      const cle = `${niveau}|${segs.slice(1, i + 1).join(' > ')}`
      const e = par.get(cle) ?? { niveau, valeur, parent: i > 1 ? segs[i - 1]! : null, machines: 0 }
      e.machines += l.n
      par.set(cle, e)
    }
  }
  return [...par.values()].sort((a, b) => a.niveau - b.niveau || b.machines - a.machines)
}
