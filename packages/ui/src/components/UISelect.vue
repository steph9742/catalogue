<script setup lang="ts">
import { onClickOutside, useElementBounding, useEventListener, useWindowSize } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

export interface UISelectOption {
    label: string
    value: string | number
    disabled?: boolean
    icon?: string
}

export interface UISelectGroup {
    title?: string
    options: UISelectOption[]
}

type SelectOrientation = 'top' | 'bottom' | 'left' | 'right'

const props = withDefaults(defineProps<{
    items: UISelectGroup[] | UISelectOption[]
    placeholder?: string
    disabled?: boolean
    orientation?: SelectOrientation
    multiSelect?: boolean
    searchable?: boolean
    modelValue?: string | number | (string | number)[] | null
}>(), {
    placeholder: 'Sélectionner une option',
    disabled: false,
    orientation: 'bottom',
    multiSelect: true,
    searchable: false,
    modelValue: undefined
})

const emit = defineEmits<{
    'update:modelValue': [value: string | number | (string | number)[] | null | undefined]
}>()

const rootRef = ref()
const triggerRef = ref()
const menuRef = ref()
const isOpen = ref(false)
const currentOrientation = ref<SelectOrientation>(props.orientation)
const searchQuery = ref('')

const model = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
})

// Normaliser les items
const normalizedItems = computed(() => {
    if (!Array.isArray(props.items) || props.items.length === 0) return []
    const firstItem = props.items[0]!
    return 'options' in firstItem ? (props.items as UISelectGroup[]) : [{ options: props.items as UISelectOption[] }]
})

const allOptions = computed(() => normalizedItems.value.flatMap(g => g.options))

const filteredItems = computed(() => {
    if (!props.searchable || !searchQuery.value) return normalizedItems.value
    const query = searchQuery.value.toLowerCase()
    return normalizedItems.value.map(g => ({
        ...g,
        options: g.options.filter(o => o.label.toLowerCase().includes(query))
    })).filter(g => g.options.length > 0)
})

const displayLabel = computed(() => {
    const values = Array.isArray(model.value) ? model.value : (model.value !== undefined && model.value !== null ? [model.value] : [])
    const selected = allOptions.value.filter(o => values.includes(o.value))
    return selected.length === 0 ? props.placeholder : selected.length === 1 ? selected[0]!.label : `${selected.length} sélectionnés`
})

// Réutilisation de la logique de positionnement
const fallbackByPreferred: Record<SelectOrientation, SelectOrientation[]> = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom']
}

const triggerBounds = useElementBounding(triggerRef)
const menuBounds = useElementBounding(menuRef)
const { width: windowWidth, height: windowHeight } = useWindowSize()

// Le menu est téléporté dans <body> et positionné en `fixed` d'après la position du
// déclencheur.
const menuStyle = computed(() => {
    const gap = 8, margin = 8
    // La largeur suit le déclencheur, jamais sous 180 px : un menu plus étroit que son
    // champ tronque les libellés, et un menu de 48 px sur un champ pleine largeur flotte.
    const largeur = Math.max(triggerBounds.width.value, 180)
    const mw = menuBounds.width.value || largeur
    const mh = menuBounds.height.value || 0
    let top = triggerBounds.bottom.value + gap
    let left = triggerBounds.left.value
    switch (currentOrientation.value) {
        case 'top': top = triggerBounds.top.value - mh - gap; left = triggerBounds.left.value; break
        case 'right': top = triggerBounds.top.value; left = triggerBounds.right.value + gap; break
        case 'left': top = triggerBounds.top.value; left = triggerBounds.left.value - mw - gap; break
        case 'bottom': default: top = triggerBounds.bottom.value + gap; left = triggerBounds.left.value
    }
    // Maintien dans le viewport (surtout mobile : évite le débordement hors écran)
    left = Math.min(Math.max(margin, left), Math.max(margin, windowWidth.value - mw - margin))
    top = Math.min(Math.max(margin, top), Math.max(margin, windowHeight.value - mh - margin))
    return { position: 'fixed' as const, top: `${top}px`, left: `${left}px`, width: `${largeur}px` }
})

function chooseOrientation() {
    if (!triggerRef.value || !menuRef.value) {
        currentOrientation.value = props.orientation
        return
    }

    const gap = 8, margin = 8
    const fits: Record<SelectOrientation, boolean> = {
        top: triggerBounds.top.value >= menuBounds.height.value + gap + margin,
        bottom: windowHeight.value - triggerBounds.bottom.value >= menuBounds.height.value + gap + margin,
        left: triggerBounds.left.value >= menuBounds.width.value + gap + margin,
        right: windowWidth.value - triggerBounds.right.value >= menuBounds.width.value + gap + margin
    }

    const preferredOrder = fallbackByPreferred[props.orientation]
    currentOrientation.value = preferredOrder.find(c => fits[c]) ?? props.orientation
}

async function openMenu() {
    isOpen.value = true
    await nextTick()
    triggerBounds.update()
    menuBounds.update()
    chooseOrientation()
}

function closeMenu() {
    isOpen.value = false
    searchQuery.value = ''
}

function toggleMenu() {
    if (!props.disabled) {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        isOpen.value ? closeMenu() : openMenu()
    }
}

function isOptionSelected(value: string | number): boolean {
    if (props.multiSelect) {
        return Array.isArray(model.value) && model.value.includes(value)
    }
    return model.value === value
}

function handleOptionClick(option: UISelectOption) {
    if (option.disabled) return

    if (props.multiSelect) {
        const values = Array.isArray(model.value) ? model.value : []
        const newValues = values.includes(option.value)
            ? values.filter(v => v !== option.value)
            : [...values, option.value]
        model.value = newValues
    } else {
        model.value = option.value
        closeMenu()
    }
}

function getOptionClass(option: UISelectOption) {
    return {
        'hover:bg-gray-100 cursor-pointer': !option.disabled,
        'text-gray-400 cursor-not-allowed': option.disabled,
        'bg-primary-50': isOptionSelected(option.value),
    }
}

// Le menu est téléporté hors de rootRef : sans cette exception, cliquer une option compterait
// comme un clic « à l'extérieur » et fermerait le menu avant la sélection.
onClickOutside(rootRef, closeMenu, { ignore: [menuRef] })
useEventListener('keydown', (e) => {
    if (e instanceof KeyboardEvent && e.key === 'Escape') closeMenu()
})
watch(() => props.orientation, (o) => {
    currentOrientation.value = o
    if (isOpen.value) chooseOrientation()
})
watch([windowWidth, windowHeight, triggerBounds.top, triggerBounds.bottom, triggerBounds.left, triggerBounds.right, menuBounds.width, menuBounds.height, isOpen], () => {
    if (isOpen.value) chooseOrientation()
})
</script>

<template>
    <div ref="rootRef" class="relative inline-block w-full max-w-xs">
        <button
            ref="triggerRef"
            type="button"
            :disabled="disabled"
            class="w-full inline-flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors duration-80 font-sans tracking-tight hover:bg-gray-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed disabled:border-gray-200"
            @click="toggleMenu"
        >
            <span class="truncate">{{ displayLabel }}</span>
            <Icon name="lucide:chevron-down" :class="['flex-shrink-0 w-4 h-4 transition-transform duration-200', isOpen && 'rotate-180']" />
        </button>

        <Teleport to="body">
            <Transition
                enter-active-class="transition duration-80 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
                <div v-if="isOpen" ref="menuRef" class="fixed z-[100] max-h-72 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg p-1" :style="menuStyle" role="listbox">
                <div v-if="searchable" class="px-2 py-1.5 border-b border-gray-200 mb-1">
                    <input v-model="searchQuery" type="text" placeholder="Rechercher..." class="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500" @click.stop @keydown.enter.prevent @keydown.stop>
                </div>

                <div v-if="filteredItems.length > 0">
                    <div v-for="(group, gi) in filteredItems" :key="`g-${gi}`">
                        <div v-if="group.title" class="inline-flex items-center gap-1 p-2 text-gray-500">
                            <span class="text-xs font-semibold font-mono tracking-tighter">{{ group.title }}</span>
                        </div>
                        <ul class="grid">
                            <li v-for="(opt, oi) in group.options" :key="`o-${gi}-${oi}`" class="px-2 py-1.5 rounded-lg text-sm transition-colors duration-80 font-sans tracking-tight inline-flex items-center gap-2" :class="getOptionClass(opt)" role="option" :aria-selected="isOptionSelected(opt.value)" @click="handleOptionClick(opt)">
                                <div :class="['relative flex items-center justify-center w-4 h-4 border border-gray-300 flex-shrink-0 transition-colors duration-80', multiSelect ? 'rounded' : 'rounded-full', isOptionSelected(opt.value) ? 'bg-primary-500 border-primary-500' : 'bg-white']">
                                    <Icon v-if="multiSelect && isOptionSelected(opt.value)" name="lucide:check" class="w-3 h-3 text-white" />
                                    <div v-else-if="!multiSelect && isOptionSelected(opt.value)" class="w-2 h-2 bg-white rounded-full" />
                                </div>

                                <Icon v-if="opt.icon" :name="opt.icon" class="w-4 h-4 flex-shrink-0" />
                                <span class="flex-grow">{{ opt.label }}</span>
                            </li>
                        </ul>
                        <hr v-if="gi < filteredItems.length - 1" class="my-2 border-gray-300" />
                    </div>
                </div>
                <div v-else class="px-2 py-4 text-center text-sm text-gray-500">Aucun résultat</div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>