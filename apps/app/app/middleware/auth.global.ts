// Middleware GLOBAL (suffixe `.global`) : il s'applique à TOUTES les pages.
const PAGES_PUBLIQUES = ['/login', '/login-secours']

export default defineNuxtRouteMiddleware(async (to) => {
  const data = await useSSRAuth()
  const estPublique = PAGES_PUBLIQUES.includes(to.path)

  // Déjà connecté : rien à faire sur une page de connexion.
  if (data.value && estPublique) {
    return navigateTo('/')
  }

  if (!data.value && !estPublique) {
    return navigateTo('/login')
  }
})
