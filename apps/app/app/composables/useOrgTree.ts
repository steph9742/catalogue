// Arbre d'organisation chargé une fois, pour résoudre la chaîne d'ancêtres d'une
// unité (ou d'une personne) et l'afficher en pills « supérieures » sous le nom.
type Pill = { label: string, tone: 'primary' | 'purple' | 'blue' | 'emerald' | 'gray' }

export const useOrgTree = async () => {
  const api = useApi()
  const one = async (e: string) => {
    const { data } = await useAsyncData(`orgtree-${e}`, () => api<Record<string, unknown>[]>(`/api/${e}`), { getCachedData: () => undefined })
    return data.value ?? []
  }
  const [ent, comp, svc, dep, pol, pop] = await Promise.all([
    one('entites'), one('composantes'), one('services'), one('departements'), one('poles'), one('populations'),
  ])
  const idx = (rows: Record<string, unknown>[]) => new Map(rows.map(r => [String(r.id), r]))
  const E = idx(ent), C = idx(comp), S = idx(svc), D = idx(dep), P = idx(pol), POP = idx(pop)

  const nm = (r: Record<string, unknown> | undefined) => (r ? String(r.sigle || r.nom || '') : '')
  const pill = (label: string, tone: Pill['tone']): Pill | null => (label ? { label, tone } : null)
  const entiteOfComp = (cid: unknown) => E.get(String(C.get(String(cid))?.entiteId))

  // Chaîne d'ancêtres, du plus haut (entité) au plus proche.
  const chainOf = (endpoint: string, row: Record<string, unknown>): Pill[] => {
    const out: (Pill | null)[] = []
    if (endpoint === 'poles') {
      const s = S.get(String(row.serviceId))
      const cid = s?.composanteId
      out.push(pill(nm(entiteOfComp(cid)), 'primary'), pill(nm(C.get(String(cid))), 'purple'), pill(nm(s), 'blue'))
    }
    else if (endpoint === 'services' || endpoint === 'departements') {
      out.push(pill(nm(entiteOfComp(row.composanteId)), 'primary'), pill(nm(C.get(String(row.composanteId))), 'purple'))
    }
    else if (endpoint === 'composantes') {
      out.push(pill(nm(E.get(String(row.entiteId))), 'primary'))
    }
    else if (endpoint === 'personnes') {
      out.push(
        pill(nm(entiteOfComp(row.composanteId)), 'primary'),
        pill(nm(C.get(String(row.composanteId))), 'purple'),
        row.serviceId ? pill(nm(S.get(String(row.serviceId))), 'blue') : null,
        row.departementId ? pill(nm(D.get(String(row.departementId))), 'blue') : null,
        row.poleId ? pill(nm(P.get(String(row.poleId))), 'emerald') : null,
        row.populationId ? pill(String(POP.get(String(row.populationId))?.nom || ''), 'gray') : null,
      )
    }
    return out.filter((p): p is Pill => !!p)
  }

  return { chainOf }
}
