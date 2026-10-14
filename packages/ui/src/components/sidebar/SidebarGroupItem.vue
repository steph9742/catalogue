<script setup lang="ts">
import { cloneVNode, Comment, computed, defineComponent, h, Text, useAttrs, useSlots, type VNode } from 'vue'

const props = defineProps<{
    active?: boolean | string
}>()

const baseClasses = 'inline-flex gap-2 items-center w-full px-3.5 py-1.5 rounded-[10px] text-sm bg-gray-100 font-sans tracking-tight hover:bg-gray-200 cursor-pointer relative data-[active=true]:before:absolute data-[active=true]:before:block data-[active=true]:before:bg-primary-700 data-[active=true]:before:-left-2 data-[active=true]:before:rounded-full data-[active=true]:before:w-1 data-[active=true]:before:top-1/2 data-[active=true]:before:-translate-y-1/2 data-[active=true]:before:h-5 data-[active=true]:bg-primary-100 data-[active=true]:border-primary-200 data-[active=true]:border'

const slots = useSlots()
const attrs = useAttrs()

const isActive = computed(() => {
    return props.active === true || props.active === 'true' || props.active === ''
})

const SlotWrapper = defineComponent({
    name: 'SidebarGroupItemSlotWrapper',
    setup() {
        return () => {
            const children = slots.default?.() ?? []
            const firstElement = children.find((child) => isRenderableElement(child))

            // If there is no element in the slot, preserve previous behavior with a div wrapper.
            if (!firstElement) {
                return h('div', {
                    ...attrs,
                    class: [baseClasses, attrs.class],
                    'data-active': isActive.value,
                }, children)
            }

            return cloneVNode(firstElement, {
                ...attrs,
                class: [baseClasses, firstElement.props?.class, attrs.class],
                'data-active': isActive.value,
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