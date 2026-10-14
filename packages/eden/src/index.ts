import { treaty, type Treaty } from "@elysiajs/eden";
import type { App } from "@catalogue/server"

// PAS D'INSTANCE AU NIVEAU DU MODULE. Une instance `eden` était construite ici au chargement,
// avec `process.env.NUXT_PUBLIC_SERVER_BASE_URL` — qui vaut `undefined` dans le NAVIGATEUR
// (Nuxt injecte sa configuration à l'exécution, pas dans process.env du bundle client).
const createEden = (baseURL: string, headers: Record<string, string>) => treaty<App>(baseURL, {
    fetch: {
        credentials: 'include',
    },
    headers
})

export { createEden, type Treaty }
