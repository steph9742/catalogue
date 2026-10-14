<script setup lang="ts">
import { authClient } from '~/lib/auth-client'
import { UIButton } from '@catalogue/ui'
import { Icon } from '#components'

definePageMeta({
  layout: 'auth',
})

const oidcEnabled = useRuntimeConfig().public.oidcEnabled
// Voies de connexion réellement ouvertes côté serveur : inutile de proposer un secours
// qui sera refusé, ni de le masquer alors qu'il fonctionne.
const authConfig = await useApi()<{ sso: boolean, secours: boolean }>('/api/auth-config')
  .catch(() => ({ sso: !!oidcEnabled, secours: true }))

const email = ref('')
const password = ref('')
const isLoading = ref(false)
const isOidcLoading = ref(false)
const errorMessage = ref('')

const signInEmail = async () => {
  if (isLoading.value) return
  errorMessage.value = ''
  isLoading.value = true

  const { error } = await authClient().signIn.email({
    email: email.value,
    password: password.value,
    callbackURL: new URL('/', window.location.origin).href,
  })

  if (error) {
    errorMessage.value = error.message ?? 'Identifiants invalides.'
    isLoading.value = false
    return
  }

  await navigateTo('/')
}

const signInOuate = async () => {
  if (isOidcLoading.value) return
  errorMessage.value = ''
  isOidcLoading.value = true

  try {
    // `signIn.oauth2` NE LÈVE PAS d'exception : il renvoie { data, error }. Le catch ne se
    // déclenchait donc jamais, et un refus du serveur laissait le bouton bloqué sur «
    // Redirection en cours » indéfiniment, sans le moindre message.
    const { data, error } = await authClient().signIn.oauth2({
      providerId: useRuntimeConfig().public.oidcProviderId || 'ouate',
      // On désactive la redirection AUTOMATIQUE du client pour la faire nous-mêmes.
      disableRedirect: true,
      // Retour APRÈS authentification : doit inclure le sous-chemin quand il y en a un,
      // sinon on atterrit à la racine du domaine, hors de l'application.
      callbackURL: new URL(useRuntimeConfig().app.baseURL || '/', window.location.origin).href,
    })

    if (error) {
      errorMessage.value = error.message
        ? `Connexion SSO impossible : ${error.message}`
        : 'Connexion SSO impossible. Vérifiez la configuration du fournisseur d\'identité.'
      isOidcLoading.value = false
      return
    }
    // Pas d'erreur mais pas d'URL : le serveur a répondu sans rien d'exploitable. On
    // montre la réponse brute — sans elle, il ne reste qu'à deviner.
    if (!data?.url) {
      errorMessage.value = 'Le fournisseur n\'a pas renvoyé d\'adresse. Réponse du serveur : '
        + JSON.stringify(data ?? null)
      isOidcLoading.value = false
      return
    }
    window.location.href = data.url
  }
  catch (e) {
    errorMessage.value = `Impossible de lancer la connexion : ${(e as Error)?.message ?? 'erreur inconnue'}`
    isOidcLoading.value = false
  }
}
</script>

<template>
  <section class="relative w-full max-w-md overflow-hidden rounded-3xl border border-gray-200/80 bg-white/85 p-8 shadow-xl shadow-gray-400/15 backdrop-blur-md sm:p-10">
    <div class="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary-400/20 blur-3xl" />
    <div class="absolute -bottom-20 -left-16 h-52 w-52 rounded-full bg-secondary-300/25 blur-3xl" />

    <div class="relative flex flex-col gap-7">
      <header class="space-y-3">
        <h1 class="font-sans text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          Connexion
        </h1>
      </header>

      <!-- SSO actif : c'est la voie normale, et la seule proposée ici. Le formulaire e-mail/mot de passe reste accessible par /login-secours, pour les cas où l'annuaire est indisponible. -->
      <form
        v-if="!oidcEnabled && authConfig.secours"
        class="flex flex-col gap-4"
        @submit.prevent="signInEmail"
      >
        <div class="flex flex-col gap-1.5">
          <label
            for="email"
            class="text-sm font-medium text-gray-700"
          >E-mail</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            placeholder="admin@catalogue.local"
          >
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            for="password"
            class="text-sm font-medium text-gray-700"
          >Mot de passe</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            placeholder="••••••••"
          >
        </div>

        <UIButton
          type="submit"
          class="w-full"
          size="lg"
          :disabled="isLoading"
        >
          <Icon
            v-if="isLoading"
            name="lucide:loader-circle"
            class="size-5 animate-spin"
          />
          <Icon
            v-else
            name="lucide:log-in"
            class="size-5"
          />
          {{ isLoading ? 'Connexion...' : 'Se connecter' }}
        </UIButton>
      </form>

      <template v-if="oidcEnabled">
        <UIButton
          class="w-full"
          size="lg"
          variant="secondary"
          :disabled="isOidcLoading"
          @click="signInOuate"
        >
          <Icon
            v-if="isOidcLoading"
            name="lucide:loader-circle"
            class="size-5 animate-spin"
          />
          <Icon
            v-else
            name="lucide:log-in"
            class="size-5"
          />
          {{ isOidcLoading ? 'Redirection en cours...' : 'Connexion avec le portail' }}
        </UIButton>
      </template>

      <p
        v-if="errorMessage"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ errorMessage }}
      </p>

      <!-- Lien discret mais PRÉSENT. Le cacher n'apporterait aucune sécurité — l'adresse est dans le code public — et rendrait la page introuvable au seul moment où elle sert : quand l'annuaire est en panne et qu'on cherche vite. -->
      <NuxtLink
        v-if="oidcEnabled && authConfig.secours"
        to="/login-secours"
        class="text-center text-xs text-gray-400 underline underline-offset-2 transition-colors hover:text-gray-600"
      >
        Le SSO est indisponible ? Connexion de secours
      </NuxtLink>
    </div>
  </section>
</template>
