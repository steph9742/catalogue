export interface Toast {
    id: string;
    title: string;
    message?: string;
    icon?: string;
    type: 'neutral' | 'success' | 'error' | 'warning' | 'info';
    duration?: number;
    /**
     * Action proposée dans le bandeau — typiquement « Annuler ». Sans elle, une action groupée
     * sur des centaines de lignes est trop risquée pour qu'on ose l\'utiliser : l\'annulation est
     * ce qui rend le geste acceptable.
     */
    action?: { label: string; run: () => void | Promise<void> };
}

import { ref } from 'vue';

const toasts = ref<Toast[]>([]);

export const useToast = () => {
    const newToast = ({ duration, ...rest }: { title: string, message?: string, icon?: string, type: Toast['type'], duration?: number, action?: Toast['action'] }) => {
        // Un bandeau porteur d'une annulation reste plus longtemps : il faut le temps de
        // lire, de mesurer l'ampleur de ce qu'on vient de faire, puis de décider.
        duration = duration ?? (rest.action ? 10000 : rest.type === 'error' ? 7000 : 3000);
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const content = { duration, ...rest };
        toasts.value.push({ id, ...content });

        setTimeout(() => {
            clearToast(id);
        }, content.duration);
    }

    const clearToast = (id: string) => {
        const idx = toasts.value.findIndex(t => t.id === id);
        if (idx !== -1) {
            toasts.value.splice(idx, 1);
        }
    }

    const clearAll = () => {
        toasts.value = []
    }

    return {
        toasts,
        newToast,
        clearToast,
        clearAll
    }
}