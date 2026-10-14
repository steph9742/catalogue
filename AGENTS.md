# AGENTS.md — Catalogue

Consignes pour qui travaille sur ce dépôt, humain ou agent.

## Ce qu'est l'outil

Catalogue cartographie le système d'information d'un établissement et suit sa conformité :
applications, machines, réseau, prestataires, accès, organisation, et les cadres ISO 27001,
NIS 2, RGPD et EBIOS RM. Il est conçu pour une équipe sécurité, pas pour un portail ouvert
aux utilisateurs finaux.

## Deux règles de fond, avant toute autre

1. **`null`, `false` et `[]` ne sont pas interchangeables.** « Jamais relevé » n'est pas
   « absent », « non tranché » n'est pas « non ». Un champ à trois états se rend à trois
   états, jusque dans l'interface.
2. **Un décompte est une partition.** La somme des parts fait le total, les manques ont leur
   ligne nommée, et un chiffre se publie avec son dénominateur. Un chiffre exact mais
   trompeur coûte plus cher qu'une absence de chiffre.

## Architecture

Monorepo Turborepo, gestionnaire de paquets **Bun**.

### Frontend (Nuxt 4) — `apps/app`
- Styling **TailwindCSS uniquement** (le CSS est réservé aux `<Transition>`).
- Formulaires, cartes et listes en composants séparés.
- Tout appel API passe par `useEden` / `useApi` (typage via Eden Treaty).
- Polices `font-geist` et `font-geistmono`, thème de `@catalogue/tailwind-config`.

### Backend (ElysiaJS) — `apps/server`
- Accès base par l'util `db` **uniquement**.
- Validation des paramètres, requêtes et corps par TypeBox ; `createInsertSchema` dérive les
  schémas des tables Drizzle.
- Droits par la macro `auth` (`user`, `admin`, `svc`) et la garde `can({ category, level })`.
- Un routeur par domaine, importé dans `src/index.ts`. Les catalogues simples passent par la
  fabrique `crudRouter` (`src/routers/crud.ts`).
- La logique pure (règles, rapprochements, partitions) vit dans `src/utils/*` pour être
  vérifiable sans base : les contrôles de `apps/server/test/verif-*.ts` s'y appuient.

### Paquets
- `@catalogue/database` — Drizzle : schémas (`src/schemas/*`) et migrations.
- `@catalogue/auth` — Better Auth : SSO OIDC, rôles, comptes de service.
- `@catalogue/ui` — bibliothèque de composants.
- `@catalogue/eden` — client API typé.
- `@catalogue/better-auth-plugins` · `@catalogue/tailwind-config` · `@catalogue/eslint-config`.

## Migrations

**Toujours générées, jamais écrites à la main** :

```bash
bun run --filter @catalogue/database generate   # puis relire le SQL produit
bun run --filter @catalogue/database migrate
```

Un fichier SQL écrit à la main laisse l'instantané (`meta/*_snapshot.json`) en arrière, et la
génération suivante produit une migration fausse sans que rien ne le signale.

## Commandes

```bash
bun install
bun run dev          # front + API
bun run build
bun run typecheck
bun run lint
bun apps/server/test/verif-<sujet>.ts   # contrôles unitaires, sans base
```

## Contributions

L'interface, la documentation et les commentaires sont en **français**. Une correction de
comportement s'accompagne du contrôle qui l'éprouve ; un chiffre publié par l'API
s'accompagne de ce qu'il ne dit pas.
