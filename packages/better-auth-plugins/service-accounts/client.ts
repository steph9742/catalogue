import type { ServiceAccountOptions } from "./types";
import type { BetterAuthClientPlugin } from "better-auth"
import { serviceAccounts } from "./index";

type ServiceAccountPlugin = typeof serviceAccounts;

export const serviceAccountsClient = () => {
    return {
        id: "serviceAccountPlugin",
        $InferServerPlugin: {} as ReturnType<ServiceAccountPlugin>,
        
    } satisfies BetterAuthClientPlugin
}