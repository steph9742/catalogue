import * as z from "zod"
import { whereOperators } from "better-auth/adapters"

export const listServiceAccountsQuerySchema = z.object({
    limit: z
        .string()
        .meta({ description: "Number of service accounts to return" })
        .or(z.number())
        .optional(),
    offset: z
        .string()
        .meta({ description: "Number of service accounts to skip" })
        .or(z.number())
        .optional(),
    sortBy: z
        .string()
        .meta({ description: "Field to sort service accounts by" })
        .optional(),
    sortDirection: z
        .enum(["asc", "desc"])
        .meta({ description: "Direction to sort service accounts" })
        .optional(),
    filterField: z
        .string()
        .meta({ description: "Field to filter service accounts by" })
        .optional(),
    filterValue: z
        .string()
        .meta({ description: "Value to filter service accounts by" })
        .or(z.number())
        .or(z.boolean())
        .or(z.array(z.string()))
        .or(z.array(z.number()))
        .optional(),
    filterOperator: z
        .enum(whereOperators)
        .meta({ description: "Operator to use for filtering" })
        .optional(),
    searchValue: z
        .string()
        .meta({ description: "Value to search service accounts by (searches name and id)" })
        .optional(),
    searchOperator: z
        .enum(["contains", "startsWith", "endsWith", "equals"])
        .meta({ description: "Operator to use for searching" })
        .optional(),
})

export const listServiceKeysQuerySchema = z.object({
    accountId: z
        .string()
        .meta({ description: "The ID of the service account to list keys for" }),
    limit: z
        .string()
        .meta({ description: "Number of service keys to return" })
        .or(z.number())
        .optional(),
    offset: z
        .string()
        .meta({ description: "Number of service keys to skip" })
        .or(z.number())
        .optional(),
    sortBy: z
        .string()
        .meta({ description: "Field to sort service keys by" })
        .optional(),
    sortDirection: z
        .enum(["asc", "desc"])
        .meta({ description: "Direction to sort service keys" })
        .optional(),
})