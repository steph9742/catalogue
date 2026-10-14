import js from "@eslint/js"
import turboPlugin from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

export const config = [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            turbo: turboPlugin
        },
        rules: {
            "turbo/no-undeclared-env-vars": "warn"
        }
    },
    {
        ignores: ["dist/**"]
    }
]