import { APIError, createAuthEndpoint, createAuthMiddleware } from "better-auth/api"
import { schemas } from "./schemas"
import { getSessionFromCtx } from "better-auth/api"
import type { ServiceAccount, ServiceAccountOptions, ServiceKey } from "./types"
import { SERVICE_ACCOUNT_ERROR_CODES } from "./error-codes"
import type { Where } from "better-auth/types"
import type { WhereOperator } from "better-auth/adapters"
import { generateRandomString } from "better-auth/crypto"

const getServiceKeyFromHeaders = (headers: Headers | undefined | null) => {
    const serviceKey = headers?.get("x-service-key")?.trim();
    if (serviceKey) return serviceKey;

    const authorization = headers?.get("authorization")?.trim();
    if (!authorization) return null;

    if (!authorization.toLowerCase().startsWith("bearer ")) return null;

    const bearerToken = authorization.slice(7).trim();
    return bearerToken.length > 0 ? bearerToken : null;
}

export const getServiceAccountFromRequest = () => createAuthEndpoint('/service-accounts/get-session', {
    method: 'GET',
}, async (ctx) => {
    const serviceKey = getServiceKeyFromHeaders(ctx.headers)

    if (!serviceKey) {
        throw APIError.fromStatus("UNAUTHORIZED", SERVICE_ACCOUNT_ERROR_CODES.SERVICE_KEY_REQUIRED)
    }

    const key = await ctx.context.adapter.findOne<ServiceKey>({
        model: "service_key",
        where: [{
            field: "key",
            operator: "eq",
            value: serviceKey
        }]
    })

    if (!key) {
        throw APIError.fromStatus("UNAUTHORIZED", SERVICE_ACCOUNT_ERROR_CODES.INVALID_SERVICE_KEY)
    }

    if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) {
        throw APIError.fromStatus("UNAUTHORIZED", SERVICE_ACCOUNT_ERROR_CODES.SERVICE_KEY_EXPIRED)
    }

    const account = await ctx.context.adapter.findOne<ServiceAccount>({
        model: "service_account",
        where: [{
            field: "id",
            operator: "eq",
            value: key.service_account_id
        }]
    })

    if (!account) {
        throw APIError.fromStatus("UNAUTHORIZED", SERVICE_ACCOUNT_ERROR_CODES.ACCOUNT_ID_NOT_FOUND)
    }

    return ctx.json({
        service_account: account,
        service_key: {
            id: key.id,
            service_account_id: key.service_account_id,
            metadata: key.metadata,
            expiresAt: key.expiresAt,
            created_at: key.created_at,
            updated_at: key.updated_at
        }
    })
})

export const hasServiceKeyPermission = () => createAuthEndpoint('/service-key/has-permission', {
    method: 'POST',
    body: schemas.create.serviceKeyHasPermission,
}, async (ctx) => {
    const { keyId, key, scopes } = ctx.body

    const serviceKey = await ctx.context.adapter.findOne<ServiceKey>({
        model: "service_key",
        where: [{
            field: keyId ? "id" : "key",
            operator: "eq",
            value: keyId ?? key ?? ""
        }]
    })

    if (!serviceKey) {
        throw APIError.fromStatus("UNAUTHORIZED", SERVICE_ACCOUNT_ERROR_CODES.INVALID_SERVICE_KEY)
    }

    if (serviceKey.expiresAt && new Date(serviceKey.expiresAt).getTime() < Date.now()) {
        throw APIError.fromStatus("UNAUTHORIZED", SERVICE_ACCOUNT_ERROR_CODES.SERVICE_KEY_EXPIRED)
    }

    const account = await ctx.context.adapter.findOne<ServiceAccount>({
        model: "service_account",
        where: [{
            field: "id",
            operator: "eq",
            value: serviceKey.service_account_id
        }]
    })

    if (!account) {
        throw APIError.fromStatus("NOT_FOUND", SERVICE_ACCOUNT_ERROR_CODES.ACCOUNT_ID_NOT_FOUND)
    }

    const grantedScopes = new Set(account.scopes ?? [])
    const missingScopes = scopes.filter((scope) => !grantedScopes.has(scope))

    return ctx.json({
        hasPermission: missingScopes.length === 0,
        missingScopes,
        accountId: account.id,
        keyId: serviceKey.id
    })
})

const manageServiceAccountsMiddleware = <O extends ServiceAccountOptions>(options?: O | undefined) => createAuthMiddleware(async (ctx) => {
    const session = await getSessionFromCtx(ctx);
    let user = session?.user || null

    if (!user) {
        throw APIError.fromStatus("UNAUTHORIZED");
    }

    const canManageAccounts =
        typeof options?.allowUserToManageServiceAccounts === "function"
            ? await options.allowUserToManageServiceAccounts(user)
            : options?.allowUserToManageServiceAccounts === undefined
                ? true
                : options.allowUserToManageServiceAccounts;

    if (!canManageAccounts) {
        throw APIError.fromStatus("FORBIDDEN", SERVICE_ACCOUNT_ERROR_CODES.NOT_ALLOWED);
    }

    return
})

export const listServiceAccounts = <O extends ServiceAccountOptions>(options?: O | undefined) => createAuthEndpoint('/service-accounts/list-accounts', {
    method: 'GET',
    use: [manageServiceAccountsMiddleware(options)],
    query: schemas.list.serviceAccountsQuery
}, async (ctx) => {
    const where: Where[] = [];

    if (ctx.query.searchValue) {
        where.push({
            field: ctx.query.searchValue || "name",
            operator: (ctx.query.searchOperator || "contains").replace(/([A-Z])/g, (match) => `_${match.toLowerCase()}`) as WhereOperator,
            value: ctx.query.searchValue
        })
    }

    if (ctx.query.filterValue !== undefined) {
        where.push({
            field: ctx.query.filterField || "name",
            operator: ctx.query.filterOperator || "eq",
            value: ctx.query.filterValue
        })
    }

    const accounts = await ctx.context.adapter.findMany<ServiceAccount>({
        model: "service_account",
        limit: Number(ctx.query.limit) || undefined,
        offset: Number(ctx.query.offset) || undefined,
        where: where.length ? where : undefined,
        sortBy: ctx.query.sortBy ? { field: ctx.query.sortBy, direction: ctx.query.sortDirection || "asc" } : undefined
    })

    const total = await ctx.context.adapter.count({
        model: "service_account",
        where: where.length ? where : undefined
    })

    return ctx.json({ service_accounts: accounts, total, limit: Number(ctx.query.limit) || undefined, offset: Number(ctx.query.offset) || undefined })
})

export const createServiceAccount = <O extends ServiceAccountOptions>(options: O) => createAuthEndpoint('/service-accounts/create-account', {
    method: 'POST',
    body: schemas.create.serviceAccount,
    use: [manageServiceAccountsMiddleware(options)]
}, async (ctx) => {
    const {
        name,
        scopes
    } = ctx.body;

    const ser_acc = await ctx.context.adapter.create<ServiceAccount>({
        model: "service_account",
        data: {
            name,
            scopes,
            created_at: new Date(),
            updated_at: new Date()
        }
    })

    if (!ser_acc) {
        throw APIError.fromStatus("INTERNAL_SERVER_ERROR", SERVICE_ACCOUNT_ERROR_CODES.FAILED_TO_CREATE);
    }

    return ctx.json(ser_acc)
})

export const updateServiceAccount = <O extends ServiceAccountOptions>(options?: O | undefined) => createAuthEndpoint('/service-accounts/update-account', {
    method: 'POST',
    body: schemas.update.serviceAccount,
    use: [manageServiceAccountsMiddleware(options)]
}, async (ctx) => {
    const { accountId, name, scopes } = ctx.body

    const existingAccount = await ctx.context.adapter.findOne({
        model: "service_account",
        where: [{
            field: "id",
            operator: "eq",
            value: accountId
        }]
    })

    if (!existingAccount) {
        throw APIError.fromStatus("NOT_FOUND", SERVICE_ACCOUNT_ERROR_CODES.ACCOUNT_ID_NOT_FOUND)
    }

    const updatedAccount = await ctx.context.adapter.update({
        model: "service_account",
        where: [{
            field: "id",
            operator: "eq",
            value: accountId
        }],
        update: {
            ...(name !== undefined ? { name } : {}),
            ...(scopes !== undefined ? { scopes } : {}),
            updated_at: new Date()
        }
    })

    if (!updatedAccount) {
        throw APIError.fromStatus("INTERNAL_SERVER_ERROR", SERVICE_ACCOUNT_ERROR_CODES.FAILED_TO_UPDATE)
    }

    return ctx.json({ service_account: updatedAccount })

})

export const deleteServiceAccount = <O extends ServiceAccountOptions>(options?: O | undefined) => createAuthEndpoint('/service-accounts/delete-account', {
    method: 'POST',
    body: schemas.delete.serviceAccount,
    use: [manageServiceAccountsMiddleware(options)]
}, async (ctx) => {
    const { accountId } = ctx.body

    const existingAccount = await ctx.context.adapter.findOne({
        model: "service_account",
        where: [{
            field: "id",
            operator: "eq",
            value: accountId
        }]
    })

    if (!existingAccount) {
        throw APIError.fromStatus("NOT_FOUND", SERVICE_ACCOUNT_ERROR_CODES.ACCOUNT_ID_NOT_FOUND)
    }

    await ctx.context.adapter.delete({
        model: "service_account",
        where: [{
            field: "id",
            operator: "eq",
            value: accountId
        }]
    })

    return ctx.json({ success: true, accountId })

})

export const listServiceKeys = <O extends ServiceAccountOptions>(options?: O | undefined) => createAuthEndpoint('/service-keys/list-keys', {
    method: 'GET',
    use: [manageServiceAccountsMiddleware(options)],
    query: schemas.list.serviceKeysQuery
}, async (ctx) => {
    const account = await ctx.context.adapter.findOne({
        model: "service_account",
        where: [{
            field: "id",
            operator: "eq",
            value: ctx.query.accountId
        }]
    })

    if (!account) {
        throw APIError.fromStatus("NOT_FOUND", SERVICE_ACCOUNT_ERROR_CODES.ACCOUNT_ID_NOT_FOUND)
    }

    const where: Where[] = [{
        field: "service_account_id",
        operator: "eq",
        value: ctx.query.accountId
    }]

    const keys = await ctx.context.adapter.findMany({
        model: "service_key",
        limit: Number(ctx.query.limit) || undefined,
        offset: Number(ctx.query.offset) || undefined,
        where,
        sortBy: ctx.query.sortBy ? { field: ctx.query.sortBy, direction: ctx.query.sortDirection || "asc" } : undefined
    })

    const total = await ctx.context.adapter.count({
        model: "service_key",
        where
    })

    return ctx.json({ service_keys: keys, total, limit: Number(ctx.query.limit) || undefined, offset: Number(ctx.query.offset) || undefined })
})

export const createServiceKey = <O extends ServiceAccountOptions>(options?: O | undefined) => createAuthEndpoint('/service-keys/create-key', {
    method: 'POST',
    body: schemas.create.serviceKey,
    use: [manageServiceAccountsMiddleware(options)]
}, async (ctx) => {
    const { accountId, metadata, expiresAt } = ctx.body

    const account = await ctx.context.adapter.findOne({
        model: "service_account",
        where: [{
            field: "id",
            operator: "eq",
            value: accountId
        }]
    })

    if (!account) {
        throw APIError.fromStatus("NOT_FOUND", SERVICE_ACCOUNT_ERROR_CODES.ACCOUNT_ID_NOT_FOUND)
    }

    const generatedKey = `sk_${generateRandomString(48)}`
    const expiresAtDate = expiresAt ? new Date(Date.now() + expiresAt * 1000) : undefined

    const serviceKey = await ctx.context.adapter.create({
        model: "service_key",
        data: {
            service_account_id: accountId,
            key: generatedKey,
            metadata,
            expiresAt: expiresAtDate,
            created_at: new Date(),
            updated_at: new Date()
        }
    })

    if (!serviceKey) {
        throw APIError.fromStatus("INTERNAL_SERVER_ERROR", SERVICE_ACCOUNT_ERROR_CODES.FAILED_TO_CREATE_KEY)
    }

    return ctx.json({ service_key: serviceKey })
})

export const updateServiceKey = <O extends ServiceAccountOptions>(options?: O | undefined) => createAuthEndpoint('/service-keys/update-key', {
    method: 'POST',
    body: schemas.update.serviceKey,
    use: [manageServiceAccountsMiddleware(options)]
}, async (ctx) => {
    const { keyId, metadata, expiresAt } = ctx.body

    const existingKey = await ctx.context.adapter.findOne({
        model: "service_key",
        where: [{
            field: "id",
            operator: "eq",
            value: keyId
        }]
    })

    if (!existingKey) {
        throw APIError.fromStatus("NOT_FOUND", SERVICE_ACCOUNT_ERROR_CODES.KEY_ID_NOT_FOUND)
    }

    const expiresAtDate = expiresAt === undefined
        ? undefined
        : expiresAt === null
            ? null
            : new Date(Date.now() + expiresAt * 1000)

    const updatedKey = await ctx.context.adapter.update({
        model: "service_key",
        where: [{
            field: "id",
            operator: "eq",
            value: keyId
        }],
        update: {
            ...(metadata !== undefined ? { metadata } : {}),
            ...(expiresAtDate !== undefined ? { expiresAt: expiresAtDate } : {}),
            updated_at: new Date()
        }
    })

    if (!updatedKey) {
        throw APIError.fromStatus("INTERNAL_SERVER_ERROR", SERVICE_ACCOUNT_ERROR_CODES.FAILED_TO_UPDATE_KEY)
    }

    return ctx.json({ service_key: updatedKey })
})

export const deleteServiceKey = <O extends ServiceAccountOptions>(options?: O | undefined) => createAuthEndpoint('/service-keys/delete-key', {
    method: 'POST',
    body: schemas.delete.serviceKey,
    use: [manageServiceAccountsMiddleware(options)]
}, async (ctx) => {
    const { keyId } = ctx.body

    const existingKey = await ctx.context.adapter.findOne({
        model: "service_key",
        where: [{
            field: "id",
            operator: "eq",
            value: keyId
        }]
    })

    if (!existingKey) {
        throw APIError.fromStatus("NOT_FOUND", SERVICE_ACCOUNT_ERROR_CODES.KEY_ID_NOT_FOUND)
    }

    await ctx.context.adapter.delete({
        model: "service_key",
        where: [{
            field: "id",
            operator: "eq",
            value: keyId
        }]
    })

    return ctx.json({ success: true, keyId })

})