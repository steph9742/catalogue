import { createServiceAccountSchema, createServiceKeySchema, hasServiceKeyPermissionSchema } from "./create";
import { deleteServiceAccountSchema, deleteServiceKeySchema } from "./delete";
import { updateServiceAccountSchema, updateServiceKeySchema } from "./update";
import { listServiceAccountsQuerySchema, listServiceKeysQuerySchema } from "./list";

export const schemas = {
    list: {
        serviceAccountsQuery: listServiceAccountsQuerySchema,
        serviceKeysQuery: listServiceKeysQuerySchema
    },
    create: {
        serviceAccount: createServiceAccountSchema,
        serviceKey: createServiceKeySchema,
        serviceKeyHasPermission: hasServiceKeyPermissionSchema
    },
    update: {
        serviceAccount: updateServiceAccountSchema,
        serviceKey: updateServiceKeySchema
    },
    delete: {
        serviceAccount: deleteServiceAccountSchema,
        serviceKey: deleteServiceKeySchema
    }
}