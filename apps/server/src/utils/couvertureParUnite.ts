import { estDepartement, normaliser, segmentsDe } from './glpiSync'
import { rapprocher, type AgentEdr } from './harfanglabRapprochement'

// VENTILATION DE LA COUVERTURE EDR PAR UNITÉ D'ORGANISATION. Séparé de la route pour être
// vérifiable sans base : la propriété qui compte — la somme des lignes fait le total — ne se
// teste pas à travers une requête SQL et un connecteur.

export type MachineCritique = { glpiId: string, entite: string | null }
/** Toute machine GLPI, critique ou non. */
export type MachineParc = MachineCritique & { nom: string | null, numeroSerie: string | null, critique: boolean }

type Compteurs = {
  critiques: number
  avecAgent: number
  sansAgent: number
  ambigus: number
  nonCritiques: number
  nonCritiquesAvecAgent: number
  nonCritiquesSansAgent: number
  nonCritiquesAmbigus: number
  /**
   * Agents EDR SANS machine GLPI, placés dans l'unité par leur entité EDR.
   */
  agentsHorsGlpi: number
}

export type LigneComposante = Compteurs & {
  composanteId: string | null
  nom: string
  entiteId: string | null
}

export type LigneSousUnite = Compteurs & {
  /** `null` quand l'unité n\'existe pas (encore) dans le catalogue : on ne l\'invente pas. */
  id: string | null
  nom: string
  /** Ce que GLPI décrit : un département d'enseignement, ou un service. */
  niveau: 'service' | 'departement'
  composanteId: string | null
}

export type LignePole = Compteurs & {
  /** `null` quand le pôle n'est pas déclaré dans le catalogue : GLPI le nomme, on le rend. */
  id: string | null
  nom: string
  /** L'unité du dessus, celle dont la fiche affiche ce détail. */
  sousUniteId: string | null
  sousUniteNiveau: 'service' | 'departement'
  composanteId: string | null
}

/** Les libellés des machines qu'aucun chemin ne rattache. Nommés, jamais tus. */
export const SANS_COMPOSANTE = '(sans composante dans GLPI)'
export const SANS_SOUS_UNITE = '(sans service ni département dans GLPI)'
export const SANS_POLE = '(sans pôle dans GLPI)'
/** Agents hors GLPI qu'aucune entité EDR ne place. Nommés, jamais tus. */
export const ENTITE_EDR_NON_RATTACHEE = '(entité EDR non rattachée)'
export const SANS_ENTITE_EDR = '(agent EDR sans entité)'

/** Une unité désignée par ses identifiants, parents compris. */
export type UniteResolue = {
  composanteId: string | null
  sousUnite: { niveau: 'service' | 'departement', id: string } | null
  poleId: string | null
}
/** Un agent sans machine GLPI, et l'unité où son entité EDR le place — ou `null`. */
export type AgentHorsGlpi = { unite: UniteResolue | null, entiteEdr: string | null }

export type Referentiels = {
  composantes: readonly { id: string, nom: string, entiteId: string }[]
  services: readonly { id: string, nom: string, composanteId: string | null }[]
  departements: readonly { id: string, nom: string, composanteId: string | null }[]
  // Un pôle appartient à un SERVICE (c'est ce que porte le schéma). Le 4e segment d'un
  // département n'a donc rien à rejoindre : il reste nommé, sans identifiant inventé.
  poles: readonly { id: string, nom: string, serviceId: string }[]
}

/** L'état des machines NON critiques face à l\'EDR. `avecAgent` est explicite : ne pas y être n\'est pas « lié ». */
export type EtatsNonCritiques = {
  machines: readonly MachineCritique[]
  avecAgent: ReadonlySet<string>
  ambigus: ReadonlySet<string>
}

const vide = (): Compteurs => ({
  critiques: 0, avecAgent: 0, sansAgent: 0, ambigus: 0,
  nonCritiques: 0, nonCritiquesAvecAgent: 0, nonCritiquesSansAgent: 0, nonCritiquesAmbigus: 0,
  agentsHorsGlpi: 0,
})

/**
 * TROIS ÉTATS DISJOINTS, et `ambigus` d'abord : un rapprochement non tranché n\'est ni une
 * couverture ni un écart.
 */
function ajouter(c: Compteurs, glpiId: string, sansAgent: ReadonlySet<string>, ambigus: ReadonlySet<string>) {
  c.critiques++
  if (ambigus.has(glpiId)) c.ambigus++
  else if (sansAgent.has(glpiId)) c.sansAgent++
  else c.avecAgent++
}

function ajouterNonCritique(c: Compteurs, glpiId: string, e: EtatsNonCritiques) {
  c.nonCritiques++
  if (e.ambigus.has(glpiId)) c.nonCritiquesAmbigus++
  else if (e.avecAgent.has(glpiId)) c.nonCritiquesAvecAgent++
  else c.nonCritiquesSansAgent++
}

export function ventilerCouverture(
  critiques: readonly MachineCritique[],
  sansAgent: ReadonlySet<string>,
  ambigus: ReadonlySet<string>,
  refs: Referentiels,
  nonCritiques?: EtatsNonCritiques,
  agentsHorsGlpi?: readonly AgentHorsGlpi[],
): { composantes: LigneComposante[], sousUnites: LigneSousUnite[], poles: LignePole[] } {
  const parNomComposante = new Map(refs.composantes.map(c => [normaliser(c.nom), c]))
  // Clé composante + nom : deux composantes peuvent avoir un « Dept-INFO » chacune, et les
  // confondre attribuerait les machines de l'une à l'autre.
  const parCleService = new Map(refs.services.map(s => [`${s.composanteId}|${normaliser(s.nom)}`, s]))
  const parCleDepartement = new Map(refs.departements.map(d => [`${d.composanteId}|${normaliser(d.nom)}`, d]))
  // Même raison un cran plus bas : deux services peuvent avoir un pôle « Réseau ».
  const parClePole = new Map(refs.poles.map(p => [`${p.serviceId}|${normaliser(p.nom)}`, p]))
  const parIdComposante = new Map(refs.composantes.map(c => [c.id, c]))
  const parIdService = new Map(refs.services.map(x => [x.id, x]))
  const parIdDepartement = new Map(refs.departements.map(x => [x.id, x]))
  const parIdPole = new Map(refs.poles.map(x => [x.id, x]))

  const composantes = new Map<string, LigneComposante>()
  const sousUnites = new Map<string, LigneSousUnite>()
  const poles = new Map<string, LignePole>()

  /**
   * Range UNE machine dans sa composante, sa sous-unité et son pôle, et la compte sur les trois
   * lignes.
   */
  const placer = (m: MachineCritique, compter: (c: Compteurs) => void) => {
    const segments = segmentsDe(m.entite)
    // Le 2e segment nomme la composante. Le 1er est l'établissement, et il n'y en a qu'un :
    // ventiler dessus rendrait une ligne unique égale au total.
    const nomComposante = segments[1]
    const c = nomComposante ? parNomComposante.get(normaliser(nomComposante)) : undefined
    const cleC = c?.id ?? (nomComposante ? `?${normaliser(nomComposante)}` : '__sans__')

    const ligneC = composantes.get(cleC)
      ?? { composanteId: c?.id ?? null, nom: c?.nom ?? nomComposante ?? SANS_COMPOSANTE, entiteId: c?.entiteId ?? null, ...vide() }
    compter(ligneC)
    composantes.set(cleC, ligneC)

    // --- 3e segment : département d'enseignement OU service --------------------------
    // GLPI ne dit pas lequel. On cherche d'abord dans les deux référentiels, et on ne tranche
    // sur le NOM que si aucun ne connaît l'unité — même règle que la synchronisation, pour que
    // les deux ne se contredisent pas.
    const nomSous = segments[2]
    if (!nomSous) {
      const cleS = `${cleC}|__sans__`
      const l = sousUnites.get(cleS)
        ?? { id: null, nom: SANS_SOUS_UNITE, niveau: 'service' as const, composanteId: c?.id ?? null, ...vide() }
      compter(l)
      sousUnites.set(cleS, l)
      // Le 3e niveau la porte aussi, sinon la somme des pôles serait inférieure à celle des
      // sous-unités — et aucune fiche ne l'affiche, puisque aucune sous-unité ne la réclame.
      const cleP = `${cleS}|__sans__`
      const lp = poles.get(cleP)
        ?? { id: null, nom: SANS_POLE, sousUniteId: null, sousUniteNiveau: 'service' as const, composanteId: c?.id ?? null, ...vide() }
      compter(lp)
      poles.set(cleP, lp)
      return
    }
    const cleRef = `${c?.id ?? null}|${normaliser(nomSous)}`
    const dep = parCleDepartement.get(cleRef)
    const srv = parCleService.get(cleRef)
    const niveau: 'service' | 'departement' = dep ? 'departement' : srv ? 'service' : (estDepartement(nomSous) ? 'departement' : 'service')
    const trouve = dep ?? srv
    const cleS = `${cleC}|${niveau}|${trouve?.id ?? normaliser(nomSous)}`
    const l = sousUnites.get(cleS)
      ?? { id: trouve?.id ?? null, nom: trouve?.nom ?? nomSous, niveau, composanteId: c?.id ?? null, ...vide() }
    compter(l)
    sousUnites.set(cleS, l)

    // --- 4e segment : le pôle ---------------------------------------------------------
    // La ligne « sans pôle » est émise MÊME quand aucun pôle n'existe : sans elle, une unité
    // qui en a deux verrait le détail totaliser moins que le bloc juste au-dessus, sans que
    // rien ne le signale.
    const nomPole = segments[3]
    // Un pôle appartient à un service : le 4e segment d'un département ne peut rejoindre
    // aucun référentiel, il garde son nom GLPI.
    const p = nomPole && niveau === 'service' && trouve
      ? parClePole.get(`${trouve.id}|${normaliser(nomPole)}`)
      : undefined
    const cleP = `${cleS}|${nomPole ? (p?.id ?? normaliser(nomPole)) : '__sans__'}`
    const lp = poles.get(cleP)
      ?? {
        id: p?.id ?? null,
        nom: p?.nom ?? nomPole ?? SANS_POLE,
        sousUniteId: trouve?.id ?? null,
        sousUniteNiveau: niveau,
        composanteId: c?.id ?? null,
        ...vide(),
      }
    compter(lp)
    poles.set(cleP, lp)
  }

  for (const m of critiques) placer(m, c => ajouter(c, m.glpiId, sansAgent, ambigus))
  if (nonCritiques) {
    for (const m of nonCritiques.machines) placer(m, c => ajouterNonCritique(c, m.glpiId, nonCritiques))
  }

  /**
   * Range un agent hors GLPI dans une unité désignée par ses IDENTIFIANTS.
   */
  const placerUnite = (u: UniteResolue, compter: (c: Compteurs) => void) => {
    const c = u.composanteId ? parIdComposante.get(u.composanteId) : undefined
    const cleC = c?.id ?? '__sans__'
    const ligneC = composantes.get(cleC)
      ?? { composanteId: c?.id ?? null, nom: c?.nom ?? SANS_COMPOSANTE, entiteId: c?.entiteId ?? null, ...vide() }
    compter(ligneC)
    composantes.set(cleC, ligneC)

    const su = u.sousUnite
      ? (u.sousUnite.niveau === 'service' ? parIdService.get(u.sousUnite.id) : parIdDepartement.get(u.sousUnite.id))
      : undefined
    if (!u.sousUnite || !su) {
      const cleS = `${cleC}|__sans__`
      const l = sousUnites.get(cleS)
        ?? { id: null, nom: SANS_SOUS_UNITE, niveau: 'service' as const, composanteId: c?.id ?? null, ...vide() }
      compter(l)
      sousUnites.set(cleS, l)
      const cleP = `${cleS}|__sans__`
      const lp = poles.get(cleP)
        ?? { id: null, nom: SANS_POLE, sousUniteId: null, sousUniteNiveau: 'service' as const, composanteId: c?.id ?? null, ...vide() }
      compter(lp)
      poles.set(cleP, lp)
      return
    }
    const niveau = u.sousUnite.niveau
    const cleS = `${cleC}|${niveau}|${su.id}`
    const l = sousUnites.get(cleS) ?? { id: su.id, nom: su.nom, niveau, composanteId: c?.id ?? null, ...vide() }
    compter(l)
    sousUnites.set(cleS, l)

    const p = u.poleId ? parIdPole.get(u.poleId) : undefined
    const cleP = `${cleS}|${p?.id ?? '__sans__'}`
    const lp = poles.get(cleP)
      ?? { id: p?.id ?? null, nom: p?.nom ?? SANS_POLE, sousUniteId: su.id, sousUniteNiveau: niveau, composanteId: c?.id ?? null, ...vide() }
    compter(lp)
    poles.set(cleP, lp)
  }

  /** Une ligne nommée pour ce qu'aucune unité ne rattache, aux trois niveaux. */
  const placerEtiquette = (nom: string, compter: (c: Compteurs) => void) => {
    const cleC = `?${nom}`
    const ligneC = composantes.get(cleC) ?? { composanteId: null, nom, entiteId: null, ...vide() }
    compter(ligneC)
    composantes.set(cleC, ligneC)
    const cleS = `${cleC}|__sans__`
    const l = sousUnites.get(cleS) ?? { id: null, nom: SANS_SOUS_UNITE, niveau: 'service' as const, composanteId: null, ...vide() }
    compter(l)
    sousUnites.set(cleS, l)
    const cleP = `${cleS}|__sans__`
    const lp = poles.get(cleP) ?? { id: null, nom: SANS_POLE, sousUniteId: null, sousUniteNiveau: 'service' as const, composanteId: null, ...vide() }
    compter(lp)
    poles.set(cleP, lp)
  }

  for (const a of agentsHorsGlpi ?? []) {
    const compter = (c: Compteurs) => {
      c.agentsHorsGlpi++
    }
    if (a.unite) placerUnite(a.unite, compter)
    else placerEtiquette(a.entiteEdr ? ENTITE_EDR_NON_RATTACHEE : SANS_ENTITE_EDR, compter)
  }

  const trier = <T extends Compteurs>(l: T[]) =>
    l.sort((a, b) => b.sansAgent - a.sansAgent || b.critiques - a.critiques || b.nonCritiques - a.nonCritiques || b.agentsHorsGlpi - a.agentsHorsGlpi)
  return {
    composantes: trier([...composantes.values()]),
    sousUnites: trier([...sousUnites.values()]),
    poles: trier([...poles.values()]),
  }
}

/**
 * LE PARC GLPI COMPLET CONFRONTÉ À L'EDR — et une partition des agents, sans double compte.
 */
export function rapprocherParc(machines: readonly MachineParc[], agents: readonly AgentEdr[]) {
  const versInventaire = (m: MachineParc) => ({ cle: m.glpiId, nom: m.nom, numeroSerie: m.numeroSerie })
  const r1 = rapprocher(machines.filter(m => m.critique).map(versInventaire), [...agents])
  const liesCritiques = new Set(r1.liens.map(l => l.agent))
  const ambigusCritiques = new Set(r1.ambigus.flatMap(a => a.agents).filter(a => !liesCritiques.has(a)))

  const restants = agents.filter(a => !liesCritiques.has(a.cle) && !ambigusCritiques.has(a.cle))
  const r2 = rapprocher(machines.filter(m => !m.critique).map(versInventaire), restants)
  const liesNonCritiques = new Set(r2.liens.map(l => l.agent))
  const ambigusNonCritiques = new Set(r2.ambigus.flatMap(a => a.agents).filter(a => !liesNonCritiques.has(a)))

  return {
    critiques: r1,
    nonCritiques: {
      avecAgent: new Set(r2.liens.map(l => l.machine)),
      ambigus: new Set(r2.ambigus.map(a => a.machine)),
      machinesSansAgent: r2.machinesSansAgent,
    },
    agents: {
      total: agents.length,
      liesCritiques: liesCritiques.size,
      ambigusCritiques: ambigusCritiques.size,
      liesNonCritiques: liesNonCritiques.size,
      ambigusNonCritiques: ambigusNonCritiques.size,
      sansMachineGlpi: r2.agentsSansMachine.length,
    },
    agentsSansMachineGlpi: r2.agentsSansMachine,
  }
}
