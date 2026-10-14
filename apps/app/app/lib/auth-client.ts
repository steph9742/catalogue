import { createAuthClient } from 'better-auth/vue'
import { serviceAccountsClient } from '@catalogue/better-auth-plugins/service-accounts'
import { adminClient, genericOAuthClient } from 'better-auth/client/plugins'

// CHEMIN DES ROUTES D'AUTHENTIFICATION — à donner EXPLICITEMENT. better-auth ne complète
// l'adresse par « /api/auth » que si elle ne porte AUCUN chemin (`withPath` dans
// better-auth/utils/url) : if (checkHasPath(url)) return url Une adresse porteuse d'un chemin
// est donc prise pour le chemin de base des…
const avecCheminAuth = (base: string) => {
  const sansBarre = base.replace(/\/+$/, '')
  return sansBarre.endsWith('/api/auth') ? sansBarre : `${sansBarre}/api/auth`
}

export const authClient = () => {
  const config = useRuntimeConfig()
  const baseURL = avecCheminAuth((import.meta.server
    ? config.serverBaseUrlInternal
    : config.public.serverBaseUrl) as string)

  return createAuthClient({
    baseURL,
    plugins: [
      serviceAccountsClient(),
      genericOAuthClient(),
      adminClient(),
    ],
  })
}
