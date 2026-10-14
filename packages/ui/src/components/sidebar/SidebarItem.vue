<script setup lang="ts">
import { cloneVNode, Comment, computed, defineComponent, h, Text, useAttrs, useSlots, type VNode } from 'vue'

const props = defineProps<{
    active?: boolean | string
}>()

const baseClasses = 'bg-white border border-gray-300 inline-flex gap-2 items-center w-full px-3 py-2 rounded-[10px] text-sm font-sans tracking-tight hover:bg-gray-200 cursor-pointer relative data-[active=true]:before:absolute data-[active=true]:before:block data-[active=true]:before:bg-primary-700 data-[active=true]:before:-left-2.5 data-[active=true]:before:rounded-full data-[active=true]:before:w-1 data-[active=true]:before:top-1/2 data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:h-8 data-[active=true]:bg-primary-100 data-[active=true]:border-primary-200'

const slots = useSlots()
const attrs = useAttrs()

const isActive = computed(() => {
    return props.active === true || props.active === 'true' || props.active === ''
})

const SlotWrapper = defineComponent({
    name: 'SidebarItemSlotWrapper',
    setup() {
        return () => {
            const children = slots.default?.() ?? []
            const firstElement = children.find((child) => isRenderableElement(child))

            // If there is no element in the slot, preserve previous behavior with a div wrapper.
            if (!firstElement) {
                return h('div', {
                    ...attrs,
                    'data-active': isActive.value,
                    class: [baseClasses, attrs.class],
                }, children)
            }

            return cloneVNode(firstElement, {
                ...attrs,
                'data-active': isActive.value,
                class: [baseClasses, firstElement.props?.class, attrs.class]
            })
        }
    },
})

function isRenderableElement(node: VNode): boolean {
    return node.type !== Comment && node.type !== Text
}
</script>

<template>
    <SlotWrapper>
        <slot />
    </SlotWrapper>
</template>