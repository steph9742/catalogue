import type { AccessControl } from "better-auth/plugins"
import * as z from "zod"

export const createServiceAccountSchema = z.object({
    name: z
        .string()
        .meta({ description: "The name of the service account" }),
    scopes: z
        .array(z.string())
        .meta({ description: "The scopes to associate with the service account" })
})

export const createServiceKeySchema = z.object({
    accountId: z
        .string()
        .meta({ description: "The ID of the service account to create the key for" }),
    metadata: z
        .any()
        .optional()
        .meta({ description: "Optional metadata to associate with the service key" }),
    expiresAt: z
        .number()
        .meta({ description: "Optional expiration time for the service key, represented as the number of seconds until expiration" })
        .min(1)
        .optional()
        .nullable()
        .default(null)
})

export const hasServiceKeyPermissionSchema = z.object({
    keyId: z
        .string()
        .optional()
        .meta({ description: "The ID of the service key to validate" }),
    key: z
        .string()
        .optional()
        .meta({ description: "The raw service key to validate" }),
    scopes: z
        .array(z.string())
        .min(1)
        .meta({ description: "Scopes required for the action" })
}).refine((data) => Boolean(data.keyId || data.key), {
    message: "Either keyId or key must be provided"
})