import * as z from "zod"

export const updateServiceAccountSchema = z.object({
    accountId: z
        .string()
        .meta({ description: "The ID of the service account to update" }),
    name: z
        .string()
        .meta({ description: "Optional new name for the service account" })
        .optional(),
    scopes: z
        .array(z.string())
        .meta({ description: "Optional new scopes to associate with the service account" })
        .optional()
}).refine((data) => data.name !== undefined || data.scopes !== undefined, {
    message: "At least one field must be provided to update the service account"
})

export const updateServiceKeySchema = z.object({
    keyId: z
        .string()
        .meta({ description: "The ID of the service key to update" }),
    metadata: z
        .any()
        .optional()
        .nullable()
        .meta({ description: "Optional metadata to associate with the service key" }),
    expiresAt: z
        .number()
        .meta({ description: "Optional expiration time for the service key, represented as the number of seconds until expiration. Use null to remove expiration." })
        .min(1)
        .optional()
        .nullable()
}).refine((data) => data.metadata !== undefined || data.expiresAt !== undefined, {
    message: "At least one field must be provided to update the service key"
})