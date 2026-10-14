export default defineNuxtRouteMiddleware(async (to) => {
  const data = await useSSRAuth()

  const isAdmin = data.value?.user.role === 'admin'

  if (data.value && to.path === '/login') {
    return navigateTo('/')
  }

  if (data.value && !isAdmin && to.path.startsWith('/accounts')) {
    return navigateTo('/')
  }

  if (!data.value && to.path !== '/login') {
    return navigateTo('/login')
  }
})
