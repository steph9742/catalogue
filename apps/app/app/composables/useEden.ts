import { createEden } from '@catalogue/eden'

const useEden = () => {
  const headers = useRequestHeaders()
  const config = useRuntimeConfig()
  // SSR (dans le conteneur) → API en interne (server:4000) ; navigateur → via le proxy.
  const baseURL = (import.meta.server
    ? config.serverBaseUrlInternal
    : config.public.serverBaseUrl) as string

  const eden = createEden(baseURL, headers)

  return eden
}

export default useEden
