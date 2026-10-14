# service-acc-ba

Plugin Better Auth pour gerer des comptes de service.

## Installation

```bash
bun install
```

## Utilisation

```ts
import { betterAuth } from "better-auth";
import { serviceAccountPlugin } from "./index";

export const auth = betterAuth({
 plugins: [
  serviceAccountPlugin({
   idPrefix: "svc",
   defaultScopes: ["read:metrics"],
   disableClientRequest: true,
  }),
 ],
});
```

## Endpoints exposes

- `POST /service-account/create`
- `GET /service-account/list`
- `POST /service-account/revoke`

## Exemple (server-side)

```ts
const created = await auth.api.createServiceAccount({
 body: {
  name: "ci-bot",
  scopes: ["deploy:prod", "read:metrics"],
 },
});

console.log(created.clientSecret);
```

Le `clientSecret` est retourne uniquement au moment de la creation.
