// CADRES DE RÉFÉRENCE ACTIFS — quels référentiels l'établissement suit. Chargé une fois par
// session et partagé (clé `useState`) : le menu, le plan du site et la palette de commandes
// s'en servent tous, et trois requêtes pour la même liste seraient du gaspillage à chaque
// navigation.
export type Cadre = { code: string, nom: string, description: string | null, actif: boolean, ordre: number }

export function useCadres() {
  const api = useApi()
  const cadres = useState<Cadre[] | null>('cadres-referentiels', () => null)

  const charger = async () => {
    if (cadres.value) return cadres.value
    cadres.value = await api<Cadre[]>('/api/cadres').catch(() => [])
    return cadres.value
  }

  /**
   * Un cadre inconnu est considéré ACTIF : une entrée de menu rattachée à un cadre qui n'existe
   * pas encore côté base (version décalée, migration en attente) doit rester visible.
   */
  const actif = (code?: string | null) => {
    if (!code) return true
    const c = cadres.value?.find(x => x.code === code)
    return c ? c.actif : true
  }

  const rafraichir = async () => {
    cadres.value = await api<Cadre[]>('/api/cadres').catch(() => cadres.value ?? [])
    return cadres.value
  }

  return { cadres, charger, actif, rafraichir }
}
