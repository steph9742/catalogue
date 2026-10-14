<script setup lang="ts">
import { computed, ref } from 'vue'

// DOCUMENTATION D'API, intégrée à l'application. Elle existait déjà, servie par le serveur à
// /openapi — mais rien n'y menait : il fallait connaître l'adresse.

const config = useRuntimeConfig()
const base = (config.public.serverBaseUrl as string) || ''
const urlDoc = computed(() => `${base}/openapi`)
const urlSchema = computed(() => `${base}/openapi/json`)

const copie = ref('')
const copier = async (texte: string, quoi: string) => {
  try {
    await navigator.clipboard.writeText(texte)
    copie.value = quoi
    setTimeout(() => {
      copie.value = ''
    }, 2000)
  }
  catch { /* presse-papiers indisponible : l'utilisateur sélectionnera à la main */ }
}

const EXEMPLE_CURL = `curl -H "x-service-key: sk_…" \\
  "${base || 'https://<domaine>'}/api/serveurs?page=1&pageSize=50"`

const CARTE = 'rounded-2xl border border-secondary-200/70 bg-white p-5 shadow-sm'
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        API
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Toutes les données de l'application sont accessibles par API — c'est ce qu'utilise l'interface elle-même.
      </p>
    </header>

    <!-- Accès à la référence complète -->
    <section :class="[CARTE, 'flex flex-wrap items-center gap-4']">
      <div class="min-w-0 flex-1">
        <h2 class="font-semibold tracking-tight text-secondary-900">
          Référence complète
        </h2>
        <p class="mt-1 text-sm text-secondary-600">
          Toutes les routes, leurs paramètres et leurs réponses, engendrés depuis le code : la référence ne peut pas
          diverger de ce que le serveur fait réellement.
        </p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <a
          :href="urlDoc"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          <Icon
            name="lucide:book-open"
            class="size-4"
          /> Ouvrir la référence
        </a>
        <a
          :href="urlSchema"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200/80 px-3 py-2 text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
        >
          <Icon
            name="lucide:file-json"
            class="size-4"
          /> Schéma OpenAPI
        </a>
      </div>
    </section>

    <!-- S'authentifier : ce qu'on ne trouve pas dans la référence engendrée -->
    <section :class="[CARTE, 'space-y-4']">
      <div>
        <h2 class="font-semibold tracking-tight text-secondary-900">
          S'authentifier
        </h2>
        <p class="mt-1 text-sm text-secondary-600">
          Deux modes, selon que l'appelant est une personne ou un programme.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div class="rounded-xl border border-secondary-200/70 p-3">
          <p class="text-sm font-medium text-secondary-900">
            Session
          </p>
          <p class="mt-1 text-xs text-secondary-600">
            Cookie posé à la connexion. C'est ce qu'utilise l'interface ; rien à faire de particulier depuis un navigateur.
          </p>
        </div>
        <div class="rounded-xl border border-secondary-200/70 p-3">
          <p class="text-sm font-medium text-secondary-900">
            Compte technique
          </p>
          <p class="mt-1 text-xs text-secondary-600">
            En-tête <code class="rounded bg-secondary-100 px-1">x-service-key</code> avec une clé <code class="rounded bg-secondary-100 px-1">sk_…</code>,
            créée dans <NuxtLink
              to="/comptes-techniques"
              class="text-primary-700 underline underline-offset-2"
            >Comptes techniques</NuxtLink>.
          </p>
        </div>
      </div>

      <div class="relative">
        <pre class="overflow-x-auto rounded-xl bg-secondary-900 p-3 text-xs leading-relaxed text-secondary-100">{{ EXEMPLE_CURL }}</pre>
        <button
          class="absolute right-2 top-2 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-white/20"
          @click="copier(EXEMPLE_CURL, 'exemple')"
        >
          {{ copie === 'exemple' ? 'Copié' : 'Copier' }}
        </button>
      </div>

      <p class="text-xs text-secondary-500">
        La portée d'une clé dépend de ses <em>scopes</em> — <code>read</code>, <code>write</code>, <code>delete</code>, <code>admin</code>.
        Hors périmètre, la réponse est <code>403</code>. Une clé est un secret : prévoyez une expiration et une rotation.
      </p>
    </section>

    <!-- Conventions transverses -->
    <section :class="[CARTE, 'space-y-3']">
      <h2 class="font-semibold tracking-tight text-secondary-900">
        Conventions
      </h2>
      <dl class="space-y-3 text-sm">
        <div>
          <dt class="font-medium text-secondary-800">
            Listes
          </dt>
          <dd class="mt-0.5 text-secondary-600">
            <code>?page</code> <em>ou</em> <code>?pageSize</code> — l'un des deux suffit — renvoient <code>{ rows, total, page, pageSize }</code> ; sans eux, la forme historique de la route. <code>pageSize</code> est plafonné à 200, 50 par défaut. Le total est compté par la base, jamais déduit du nombre de lignes reçues.
            <code>?q=</code> cherche dans les colonnes texte, <code>?&lt;colonne&gt;=v1,v2</code> filtre, <code>?sort=</code> et <code>?dir=</code> trient.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-secondary-800">
            Actions groupées
          </dt>
          <dd class="mt-0.5 text-secondary-600">
            <code>/lot</code> accepte <code>ids</code> ou <code>filtre</code> — ce dernier désignant <strong>tous</strong> les résultats,
            y compris ceux qui ne sont pas affichés. Chaque opération renvoie un <code>annulationId</code> réutilisable pendant 24 h.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-secondary-800">
            Import
          </dt>
          <dd class="mt-0.5 text-secondary-600">
            <code>dryRun: true</code> par défaut : l'appel annonce ce qui serait écrit <strong>sans rien écrire</strong>.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-secondary-800">
            Écriture par un contributeur
          </dt>
          <dd class="mt-0.5 text-secondary-600">
            La requête ne modifie rien : elle devient une demande de validation et la réponse est <code>202</code>.
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>
