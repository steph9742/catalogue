<script setup lang="ts">
import { ref, computed } from 'vue'

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('personnes')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const load = async (e: string) => (await useAsyncData(`raci-${e}`, () => api<Row[]>(`/api/${e}`), { getCachedData: () => undefined })).data
const personnes = await load('personnes')

// Sources de responsabilité : [catalogue, libellé du domaine, champ personne, rôle, clé du titre]
const SOURCES: [string, string, string, string, string][] = [
  ['actifs-smsi', 'Actifs SMSI', 'proprietaireId', 'Propriétaire', 'nom'],
  ['risques-smsi', 'Risques', 'proprietaireId', 'Propriétaire du risque', 'nom'],
  ['mesures-smsi', 'Mesures (SoA)', 'responsableId', 'Responsable', 'reference'],
  ['objectifs-smsi', 'Objectifs SSI', 'responsableId', 'Responsable', 'nom'],
  ['documents-smsi', 'Documents SMSI', 'responsableId', 'Responsable', 'nom'],
  ['non-conformites', 'Non-conformités', 'responsableId', 'Responsable', 'nom'],
  ['exigences-legales', 'Exigences légales', 'responsableId', 'Responsable', 'intitule'],
  ['opportunites', 'Opportunités', 'responsableId', 'Responsable', 'nom'],
  ['actifs-informationnels', 'Actifs informationnels', 'proprietaireId', 'Propriétaire', 'nom'],
  ['processus', 'Processus métier', 'proprietaireId', 'Propriétaire', 'nom'],
]
const donnees: Record<string, Row[]> = {}
for (const [cat] of SOURCES) donnees[cat] = (await load(cat)).value ?? []

const nomDe = (pid: string) => {
  const p = (personnes.value ?? []).find(x => x.id === pid)
  return p ? `${p.prenom ? p.prenom + ' ' : ''}${p.nom ?? ''}`.trim() : '—'
}

type Resp = { personneId: string, personne: string, role: string, domaine: string, objet: string, cat: string, id: string }
const toutes = computed<Resp[]>(() => {
  const out: Resp[] = []
  for (const [cat, domaine, champ, role, titre] of SOURCES) {
    for (const r of donnees[cat] ?? []) {
      const pid = r[champ]
      if (!pid) continue
      out.push({ personneId: pid, personne: nomDe(pid), role, domaine, objet: String(r[titre] ?? r.nom ?? r.id), cat, id: r.id })
    }
  }
  return out.sort((a, b) => a.personne.localeCompare(b.personne) || a.domaine.localeCompare(b.domaine))
})

const filtre = ref('')
const filtrees = computed(() => {
  const q = filtre.value.trim().toLowerCase()
  if (!q) return toutes.value
  return toutes.value.filter(r => [r.personne, r.role, r.domaine, r.objet].join(' ').toLowerCase().includes(q))
})
const parPersonne = computed(() => {
  const m = new Map<string, Resp[]>()
  for (const r of filtrees.value) m.set(r.personne, [...(m.get(r.personne) ?? []), r])
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})
const sansResponsable = computed(() =>
  SOURCES.map(([cat, domaine, champ]) => ({ domaine, n: (donnees[cat] ?? []).filter(r => !r[champ]).length }))
    .filter(x => x.n > 0))
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Matrice RACI
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Qui est responsable de quoi — {{ toutes.length }} responsabilité(s) sur {{ parPersonne.length }} personne(s).
        </p>
      </div>
      <input
        v-model="filtre"
        placeholder="Filtrer (personne, objet, domaine)…"
        class="w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20 sm:w-72"
      >
    </header>

    <section
      v-if="!parPersonne.length"
      class="rounded-2xl border border-dashed border-secondary-300 p-10 text-center text-sm text-secondary-500"
    >
      Aucune responsabilité attribuée. Renseignez les propriétaires / responsables sur les actifs, risques, mesures, documents…
    </section>

    <section
      v-for="[nom, items] in parPersonne"
      :key="nom"
      class="rounded-2xl border border-secondary-200/60 bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]"
    >
      <h2 class="mb-3 flex items-center gap-2 font-medium tracking-tight text-secondary-900">
        <Icon
          name="lucide:user-check"
          class="size-4 text-primary-500"
        />{{ nom }}
        <span class="ml-auto font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-400">{{ items.length }}</span>
      </h2>
      <div class="space-y-1">
        <NuxtLink
          v-for="r in items"
          :key="r.cat + r.id"
          :to="`/${r.cat}/${r.id}`"
          class="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary-50"
        >
          <span class="inline-flex items-center rounded border border-primary-200/60 bg-primary-50/60 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">{{ r.role }}</span>
          <span class="text-secondary-800">{{ r.objet }}</span>
          <span class="ml-auto font-mono text-[10px] uppercase tracking-wide text-secondary-400">{{ r.domaine }}</span>
        </NuxtLink>
      </div>
    </section>

    <section
      v-if="sansResponsable.length"
      class="rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-4"
    >
      <h2 class="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-amber-600">
        Sans responsable désigné
      </h2>
      <div class="flex flex-wrap gap-2">
        <span
          v-for="s in sansResponsable"
          :key="s.domaine"
          class="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-1 text-xs text-secondary-700"
        >
          {{ s.domaine }} <span class="font-semibold text-amber-700">{{ s.n }}</span>
        </span>
      </div>
    </section>
  </div>
</template>
