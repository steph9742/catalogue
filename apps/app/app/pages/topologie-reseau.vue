<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { equipementReseauTypes } from '~/utils/catalogueEnums'

const api = useApi()
const perms = await usePermissions()
if (!perms.canRead('equipements-reseau')) throw createError({ statusCode: 403, statusMessage: 'Accès refusé' })

type Equip = { id: string, nom: string, type: string | null, lieuId: string | null }
type Lien = { id: string, equipementAId: string | null, equipementBId: string | null, type: string | null, portee: string | null, debit: string | null }
type Interco = { id: string, nom: string, type: string | null, equipementId: string | null, debit: string | null }
type Lieu = { id: string, nom: string, type: string | null, parentId: string | null }
// DÉCLARATION de fonction, pas de flèche générique : dans un `.vue`, `<T>(…)` est lu
// comme une balise ouvrante et fait échouer l'analyse eslint de TOUT le fichier —
// même piège que dans reglages.vue, mêmes conséquences (signalements masqués).
async function load<T>(e: string) {
  return (await useAsyncData(`topo-${e}`, () => api<T[]>(`/api/${e}`), { getCachedData: () => undefined })).data
}
const equipements = await load<Equip>('equipements-reseau')
const liens = await load<Lien>('liens-reseau')
const intercos = await load<Interco>('interconnexions-externes')
const lieux = await load<Lieu>('lieux')

// Site (ville) d'un équipement : on remonte la hiérarchie de lieux jusqu'au type « site ».
const lieuMap = new Map((lieux.value ?? []).map(l => [l.id, l]))
function siteOf(lieuId: string | null): string | null {
  let cur = lieuId ? lieuMap.get(lieuId) : undefined
  let guard = 0
  while (cur && guard++ < 20) {
    if (cur.type === 'site') return cur.nom
    cur = cur.parentId ? lieuMap.get(cur.parentId) : undefined
  }
  return null
}

type Node = { id: string, label: string, kind: 'equip' | 'interco', type: string | null, site: string | null }
type Link = { a: string, b: string, medium: string, portee: string | null, debit: string | null }
const nodes: Node[] = [
  ...(equipements.value ?? []).map(e => ({ id: e.id, label: e.nom, kind: 'equip' as const, type: e.type, site: siteOf(e.lieuId) })),
  ...(intercos.value ?? []).map(i => ({ id: 'i:' + i.id, label: i.nom, kind: 'interco' as const, type: i.type, site: null })),
]
const links: Link[] = [
  ...(liens.value ?? []).filter(l => l.equipementAId && l.equipementBId).map(l => ({ a: l.equipementAId!, b: l.equipementBId!, medium: l.type ?? 'autre', portee: l.portee, debit: l.debit })),
  ...(intercos.value ?? []).filter(i => i.equipementId).map(i => ({ a: 'i:' + i.id, b: i.equipementId!, medium: 'interco', portee: null, debit: i.debit })),
]

const NODE_COLORS: Record<string, string> = {
  firewall: '#ef4444', routeur: '#3b82f6', switch: '#6366f1', borne_wifi: '#a855f7',
  load_balancer: '#f59e0b', passerelle: '#10b981', autre: '#94a3b8',
}
const colorOf = (n: Node) => n.kind === 'interco' ? '#0f172a' : (NODE_COLORS[n.type ?? 'autre'] ?? '#6366f1')

// Débit → Gbps.
function gbps(s: string | null): number | null {
  if (!s) return null
  const m = s.match(/([\d.,]+)\s*(g|m|k|t)?/i)
  if (!m) return null
  let v = parseFloat(m[1]!.replace(',', '.'))
  const u = (m[2] ?? 'g').toLowerCase()
  if (u === 't') v *= 1000
  else if (u === 'm') v /= 1000
  else if (u === 'k') v /= 1e6
  return Number.isFinite(v) ? v : null
}
// Palier de vitesse (couleur froide → chaude = lent → rapide) — encode le débit du lien.
const SPEED_TIERS = [
  { min: 100, label: '≥ 100 Gbps', color: '#ef4444' },
  { min: 40, label: '40 Gbps', color: '#f97316' },
  { min: 10, label: '10 Gbps', color: '#f59e0b' },
  { min: 1, label: '1 Gbps', color: '#14b8a6' },
  { min: 0, label: '< 1 Gbps', color: '#3b82f6' },
]
const UNKNOWN_SPEED = { label: 'Débit non renseigné', color: '#cbd5e1' }
function speedTier(debit: string | null) {
  const g = gbps(debit)
  if (g == null) return UNKNOWN_SPEED
  return SPEED_TIERS.find(t => g >= t.min) ?? UNKNOWN_SPEED
}
// Interco externe = gris sombre ; sinon couleur par vitesse.
const linkColor = (e: Link) => e.medium === 'interco' ? '#334155' : speedTier(e.debit).color
function linkWidth(e: Link): number {
  const g = gbps(e.debit)
  const base = g == null ? 1.6 : g >= 100 ? 5 : g >= 40 ? 4.2 : g >= 10 ? 3.4 : g >= 1 ? 2.6 : 1.8
  return e.portee === 'man' ? Math.max(base, 2.6) : base
}
const dashOf = (e: Link) => e.medium === 'interco' ? '2 4' : e.portee === 'man' ? '9 4' : undefined

const W = 860, H = 580
const layout = ref<Map<string, { x: number, y: number }> | null>(null)
const siteBubbles = ref<{ site: string, x: number, y: number, r: number, i: number }[]>([])

// Sites (villes) → un centre par site sur un grand cercle ; les nœuds gravitent vers leur site.
const siteList = [...new Set(nodes.map(n => n.site).filter((s): s is string => !!s))]
const siteCenter = new Map(siteList.map((s, i) => {
  const ang = (2 * Math.PI * i) / Math.max(1, siteList.length)
  const rad = siteList.length > 1 ? 250 : 0
  return [s, { x: W / 2 + Math.cos(ang) * rad, y: H / 2 + Math.sin(ang) * rad * 0.78 }]
}))

onMounted(() => {
  if (!nodes.length) {
    layout.value = new Map()
    return
  }
  const pos = new Map(nodes.map((n, i) => {
    const c = n.site ? siteCenter.get(n.site) : null
    const ang = (2 * Math.PI * i) / nodes.length
    return [n.id, c
      ? { x: c.x + Math.cos(ang) * 45, y: c.y + Math.sin(ang) * 45, vx: 0, vy: 0 }
      : { x: W / 2 + Math.cos(ang) * 230, y: H / 2 + Math.sin(ang) * 200, vx: 0, vy: 0 }]
  }))
  for (let it = 0; it < 460; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i]!.id)!, b = pos.get(nodes[j]!.id)!
        const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy || 0.01, d = Math.sqrt(d2)
        const f = 2200 / d2, fx = (dx / d) * f, fy = (dy / d) * f
        a.vx += fx
        a.vy += fy
        b.vx -= fx
        b.vy -= fy
      }
    }
    for (const e of links) {
      const a = pos.get(e.a), b = pos.get(e.b)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01
      const f = (d - 90) * 0.02, fx = (dx / d) * f, fy = (dy / d) * f
      a.vx += fx
      a.vy += fy
      b.vx -= fx
      b.vy -= fy
    }
    for (const n of nodes) {
      const p = pos.get(n.id)!
      const c = n.site ? siteCenter.get(n.site) : null
      if (c) {
        p.vx += (c.x - p.x) * 0.03
        p.vy += (c.y - p.y) * 0.03
      }
      else {
        p.vx += (W / 2 - p.x) * 0.004
        p.vy += (H / 2 - p.y) * 0.004
      }
      p.x += p.vx * 0.82
      p.y += p.vy * 0.82
      p.vx *= 0.82
      p.vy *= 0.82
      p.x = Math.max(28, Math.min(W - 28, p.x))
      p.y = Math.max(30, Math.min(H - 22, p.y))
    }
  }
  layout.value = new Map([...pos].map(([k, v]) => [k, { x: v.x, y: v.y }]))
  siteBubbles.value = siteList.map((s, i) => {
    const ms = nodes.filter(n => n.site === s).map(n => pos.get(n.id)!)
    const cx = ms.reduce((a, m) => a + m.x, 0) / ms.length
    const cy = ms.reduce((a, m) => a + m.y, 0) / ms.length
    const r = Math.max(40, ...ms.map(m => Math.hypot(m.x - cx, m.y - cy))) + 26
    return { site: s, x: cx, y: cy, r, i }
  })
})

const P = (id: string) => layout.value?.get(id) ?? { x: W / 2, y: H / 2 }
const open = (n: Node) => navigateTo(n.kind === 'interco' ? `/interconnexions-externes/${n.id.slice(2)}` : `/equipements-reseau/${n.id}`)
const SITE_FILL = ['#eff6ff', '#f0fdf4', '#fef3c7', '#faf5ff', '#fef2f2', '#ecfeff', '#fdf4ff']
const SITE_STROKE = ['#bfdbfe', '#bbf7d0', '#fde68a', '#e9d5ff', '#fecaca', '#a5f3fc', '#f5d0fe']
const nodeLegende = [...equipementReseauTypes.filter(t => NODE_COLORS[t.value]).map(t => ({ label: t.label, color: NODE_COLORS[t.value]! })), { label: 'Interconnexion externe', color: '#0f172a' }]
const linkLegende = [...SPEED_TIERS.map(t => ({ label: t.label, color: t.color })), { label: UNKNOWN_SPEED.label, color: UNKNOWN_SPEED.color }]
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-4 p-6 animate-in fade-in duration-500">
    <header>
      <UITitle class="tracking-tight text-secondary-900">
        Topologie réseau
      </UITitle>
      <p class="mt-1 text-sm text-secondary-600/90">
        {{ nodes.length }} nœud(s), {{ links.length }} lien(s){{ siteList.length ? ` · ${siteList.length} site(s)` : '' }} — équipements regroupés par ville, liens colorés par médium.
      </p>
    </header>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-secondary-200/60 bg-secondary-50/40 px-3 py-2 text-xs text-secondary-600">
      <span class="font-semibold uppercase tracking-wide text-secondary-400">Nœuds</span>
      <div
        v-for="l in nodeLegende"
        :key="l.label"
        class="flex items-center gap-1.5"
      >
        <span
          class="inline-block size-2.5 rounded-full"
          :style="{ background: l.color }"
        />{{ l.label }}
      </div>
      <span class="ml-2 font-semibold uppercase tracking-wide text-secondary-400">Vitesse</span>
      <div
        v-for="l in linkLegende"
        :key="l.label"
        class="flex items-center gap-1.5"
      >
        <svg
          width="20"
          height="8"
        ><line
          x1="1"
          y1="4"
          x2="19"
          y2="4"
          :stroke="l.color"
          stroke-width="3.5"
          stroke-linecap="round"
        /></svg>{{ l.label }}
      </div>
      <div class="flex items-center gap-1.5">
        <svg
          width="20"
          height="8"
        ><line
          x1="1"
          y1="4"
          x2="19"
          y2="4"
          stroke="#64748b"
          stroke-width="3"
          stroke-dasharray="9 4"
          stroke-linecap="round"
        /></svg>MAN (inter-sites)
      </div>
      <div class="flex items-center gap-1.5">
        <svg
          width="20"
          height="8"
        ><line
          x1="1"
          y1="4"
          x2="19"
          y2="4"
          stroke="#334155"
          stroke-width="3"
          stroke-dasharray="2 4"
          stroke-linecap="round"
        /></svg>Interco externe
      </div>
    </div>

    <section class="overflow-x-auto rounded-2xl border border-secondary-200/60 bg-white shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
      <p
        v-if="!nodes.length"
        class="p-16 text-center text-sm text-secondary-500"
      >
        Aucun équipement réseau. Ajoutez équipements, liens (avec portée/médium) et sites pour voir la topologie.
      </p>
      <div
        v-else-if="!layout"
        class="flex items-center justify-center p-24 font-mono text-sm text-primary-600"
      >
        <div class="mr-3 size-3 animate-ping rounded-full bg-primary-400" /> Calcul du graphe…
      </div>
      <svg
        v-else
        :viewBox="`0 0 ${W} ${H}`"
        class="w-full"
        :style="{ minWidth: '680px' }"
      >
        <!-- Bulles de site (villes) -->
        <g
          v-for="b in siteBubbles"
          :key="b.site"
        >
          <circle
            :cx="b.x"
            :cy="b.y"
            :r="b.r"
            :fill="SITE_FILL[b.i % SITE_FILL.length]"
            :stroke="SITE_STROKE[b.i % SITE_STROKE.length]"
            stroke-width="1.5"
            opacity="0.7"
          />
          <text
            :x="b.x"
            :y="b.y - b.r + 14"
            text-anchor="middle"
            class="fill-secondary-500"
            style="font-size: 11px; font-weight: 600;"
          >{{ b.site }}</text>
        </g>
        <!-- Liens -->
        <line
          v-for="(e, i) in links"
          :key="'e' + i"
          :x1="P(e.a).x"
          :y1="P(e.a).y"
          :x2="P(e.b).x"
          :y2="P(e.b).y"
          :stroke="linkColor(e)"
          :stroke-width="linkWidth(e)"
          :stroke-dasharray="dashOf(e)"
          stroke-linecap="round"
        />
        <!-- Nœuds -->
        <g
          v-for="n in nodes"
          :key="n.id"
          class="cursor-pointer"
          @click="open(n)"
        >
          <rect
            v-if="n.kind === 'interco'"
            :x="P(n.id).x - 9"
            :y="P(n.id).y - 9"
            width="18"
            height="18"
            rx="3"
            :fill="colorOf(n)"
          />
          <circle
            v-else
            :cx="P(n.id).x"
            :cy="P(n.id).y"
            r="9"
            :fill="colorOf(n)"
            stroke="white"
            stroke-width="1.5"
          />
          <text
            :x="P(n.id).x"
            :y="P(n.id).y + 20"
            text-anchor="middle"
            class="fill-secondary-700"
            style="font-size: 10px;"
          >{{ n.label }}</text>
        </g>
      </svg>
    </section>
    <p class="text-center text-xs text-secondary-400">
      Cliquez un nœud pour sa fiche. Vue logique : <NuxtLink
        to="/zones-reseau"
        class="hover:text-primary-600 hover:underline"
      >Zones & VLAN</NuxtLink>, <NuxtLink
        to="/flux-reseau"
        class="hover:text-primary-600 hover:underline"
      >Flux</NuxtLink>.
    </p>
  </div>
</template>
