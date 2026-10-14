<script setup lang="ts">
import { UIButton } from '@catalogue/ui'
import Pill from '~/components/ui/Pill.vue'

type Alert = { type: string, severity: 'critical' | 'warning', message: string, entite: string, entiteId: string, dueDate: string | null }

const api = useApi()
const { data: alerts } = await useAsyncData('alerts', () => api<Alert[]>('/api/alerts'), {
  getCachedData: () => undefined,
})
const session = await useSSRAuth()
const isAdmin = computed(() => session.value?.user?.role === 'admin')

const dispatching = ref(false)
const dispatchMsg = ref('')
const dispatch = async () => {
  dispatching.value = true
  dispatchMsg.value = ''
  try {
    const r = await api<{ count: number, webhooksSent: number, webhooksTotal: number }>('/api/alerts/dispatch', { method: 'POST' })
    dispatchMsg.value = `${r.count} alerte(s) diffusée(s) à ${r.webhooksSent}/${r.webhooksTotal} webhook(s).`
  }
  catch {
    dispatchMsg.value = 'Échec de la diffusion.'
  }
  finally { dispatching.value = false }
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-6 p-6 animate-in fade-in duration-500">
    <div
      v-if="!isAdmin"
      class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      Accès réservé aux administrateurs.
    </div>
    <template v-else>
      <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <UITitle class="tracking-tight text-secondary-900">
            Alertes
          </UITitle>
          <p class="mt-1 text-sm text-secondary-600/90">
            Échéances : VPN, technos en fin de vie, contrats, fin de support, revues d'homologation.
          </p>
        </div>
        <UIButton
          variant="outline"
          class="font-medium tracking-tight shadow-sm transition-all duration-300 hover:shadow-md"
          :disabled="dispatching"
          @click="dispatch"
        >
          <Icon
            name="lucide:send"
            class="size-4"
          /> {{ dispatching ? 'Diffusion…' : 'Diffuser (webhooks)' }}
        </UIButton>
      </header>

      <p
        v-if="dispatchMsg"
        class="rounded-xl border border-primary-200/60 bg-primary-50/60 px-3 py-2 text-sm text-primary-700"
      >
        {{ dispatchMsg }}
      </p>

      <section
        v-if="!alerts?.length"
        class="rounded-2xl border border-secondary-200/60 bg-secondary-50/40 py-20 text-center shadow-sm"
      >
        <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-emerald-200/60 bg-emerald-100/50 shadow-inner">
          <Icon
            name="lucide:check-check"
            class="size-7 text-emerald-600"
          />
        </div>
        <p class="font-medium text-secondary-600">
          Aucune alerte.
        </p>
        <p class="mt-1 text-sm text-secondary-500">
          Aucune échéance dans les 30 prochains jours.
        </p>
      </section>

      <ul
        v-else
        class="space-y-2.5"
      >
        <li
          v-for="(a, i) in alerts"
          :key="i"
          class="group relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.1)]"
          :class="a.severity === 'critical' ? 'border-red-200/70' : 'border-amber-200/70'"
        >
          <div
            class="absolute inset-y-0 left-0 w-1"
            :class="a.severity === 'critical' ? 'bg-red-400' : 'bg-amber-400'"
          />
          <div class="flex min-w-0 items-center gap-3 pl-1">
            <Pill :tone="a.severity === 'critical' ? 'red' : 'amber'">
              {{ a.severity === 'critical' ? 'Critique' : 'À venir' }}
            </Pill>
            <span class="truncate text-sm text-secondary-800">{{ a.message }}</span>
          </div>
          <NuxtLink
            :href="`/${a.entite}/${a.entiteId}`"
            class="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
          >
            Voir <Icon
              name="lucide:arrow-right"
              class="size-3.5"
            />
          </NuxtLink>
        </li>
      </ul>
    </template>
  </div>
</template>
