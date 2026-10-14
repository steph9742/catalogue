import type { BetterAuthPlugin } from "better-auth";
import { serviceAccountSchema } from "./schema";
import type { ServiceAccount, ServiceAccountOptions, ServiceKey } from "./types";
import { SERVICE_ACCOUNT_ERROR_CODES } from "./error-codes";
import {
    createServiceAccount,
    createServiceKey,
    deleteServiceAccount,
    deleteServiceKey,
    getServiceAccountFromRequest,
    hasServiceKeyPermission,
    listServiceAccounts,
    listServiceKeys,
    updateServiceAccount,
    updateServiceKey
} from "./routes";
import { serviceAccountsClient } from "./client";

export const serviceAccounts = (options: ServiceAccountOptions) =>
({
    id: "serviceAccountPlugin",
    schema: serviceAccountSchema,
    endpoints: {
        listServiceAccounts: listServiceAccounts(options),
        createServiceAccount: createServiceAccount(options),
        updateServiceAccount: updateServiceAccount(options),
        deleteServiceAccount: deleteServiceAccount(options),
        getServiceAccountFromRequest: getServiceAccountFromRequest(),
        hasServiceKeyPermission: hasServiceKeyPermission(),
        listServiceKeys: listServiceKeys(options),
        createServiceKey: createServiceKey(options),
        updateServiceKey: updateServiceKey(options),
        deleteServiceKey: deleteServiceKey(options)
    },
    $ERROR_CODES: SERVICE_ACCOUNT_ERROR_CODES,

} satisfies BetterAuthPlugin);

export { serviceAccountsClient, type ServiceAccount, type ServiceKey };