import { Elysia } from "elysia";
import { and, eq } from "drizzle-orm";
import { auth } from "@catalogue/auth"
import { db } from "@catalogue/database"
import { userCategoryRole, changeRequest } from "@catalogue/database/tables"
import { INTERNAL_TOKEN } from "../utils/internal"
import { notify } from "../utils/notify"
import { porteeService } from "../utils/access"

type Permission = 'user' | 'admin' | 'svc'
type CatRole = 'lecteur' | 'contributeur' | 'gestionnaire'

const getServiceKeyFromHeaders = (headers: Headers | undefined | null) => {
    const serviceKey = headers?.get("x-service-key")?.trim();
    if (serviceKey) return serviceKey;

    const authorization = headers?.get("authorization")?.trim();
    if (!authorization) return null;

    if (!authorization.toLowerCase().startsWith("bearer ")) return null;

    const bearerToken = authorization.slice(7).trim();
    return bearerToken.length > 0 ? bearerToken : null;
}

export const betterAuth = new Elysia({ name: 'better-auth' })
    .mount(auth.handler)
    .macro({
        auth: (permission: Permission[]) => ({
            async resolve({ status, request: { headers } }) {
                if (getServiceKeyFromHeaders(headers) && permission.includes('svc')) {
                    const svc = await auth.api.getServiceAccountFromRequest({ headers })
                    return svc ? svc : status(401)
                }

                const session = await auth.api.getSession({ headers })
                if (!session) return status(401)

                // Sémantique OU : `user` autorise tout compte authentifié ;
                // `admin` restreint aux administrateurs.
                if (permission.includes('user')) {
                    return { user: session.user, session: session.session }
                }
                if (permission.includes('admin') && session.user.role === 'admin') {
                    return { user: session.user, session: session.session }
                }
                return status(403)
            }
        }),
        // Autorisation fine par catégorie (garde pure via beforeHandle, sans injection de
        // contexte).
        can: (opts: { category: string, level: 'read' | 'write' }) => ({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async beforeHandle(ctx: any) {
                const { status, request } = ctx
                const headers = request.headers as Headers

                // Application d'une demande approuvée (rejeu interne) → laisser passer.
                if (headers.get('x-internal-token') === INTERNAL_TOKEN) return undefined

                // COMPTE DE SERVICE : sa PORTÉE est consultée, comme celle d'un utilisateur.
                if (getServiceKeyFromHeaders(headers)) {
                    const svc = await auth.api.getServiceAccountFromRequest({ headers })
                    if (!svc) return status(401)
                    const scopes = (svc.service_account?.scopes ?? []) as readonly string[]
                    if (!porteeService(scopes).has(opts.category)) return status(403)
                    // L'écriture demande `write` (ou `admin`) EN PLUS de la portée : un
                    // compte de lecture ne doit pas pouvoir écrire parce qu'il voit.
                    if (opts.level === 'write' && !scopes.includes('write') && !scopes.includes('admin')) {
                        return status(403)
                    }
                    return undefined
                }

                const session = await auth.api.getSession({ headers })
                if (!session) return status(401)
                if (session.user.role === 'admin') return undefined

                const [cr] = await db.select().from(userCategoryRole)
                    .where(and(
                        eq(userCategoryRole.userId, session.user.id),
                        eq(userCategoryRole.category, opts.category),
                    ))
                    .limit(1)
                const role = cr?.role as CatRole | undefined
                if (!role) return status(403)
                if (opts.level === 'read') return undefined
                if (role === 'gestionnaire') return undefined

                // Contributeur en écriture → dépôt d'une demande de validation.
                if (role === 'contributeur') {
                    const method = request.method as string
                    if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') return status(403)
                    const pathname = new URL(request.url).pathname
                    const parts = pathname.split('/').filter(Boolean)
                    if (parts[2] === 'import') return status(403)
                    const action = method === 'POST' ? 'create' : method === 'DELETE' ? 'delete' : 'update'
                    await db.insert(changeRequest).values({
                        category: opts.category,
                        action,
                        entityId: parts[2] ?? null,
                        method,
                        path: pathname,
                        payload: ctx.body ?? null,
                        requestedBy: session.user.id,
                        status: 'pending',
                    })
                    await notify(`demande:${opts.category}`, {
                        event: `demande:${opts.category}`,
                        kind: 'demande',
                        category: opts.category,
                        action,
                        requestedBy: session.user.email,
                        at: new Date().toISOString(),
                        title: 'Demande à valider',
                        body: `${action} — ${opts.category} (par ${session.user.email})`,
                    }).catch(() => {})
                    return status(202, { queued: true, message: 'Demande envoyée pour validation.' })
                }

                return status(403)
            }
        }),
    })
