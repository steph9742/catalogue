// RAPPROCHEMENT « agent EDR ↔ machine de l'inventaire ». C'est la pièce dont tout le reste
// dépend.
import { nomIdentifie, serieIdentifie } from './glpiSync'

export type Certitude = 'certain' | 'probable' | 'ambigu'

export type MachineInventaire = { cle: string, nom: string | null, numeroSerie: string | null }
export type AgentEdr = { cle: string, hostname: string | null, machineSerial: string | null }

export type Rapprochement = {
  machine: string
  agent: string
  certitude: Certitude
  motif: string
}

export type ResultatRapprochement = {
  liens: Rapprochement[]
  /** Machines de l'inventaire dont le nom mène à PLUSIEURS agents, ou l\'inverse. */
  ambigus: { machine: string, agents: string[], motif: string }[]
  machinesSansAgent: string[]
  agentsSansMachine: string[]
  comptes: {
    machines: number
    agents: number
    certains: number
    probables: number
    ambigus: number
    machinesSansAgent: number
    agentsSansMachine: number
    /** Machines dont le numéro de série ne permet AUCUNE conclusion. */
    machinesSansSerieUtilisable: number
    agentsSansSerieUtilisable: number
  }
}

/** Clé de comparaison : casse, accents et ponctuation ignorés — comme partout ici. */
const normaliser = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

function indexer<T>(items: T[], cle: (x: T) => string | null): Map<string, T[]> {
  const index = new Map<string, T[]>()
  for (const item of items) {
    const k = cle(item)
    if (!k) continue
    const acc = index.get(k) ?? []
    acc.push(item)
    index.set(k, acc)
  }
  return index
}

export function rapprocher(machines: MachineInventaire[], agents: AgentEdr[]): ResultatRapprochement {
  const liens: Rapprochement[] = []
  const ambigus: ResultatRapprochement['ambigus'] = []
  const machinesLiees = new Set<string>()
  const agentsLies = new Set<string>()

  // --- 1. Numéro de série : la seule preuve ------------------------------------------
  const parSerieAgent = indexer(agents, a => (serieIdentifie(a.machineSerial) ? normaliser(a.machineSerial) : null))
  const parSerieMachine = indexer(machines, m => (serieIdentifie(m.numeroSerie) ? normaliser(m.numeroSerie) : null))

  for (const [serie, lot] of parSerieMachine) {
    const candidats = parSerieAgent.get(serie)
    if (!candidats?.length) continue
    // Plusieurs machines OU plusieurs agents sur un même numéro : ce n'est plus une
    // preuve. On le déclare ambigu plutôt que d'apparier au hasard.
    if (lot.length > 1 || candidats.length > 1) {
      for (const m of lot) {
        ambigus.push({ machine: m.cle, agents: candidats.map(a => a.cle), motif: `numéro de série « ${serie} » partagé par ${lot.length} machine(s) et ${candidats.length} agent(s)` })
        machinesLiees.add(m.cle)
      }
      for (const a of candidats) agentsLies.add(a.cle)
      continue
    }
    liens.push({ machine: lot[0]!.cle, agent: candidats[0]!.cle, certitude: 'certain', motif: 'numéro de série identique' })
    machinesLiees.add(lot[0]!.cle)
    agentsLies.add(candidats[0]!.cle)
  }

  // --- 2. Nom d'hôte : un indice, sur ce qui reste ------------------------------------
  const restantesMachines = machines.filter(m => !machinesLiees.has(m.cle))
  const restantsAgents = agents.filter(a => !agentsLies.has(a.cle))
  const parNomAgent = indexer(restantsAgents, a => (nomIdentifie(a.hostname) ? normaliser(a.hostname) : null))
  const parNomMachine = indexer(restantesMachines, m => (nomIdentifie(m.nom) ? normaliser(m.nom) : null))

  for (const [nom, lot] of parNomMachine) {
    const candidats = parNomAgent.get(nom)
    if (!candidats?.length) continue
    if (lot.length > 1 || candidats.length > 1) {
      for (const m of lot) {
        ambigus.push({ machine: m.cle, agents: candidats.map(a => a.cle), motif: `nom « ${nom} » porté par ${lot.length} machine(s) et ${candidats.length} agent(s)` })
        machinesLiees.add(m.cle)
      }
      for (const a of candidats) agentsLies.add(a.cle)
      continue
    }
    liens.push({ machine: lot[0]!.cle, agent: candidats[0]!.cle, certitude: 'probable', motif: 'nom d\'hôte identique et unique des deux côtés' })
    machinesLiees.add(lot[0]!.cle)
    agentsLies.add(candidats[0]!.cle)
  }

  const machinesSansAgent = machines.filter(m => !machinesLiees.has(m.cle)).map(m => m.cle)
  const agentsSansMachine = agents.filter(a => !agentsLies.has(a.cle)).map(a => a.cle)

  return {
    liens,
    ambigus,
    machinesSansAgent,
    agentsSansMachine,
    comptes: {
      machines: machines.length,
      agents: agents.length,
      certains: liens.filter(l => l.certitude === 'certain').length,
      probables: liens.filter(l => l.certitude === 'probable').length,
      ambigus: ambigus.length,
      machinesSansAgent: machinesSansAgent.length,
      agentsSansMachine: agentsSansMachine.length,
      machinesSansSerieUtilisable: machines.filter(m => !serieIdentifie(m.numeroSerie)).length,
      agentsSansSerieUtilisable: agents.filter(a => !serieIdentifie(a.machineSerial)).length,
    },
  }
}
