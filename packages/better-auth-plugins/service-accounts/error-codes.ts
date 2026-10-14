import { defineErrorCodes } from "better-auth"

export const SERVICE_ACCOUNT_ERROR_CODES = defineErrorCodes({
    SERVICE_KEY_REQUIRED: "A service key is required.",
    INVALID_SERVICE_KEY: "The provided service key is invalid.",
    SERVICE_KEY_EXPIRED: "The provided service key has expired.",
    ACCOUNT_ID_REQUIRED: "A service account ID is required.",
    KEY_ID_REQUIRED: "A service key ID is required.",
    ACCOUNT_ID_NOT_FOUND: "The specified service account ID was not found.",
    KEY_ID_NOT_FOUND: "The specified service key ID was not found.",
    NOT_ALLOWED: "You do not have permission to create service accounts.",
    FAILED_TO_CREATE: "Failed to create the service account.",
    FAILED_TO_UPDATE: "Failed to update the service account.",
    FAILED_TO_DELETE: "Failed to delete the service account.",
    FAILED_TO_CREATE_KEY: "Failed to create the service key.",
    FAILED_TO_UPDATE_KEY: "Failed to update the service key.",
    FAILED_TO_DELETE_KEY: "Failed to delete the service key.",
}) 