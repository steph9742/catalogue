import type { ComputedRef, InjectionKey } from 'vue'

export type TabsContext = {
    selectedValue: ComputedRef<string>
    select: (value: string) => void
    color: ComputedRef<'primary' | 'secondary' | 'accent' | 'neutral'>
}

export const tabsContextKey: InjectionKey<TabsContext> = Symbol('ui-tabs-context')