# Catalogue

Outil de **cartographie du système d'information et de conformité cyber** pour un
établissement : ce qu'on possède, qui en répond, ce qui expire, ce qui manque.

> **Fait par la cellule cyber de l'UMLP, pour la cellule cyber de l'UMLP.**
> Conçu, développé et utilisé en production par la cellule cyber de l'Université Marie et
> Louis Pasteur (UMLP) pour ses propres besoins, puis publié sous licence MIT pour que
> d'autres équipes puissent le reprendre, l'adapter et le déployer chez elles.

## Ce que fait l'outil

- **Cartographies** — applications métiers, serveurs, postes de travail, appareils mobiles,
  objets connectés, machines industrielles, réseau et flux, prestataires, accès VPN, lieux,
  et l'organisation (entités, composantes, départements, services, pôles, personnes).
- **Conformité** — SMSI / ISO 27001 (déclaration d'applicabilité, clauses, actions),
  NIS 2 (exigences, plan d'actions, notification d'incident et ses échéances réglementaires),
  RGPD (sécurité des traitements, AIPD), EBIOS RM (ateliers 1 à 5), matrice des risques.
- **Fin de vie des systèmes** — le parc confronté aux dates de fin de support publiées, avec
  la distinction entre « hors support », « support étendu » et « échéance inconnue ».
- **Surface exposée** — sites et services exposés, certificats TLS relevés (jamais saisis),
  technologies détectées, découverte des noms d'hôte par journaux de transparence des
  certificats et par transfert de zone DNS.
- **Échéances** — un moteur unique pour tout ce qui expire : certificat, fin de support, accès
  VPN, contrat, revue d'homologation, réexamen d'AIPD, revue de fournisseur.
- **Registre de lecture** (`/api/lectures`) — ce que vaut chaque valeur rendue par l'API, pour
  qu'un appelant automatisé ne confonde pas « non évalué » et « conforme ».

Deux principes traversent le code et méritent d'être connus avant d'y toucher :

1. **`null`, `false` et `[]` ne veulent pas dire la même chose.** « Jamais relevé » n'est pas
   « absent », et « non tranché » n'est pas « non ». L'interface et l'API le disent plutôt
   que de choisir pour le lecteur.
2. **Un chiffre exact et trompeur est pire qu'une absence de chiffre.** Les décomptes sont
   des partitions dont la somme se vérifie, et les manques ont leur propre ligne.

## Connecteurs, tous facultatifs

| Connecteur | Sens | Ce qu'il apporte |
|---|---|---|
| **GLPI** | lecture | inventaire des machines, entités, lieux, groupes |
| **HarfangLab** (EDR) | lecture | flotte d'agents, état des moteurs, couverture du parc |
| **Slowpoke / Sniff** | lecture | incidents de sécurité rattachés aux actifs, listes blanches |
| **LDAP** | lecture | personnes et unités de l'annuaire |
| **Moteur d'audit de surface** | appel sortant | constats relevés depuis Internet |

Aucun n'est nécessaire : l'application fonctionne avec la saisie et les imports de fichiers.

## Pile technique

Monorepo **Turborepo** géré avec **Bun**.

- **Frontend** — Nuxt 4 + Tailwind CSS (`apps/app`)
- **Backend** — ElysiaJS sur Bun, API typée exposée au front via **Eden Treaty** (`apps/server`)
- **Base de données** — PostgreSQL 18 + Drizzle ORM (`packages/database`)
- **Authentification** — Better Auth : SSO OIDC et mot de passe de secours, rôles par
  catégorie, comptes de service (`packages/auth`)
- **UI** — bibliothèque de composants partagée (`packages/ui`)

Le socle technique est repris de **Slowpoke**, l'outil de gestion d'incidents de sécurité
publié par la même équipe.

## Démarrer

```bash
cp .env.example .env            # au minimum : DATABASE_URL et BETTER_AUTH_SECRET
docker compose up -d --build    # postgres → migrations → API → front → proxy
docker compose run --rm seed    # compte de secours et référentiels
```

L'application répond sur `http://localhost:8080`. Le mot de passe du compte de secours est
affiché **une seule fois** par le seed et déposé dans `.secrets/admin-password`.

En développement :

```bash
bun install
docker compose up -d postgres
bun run --filter @catalogue/database migrate
bun run dev                     # front sur :3000, API sur :4000 (OpenAPI sur /openapi)
bun run typecheck && bun run lint
```

## Documentation

| Document | Pour qui |
|---|---|
| [`doc/Guide-Utilisateur.md`](doc/Guide-Utilisateur.md) | utilisateurs — catalogues, cartographies, conformité, fin de vie |
| [`doc/Installation.md`](doc/Installation.md) | installation — variables d'environnement, Docker Compose, SSO |
| [`doc/Reglages.md`](doc/Reglages.md) | administrateurs — ce que fait chaque réglage |
| [`doc/Exploitation-MCO.md`](doc/Exploitation-MCO.md) | exploitation — migrations, sauvegardes, supervision, pannes connues |
| [`doc/Documentation.md`](doc/Documentation.md) | technique — architecture, droits, connecteurs, référentiels |
| [`doc/Registre-Assistant.md`](doc/Registre-Assistant.md) | contrat de lecture pour un appelant automatisé |

## Limites assumées

- L'interface et la documentation sont **en français**, et le vocabulaire suit celui d'un
  établissement de l'enseignement supérieur français.
- Les référentiels réglementaires embarqués (NIS 2 / ReCyF, ISO 27001, RGPD) suivent la
  transposition française ; leur contenu doit être vérifié avant tout usage opposable.
- Aucune donnée d'organisation n'est livrée : les tables de correspondance se remplissent
  depuis l'interface ou par import.

## Licence et provenance

[MIT](LICENSE) — © 2026 Université Marie et Louis Pasteur.

Un des outils de la **cellule cyber de l'UMLP**, écrits pour ses propres besoins et
publiés ensemble :

| Outil | Rôle |
|---|---|
| **Slowpoke** | gestion des incidents de cybersécurité |
| **Catalogue** (ce dépôt) | cartographie du SI et conformité cyber |
| **Assistants IA** | réponses sourcées sur le corpus de procédures, analyse de journaux |
| **Astreintes** | planning et heures d'astreinte de l'équipe |
| **Gestion de crise cyber** | conduite d'une crise d'origine cyber : main courante, décisions, communications, exercices |
| **Arche** | réplique hors ligne et plan de reprise YunoHost + Docker |
| **Bureautix Fleet** | parc de postes de travail NixOS durcis, multi-entités — *expérimental, en cours* |
