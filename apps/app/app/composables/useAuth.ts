import type { UserWithRole } from 'better-auth/plugins/admin'
import type { authClient } from '~/lib/auth-client'

type UserSession = ReturnType<typeof authClient>['$Infer']['Session']
type SessionResponse = {
  user: UserWithRole
  session: UserSession
} | null

export const useSSRAuth = async () => {
  const config = useRuntimeConfig()
  // SSR → API en interne (server:4000) ; navigateur → via le proxy (origine publique).
  const baseURL = (import.meta.server
    ? config.serverBaseUrlInternal
    : config.public.serverBaseUrl) as string

  const { data: session } = await useFetch<SessionResponse>('/api/auth/get-session', {
    credentials: 'include',
    baseURL,
    headers: useRequestHeaders(['cookie']),
  })

  return session
}
