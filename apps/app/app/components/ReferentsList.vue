<script setup lang="ts">
const props = defineProps<{
  kind: 'referent' | 'mission'
  title: string
  subtitle: string
  icon: string
  tone: 'primary' | 'accent'
}>()

type Group = { titre: string, kind: string, personnes: { id: string, nom: string, prenom: string | null }[] }
const api = useApi()
const { data: groups } = await useAsyncData(
  `referents-list-${props.kind}`,
  () => api<Group[]>(`/api/referents?kind=${props.kind}`),
  { getCachedData: () => undefined },
)

const open = ref('')
const toggle = (t: string) => {
  open.value = open.value === t ? '' : t
}
const fullName = (p: { nom: string, prenom: string | null }) => `${p.prenom ? p.prenom + ' ' : ''}${p.nom}`.trim()

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = groups.value ?? []
  return q ? list.filter(g => g.titre.toLowerCase().includes(q)) : list
})
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6 animate-in fade-in duration-500">
    <header
      class="relative overflow-hidden rounded-2xl border p-6 shadow-sm"
      :class="tone === 'primary' ? 'border-primary-200/50 bg-linear-to-br from-primary-50/70 via-background to-accent-50/40' : 'border-accent-200/50 bg-linear-to-br from-accent-50/70 via-background to-primary-50/30'"
    >
      <div class="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <div
          class="absolute -right-12 -top-16 size-52 rounded-full blur-3xl"
          :class="tone === 'primary' ? 'bg-primary-300/20' : 'bg-accent-300/20'"
        />
      </div>
      <div class="relative flex items-center gap-3">
        <div
          class="flex size-11 items-center justify-center rounded-2xl border bg-white shadow-sm"
          :class="tone === 'primary' ? 'border-primary-200/60 text-primary-600' : 'border-accent-200/60 text-accent-600'"
        >
          <Icon
            :name="icon"
            class="size-6"
          />
        </div>
        <div>
          <UITitle class="tracking-tight text-secondary-900">
            {{ title }}
          </UITitle>
          <p class="mt-0.5 text-sm text-secondary-600/90">
            {{ subtitle }}
          </p>
        </div>
      </div>
    </header>

    <div
      v-if="groups?.length"
      class="relative"
    >
      <Icon
        name="lucide:search"
        class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-secondary-400"
      />
      <input
        v-model="search"
        :placeholder="`Rechercher…`"
        class="w-full rounded-xl border border-secondary-200/80 bg-secondary-50/30 py-2.5 pl-10 pr-3 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
      >
    </div>

    <div
      v-if="!groups?.length"
      class="rounded-2xl border border-secondary-200/50 bg-secondary-50/30 py-20 text-center shadow-sm"
    >
      <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
        <Icon
          :name="icon"
          class="size-7 text-primary-600"
        />
      </div>
      <p class="flex flex-col gap-1 font-medium text-secondary-600">
        <span>Rien pour le moment.</span>
        <span class="text-sm font-normal opacity-80">Ajoutez des titres depuis la fiche d'une personne.</span>
      </p>
    </div>
    <div
      v-else-if="!filtered.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucun résultat pour « {{ search }} ».
    </div>

    <ul
      v-else
      class="space-y-2.5"
    >
      <li
        v-for="g in filtered"
        :key="g.titre"
        class="overflow-hidden rounded-2xl border border-secondary-200/60 bg-white shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
      >
        <button
          class="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary-50/60"
          @click="toggle(g.titre)"
        >
          <div
            class="flex size-9 shrink-0 items-center justify-center rounded-xl border"
            :class="tone === 'primary' ? 'border-primary-100 bg-primary-50/60 text-primary-600' : 'border-accent-100 bg-accent-50/60 text-accent-600'"
          >
            <Icon
              :name="icon"
              class="size-5"
            />
          </div>
          <span class="min-w-0 flex-1 font-medium text-secondary-900">{{ g.titre }}</span>
          <span class="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary-100 px-2 text-xs font-semibold text-secondary-600">{{ g.personnes.length }}</span>
          <Icon
            name="lucide:chevron-down"
            class="size-4 shrink-0 text-secondary-400 transition-transform"
            :class="open === g.titre ? 'rotate-180' : ''"
          />
        </button>
        <div
          v-if="open === g.titre"
          class="border-t border-secondary-100 bg-secondary-50/30 p-3"
        >
          <div
            v-if="!g.personnes.length"
            class="px-1 py-1 text-sm text-secondary-400"
          >
            Aucune personne.
          </div>
          <div
            v-else
            class="flex flex-wrap gap-2"
          >
            <NuxtLink
              v-for="p in g.personnes"
              :key="p.id"
              :to="`/personnes/${p.id}`"
              class="inline-flex items-center gap-1.5 rounded-lg border border-secondary-200 bg-white px-2.5 py-1.5 text-sm text-secondary-700 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-800"
            >
              <Icon
                name="lucide:user-round"
                class="size-3.5 text-secondary-400"
              /> {{ fullName(p) }}
            </NuxtLink>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
