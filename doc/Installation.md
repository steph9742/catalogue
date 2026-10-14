# Installation — Catalogue

Quatre parties, dans l'ordre où on les rencontre :

| | | |
|---|---|---|
| **A** | Installation de la pile | requis |
| **B** | Activer le SSO (Dex) | facultatif — l'application marche sans |
| **C** | Mise en production derrière l'hôte | selon l'hébergement |
| **D** | Après l'installation | à faire avant d'en avoir besoin |

Pour ce que font les réglages **dans l'application** une fois installée, voir [Réglages](Reglages.md).

---

# Partie A — Installation de la pile

## A.1 Prérequis

| Élément | Pourquoi |
|---|---|
| **git** | récupérer et mettre à jour le dépôt |
| **Docker** et **Docker Compose** | la pile entière tourne en conteneurs |
| **4 CPU et 6 Gio de mémoire** disponibles pendant le build | en deçà, la construction du frontend est tuée par manque de mémoire (code 137) |
| Espace disque | les cycles de construction consomment quelques gigaoctets, récupérables avec `docker builder prune -af` |
| Accès réseau à **GLPI** et **Sniff** | pour les connecteurs |
| Accès à **endoflife.date** | dates de fin de support — facultatif, l'application fonctionne sans |

**Bun n'est pas requis sur le serveur** : tout est compilé dans les images. Il ne sert qu'au développement (§B.8).

## A.2 Récupérer le dépôt

```bash
sudo mkdir -p /opt/catalogue && sudo chown "$USER" /opt/catalogue
git clone https://github.com/<votre-compte>/catalogue.git /opt/catalogue
cd /opt/catalogue
```

Le travail se fait sur la branche **`main`**.

Ce que contient le dépôt, pour se repérer :

```
apps/app/          frontend Nuxt
apps/server/       API Elysia, connecteurs, ordonnanceurs
packages/database/ schéma Drizzle, migrations, référentiels officiels
deploy/            scripts de sauvegarde et de migration, modèle nginx
doc/               cette documentation
docker-compose.yml la pile complète
```

Mettre à jour plus tard : `git pull`, puis la procédure de [MCO §3](Exploitation-MCO.md#3-mise-à-jour-de-lapplication).

## A.3 Fichier `.env`

> **Deux jeux de noms pour le fournisseur d'identité.** Les variables publiées sont
> `OIDC_*` ; les anciennes, `OUATE_*`, restent lues en repli pour qu'une instance déjà
> déployée n'ait rien à changer. Quand les deux sont renseignées, `OIDC_*` l'emporte.
>
> Une exception qui n'en est pas une : `OIDC_PROVIDER_ID` vaut **`ouate`** par défaut, parce
> que cet identifiant entre dans l'URL de rappel (`/api/auth/oauth2/callback/ouate`) déclarée
> chez le fournisseur. Le changer impose de redéclarer cette URL des deux côtés.

Copiez `.env.example` en `.env` et renseignez :

```bash
# Base de données
POSTGRES_USER=<utilisateur>
POSTGRES_PASSWORD=<mot de passe fort>
POSTGRES_DB=catalogue
DATABASE_URL=postgres://<utilisateur>:<mot de passe>@postgres:5432/catalogue

# Application
# Origine publique : schéma + hôte, SANS chemin ni barre oblique finale.
PUBLIC_URL=https://<votre-domaine>
TRUSTED_ORIGINS=https://<votre-domaine>
BETTER_AUTH_URL=https://<votre-domaine>
BETTER_AUTH_SECRET=<chaîne aléatoire longue>
APP_PORT=8080

# Sous-chemin de déploiement. Vide = à la racine du domaine (cas courant).
# Sinon une barre oblique AU DÉBUT, aucune à la fin. Voir « Déployer sous un sous-chemin » (§A.3).
BASE_PATH=

# Compte administrateur de SECOURS (seed) — défaut : secours@catalogue.local
SEED_ADMIN_EMAIL=<adresse>
# Facultatif : chemin d'un fichier contenant le mot de passe (voir C.4).
SEED_ADMIN_PASSWORD_FILE=/app/.secrets/admin-password

# Notifications push — voir « Engendrer les clés VAPID » ci-dessous.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:cyber@example.org

# Sauvegardes (facultatif)
CATALOGUE_BACKUP_KEEP=14         # nombre de sauvegardes automatiques conservées
CATALOGUE_BACKUP_DIR=./backup    # destination, HORS du volume Docker
```

Puis, pour activer le **SSO Dex** (voir Partie B) :

```bash
OIDC_CLIENT_ID=catalogue
OIDC_CLIENT_SECRET=<le secret du client Dex>
OIDC_DISCOVERY_URL=https://sso.example.org/dex/.well-known/openid-configuration
# Adresse de l'instance Nextcloud, d'où sont tirées les photos de profil.
OIDC_NC_URL=https://sso.example.org/nextcloud
# Uniquement si l'application est servie sous un sous-chemin :
OIDC_REDIRECT_URI=https://<votre-domaine>/<sous-chemin>/api/auth/oauth2/callback/ouate
```

Et, si vous voulez **fermer la connexion par mot de passe** une fois le SSO éprouvé :

```bash
# Ferme /login-secours ET l'endpoint correspondant. Sans effet si le SSO n'est pas
# configuré — un durcissement ne doit pas pouvoir rendre l'application inaccessible.
AUTH_SECOURS=false
```

> ⚠️ Avec `AUTH_SECOURS=false`, une panne d'annuaire enferme tout le monde dehors et il n'y a **plus de recours depuis l'interface**. La reprise passe alors par le serveur (remettre le réglage à `true`, redéployer). À n'activer qu'en connaissance de cause.

Omettre `OIDC_CLIENT_ID` désactive le SSO : l'application démarre en mode local, connexion par e-mail et mot de passe. Les variables `VAPID_*` préparent les notifications push, sur le modèle de Sniff ; elles ne sont pas requises aujourd'hui.

> ⚠️ `.env` n'est **jamais** versionné. Sauvegardez-le dans un coffre séparé : il contient les seuls secrets qui ne se retrouvent nulle part ailleurs.

### Engendrer les clés VAPID

Les notifications du navigateur exigent une paire de clés **VAPID**, propre à l'installation. Sans elles, l'application démarre mais aucune notification ne part.

Depuis la racine du dépôt, une fois la pile démarrée :

```bash
docker compose exec server bun -e "import w from 'web-push'; const k = w.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY=' + k.publicKey); console.log('VAPID_PRIVATE_KEY=' + k.privateKey)"
```

Sans la pile, mais avec le dépôt et `bun install` faits :

```bash
cd apps/server && bun -e "import w from 'web-push'; const k = w.generateVAPIDKeys(); console.log(k.publicKey, k.privateKey)"
```

> ⚠️ La commande **doit être lancée depuis `apps/server` ou depuis le conteneur** : `web-push` est une dépendance du serveur, pas de la racine du dépôt. Lancée ailleurs — depuis votre dossier personnel, par exemple — elle échoue sur `Cannot find package 'web-push'`.
>
> À défaut, `bunx --bun web-push generate-vapid-keys` fonctionne partout, mais télécharge le paquet.

Reportez la paire dans `.env`, puis redéployez. **Changer ces clés invalide tous les abonnements existants** : chaque personne devra réactiver ses notifications.

### `PUBLIC_URL` : l'origine SEULE

C'est le piège le plus coûteux de cette installation, alors qu'il tient en une ligne.

`PUBLIC_URL` porte l'**origine** — schéma et hôte — et **rien d'autre**. Le sous-chemin va dans `BASE_PATH`, que le compose ajoute là où il faut.

| | |
|---|---|
| ✅ | `PUBLIC_URL=https://sso.example.org` + `BASE_PATH=/catalogue` |
| ❌ | `PUBLIC_URL=https://sso.example.org/catalogue` + `BASE_PATH=/catalogue` |

Le second cas produit `…/catalogue/catalogue` — et le symptôme est déroutant : **la page s'affiche puis se vide**. Le rendu initial passe par l'adresse interne du conteneur et réussit ; seul le navigateur utilise l'adresse publique, donc fausse. On observe un menu réduit, une session absente, une erreur d'hydratation, et aucun journal ne mentionne la cause.

Le serveur **contrôle désormais cette cohérence au démarrage** et le signale :

```
⚠️  CONFIGURATION INCOHÉRENTE — l'application démarre, mais ne fonctionnera pas correctement :

   PUBLIC_URL contient un chemin (« /catalogue ») alors qu'elle doit porter l'ORIGINE SEULE…
   → PUBLIC_URL=https://sso.example.org   (et BASE_PATH=/catalogue)
```

Sont également vérifiés : la forme de `BASE_PATH`, le fait que `TRUSTED_ORIGINS` couvre l'origine publique (sinon les requêtes du navigateur sont refusées), et un `BETTER_AUTH_SECRET` resté à `change-me`.

```bash
docker compose logs server | head -20     # à lire après chaque changement de .env
```

### Déployer sous un sous-chemin

Par défaut l'application occupe la racine du domaine (`https://catalogue.exemple.fr`). Si elle doit vivre sous un sous-chemin — typiquement pour partager un domaine existant — une seule variable le commande :

```bash
PUBLIC_URL=https://sso.example.org
BASE_PATH=/catalogue        # barre oblique au début, aucune à la fin
```

L'application est alors servie sur `https://sso.example.org/catalogue`.

**Tout le reste en découle**, sans autre réglage : le compose dérive `NUXT_APP_BASE_URL`, `NUXT_PUBLIC_SERVER_BASE_URL` et `BETTER_AUTH_URL`, et le modèle nginx interne est rendu au démarrage avec ce préfixe — il le **retire** avant de transmettre au serveur, dont les routes restent en `/api`.

**Une exception, et c'est le piège** : l'URL de rappel OIDC. Comme le proxy retire le préfixe, `BETTER_AUTH_URL` ne porte que l'origine et l'URL calculée automatiquement **perdrait le sous-chemin**. Il faut donc la forcer :

```bash
OIDC_REDIRECT_URI=https://sso.example.org/catalogue/api/auth/oauth2/callback/ouate
```

…et déclarer **exactement cette valeur** dans `redirectURIs` côté Dex (§B.2). Une divergence, même d'une barre oblique, produit un `invalid redirect_uri` au moment de la connexion.

| Cas | `BASE_PATH` | `OIDC_REDIRECT_URI` |
|---|---|---|
| Racine du domaine | vide | inutile |
| Sous-chemin | `/catalogue` | obligatoire, avec le sous-chemin |

## A.4 Le compte de secours et son mot de passe

Adresse par défaut : **`secours@catalogue.local`**. C'est le compte qui permet de **reprendre la main quand le SSO est indisponible** — panne d'annuaire, client OIDC mal déclaré, claim `groups` absent. Sans lui, plus personne ne peut attribuer de rôles : l'application est perdue pour tout le monde.

Le mot de passe est cherché dans cet ordre :

| Rang | Source | Usage |
|---|---|---|
| 1 | `SEED_ADMIN_PASSWORD_FILE` | chemin d'un fichier — convention des secrets Docker |
| 2 | `SEED_ADMIN_PASSWORD` | variable d'environnement, pour les installations automatisées |
| 3 | `.secrets/admin-password` | fichier local, créé automatiquement s'il manque |
| 4 | — | engendré aléatoirement, **déposé** dans le fichier ci-dessus (droits 0600) |

**Le fichier prime volontairement sur la variable d'environnement.** Une variable se lit dans `docker inspect`, dans la liste des processus et dans les journaux de l'orchestrateur ; un fichier en 0600 non.

### Préparer le dossier des secrets — À FAIRE AVANT LE PREMIER SEED

```bash
mkdir -p /opt/catalogue/.secrets
sudo chown 1001:1001 /opt/catalogue/.secrets
chmod 700 /opt/catalogue/.secrets
```

**Pourquoi cet uid.** Le conteneur tourne en `bunjs` (uid 1001), et le dossier est monté depuis l'hôte. Si le dossier n'existe pas, **Docker le crée au montage en appartenant à root** : le seed ne peut alors pas y écrire, le mot de passe engendré n'existe plus que dans la sortie de la commande, et il disparaît avec le défilement du terminal.

Le symptôme est trompeur : l'installation se déroule sans erreur bloquante et l'application fonctionne — jusqu'au jour où le SSO tombe et où personne ne retrouve le mot de passe de secours.

> Sous macOS le montage est permissif et l'anomalie ne se produit pas : elle ne se voit donc **pas** en développement. C'est un cas typique où l'environnement de développement ne reproduit pas la production.

Depuis août 2026, le seed **encadre** cet échec et donne la commande de réparation, au lieu du simple avertissement qui se noyait dans sa sortie.

### Mot de passe perdu

Le seed **ne réinitialise jamais** le mot de passe d'un compte existant : rejoué à chaque déploiement, il invaliderait sinon celui qui est noté au coffre. Quand ce mot de passe est perdu, la réinitialisation se demande **explicitement** :

```bash
# 1. Déposer le mot de passe voulu
mkdir -p /opt/catalogue/.secrets
printf '%s\n' 'LE-MOT-DE-PASSE-CHOISI' > /opt/catalogue/.secrets/admin-password
chmod 600 /opt/catalogue/.secrets/admin-password

# 2. Le poser sur le compte existant
docker compose --profile seed run --rm -e SEED_ADMIN_RESET=oui seed
```

Le seed confirme par `🔑 … mot de passe RÉINITIALISÉ à la demande`, et réaffiche l'encadré des identifiants. **Sans cette variable, rien ne change** — c'est ce qui permet de rejouer le seed à chaque déploiement sans risque.

> ⚠️ **Ne supprimez jamais le compte pour retrouver un accès.** `audit_log` ne conserve que l'identifiant de l'utilisateur, sans nom ni adresse : supprimer un compte **anonymise toutes ses actions passées** au journal d'audit (la clé étrangère passe à `null`). Perdre une trace d'audit pour regagner un accès est un très mauvais échange.

### Partager le même identifiant entre production et réplica

Un mot de passe engendré localement diffère sur chaque installation. Pour qu'un réplica (préproduction, bac à sable restauré d'un dump) partage l'identifiant de la production, **copiez le fichier de secret** :

```bash
scp prod:/opt/catalogue/.secrets/admin-password replica:/opt/catalogue/.secrets/
chmod 600 /opt/catalogue/.secrets/admin-password
```

Le seed est **idempotent sur ce point** : il ne réinitialise jamais le mot de passe d'un compte déjà existant. Le rejouer à chaque déploiement n'invalide donc pas celui qui est noté dans le coffre.

> `.secrets/` est exclu du dépôt. Ce fichier ne doit jamais être versionné ni transiter par un canal non chiffré.

## A.5 Premier démarrage

```bash
docker compose build
docker compose up -d postgres
docker compose run --rm migrate      # crée le schéma
docker compose run --rm seed         # compte admin + 4 des 6 référentiels (ISO 27001 et RGPD s'importent ensuite depuis /referentiels)
docker compose up -d                 # pile complète
docker compose ps                    # tous « healthy » ?
```

Connectez-vous avec le compte du *seed*, puis **changez son mot de passe** et créez un second administrateur.

## A.6 Vérifications après installation

| Contrôle | Commande ou page | Attendu |
|---|---|---|
| API vivante | `curl -f http://localhost:8080/health` | `{"status":"ok"}` |
| Référentiels chargés | `/referentiels` | 152 / 93 / 80 / 6 sans écart après le seed ; **ISO 27001 (34) et RGPD (29) affichent un écart tant qu'ils n'ont pas été importés depuis la page** — c'est l'état attendu d'une installation neuve |
| Sauvegarde active | `ls -lht backup/` | un fichier récent, **non vide** |
| Connecteur GLPI | `/glpi` → *Tester la connexion* | connexion réussie |
| Fin de vie | `/fin-de-vie` → *Construire le référentiel* | systèmes du parc listés |

## A.7 Mise en production derrière un reverse proxy

Le service `reverse` écoute sur `8080` en HTTP. Placez devant lui le reverse proxy du site, qui assure la **terminaison TLS**.

Si l'application est servie sous un sous-chemin, renseignez `BASE_PATH` (ex. `/catalogue`) : le proxy interne et le frontend s'y adaptent.

**Ne publiez jamais** les ports de `postgres`, `server` ou `app`.

## A.8 Environnement de développement

Sur un poste, pour travailler sur le code :

```bash
git clone https://sso.example.org/gitlab/ssi/catalogue.git
cd catalogue
bun install                  # bun 1.3.10 (cf. packageManager)
cp .env.example .env         # valeurs locales : localhost, mot de passe postgres/postgres

bun run typecheck            # contrôle des types sur tous les paquets
bun run lint
```

La pile complète en local, comme en production :

```bash
docker compose up -d postgres
docker compose run --rm migrate
docker compose run --rm seed
docker compose up -d
```

L'application répond alors sur `http://localhost:8080`. Sans `OIDC_CLIENT_ID`, le SSO n'est pas déclaré et la connexion se fait par e-mail et mot de passe — c'est ce qui permet de développer sans dépendre de l'annuaire.

Après modification du schéma :

```bash
cd packages/database && bun run generate    # engendre la migration
cd ../.. && ./deploy/migrer.sh              # sauvegarde vérifiée PUIS migration
```

Pour régénérer les captures de la documentation : `bun doc/captures.ts`.

---

# Partie B — Activer le SSO (facultatif)

> **Cette partie est facultative.** Sans elle, l'application fonctionne : la connexion se fait par e-mail et mot de passe, avec le compte de secours créé à l'installation (§B.4). C'est le mode de démarrage normal, et rien n'oblige à activer le SSO tout de suite.
>
> Activez-le quand vous voulez que les agents se connectent avec leurs identifiants habituels. `OIDC_CLIENT_ID` renseigné suffit à le déclencher ; absent, l'application ne tente aucune connexion vers l'annuaire.

Ces réglages se font dans la **configuration de Dex**, pas dans l'application.

## B.1 Où se trouve la configuration de Dex

Dans l'établissement, **Dex tourne sur l'hôte**, adossé à son annuaire LDAP. Il est servi sous `https://sso.example.org/dex`.

Sa configuration est éclatée en **un fichier par application** :

```
/var/www/dex/config.yaml.d/
├── slowpoke.yaml        (Sniff)
├── catalogue.yaml       ← celui à créer
└── …
```

C'est une bonne nouvelle : **on ne touche pas au fichier des autres**. Il suffit d'ajouter le sien, puis de redémarrer Dex.

```bash
sudoedit /var/www/dex/config.yaml.d/catalogue.yaml
# … contenu ci-dessous …
systemctl restart dex        # nom du service à confirmer sur l'instance
```

> ⚠️ Même en fichier séparé, **une erreur de syntaxe empêche Dex de démarrer** — et Dex authentifie *toutes* les applications de l'établissement, pas seulement celle-ci. Vérifiez le YAML avant de redémarrer, et gardez une session ouverte le temps de contrôler que l'authentification fonctionne toujours ailleurs.

Vérifier que Dex répond, avant et après :

```bash
curl -s https://sso.example.org/dex/.well-known/openid-configuration | head
```

## B.2 Déclarer le client

Ajoutez un client statique dans la configuration de Dex :

Contenu de `catalogue.yaml` — **une entrée de liste, SANS la clé `staticClients:`** :

```yaml
- id: catalogue
  name: catalogue
  secret: <secret long et aléatoire — à reporter dans OIDC_CLIENT_SECRET>
  redirectURIs:
  - https://<votre-domaine>/api/auth/oauth2/callback/ouate
  - http://localhost:8080/api/auth/oauth2/callback/ouate
```

> ⚠️ **N'écrivez pas `staticClients:` dans ce fichier.** Les fragments de `config.yaml.d/`
> sont concaténés dans une liste **déjà ouverte** par la configuration principale. Répéter
> la clé produit un second `staticClients:` au milieu de la liste, et Dex refuse de
> démarrer :
>
> ```
> error parse config file config.yaml: yaml: line 76: did not find expected key
> ```
>
> **Dex ne démarrant plus, l'authentification de TOUTES les applications de
> l'établissement s'arrête** — pas seulement celle-ci. Erreur commise en juillet 2026.
>
> En cas de doute, calquez-vous sur un fragment existant qui fonctionne :
> `cat /var/www/dex/config.yaml.d/slowpoke.yaml`.
>
> L'assemblage est fait par `/var/www/dex/regenerate_config.sh`, exécuté par systemd
> **avant** chaque démarrage du service (`ExecStartPre`). C'est lui qui produit le
> `config.yaml` dont parlent les messages d'erreur : les numéros de ligne qu'il cite
> désignent le fichier assemblé, pas votre fragment.

La seconde URL sert au développement local. Sans elle, le SSO ne pourra être essayé que sur le serveur.

**Procédure sûre** — Dex étant partagé, ne laissez jamais le service à l'arrêt le temps de chercher :

```bash
sudoedit /var/www/dex/config.yaml.d/catalogue.yaml
systemctl restart dex
systemctl status dex --no-pager | head -5        # actif ?
curl -s https://sso.example.org/dex/.well-known/openid-configuration | head -c 80

# En cas d'échec : on retire, on rétablit, on cherche à froid.
mv /var/www/dex/config.yaml.d/catalogue.yaml /root/catalogue.yaml.bak && systemctl restart dex
```

L'**URL de redirection doit correspondre au caractère près** à celle que l'application utilise. C'est la cause n°1 des échecs de connexion (`invalid redirect_uri` côté Dex).

> Si l'application est servie sous un sous-chemin, l'URL devient
> `https://<votre-domaine>/<sous-chemin>/api/auth/oauth2/callback/ouate`,
> et il faut renseigner `OIDC_REDIRECT_URI` avec cette même valeur (voir §A.3).

## B.3 Le claim `groups`

L'application dérive le rôle global de l'appartenance au groupe **`admins`** : membre → `admin`, sinon → `user`.

**Ce claim ne se configure PAS dans votre fichier.** Le connecteur LDAP est déclaré **une seule fois** dans la configuration principale de Dex, partagée par toutes les applications — votre `catalogue.yaml` ne contient que le `staticClients`. Redéclarer un connecteur y créerait un doublon.

Il n'y a donc rien à faire côté connecteur, à condition qu'il remonte déjà les groupes. Ce que vous pouvez vérifier :

```bash
curl -s https://sso.example.org/dex/.well-known/openid-configuration \
  | grep -o '"scopes_supported":\[[^]]*\]'
```

`groups` doit y figurer. Sniff s'appuie sur le même mécanisme en production : si les groupes remontent pour lui, ils remonteront ici.

**Si les groupes ne remontent pas**, la correction porte sur la configuration **partagée** (bloc `groupSearch` du connecteur LDAP) — donc sur un fichier qui engage les autres applications. À traiter avec l'exploitant de Dex, pas seul.

> Sans ce claim, **tout le monde se connecte en `user`**, vous compris. C'est pourquoi le compte de secours créé par le *seed* doit exister **avant** de basculer sur le SSO : sans lui, plus personne ne peut attribuer de rôles.

### Quand le rôle est-il appliqué ?

**À la création du compte, et seulement là.** L'annuaire donne le rôle *initial* ; l'application en devient ensuite propriétaire, via **Réglages → Utilisateurs & rôles**.

Ce choix évite qu'une connexion défasse les attributions décidées dans l'application. Il a une contrepartie qu'il faut connaître : **retirer quelqu'un du groupe `admins` ne lui retire pas le rôle**. La révocation se fait dans l'application, pas dans l'annuaire.

Conséquence pratique : un compte créé *avant* que les groupes ne remontent gardera `user` même une fois Dex corrigé. Il faut le promouvoir à la main — depuis un compte administrateur, ou en base si plus aucun n'existe :

```bash
docker compose exec -T postgres psql -U postgres -d catalogue \
  -c "update \"user\" set role='admin' where email='<votre e-mail>';"
```

Puis se déconnecter et se reconnecter.

## B.4 Vérifier la découverte

L'application lit la configuration de l'IdP par son URL de découverte :

```bash
curl -s https://sso.example.org/dex/.well-known/openid-configuration
```

Elle doit répondre un JSON dont l'`issuer` vaut `https://sso.example.org/dex`, et dont les `scopes_supported` contiennent **`groups`** — sans lui, tout le monde se connecte en `user` (§B.3).

> L'application demande aussi le scope **`federated:id`**, qui n'apparaît pas dans `scopes_supported`. C'est normal : c'est un scope propre à Dex, accepté sans être annoncé. Sniff l'utilise en production avec le même fournisseur.

## B.5 Récapitulatif des variables correspondantes

| Variable (`.env`) | Correspond à |
|---|---|
| `OIDC_CLIENT_ID` | `id` du client statique Dex |
| `OIDC_CLIENT_SECRET` | `secret` du client statique Dex |
| `OIDC_DISCOVERY_URL` | `https://sso.example.org/dex/.well-known/openid-configuration` |
| `OIDC_REDIRECT_URI` | l'URL de redirection déclarée dans `redirectURIs` — obligatoire sous sous-chemin (voir §A.3) |
| `OIDC_NC_URL` | adresse de l'instance Nextcloud — voir « Photos de profil » ci-dessous |
| `OIDC_PROVIDER_ID` | identifiant du fournisseur dans l'URL de rappel (défaut `ouate`) |

Les mêmes variables en `OUATE_*` sont lues en repli, et seulement si la variante `OIDC_*`
est absente.

### Photos de profil

À la première connexion SSO, l'application construit l'adresse de l'avatar de l'utilisateur à partir de son identifiant fédéré :

```
${OIDC_NC_URL}/avatar/<identifiant fédéré>/512
```

C'est le point d'accès standard des avatars **Nextcloud** — d'où le `NC` du nom.

L'identifiant vient du claim `federated:id`, celui que Dex fournit sans l'annoncer (§B.4).

La variable est **facultative** : sans elle, l'interface affiche les initiales de la personne, calculées localement. C'est d'ailleurs ce qui se passe sur les comptes créés par mot de passe, qui n'ont pas d'avatar.

### Si le SSO ne fonctionne pas

Dans l'ordre, du plus fréquent au plus rare :

**1. Les variables atteignent-elles le conteneur ?**

```bash
docker compose exec server sh -c 'env | grep OIDC'
```

Si rien ne sort, les variables sont dans `.env` mais pas transmises : votre `docker-compose.yml` est antérieur au correctif qui les ajoute. Faites un `git pull` puis `docker compose up -d server app`.

**2. Le bouton « Connexion avec le portail » apparaît-il ?**

Il est piloté par `NUXT_PUBLIC_OIDC_ENABLED`, dérivé de la présence de `OIDC_CLIENT_ID`. Absent, c'est que le client n'est pas déclaré côté application.

**3. Que disent les journaux au démarrage ?**

```bash
docker compose logs server | head -25
```

Le contrôle de cohérence y nomme la variable fautive et donne la correction.

**4. Le serveur JOINT-IL le fournisseur ?**

C'est la panne la plus déroutante : l'adresse de Dex répond parfaitement depuis un
navigateur, sur la machine même, et le SSO échoue quand même — en 500, avec une pile
minifiée de plusieurs centaines de lignes dans laquelle la vraie cause tient en un mot.

Le conteneur va chercher le document de découverte à l'adresse **publique**. Depuis le
réseau Docker, ce nom résout souvent vers une adresse externe injoignable : NAT sans retour
de boucle, pare-feu, DNS partagé. Il faut donc interroger **depuis le conteneur**, jamais
depuis l'hôte :

```bash
docker compose exec server bun -e 'const u=process.env.OIDC_DISCOVERY_URL; console.log((await fetch(u)).status)'
```

Un `ConnectionRefused` ou une temporisation confirme le diagnostic. La correction consiste
à router ce nom vers la passerelle de l'hôte, donc vers son nginx — le certificat TLS reste
valable puisque le nom ne change pas :

```bash
echo 'AUTH_HOST_INTERNE=sso.example.org' >> .env
docker compose up -d --force-recreate server
```

`--force-recreate` est nécessaire : `extra_hosts` se fixe à la création du conteneur, un
simple `restart` ne le prendrait pas.

Le **connecteur Sniff** est sujet au même retour de boucle : si le test de connexion
répond « Unable to connect » alors que l'URL de Sniff fonctionne dans un navigateur,
router de la même façon le nom public de Sniff :

```bash
echo 'SNIFF_HOST_INTERNE=sniff.example.org' >> .env
docker compose up -d --force-recreate server
```

Après correction, `docker compose exec server curl -skI https://<hôte>/api/incidents`
doit répondre un code HTTP (401 sans clé : normal, le réseau passe) et non une erreur
de connexion.

Depuis la version qui introduit ce réglage, le serveur sonde le fournisseur **au démarrage**
et écrit en clair `⚠️  SSO INJOIGNABLE` avec la correction. Un `docker compose logs server`
suffit donc à le voir sans attendre qu'un utilisateur bute sur l'erreur.

**5. Dex répond-il « invalid redirect_uri » ?**

L'URL déclarée dans `redirectURIs` et celle de `OIDC_REDIRECT_URI` doivent être **identiques au caractère près**, sous-chemin compris. C'est la cause n°1.

**6. Tout le monde se connecte en `user` ?**

Le claim `groups` ne remonte pas (§B.3). Le compte de secours reste votre porte d'entrée pour attribuer les rôles à la main.

**Renseigner `OIDC_CLIENT_ID` suffit à activer le SSO.** S'il est absent, l'application ne déclare aucun fournisseur et ne tente aucune connexion réseau — c'est le mode local, par e-mail et mot de passe.

---

---

# Partie C — Mise en production derrière l'hôte

> ⚠️ **Il n'existe pas de paquet l'hôte pour Catalogue.** l'hôte sert ici d'**hôte Docker** et de **terminaison TLS**. L'authentification reste celle de l'application (SSO Dex) : on **n'utilise pas** le portail SSOwat de l'hôte, sous peine de double authentification.

## C.1 Principe

```
Internet ──HTTPS──> nginx l'hôte (TLS, domaine)
                        │
                        └──HTTP──> 127.0.0.1:8080 (reverse interne de la pile)
                                        ├──> app    (Nuxt)
                                        └──> server (API)
```

## C.2 Préparer le domaine

```bash
yunohost domain add <catalogue.mondomaine.fr>
yunohost domain cert install <catalogue.mondomaine.fr>   # Let's Encrypt
```

## C.3 Déployer la pile

Sur le serveur l'hôte (Debian) :

```bash
curl -fsSL https://get.docker.com | sh
# déposer le dépôt + .env (Partie C), puis :
cd /opt/catalogue
docker compose up -d --build
./deploy/migrer.sh
docker compose run --rm seed
```

**Limitez l'exposition** : le reverse interne ne doit écouter que sur la boucle locale, pour que seul nginx l'hôte puisse l'atteindre.

```dotenv
APP_PORT=127.0.0.1:8080
```

Puis `docker compose up -d reverse`. Vérifiez ensuite :

```bash
docker compose ps --format '{{.Service}}  {{.Ports}}'   # reverse sur 127.0.0.1 uniquement
ss -tlnp | grep 8080                                    # pas d'écoute sur 0.0.0.0
```

Dans le `.env`, les URLs publiques pointent sur le domaine l'hôte :
`PUBLIC_URL`, `BETTER_AUTH_URL`, `TRUSTED_ORIGINS`, `NUXT_PUBLIC_SERVER_BASE_URL` = `https://<catalogue.mondomaine.fr>`.

## C.4 Brancher le reverse proxy l'hôte

l'hôte inclut automatiquement les fichiers de `*/conf.d/` :

```bash
sudoedit /etc/nginx/conf.d/<catalogue.mondomaine.fr>.d/catalogue.conf
```

```nginx
location / {
    proxy_pass          http://127.0.0.1:8080;
    proxy_http_version  1.1;
    proxy_set_header    Host              $host;
    proxy_set_header    X-Real-IP         $remote_addr;
    proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header    X-Forwarded-Proto $scheme;
    proxy_set_header    Upgrade           $http_upgrade;
    proxy_set_header    Connection        "upgrade";

    # Dépôt de pièces jointes : aligné sur la limite du reverse interne (20 Mo).
    client_max_body_size 20m;

    # Les synchronisations GLPI d'un parc étendu dépassent le défaut de 60 s.
    proxy_read_timeout  300s;
    proxy_send_timeout  300s;
}
```

```bash
nginx -t && systemctl reload nginx
```

> Les deux dernières directives comptent : sans elles, un import de pièce jointe un peu gros repart en **413**, et une synchronisation GLPI longue est coupée en **504** — alors qu'elle continue de tourner côté serveur, ce qui donne un diagnostic trompeur.

## C.5 Accès public (SSOwat)

Catalogue gère sa propre authentification : le domaine doit être **servi publiquement**, sans interposer le portail SSOwat. Selon votre configuration, assurez-vous que ce domaine n'est pas rattaché à une application l'hôte protégée, ou déclarez son accès public. **À vérifier sur votre instance** avant mise en production.

## C.6 Rappel OIDC et vérification

- Côté **Dex**, l'URL de redirection doit être `https://<catalogue.mondomaine.fr>/api/auth/oauth2/callback/ouate` (Partie B.1).
- `https://<catalogue.mondomaine.fr>/health` doit répondre `{"status":"ok"}`.
- La page de connexion doit proposer le SSO et rediriger vers Dex.

## C.7 Sauvegardes

⚠️ **`yunohost backup` ne couvre pas les volumes Docker.** La base doit être sauvegardée séparément : c'est le rôle du service `sauvegarde`, qui écrit dans `./backup`. Pensez à inclure ce dossier — et le fichier `.env` — dans la sauvegarde de l'hôte, ou à le recopier hors-site.

---

# Partie D — Après l'installation

Cinq choses à faire **avant** d'avoir besoin d'elles :

1. **Tester une restauration.** `./deploy/sauvegarde.sh` puis restaurez le dump dans une base de test. Une sauvegarde jamais restaurée n'est pas une sauvegarde.
2. **Créer un second administrateur.** Un seul admin est un point de défaillance unique.
3. **Vérifier que le service `sauvegarde` tourne** et écrit bien dans `./backup` — hors du volume Docker, pour survivre à sa destruction. Prévoir une **recopie hors-site** : `backup/` vit sur le même hôte que la base.
4. **Changer le mot de passe du compte administrateur initial** et retirer `SEED_ADMIN_PASSWORD` du `.env` une fois le compte créé.
5. **Vérifier la surface d'exposition** : `docker compose ps --format '{{.Service}}  {{.Ports}}'` ne doit publier que `reverse`.

Voir [Exploitation & MCO](Exploitation-MCO.md) pour la suite : mises à jour, migrations, supervision, sécurité et problèmes connus.

---

**Voir aussi** — [Réglages de l'application](Reglages.md) · [Exploitation & MCO](Exploitation-MCO.md) · [Passation](Passation.md)
