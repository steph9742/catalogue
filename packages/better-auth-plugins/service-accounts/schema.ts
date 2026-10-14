import type { BetterAuthPluginDBSchema } from "better-auth/db";
import { parseJSON } from "better-auth/client";

export const serviceAccountSchema = {
    service_account: {
        fields: {
            name: {
                type: "string",
                required: true
            },
            scopes: {
                type: "string[]",
                required: true,
            },
            created_at: {
                type: "date",
                defaultValue: () => new Date()
            },
            updated_at: {
                type: "date",
                defaultValue: () => new Date(),
                onUpdate: () => new Date()
            }
        }
    },
    service_key: {
        fields: {
            service_account_id: {
                type: "string",
                required: true,
                references: {
                    field: "id",
                    model: "service_account"
                }
            },
            key: {
                type: "string",
                required: true,
                input: false,
                index: true,
            },
            metadata: {
                type: "string",
                required: false,
                input: true,
                transform: {
                    input(value) {
                        return JSON.stringify(value);
                    },
                    output(value) {
                        if (!value) return null;
                        return parseJSON<any>(value as string);
                    },
                },
            },
            expiresAt: {
                type: "date",
                required: false,
                input: false
            },
            created_at: {
                type: "date",
                defaultValue: () => new Date()
            },
            updated_at: {
                type: "date",
                defaultValue: () => new Date(),
                onUpdate: () => new Date()
            }
        }
    }
} satisfies BetterAuthPluginDBSchema;