import type { EnumOption } from '~/utils/catalogueEnums'

// Charge les listes d'entités liables et les mappe en options {value:id, label}
// pour les sélecteurs (rattachements + relations de la fiche application).
export const useRefOptions = async () => {
  const api = useApi()

  const load = async (endpoint: string) => {
    const { data } = await useAsyncData(`opts-${endpoint}`, () =>
      api<Record<string, unknown>[]>(`/api/${endpoint}`),
    { getCachedData: () => undefined })
    return data.value ?? []
  }

  const tiersRows = await load('tiers')
  const polesRows = await load('poles')
  const personnesRows = await load('personnes')
  const serveursRows = await load('serveurs')
  const technologiesRows = await load('technologies')
  const populationsRows = await load('populations')
  const groupesRows = await load('groupes')
  const composantesRows = await load('composantes')
  const servicesRows = await load('services')
  const departementsRows = await load('departements')
  const entitesRows = await load('entites')

  const opt = (
    rows: Record<string, unknown>[],
    label: (r: Record<string, unknown>) => string,
  ): EnumOption[] => rows.map(r => ({ value: String(r.id), label: label(r) }))

  // Maps parent (id → sigle||nom) pour suffixer « nom · parent ».
  const mapBy = (rows: Record<string, unknown>[]) => Object.fromEntries(rows.map(r => [String(r.id), String(r.sigle || r.nom || '')]))
  const entiteBy = mapBy(entitesRows)
  const composanteBy = mapBy(composantesRows)
  const serviceBy = Object.fromEntries(servicesRows.map(r => [String(r.id), String(r.nom || '')]))
  const suffix = (base: string, parent: string | undefined) => (parent ? `${base} · ${parent}` : base)

  return {
    tiers: opt(tiersRows, r => String(r.nom ?? '')),
    poles: opt(polesRows, r => suffix(String(r.nom ?? ''), serviceBy[String(r.serviceId)])),
    personnes: opt(personnesRows, r => `${r.prenom ? r.prenom + ' ' : ''}${r.nom ?? ''}`.trim()),
    serveurs: opt(serveursRows, r => String(r.hostname ?? '')),
    technologies: opt(technologiesRows, r => `${r.nom ?? ''}${r.version ? ' ' + r.version : ''}`),
    populations: opt(populationsRows, r => String(r.nom ?? '')),
    groupes: opt(groupesRows, r => String(r.nom ?? '')),
    composantes: opt(composantesRows, r => suffix(String(r.nom ?? ''), entiteBy[String(r.entiteId)])),
    services: opt(servicesRows, r => suffix(String(r.nom ?? ''), composanteBy[String(r.composanteId)])),
    departements: opt(departementsRows, r => suffix(String(r.nom ?? ''), composanteBy[String(r.composanteId)])),
  }
}
