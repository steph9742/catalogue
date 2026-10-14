<script setup lang="ts">
import { onClickOutside, useElementBounding, useEventListener, useWindowSize } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'
import type { UIDropdownMenuItem, UIDropdownMenuSection } from './UIDropdownMenu';

type DropdownOrientation = 'top' | 'bottom' | 'left' | 'right'

const props = withDefaults(defineProps<{
    items: UIDropdownMenuSection[]
    orientation?: DropdownOrientation
}>(), {
    orientation: 'bottom'
})

const rootRef = ref()
const triggerRef = ref()
const menuRef = ref()
const isOpen = ref(false)
const currentOrientation = ref<DropdownOrientation>(props.orientation)

const fallbackByPreferred: Record<DropdownOrientation, DropdownOrientation[]> = {
    top: ['top', 'bottom', 'right', 'left'],
    bottom: ['bottom', 'top', 'right', 'left'],
    left: ['left', 'right', 'top', 'bottom'],
    right: ['right', 'left', 'top', 'bottom']
}

const triggerBounds = useElementBounding(triggerRef)
const menuBounds = useElementBounding(menuRef)
const { width: windowWidth, height: windowHeight } = useWindowSize()

// Menu téléporté dans <body> et positionné en `fixed` : affranchit des contextes d'empilement
// locaux (cartes backdrop-blur/shadow/transform, sidebar) qui le faisaient passer en arrière-plan sur mobile.
const menuStyle = computed(() => {
    const gap = 8, margin = 8
    const mw = menuBounds.width.value || 0
    const mh = menuBounds.height.value || 0
    let top = triggerBounds.bottom.value + gap
    let left = triggerBounds.left.value
    switch (currentOrientation.value) {
        case 'top': top = triggerBounds.top.value - mh - gap; left = triggerBounds.left.value; break
        case 'right': top = triggerBounds.top.value; left = triggerBounds.right.value + gap; break
        case 'left': top = triggerBounds.top.value; left = triggerBounds.left.value - mw - gap; break
        case 'bottom': default: top = triggerBounds.bottom.value + gap; left = triggerBounds.left.value
    }
    left = Math.min(Math.max(margin, left), Math.max(margin, windowWidth.value - mw - margin))
    top = Math.min(Math.max(margin, top), Math.max(margin, windowHeight.value - mh - margin))
    return { position: 'fixed' as const, top: `${top}px`, left: `${left}px` }
})

function chooseOrientation() {
    if (!triggerRef.value || !menuRef.value) {
        currentOrientation.value = props.orientation
        return
    }

    const gap = 8
    const margin = 8

    const fits: Record<DropdownOrientation, boolean> = {
        top: triggerBounds.top.value >= menuBounds.height.value + gap + margin,
        bottom: windowHeight.value - triggerBounds.bottom.value >= menuBounds.height.value + gap + margin,
        left: triggerBounds.left.value >= menuBounds.width.value + gap + margin,
        right: windowWidth.value - triggerBounds.right.value >= menuBounds.width.value + gap + margin
    }

    const preferredOrder = fallbackByPreferred[props.orientation]
    currentOrientation.value = preferredOrder.find((candidate) => fits[candidate]) ?? props.orientation
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
}

function toggleMenu() {
    if (isOpen.value) {
        closeMenu()
        return
    }

    openMenu()
}

function handleItemClick(item: UIDropdownMenuSection['items'][number]) {
    if (item.disabled) {
        return
    }

    item.onClick?.()
    closeMenu()
}

function getItemClass(item: UIDropdownMenuItem) {
    return {
        'hover:bg-gray-100 cursor-pointer': !item.disabled,
        'text-gray-400 cursor-not-allowed': item.disabled && !item.destructive,
        'text-red-600': item.destructive && !item.disabled,
        'text-red-300 cursor-not-allowed': item.destructive && item.disabled
    }
}

// Menu téléporté hors de rootRef -> l'ignorer, sinon cliquer un item fermerait avant l'action.
onClickOutside(rootRef, () => {
    closeMenu()
}, { ignore: [menuRef] })

useEventListener('keydown', (event) => {
    if ('key' in event && event.key === 'Escape') {
        closeMenu()
    }
})

watch(() => props.orientation, (newOrientation) => {
    currentOrientation.value = newOrientation
    if (isOpen.value) {
        chooseOrientation()
    }
})

watch(
    [
        windowWidth,
        windowHeight,
        triggerBounds.top,
        triggerBounds.bottom,
        triggerBounds.left,
        triggerBounds.right,
        menuBounds.width,
        menuBounds.height,
        isOpen
    ],
    () => {
        if (isOpen.value) {
            chooseOrientation()
        }
    }
)

</script>

<template>
    <div ref="rootRef" class="relative inline-block">
        <div
            ref="triggerRef"
            class="inline-flex w-full"
            @click="toggleMenu"
        >
            <slot />
        </div>

        <Teleport to="body">
            <Transition
                enter-active-class="transition duration-80 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
                <div
                    v-if="isOpen"
                    ref="menuRef"
                    class="fixed z-[60] min-w-40 bg-white border border-gray-300 rounded-lg shadow-lg p-1"
                    :style="menuStyle"
                    role="menu"
                >
                <div v-for="(section, sectionIndex) in items" :key="sectionIndex">
                    <div class="inline-flex items-center gap-1 p-2 text-gray-500">
                        <Icon v-if="section.icon" :name="section.icon" />
                        <span v-if="section.title" class="text-xs font-semibold font-mono tracking-tighter">
                            {{ section.title }}
                        </span>
                    </div>
                    <ul class="grid">
                        <li
                            v-for="(item, itemIndex) in section.items"
                            :key="itemIndex"
                            class="px-2 py-1.5 rounded-lg text-sm transition-colors duration-80 font-sans tracking-tight inline-flex items-center gap-1"
                            :class="getItemClass(item)"
                            role="menuitem"
                            @click="handleItemClick(item)"
                        >
                            {{ item.label }}
                        </li>
                        <hr v-if="sectionIndex < items.length - 1" class="my-2 border-gray-300" />
                    </ul>
                </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>