<script setup lang="ts">
import type { NuxtError } from '#app'
import { UIButton } from '@catalogue/ui'

defineProps<{ error: NuxtError }>()

const { cat } = useRoute().query

const showStackTrace = ref<boolean>(false)
</script>

<template>
  <div class="max-w-7xl mx-auto h-screen p-16 space-y-5">
    <h1 class="text-9xl font-bold font-mono text-primary-600">
      {{ error.status }}
    </h1>
    <div class="w-full h-2 bg-accent-100 rounded-full" />

    <p class="font-sans text-2xl font-semibold">
      {{ error.message }}
    </p>

    <UIButton
      variant="link"
      size="lg"
      as-child
    >
      <NuxtLink to="/">
        Retour à l'accueil
      </NuxtLink>
    </UIButton>

    <img
      v-if="cat"
      :src="'https://http.cat/' + cat"
    >

    <DevOnly>
      <UIButton
        size="lg"
        @click="showStackTrace = !showStackTrace"
      >
        {{ showStackTrace ? 'Masquer' : 'Afficher' }} le stack trace
      </UIButton>
      <pre
        v-if="showStackTrace"
        class="mt-4 p-4 bg-gray-100 rounded-md text-sm overflow-x-auto whitespace-pre-wrap wrap-break-word"
      >
        {{ error.stack }}
      </pre>
    </DevOnly>
  </div>
</template>
