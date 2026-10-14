// Bloque l'accès direct (URL) aux pages de création pour les utilisateurs qui ne peuvent pas
// proposer sur la catégorie (lecteurs).
export default defineNuxtRouteMiddleware(async (to) => {
  const category = to.path.split('/')[1]
  if (!category) return
  const perms = await usePermissions()
  if (!perms.canPropose(category)) {
    return navigateTo(`/${category}`)
  }
})
