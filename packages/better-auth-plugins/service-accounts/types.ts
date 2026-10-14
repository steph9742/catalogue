import type { Awaitable, User } from "better-auth";
import type { AccessControl } from "better-auth/plugins";

export interface ServiceAccount {
    id: string;
    name: string;
    scopes: string[];
    created_at: Date;
    updated_at: Date;

}

export interface ServiceKey {
    id: string;
    service_account_id: string;
    key: string;
    metadata?: Record<string, any> | null;
    expiresAt?: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface ServiceAccountOptions {
    scopes: AccessControl
    allowUserToManageServiceAccounts?: | (boolean | ((user: User & Record<string, any>) => Awaitable<boolean>)) | undefined
}