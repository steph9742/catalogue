<script setup lang="ts">
import { reactive, watchEffect } from 'vue'

type UserRow = { id: string, email: string, name: string, role: string | null, roleOrigine: string | null, categoryRoles: Record<string, string> }
type Category = { key: string, label: string }

const api = useApi()
const perms = await usePermissions()

const { data: users, refresh: rafraichir } = await useAsyncData('roles-users', () => api<UserRow[]>('/api/roles'), { getCachedData: () => undefined })
const { data: categories } = await useAsyncData('categories', () => api<Category[]>('/api/categories'))

const roleOptions = [
  { v: '', l: '—' },
  { v: 'lecteur', l: 'Lecteur' },
  { v: 'contributeur', l: 'Contributeur' },
  { v: 'gestionnaire', l: 'Gestionnaire' },
]

// État local éditable : roles[userId][category] = rôle | '' ; admins[userId] = bool.
const roles = reactive<Record<string, Record<string, string>>>({})
const admins = reactive<Record<string, boolean>>({})
// ORIGINE DU RÔLE GLOBAL — `annuaire` (réévalué à chaque connexion) ou `manuel` (posé ici, et
// l'annuaire n'y touche plus).
const origines = reactive<Record<string, string>>({})
watchEffect(() => {
  for (const u of users.value ?? []) {
    if (!roles[u.id]) roles[u.id] = {}
    if (admins[u.id] === undefined) admins[u.id] = u.role === 'admin'
    if (origines[u.id] === undefined) origines[u.id] = u.roleOrigine ?? 'annuaire'
    for (const c of categories.value ?? []) {
      if (roles[u.id]![c.key] === undefined) roles[u.id]![c.key] = u.categoryRoles?.[c.key] ?? ''
    }
  }
})

const saving = ref('')
const setRole = async (userId: string, category: string) => {
  const role = roles[userId]?.[category] || null
  saving.value = `${userId}:${category}`
  try {
    await api(`/api/roles/${userId}`, { method: 'PUT', body: { category, role } })
  }
  finally {
    saving.value = ''
  }
}

// ORIGINE DU RÔLE GLOBAL — qui décide, de l'annuaire ou d'ici. Une modification faite sur cet
// écran est une DÉCISION : elle marque le rôle « manuel » et l'annuaire cesse de le réévaluer.
const setAdmin = async (userId: string, origine: 'manuel' | 'annuaire' = 'manuel') => {
  try {
    const r = await api<{ origine: string }>(`/api/roles/${userId}/admin`, {
      method: 'PUT',
      body: { admin: admins[userId], origine },
    })
    origines[userId] = r.origine
    // Rendre la main à l'annuaire ne prend effet qu'à la prochaine connexion : on
    // recharge pour que l'écran montre l'état réellement enregistré, pas l'état espéré.
    if (origine === 'annuaire') await rafraichir()
  }
  catch {
    admins[userId] = !admins[userId] // revert en cas de refus (ex. retrait de son propre rôle)
  }
}

// Utilisateur courant : on ne peut pas retirer son propre rôle admin.
const meId = computed(() => perms.me.value?.id)

// Colonne « Toutes catégories » : reflète l'état (rôle commun à toutes les catégories,
// « Aucun » si toutes vides, « Personnalisé » si mélange) et permet d'appliquer en masse.
const bulkState = (userId: string): string => {
  const cats = categories.value ?? []
  if (!cats.length) return 'none'
  const vals = cats.map(c => roles[userId]?.[c.key] ?? '')
  const first = vals[0] ?? ''
  if (vals.every(v => v === first)) return first === '' ? 'none' : first
  return 'custom'
}
const setBulk = async (userId: string, value: string) => {
  if (value === 'custom') return
  const role = value === 'none' ? null : value
  saving.value = `${userId}:all`
  try {
    await api(`/api/roles/${userId}/all`, { method: 'PUT', body: { role } })
    for (const c of categories.value ?? []) roles[userId]![c.key] = role ?? ''
  }
  finally {
    saving.value = ''
  }
}

const selectCls = 'rounded-lg border border-secondary-200/80 bg-secondary-50/40 px-2 py-1 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Utilisateurs &amp; rôles
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        Rôle par catégorie. Vide = aucun accès. Les administrateurs ont tout.
      </p>
    </header>

    <div
      v-if="!perms.isAdmin.value"
      class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      Accès réservé aux administrateurs.
    </div>
    <template v-else>
      <div class="overflow-x-auto rounded-2xl border border-secondary-200/70 bg-white shadow-sm">
        <table class="text-sm">
          <thead>
            <tr class="border-b border-secondary-100 bg-secondary-50/60">
              <th class="sticky left-0 bg-secondary-50/60 px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">
                Utilisateur
              </th>
              <th class="whitespace-nowrap border-r border-secondary-200/70 px-3 py-3 text-center font-mono text-[11px] font-semibold uppercase tracking-widest text-primary-600">
                Toutes catégories
              </th>
              <th
                v-for="c in categories ?? []"
                :key="c.key"
                class="whitespace-nowrap px-3 py-3 text-center font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500"
              >
                {{ c.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="u in users ?? []"
              :key="u.id"
              class="border-t border-secondary-100 hover:bg-secondary-50/40"
            >
              <td class="sticky left-0 whitespace-nowrap bg-white px-4 py-2.5 font-medium text-secondary-900">
                <div>
                  {{ u.email }}<span
                    v-if="u.id === meId"
                    class="ml-1.5 text-[10px] font-normal text-secondary-400"
                  >(vous)</span>
                </div>
                <label
                  class="mt-1 inline-flex items-center gap-1.5 text-xs font-normal text-secondary-500"
                  :title="u.id === meId ? 'Vous ne pouvez pas retirer votre propre rôle admin.' : ''"
                >
                  <input
                    v-model="admins[u.id]"
                    type="checkbox"
                    class="size-3.5 accent-primary-600 disabled:opacity-40"
                    :disabled="u.id === meId"
                    @change="setAdmin(u.id)"
                  > Administrateur
                </label>
                <!-- L'origine du rôle. Un rôle « manuel » échappe à la révocation par
                     l'annuaire : le taire le rendrait permanent par oubli. -->
                <p
                  v-if="origines[u.id] === 'manuel'"
                  class="mt-0.5 text-[10px] font-normal text-amber-700"
                >
                  Posé à la main — non réévalué à la connexion.
                  <button
                    class="underline hover:no-underline"
                    title="Le rôle sera de nouveau déterminé par le groupe « admins » de l'annuaire, à la prochaine connexion."
                    @click="setAdmin(u.id, 'annuaire')"
                  >
                    Rendre à l'annuaire
                  </button>
                </p>
                <p
                  v-else
                  class="mt-0.5 text-[10px] font-normal text-secondary-400"
                >
                  Suit le groupe « admins » de l'annuaire.
                </p>
              </td>
              <td class="border-r border-secondary-200/70 px-3 py-2.5 text-center">
                <select
                  v-if="!admins[u.id]"
                  :value="bulkState(u.id)"
                  :class="[selectCls, bulkState(u.id) === 'custom' ? 'italic text-secondary-500' : 'font-medium']"
                  :disabled="saving === `${u.id}:all`"
                  @change="setBulk(u.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option
                    value="custom"
                    disabled
                  >
                    Personnalisé
                  </option>
                  <option value="none">
                    Aucun
                  </option>
                  <option value="lecteur">
                    Lecteur
                  </option>
                  <option value="contributeur">
                    Contributeur
                  </option>
                  <option value="gestionnaire">
                    Gestionnaire
                  </option>
                </select>
                <span
                  v-else
                  class="text-xs text-secondary-400"
                >—</span>
              </td>
              <td
                v-for="c in categories ?? []"
                :key="c.key"
                class="px-3 py-2.5 text-center"
              >
                <select
                  v-if="!admins[u.id]"
                  v-model="roles[u.id]![c.key]"
                  :class="selectCls"
                  :disabled="saving === `${u.id}:${c.key}`"
                  @change="setRole(u.id, c.key)"
                >
                  <option
                    v-for="o in roleOptions"
                    :key="o.v"
                    :value="o.v"
                  >
                    {{ o.l }}
                  </option>
                </select>
                <span
                  v-else
                  class="inline-flex items-center rounded-md border border-primary-200/60 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary-700"
                >tout</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
