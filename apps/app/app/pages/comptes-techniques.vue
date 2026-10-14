<script setup lang="ts">
import { ref, reactive } from 'vue'
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'
import { authClient } from '~/lib/auth-client'

const perms = await usePermissions()

type Account = { id: string, name: string, scopes: string[] }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Key = { id: string, metadata?: any, expiresAt?: string | null, created_at?: string | null }

const opts = () => ({ credentials: 'include' as const, headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined })

const { data: accounts, refresh } = await useAsyncData('service-accounts', async () => {
  const { data } = await authClient().serviceAccounts.listAccounts({ query: {}, fetchOptions: opts() })
  return (data?.service_accounts ?? []) as Account[]
}, { getCachedData: () => undefined })

const scopeDefs = [
  { value: 'read', label: 'Lecture' },
  { value: 'write', label: 'Écriture' },
  { value: 'delete', label: 'Suppression' },
  { value: 'admin', label: 'Admin' },
]

// Création de compte
const showCreate = ref(false)
const newName = ref('')
const newScopes = reactive<Record<string, boolean>>({ read: true, write: true, delete: false, admin: false })
const creating = ref(false)
const createAccount = async () => {
  if (!newName.value.trim() || creating.value) return
  creating.value = true
  await authClient().serviceAccounts.createAccount({
    name: newName.value.trim(),
    scopes: scopeDefs.map(s => s.value).filter(s => newScopes[s]),
    fetchOptions: { credentials: 'include' },
  })
  newName.value = ''
  creating.value = false
  showCreate.value = false
  await refresh()
}
const deleteAccount = async (id: string) => {
  if (!confirm('Supprimer ce compte technique et toutes ses clés ?')) return
  await authClient().serviceAccounts.deleteAccount({ accountId: id, fetchOptions: { credentials: 'include' } })
  await refresh()
}

// Gestion des clés
const expanded = ref('')
const keys = ref<Key[]>([])
const newKeyRaw = ref('')
const copied = ref(false)
const revealKey = ref(false)
const masked = computed(() => '•'.repeat(Math.min(44, newKeyRaw.value.length || 40)))
const keyExpiration = ref<number | null>(null)
const expirations = [
  { label: '7 jours', value: 60 * 60 * 24 * 7 },
  { label: '30 jours', value: 60 * 60 * 24 * 30 },
  { label: '1 an', value: 60 * 60 * 24 * 365 },
  { label: 'Jamais', value: null },
]

const loadKeys = async (id: string) => {
  const { data } = await authClient().serviceKeys.listKeys({ query: { accountId: id }, fetchOptions: opts() })
  keys.value = (data?.service_keys ?? []) as Key[]
}
const toggleKeys = async (id: string) => {
  newKeyRaw.value = ''
  copied.value = false
  revealKey.value = false
  expanded.value = expanded.value === id ? '' : id
  if (expanded.value) await loadKeys(id)
}
const createKey = async (id: string) => {
  copied.value = false
  revealKey.value = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = { accountId: id, fetchOptions: { credentials: 'include' } }
  if (keyExpiration.value !== null) body.expiresAt = keyExpiration.value
  const { data } = await authClient().serviceKeys.createKey(body)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newKeyRaw.value = (data as any)?.service_key?.key ?? ''
  await loadKeys(id)
}
const deleteKey = async (keyId: string, accountId: string) => {
  await authClient().serviceKeys.deleteKey({ keyId, fetchOptions: { credentials: 'include' } })
  await loadKeys(accountId)
}
const copyRaw = async () => {
  try {
    await navigator.clipboard.writeText(newKeyRaw.value)
    copied.value = true
  }
  catch { /* clipboard indisponible */ }
}

const inputCls = 'w-full rounded-lg border border-secondary-200/80 bg-secondary-50/30 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-400 focus:bg-white focus:ring-2 focus:ring-primary-500/20'
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-6 animate-in fade-in duration-500">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <UITitle class="tracking-tight text-secondary-900">
          Comptes techniques
        </UITitle>
        <p class="mt-1 text-sm text-secondary-600/90">
          Intégrations via l'en-tête <code class="rounded bg-secondary-100 px-1 py-0.5 font-mono text-xs">x-service-key</code>. Un compte peut avoir plusieurs clés.
        </p>
      </div>
      <UIButton
        v-if="perms.isAdmin.value"
        variant="primary"
        class="font-medium tracking-tight shadow-sm shadow-primary-500/20 transition-all duration-300 hover:shadow-md hover:shadow-primary-500/30"
        @click="showCreate = !showCreate"
      >
        <Icon
          :name="showCreate ? 'lucide:x' : 'lucide:plus'"
          class="size-4"
        /> {{ showCreate ? 'Fermer' : 'Créer un compte' }}
      </UIButton>
    </header>

    <p
      v-if="!perms.isAdmin.value"
      class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      Accès réservé aux administrateurs.
    </p>
    <template v-else>
      <!-- Création -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
      >
        <div
          v-if="showCreate"
          class="space-y-4 rounded-2xl border border-primary-200/60 bg-white p-5 shadow-sm"
        >
          <div class="space-y-1.5">
            <label class="block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">Nom du compte</label>
            <input
              v-model="newName"
              placeholder="ex. n8n-integration"
              :class="inputCls"
              @keyup.enter="createAccount"
            >
          </div>
          <div class="space-y-1.5">
            <label class="block font-mono text-[11px] font-semibold uppercase tracking-widest text-secondary-500">Permissions</label>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="s in scopeDefs"
                :key="s.value"
                class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-secondary-200 bg-secondary-50/40 px-3 py-2 text-sm text-secondary-700 transition-colors has-[:checked]:border-primary-300 has-[:checked]:bg-primary-50 has-[:checked]:text-primary-800"
              >
                <input
                  v-model="newScopes[s.value]"
                  type="checkbox"
                  class="size-4 accent-primary-600"
                > {{ s.label }}
              </label>
            </div>
          </div>
          <div class="flex justify-end">
            <UIButton
              :disabled="creating || !newName.trim()"
              @click="createAccount"
            >
              {{ creating ? 'Création…' : 'Créer le compte' }}
            </UIButton>
          </div>
        </div>
      </Transition>

      <!-- Liste -->
      <div
        v-if="!accounts?.length && !showCreate"
        class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 py-16 text-center shadow-sm"
      >
        <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-primary-200/60 bg-primary-100/50 shadow-inner">
          <Icon
            name="lucide:key-round"
            class="size-7 text-primary-600"
          />
        </div>
        <p class="font-medium text-secondary-600">
          Aucun compte technique.
        </p>
      </div>

      <ul
        v-else
        class="space-y-2.5"
      >
        <li
          v-for="acc in accounts"
          :key="acc.id"
          class="rounded-2xl border bg-white p-4 shadow-sm transition-colors"
          :class="expanded === acc.id ? 'border-primary-200' : 'border-secondary-200/70'"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-xl border border-secondary-100 bg-secondary-50 text-secondary-500">
                <Icon
                  name="lucide:bot"
                  class="size-5"
                />
              </div>
              <div class="min-w-0">
                <div class="truncate font-medium text-secondary-900">
                  {{ acc.name }}
                </div>
                <div class="mt-1 flex flex-wrap gap-1">
                  <Pill
                    v-for="s in acc.scopes"
                    :key="s"
                    tone="gray"
                  >
                    {{ s }}
                  </Pill>
                </div>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UIButton
                variant="outline"
                size="sm"
                @click="toggleKeys(acc.id)"
              >
                <Icon
                  name="lucide:key-round"
                  class="size-4"
                /> Clés
              </UIButton>
              <UIButton
                variant="ghost"
                size="icon"
                class="text-red-500 hover:bg-red-50"
                @click="deleteAccount(acc.id)"
              >
                <Icon
                  name="lucide:trash-2"
                  class="size-4"
                />
              </UIButton>
            </div>
          </div>

          <div
            v-if="expanded === acc.id"
            class="mt-4 space-y-3 rounded-xl border border-secondary-200/70 bg-secondary-50/40 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="font-mono text-[11px] font-semibold uppercase tracking-widest text-primary-600">Clés de service</span>
            </div>

            <!-- Clé fraîchement créée : le secret n'est renvoyé qu'une fois -->
            <div
              v-if="newKeyRaw"
              class="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5"
            >
              <div class="mb-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                <Icon
                  name="lucide:circle-check-big"
                  class="size-4"
                /> Nouvelle clé générée
              </div>
              <p class="mb-2.5 text-xs text-emerald-700/90">
                Copiez-la maintenant : pour des raisons de sécurité, elle ne sera plus jamais réaffichée.
              </p>
              <div class="flex items-center gap-2">
                <code class="min-w-0 flex-1 truncate rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs tracking-tight text-secondary-800">{{ revealKey ? newKeyRaw : masked }}</code>
                <UIButton
                  variant="outline"
                  size="sm"
                  :title="revealKey ? 'Masquer' : 'Afficher'"
                  @click="revealKey = !revealKey"
                >
                  <Icon
                    :name="revealKey ? 'lucide:eye-off' : 'lucide:eye'"
                    class="size-4"
                  />
                </UIButton>
                <UIButton
                  size="sm"
                  @click="copyRaw"
                >
                  <Icon
                    :name="copied ? 'lucide:check' : 'lucide:copy'"
                    class="size-4"
                  /> {{ copied ? 'Copié' : 'Copier' }}
                </UIButton>
              </div>
            </div>

            <div
              v-if="!keys.length"
              class="text-sm text-secondary-400"
            >
              Aucune clé active.
            </div>
            <ul
              v-else
              class="space-y-1.5"
            >
              <li
                v-for="k in keys"
                :key="k.id"
                class="flex items-center justify-between gap-3 rounded-lg border border-secondary-200 bg-white px-3 py-2 text-sm"
              >
                <span class="flex min-w-0 items-center gap-2.5">
                  <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary-100 text-secondary-500">
                    <Icon
                      name="lucide:key-round"
                      class="size-3.5"
                    />
                  </span>
                  <span class="min-w-0">
                    <span class="block font-mono text-xs text-secondary-600">réf. {{ k.id.slice(0, 8) }}</span>
                    <span class="text-[11px] text-secondary-400">{{ k.expiresAt ? 'expire le ' + String(k.expiresAt).slice(0, 10) : 'sans expiration' }}</span>
                  </span>
                </span>
                <button
                  aria-label="Révoquer"
                  class="shrink-0 rounded-md p-1.5 text-secondary-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  @click="deleteKey(k.id, acc.id)"
                >
                  <Icon
                    name="lucide:trash-2"
                    class="size-4"
                  />
                </button>
              </li>
            </ul>

            <div class="flex flex-wrap items-center gap-2 border-t border-secondary-200/60 pt-3">
              <select
                v-model="keyExpiration"
                class="rounded-lg border border-secondary-200/80 bg-white px-2 py-1.5 text-sm"
              >
                <option
                  v-for="e in expirations"
                  :key="e.label"
                  :value="e.value"
                >
                  {{ e.label }}
                </option>
              </select>
              <UIButton
                size="sm"
                @click="createKey(acc.id)"
              >
                <Icon
                  name="lucide:plus"
                  class="size-4"
                /> Nouvelle clé
              </UIButton>
            </div>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
