// Compteurs affichés en pastille dans le menu (demandes à traiter, échéances).
// État partagé (useState) rafraîchissable après une action ou un changement de page.
export const useBadges = () => {
  const api = useApi()
  const demandes = useState('badge-demandes', () => 0)
  const alertes = useState('badge-alertes', () => 0)

  const refresh = async () => {
    const perms = await usePermissions()
    // Demandes : gestionnaire/admin → à valider dans ses catégories ; contributeur → ses demandes en attente.
    try {
      if (perms.isManager.value) {
        const rows = await api<unknown[]>('/api/change-requests')
        demandes.value = Array.isArray(rows) ? rows.length : 0
      }
      else if (perms.isContributor.value) {
        const rows = await api<{ status: string }[]>('/api/change-requests/mine')
        demandes.value = Array.isArray(rows) ? rows.filter(r => r.status === 'pending').length : 0
      }
      else {
        demandes.value = 0
      }
    }
    catch { demandes.value = 0 }
    // Échéances : réservé aux admins (route /api/alerts).
    try {
      if (perms.isAdmin.value) {
        const rows = await api<unknown[]>('/api/alerts')
        alertes.value = Array.isArray(rows) ? rows.length : 0
      }
      else {
        alertes.value = 0
      }
    }
    catch { alertes.value = 0 }
  }

  return { demandes, alertes, refresh }
}
