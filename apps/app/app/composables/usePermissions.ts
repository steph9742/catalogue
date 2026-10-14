type Me = {
  id: string
  email: string
  name: string
  admin: boolean
  roles: Record<string, string>
}

// Permissions effectives de l'utilisateur courant (pilote l'affichage de l'UI).
// L'autorisation réelle est toujours appliquée côté serveur (macro `can`).
export const usePermissions = async () => {
  const api = useApi()
  const { data: me } = await useAsyncData('me', () => api<Me>('/api/me'))

  const isAdmin = computed(() => Boolean(me.value?.admin))
  const roleOn = (category: string) => me.value?.roles?.[category]
  const canRead = (category: string) => isAdmin.value || Boolean(roleOn(category))
  const canWrite = (category: string) => isAdmin.value || roleOn(category) === 'gestionnaire'
  // Peut agir (directement si gestionnaire/admin, ou via une demande si contributeur).
  const canPropose = (category: string) =>
    isAdmin.value || roleOn(category) === 'gestionnaire' || roleOn(category) === 'contributeur'

  // Gestionnaire sur au moins une catégorie (admin inclus).
  const isManager = computed(() =>
    isAdmin.value || Object.values(me.value?.roles ?? {}).includes('gestionnaire'),
  )
  const isContributor = computed(() => Object.values(me.value?.roles ?? {}).includes('contributeur'))
  // Catégories gérées : null = toutes (admin), sinon la liste des catégories gestionnaire.
  const managedCategories = computed<string[] | null>(() =>
    isAdmin.value
      ? null
      : Object.entries(me.value?.roles ?? {}).filter(([, r]) => r === 'gestionnaire').map(([c]) => c),
  )

  return { me, isAdmin, canRead, canWrite, canPropose, roleOn, isManager, isContributor, managedCategories }
}
