<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { VueFlow, Handle, Position, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import dagre from '@dagrejs/dagre'
import { labelOf, composanteTypes, departementTypes, poleTypes } from '~/utils/catalogueEnums'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const props = defineProps<{
  entites: Row[]
  composantes: Row[]
  departements: Row[]
  services: Row[]
  poles: Row[]
  personnes: Row[]
  gouvernance: Row[]
}>()

const nm = (r: Row | undefined) => (r ? String(r.sigle || r.nom || '') : '')
const fullName = (p: Row | undefined) => (p ? `${p.prenom ? p.prenom + ' ' : ''}${p.nom ?? ''}`.trim() : '')
const byId = (rows: Row[]) => new Map(rows.map(r => [String(r.id), r]))
const persMap = computed(() => byId(props.personnes))
const personName = (id: string | null | undefined) => (id ? fullName(persMap.value.get(String(id))) : null)

const composantesOf = (id: string) => props.composantes.filter(c => c.entiteId === id)
const departementsOf = (id: string) => props.departements.filter(d => d.composanteId === id)
const servicesOf = (id: string) => props.services.filter(s => s.composanteId === id)
const polesOf = (id: string) => props.poles.filter(p => p.serviceId === id)

const personsByUnit = computed(() => {
  const m = new Map<string, Row[]>()
  for (const p of props.personnes) {
    const u = p.poleId ?? p.departementId ?? p.serviceId ?? p.composanteId
    if (!u) continue
    const g = m.get(u) ?? []
    g.push(p)
    m.set(u, g)
  }
  return m
})
const personsOf = (id: string) => personsByUnit.value.get(id) ?? []

// Rôles de gouvernance.
const GOV: Record<string, string> = { president: 'Prés.', vice_president: 'VP', chef_cabinet: 'Chef cab.', secretaire_cabinet: 'Secr. cab.', dgs: 'DGS', dga: 'DGA' }
const GOV_FULL: Record<string, string> = { president: 'Président·e', vice_president: 'Vice-président·e', chef_cabinet: 'Chef·fe de cabinet', secretaire_cabinet: 'Secrétaire de cabinet', dgs: 'DGS', dga: 'DGA' }
const GOV_ORDER = ['president', 'vice_president', 'chef_cabinet', 'secretaire_cabinet', 'dgs', 'dga']
const govOf = (id: string) => props.gouvernance.filter(g => g.entiteId === id)

// Badges compacts de gouvernance pour le nœud entité (rôles uniques nommés, multiples comptés).
const govBadges = (id: string): string[] => {
  const list = govOf(id)
  const out: string[] = []
  for (const role of GOV_ORDER) {
    const m = list.filter(g => g.role === role)
    if (!m.length) continue
    if (role === 'vice_president' || role === 'dga') out.push(`${GOV[role]} ×${m.length}`)
    else out.push(`${GOV[role]} ${fullName(m[0])}`)
  }
  return out
}
const unitBadges = (type: string, r: Row): string[] => {
  const b: string[] = []
  const add = (label: string, id: string | null | undefined) => {
    const n = personName(id)
    if (n) b.push(`${label} ${n}`)
  }
  if (type === 'composante') {
    add('Dir.', r.directeurId)
    add('Vice-dir.', r.viceDirecteurId)
    add('RSA', r.rsaId)
  }
  else if (type === 'departement') {
    add('Dir.', r.directeurId)
    add('Secr.', r.secretaireId)
  }
  else if (type === 'service') {
    add('Dir.', r.directeurId)
  }
  else if (type === 'pole') {
    add('Resp.', r.responsableId)
  }
  return b
}

// Personnes « responsables » (mises en avant).
const leaderMap = computed(() => {
  const m = new Map<string, string>()
  const set = (id: string | null | undefined, label: string) => {
    if (id && !m.has(String(id))) m.set(String(id), label)
  }
  for (const g of props.gouvernance) set(g.personneId, GOV_FULL[g.role] ?? g.role)
  for (const c of props.composantes) {
    set(c.directeurId, 'Directeur·rice')
    set(c.viceDirecteurId, 'Vice-directeur·rice')
    set(c.rsaId, 'RSA')
  }
  for (const d of props.departements) {
    set(d.directeurId, 'Directeur·rice')
    set(d.secretaireId, 'Secrétaire')
  }
  for (const s of props.services) set(s.directeurId, 'Directeur·rice')
  for (const p of props.poles) set(p.responsableId, 'Responsable')
  return m
})

// --- Construction du graphe selon l'état déplié ---
const expanded = ref(new Set<string>(props.entites.map(e => String(e.id))))
const PERSON_CAP = 14
const SIZE: Record<string, [number, number]> = {
  entite: [252, 96], composante: [224, 82], service: [204, 70], departement: [204, 70], pole: [192, 62], personne: [178, 56], more: [150, 40],
}

function buildModel() {
  const nodes: Row[] = []
  const edges: Row[] = []
  const isExp = (id: string) => expanded.value.has(id)
  const push = (id: string, type: string, data: Row) => {
    const [w, h] = SIZE[type]!
    nodes.push({ id, type: 'org', position: { x: 0, y: 0 }, style: { width: `${w}px` }, _w: w, _h: h, data: { ...data, type } })
  }
  const link = (s: string, t: string) => edges.push({ id: `${s}>${t}`, source: s, target: t, type: 'smoothstep' })
  const addPersons = (parentId: string, unitId: string) => {
    const ps = personsOf(unitId)
    for (const p of ps.slice(0, PERSON_CAP)) {
      const pid = `p:${p.id}:${unitId}`
      push(pid, 'personne', { label: fullName(p), sub: p.fonction, leader: leaderMap.value.get(String(p.id)) ?? null, href: `/personnes/${p.id}`, expandable: false })
      link(parentId, pid)
    }
    if (ps.length > PERSON_CAP) {
      const mid = `more:${unitId}`
      push(mid, 'more', { label: `+${ps.length - PERSON_CAP} autres`, href: '/annuaire', expandable: false })
      link(parentId, mid)
    }
  }

  for (const e of props.entites) {
    const comps = composantesOf(e.id)
    push(e.id, 'entite', { label: nm(e), sub: e.nom, badges: govBadges(e.id), expandable: comps.length > 0, expanded: isExp(e.id), href: `/entites/${e.id}` })
    if (!isExp(e.id)) continue
    for (const c of comps) {
      const cChildren = departementsOf(c.id).length + servicesOf(c.id).length + personsOf(c.id).length
      push(c.id, 'composante', { label: nm(c), sub: labelOf(composanteTypes, c.type), badges: unitBadges('composante', c), expandable: cChildren > 0, expanded: isExp(c.id), href: `/composantes/${c.id}` })
      link(e.id, c.id)
      if (!isExp(c.id)) continue
      addPersons(c.id, c.id)
      for (const d of departementsOf(c.id)) {
        push(d.id, 'departement', { label: d.nom, sub: labelOf(departementTypes, d.type), badges: unitBadges('departement', d), expandable: personsOf(d.id).length > 0, expanded: isExp(d.id), href: `/departements/${d.id}` })
        link(c.id, d.id)
        if (isExp(d.id)) addPersons(d.id, d.id)
      }
      for (const s of servicesOf(c.id)) {
        const sChildren = polesOf(s.id).length + personsOf(s.id).length
        push(s.id, 'service', { label: s.nom, sub: s.central ? 'Service central' : 'Service', badges: unitBadges('service', s), expandable: sChildren > 0, expanded: isExp(s.id), href: `/services/${s.id}` })
        link(c.id, s.id)
        if (!isExp(s.id)) continue
        addPersons(s.id, s.id)
        for (const p of polesOf(s.id)) {
          push(p.id, 'pole', { label: p.nom, sub: labelOf(poleTypes, p.type), badges: unitBadges('pole', p), expandable: personsOf(p.id).length > 0, expanded: isExp(p.id), href: `/poles/${p.id}` })
          link(s.id, p.id)
          if (isExp(p.id)) addPersons(p.id, p.id)
        }
      }
    }
  }
  return { nodes, edges }
}

// Première passe : positions estimées (hauteurs approximatives), corrigées ensuite
// avec les dimensions réelles mesurées par Vue Flow (voir relayout()).
function layout(nodes: Row[], edges: Row[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', ranksep: 84, nodesep: 46 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.id, { width: n._w, height: n._h })
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  for (const n of nodes) {
    const p = g.node(n.id)
    n.position = { x: p.x - n._w / 2, y: p.y - n._h / 2 }
  }
  return nodes
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flowNodes = ref<any[]>([])
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flowEdges = ref<any[]>([])
const { fitView, setCenter, getViewport, findNode, onNodesInitialized } = useVueFlow()

const largestEntiteId = computed(() => {
  const es = [...props.entites]
  es.sort((a, b) => ((Number(b.effectif) || composantesOf(b.id).length) - (Number(a.effectif) || composantesOf(a.id).length)))
  return es[0] ? String(es[0].id) : ''
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dimOf = (n: any) => {
  const gn = findNode(n.id)
  return { w: gn?.dimensions?.width || n._w, h: gn?.dimensions?.height || n._h }
}
function centerNode(id: string, zoom?: number) {
  const n = flowNodes.value.find(x => x.id === id)
  if (!n) return
  const { w, h } = dimOf(n)
  const z = zoom ?? Math.max(getViewport().zoom, 0.6)
  setCenter(n.position.x + w / 2, n.position.y + h / 2 - 60, { zoom: z, duration: 450 })
}

let needsLayout = false
let pendingFocus: string | null = null
let pendingZoom: number | undefined
// Recalcule la mise en page avec les dimensions réelles des cartes → traits nets.
function relayout() {
  if (!needsLayout || !flowNodes.value.length) return
  needsLayout = false
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', ranksep: 84, nodesep: 46 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const n of flowNodes.value) {
    const { w, h } = dimOf(n)
    g.setNode(n.id, { width: w, height: h })
  }
  for (const e of flowEdges.value) g.setEdge(e.source, e.target)
  dagre.layout(g)
  flowNodes.value = flowNodes.value.map((n) => {
    const p = g.node(n.id)
    const { w, h } = dimOf(n)
    return { ...n, position: { x: p.x - w / 2, y: p.y - h / 2 } }
  })
  nextTick(() => setTimeout(() => {
    if (pendingFocus && flowNodes.value.some(n => n.id === pendingFocus)) centerNode(pendingFocus, pendingZoom)
    else fitView({ padding: 0.25, minZoom: 0.6, maxZoom: 1.2, duration: 400 })
    pendingFocus = null
    pendingZoom = undefined
  }, 20))
}
onNodesInitialized(() => relayout())

function rebuild(focusId?: string, zoom?: number) {
  needsLayout = true
  pendingFocus = focusId ?? null
  pendingZoom = zoom
  const { nodes, edges } = buildModel()
  flowNodes.value = layout(nodes, edges)
  flowEdges.value = edges
  // Filet de sécurité si onNodesInitialized ne se déclenche pas (repli sans nouveaux nœuds).
  nextTick(() => setTimeout(relayout, 80))
}
const toggle = (id: string) => {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
  rebuild(id)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onNodeClick = ({ node }: any) => {
  if (node.data.expandable) toggle(node.id)
  else if (node.data.href) navigateTo(node.data.href)
}
const open = (href: string) => navigateTo(href)
onMounted(() => rebuild(largestEntiteId.value, 0.95))

const TS: Record<string, { icon: string, chip: string, accent: string }> = {
  entite: { icon: 'lucide:landmark', chip: 'bg-primary-100 text-primary-600', accent: 'border-primary-200 border-l-4 border-l-primary-400' },
  composante: { icon: 'lucide:building', chip: 'bg-purple-100 text-purple-600', accent: 'border-purple-200 border-l-4 border-l-purple-400' },
  service: { icon: 'lucide:layers', chip: 'bg-blue-100 text-blue-600', accent: 'border-blue-200 border-l-4 border-l-blue-400' },
  departement: { icon: 'lucide:graduation-cap', chip: 'bg-emerald-100 text-emerald-600', accent: 'border-emerald-200 border-l-4 border-l-emerald-400' },
  pole: { icon: 'lucide:network', chip: 'bg-primary-100 text-primary-600', accent: 'border-secondary-200 border-l-4 border-l-primary-300' },
  personne: { icon: 'lucide:user-round', chip: 'bg-secondary-100 text-secondary-500', accent: 'border-secondary-200 border-l-4 border-l-secondary-300' },
  more: { icon: 'lucide:ellipsis', chip: 'bg-secondary-100 text-secondary-500', accent: 'border-dashed border-secondary-300' },
}
const ts = (t: string) => TS[t] ?? TS.personne!
</script>

<template>
  <div class="h-[74vh] overflow-hidden rounded-2xl border border-secondary-200/60 bg-linear-to-br from-secondary-50/70 via-background to-primary-50/30 shadow-sm">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :min-zoom="0.15"
      :max-zoom="1.6"
      :fit-view-on-init="false"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :default-edge-options="{ type: 'smoothstep', style: { stroke: '#cbd5e1', strokeWidth: 1.5 } }"
      @node-click="onNodeClick"
    >
      <Background
        :gap="24"
        pattern-color="#d9e0e8"
      />
      <Controls
        position="bottom-right"
        :show-interactive="false"
      />
      <MiniMap
        pannable
        zoomable
      />

      <template #node-org="{ data }">
        <Handle
          type="target"
          :position="Position.Top"
          class="!opacity-0"
        />
        <div
          class="group flex w-full flex-col gap-1 rounded-xl border bg-white px-3 py-2 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_8px_22px_-8px_rgba(0,0,0,0.22)]"
          :class="[ts(data.type).accent, data.type === 'personne' && data.leader ? 'ring-2 ring-amber-300' : '']"
        >
          <div class="flex items-center gap-2">
            <span
              class="flex size-6 shrink-0 items-center justify-center rounded-lg"
              :class="ts(data.type).chip"
            >
              <Icon
                :name="data.type === 'personne' && data.leader ? 'lucide:crown' : ts(data.type).icon"
                class="size-3.5"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] font-semibold leading-tight text-secondary-900">
                {{ data.label }}
              </div>
              <div
                v-if="data.sub && data.sub !== data.label"
                class="truncate text-[10px] text-secondary-400"
              >
                {{ data.sub }}
              </div>
            </div>
            <button
              v-if="data.href"
              class="shrink-0 rounded p-0.5 text-secondary-300 opacity-0 transition-opacity hover:text-primary-600 group-hover:opacity-100"
              title="Ouvrir la fiche"
              @click.stop="open(data.href)"
            >
              <Icon
                name="lucide:external-link"
                class="size-3.5"
              />
            </button>
            <Icon
              v-if="data.expandable"
              :name="data.expanded ? 'lucide:chevron-down' : 'lucide:chevron-right'"
              class="size-4 shrink-0 text-secondary-400"
            />
          </div>
          <div
            v-if="data.leader && data.type === 'personne'"
            class="inline-flex w-fit items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
          >
            {{ data.leader }}
          </div>
          <div
            v-if="data.badges?.length"
            class="flex flex-wrap gap-1"
          >
            <span
              v-for="(b, i) in data.badges"
              :key="i"
              class="truncate rounded border border-secondary-200 bg-secondary-50 px-1.5 py-0.5 text-[9.5px] font-medium text-secondary-600"
            >{{ b }}</span>
          </div>
        </div>
        <Handle
          type="source"
          :position="Position.Bottom"
          class="!opacity-0"
        />
      </template>
    </VueFlow>
  </div>
</template>

<style>
.vue-flow__node-org { background: transparent; border: none; padding: 0; width: auto; font-family: inherit; }
.vue-flow__minimap { border-radius: 12px; overflow: hidden; }
</style>
