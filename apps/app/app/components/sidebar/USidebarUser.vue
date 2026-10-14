<script setup lang="ts">
import { UISkeleton, UIDropdownMenu, type UIDropdownMenuSection } from '@catalogue/ui'
import type { User } from 'better-auth'
import { authClient } from '~/lib/auth-client'

const props = defineProps<{
  user: User | null
}>()

// Initiales calculées LOCALEMENT. L'avatar passait auparavant par un service externe
// (ui-avatars.com) : cela transmettait le nom de chaque agent à un tiers, et ne fonctionnait
// pas derrière le VPN de l'établissement — l'image restait cassée.
const initiales = computed(() => {
  const n = (props.user?.name || props.user?.email || '?').trim()
  const mots = n.split(/[\s.@_-]+/).filter(Boolean)
  return (mots.length > 1
    ? mots.slice(0, 2).map(m => m[0]!).join('')
    : n.slice(0, 2)
  ).toUpperCase()
})

const items: UIDropdownMenuSection[] = [
  {
    title: 'Mon compte',
    icon: 'lucide:user',
    items: [
      {
        label: 'Mon profil',
        onClick: () => { navigateTo('/profil') },
      },
      {
        label: 'Se déconnecter',
        onClick: async () => {
          await authClient().signOut()
          // Rechargement COMPLET, pas une navigation interne : la session est lue par
          // `useFetch` (useSSRAuth), dont la réponse est mise en cache.
          window.location.href = '/login'
        },
        destructive: true,
      },
    ],
  },
]
</script>

<template>
  <UIDropdownMenu
    v-if="user"
    :items="items"
  >
    <div class="bg-white rounded-xl p-2.5 w-full hover:bg-gray-50 cursor-pointer transition-colors duration-75">
      <div class="flex items-center gap-3">
        <img
          v-if="$props.user?.image"
          :src="$props.user.image"
          :alt="'Avatar de ' + $props.user?.name"
          class="size-10 rounded-full"
        >
        <span
          v-else
          class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700"
          aria-hidden="true"
        >{{ initiales }}</span>
        <div class="w-full flex flex-col gap-px grow-0 font-sans">
          <p class="text-sm font-semibold">
            {{ $props.user?.name }}
          </p>
          <p class="text-xs text-gray-500">
            {{ $props.user?.email }}
          </p>
        </div>
      </div>
    </div>
  </UIDropdownMenu>
  <div
    v-else
    class="bg-white rounded-xl p-2.5"
  >
    <div class="flex items-center gap-3">
      <UISkeleton class="shrink-0 size-10 rounded-full!" />
      <div class="w-full flex flex-col gap-3 grow-0">
        <UISkeleton class="h-3 rounded-full" />
        <UISkeleton class="w-26 h-3 rounded-full" />
      </div>
    </div>
  </div>
</template>
