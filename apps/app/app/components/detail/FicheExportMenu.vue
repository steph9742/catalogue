<script setup lang="ts">
import { ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { UIButton } from '@catalogue/ui'
import { exportFiche, type FicheDoc } from '~/utils/ficheExport'

const props = defineProps<{ doc: FicheDoc, filename?: string }>()
const open = ref(false)
const root = ref()
onClickOutside(root, () => {
  open.value = false
})

const items = [
  { fmt: 'pdf', label: 'PDF', icon: 'lucide:file-text' },
  { fmt: 'odt', label: 'ODT (LibreOffice)', icon: 'lucide:file-type' },
  { fmt: 'md', label: 'Markdown', icon: 'lucide:file-code-2' },
] as const

const run = (fmt: 'md' | 'odt' | 'pdf') => {
  open.value = false
  exportFiche(fmt, props.doc, props.filename)
}
</script>

<template>
  <div
    ref="root"
    class="relative"
  >
    <UIButton
      variant="outline"
      size="md"
      class="group font-mono shadow-sm transition-all duration-300 hover:shadow-md"
      @click="open = !open"
    >
      <Icon
        name="lucide:download"
        class="text-base transition-transform group-hover:scale-110"
      />
      <span class="ml-1.5 font-medium tracking-tight">Exporter</span>
      <Icon
        name="lucide:chevron-down"
        class="ml-1 size-3.5 transition-transform"
        :class="open && 'rotate-180'"
      />
    </UIButton>
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="open"
        class="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-secondary-200 bg-white p-1 shadow-lg"
      >
        <button
          v-for="it in items"
          :key="it.fmt"
          type="button"
          class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-secondary-700 transition-colors hover:bg-secondary-50"
          @click="run(it.fmt)"
        >
          <Icon
            :name="it.icon"
            class="size-4 text-secondary-400"
          /> {{ it.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>
