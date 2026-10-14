import type { EnumOption } from '~/utils/catalogueEnums'

// Unités d'organisation : on affiche « nom · parent » pour lever l'ambiguïté (deux pôles «
// Support », deux composantes homonymes…).
const ORG_PARENTS: Record<string, { fk: string, endpoint: string }> = {
  poles: { fk: 'serviceId', endpoint: 'services' },
  services: { fk: 'composanteId', endpoint: 'composantes' },
  departements: { fk: 'composanteId', endpoint: 'composantes' },
  composantes: { fk: 'entiteId', endpoint: 'entites' },
}

// Charge les options {value,label} d'un endpoint, en suffixant le parent si org.
export const useRefLabels = async (endpoint: string, labelKey = 'nom'): Promise<EnumOption[]> => {
  const api = useApi()
  const parent = ORG_PARENTS[endpoint]

  const principal = useAsyncData(`reflab-${endpoint}`, () => api<Record<string, unknown>[]>(`/api/${endpoint}`), { getCachedData: () => undefined })
  const ascendant = parent
    ? useAsyncData(`reflab-parent-${parent.endpoint}`, () => api<Record<string, unknown>[]>(`/api/${parent.endpoint}`), { getCachedData: () => undefined })
    : null

  const [{ data }, resultatParent] = await Promise.all([principal, ascendant])
  const rows = data.value ?? []
  const pmap: Record<string, string> = resultatParent
    ? Object.fromEntries((resultatParent.data.value ?? []).map(r => [String(r.id), String(r.sigle || r.nom || '')]))
    : {}

  const base = (r: Record<string, unknown>) => {
    if (endpoint === 'personnes') return `${r.prenom ? r.prenom + ' ' : ''}${r.nom ?? ''}`.trim()
    return String(r[labelKey] ?? r.nom ?? r.hostname ?? r.identifiant ?? r.id)
  }
  return rows.map((r) => {
    const suffix = parent ? pmap[String(r[parent.fk])] : ''
    return { value: String(r.id), label: suffix ? `${base(r)} · ${suffix}` : base(r) }
  })
}
