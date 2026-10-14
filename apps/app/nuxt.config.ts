import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/icon',
    '@vueuse/nuxt', /* '@vite-pwa/nuxt', */
  ],
  devtools: { enabled: true },

  css: ['~/assets/css/tailwind.css'],
  runtimeConfig: {
    // URL de l'API atteignable depuis le serveur Nuxt (SSR) — en Docker: http://server:4000.
    // Repli sur l'URL publique si non défini (dev local: http://localhost:4000).
    serverBaseUrlInternal: process.env.NUXT_SERVER_BASE_URL_INTERNAL || process.env.NUXT_PUBLIC_SERVER_BASE_URL,
    public: {
      // URL de l'API atteignable depuis le navigateur — en Docker: l'origine du proxy.
      serverBaseUrl: process.env.NUXT_PUBLIC_SERVER_BASE_URL,
      // Affiche le bouton SSO seulement s'il est activé (NUXT_PUBLIC_OIDC_ENABLED=true).
      oidcEnabled: false,
      // Identifiant du fournisseur : il doit être le MÊME que côté serveur, puisqu'il entre
      // dans l'URL de rappel. Même défaut historique des deux côtés.
      oidcProviderId: 'ouate',
    },
  },
  compatibilityDate: '2025-07-15',
  vite: {
    define: {
      // DÉTAIL DES DIVERGENCES D'HYDRATATION, AUSSI EN PRODUCTION. Sans ce drapeau, la console
      // de production dit « Hydration completed but contains mismatches » sans JAMAIS dire où —
      // et la chasse se fait à l'aveugle, page par page, hypothèse par hypothèse. ATTENTION :
      // une seule clé `vite:` dans ce fichier.
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true',
    },
    plugins: [
      tailwindcss(),
    ],
    optimizeDeps: {
      include: ['better-auth/client', 'better-auth/vue', 'better-auth/client/plugins', 'better-auth', 'better-auth/api', 'better-auth/crypto', 'zod', 'better-auth/adapters', '@paralleldrive/cuid2'],
    },
  },
  eslint: {
    config: {
      stylistic: true,
    },
  },
  icon: {
    mode: 'svg',
    serverBundle: {
      collections: ['lucide'],
    },
    localApiEndpoint: '/_nuxt-icon',
  },
})
