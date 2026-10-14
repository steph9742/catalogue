<script setup lang="ts">
import { ref } from 'vue'
import { UIButton } from '@catalogue/ui'
import { authClient } from '~/lib/auth-client'

// CONNEXION DE SECOURS — e-mail et mot de passe, quand le SSO ne répond pas.
definePageMeta({ layout: 'auth' })

// Si la connexion par mot de passe est fermée (AUTH_SECOURS=false), la page n'a pas lieu d'être
// : on renvoie vers la connexion normale plutôt que d'offrir un formulaire dont chaque
// tentative sera refusée.
const config = await useApi()<{ sso: boolean, secours: boolean }>('/api/auth-config').catch(() => ({ sso: false, secours: true }))
if (!config.secours) await navigateTo('/login', { replace: true })

const email = ref('')
const password = ref('')
const enCours = ref(false)
const erreur = ref('')

const seConnecter = async () => {
  enCours.value = true
  erreur.value = ''
  const { error } = await authClient().signIn.email({ email: email.value, password: password.value })
  if (error) {
    erreur.value = error.message ?? 'Identifiants incorrects.'
    enCours.value = false
    return
  }
  // Trace de l'usage. La route exige une session : elle n'est donc appelable qu'après une
  // connexion réussie, et pas par un visiteur anonyme.
  try {
    await useApi()('/api/secours/trace', { method: 'POST' })
  }
  catch { /* la traçabilité ne doit jamais bloquer la reprise en main */ }

  // Rechargement COMPLET, pas une navigation interne : la session est lue par `useFetch`
  // (useSSRAuth), dont la réponse est mise en cache.
  window.location.href = '/'
}
</script>

<template>
  <section class="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl bg-white p-8 shadow-xl">
    <div class="absolute -top-16 -right-12 h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" />

    <div class="relative flex flex-col gap-6">
      <header class="space-y-2">
        <h1 class="font-sans text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
          Connexion de secours
        </h1>
        <p class="text-sm text-gray-600">
          À utiliser uniquement lorsque l'authentification unique est indisponible.
        </p>
      </header>

      <div class="flex gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
        <Icon
          name="lucide:shield-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        <p>
          Cette connexion contourne l'annuaire de l'établissement. <strong>Son usage est enregistré</strong>
          au journal d'audit. Si le SSO fonctionne, passez par la
          <NuxtLink
            to="/login"
            class="underline underline-offset-2"
          >connexion habituelle</NuxtLink>.
        </p>
      </div>

      <form
        class="flex flex-col gap-4"
        @submit.prevent="seConnecter"
      >
        <div class="flex flex-col gap-1.5">
          <label
            for="email-secours"
            class="text-sm font-medium text-gray-700"
          >E-mail</label>
          <input
            id="email-secours"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          >
        </div>
        <div class="flex flex-col gap-1.5">
          <label
            for="mdp-secours"
            class="text-sm font-medium text-gray-700"
          >Mot de passe</label>
          <input
            id="mdp-secours"
            v-model="password"
            type="password"
            required
            autocomplete="current-password"
            class="rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          >
        </div>

        <UIButton
          type="submit"
          class="w-full"
          size="lg"
          :disabled="enCours"
        >
          <Icon
            :name="enCours ? 'lucide:loader-circle' : 'lucide:key-round'"
            class="size-5"
            :class="enCours ? 'animate-spin' : ''"
          />
          {{ enCours ? 'Connexion…' : 'Se connecter' }}
        </UIButton>
      </form>

      <p
        v-if="erreur"
        class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ erreur }}
      </p>

      <p class="text-center text-xs text-gray-400">
        Le mot de passe du compte de secours est affiché <strong>une seule fois</strong>, à l'installation.
        Il se trouve normalement dans le coffre de l'équipe.
      </p>
    </div>
  </section>
</template>
