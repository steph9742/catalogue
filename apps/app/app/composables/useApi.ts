// Client HTTP générique authentifié pour les catalogues pilotés par config (là où le typage
// eden par entité n'est pas nécessaire).
export const useApi = () => {
  const config = useRuntimeConfig()
  const baseURL = (import.meta.server
    ? config.serverBaseUrlInternal
    : config.public.serverBaseUrl) as string
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined

  return <T = unknown>(path: string, opts: Record<string, unknown> = {}) =>
    $fetch<T>(path, {
      baseURL,
      credentials: 'include',
      headers,
      ...opts,
    })
}
