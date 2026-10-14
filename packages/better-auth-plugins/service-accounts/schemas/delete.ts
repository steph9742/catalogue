import * as z from "zod"

export const deleteServiceAccountSchema = z.object({
    accountId: z
        .string()
        .meta({ description: "The ID of the service account to delete" })
})

export const deleteServiceKeySchema = z.object({
    keyId: z
        .string()
        .meta({ description: "The ID of the service key to delete" })
})