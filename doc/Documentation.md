# Documentation Catalogue

Catalogue est l'outil de **cartographie et de conformité cyber** de la DSI, développé avec **Nuxt 4** (frontend), **ElysiaJS** sur Bun (backend) et **PostgreSQL** (base de données, via Drizzle ORM). L'ensemble est un monorepo Turborepo, sur le même socle technique que Sniff (Slowpoke).

> Les **adresses des systèmes sources** (GLPI, Sniff) sont celles de l'établissement. Les **secrets** (jetons, clés, mots de passe) ne figurent nulle part dans cette documentation : ils vivent dans `.env` et dans l'application.

## Fonctionnement

Catalogue tient à jour le **patrimoine numérique** de l'établissement et le relie aux **démarches réglementaires**. Trois sources alimentent les données :

- **GLPI** — l'inventaire du parc (machines, entités, lieux) est synchronisé automatiquement ; c'est la source de vérité pour le matériel.
- **Sniff / Slowpoke** — les incidents de sécurité sont lus (jamais écrits) pour alimenter la déclaration NIS 2.
- **Saisie et import** — tout le reste : applications, processus, risques, tiers, personnes, mesures de sécurité.

Ces données alimentent ensuite les **cartographies** (applicative, infrastructure, données, humaine), les **démarches** (SMSI/ISO 27001, NIS 2/ReCyF, EBIOS RM) et les **vues de pilotage** (tableau de bord, périmètres).

## Architecture

| Service | Rôle |
|---|---|
| `postgres` | Base de données (95 tables) |
| `migrate` | Applique les migrations Drizzle — **binaire distinct**, lancé à la demande |
| `server` | API ElysiaJS/Bun (routes documentées dans `/openapi`), ordonnanceurs GLPI et NIS 2 |
| `app` | Frontend Nuxt 4 (55 pages) |
| `reverse` | Reverse proxy nginx interne (port 8080) |
| `sauvegarde` | Dump quotidien vérifié vers `./backup` |

Seul `reverse` est exposé. La terminaison TLS se fait **devant**. Les ports `app`, `server` et `postgres` ne doivent jamais être publiés directement.

## Authentification

Deux voies coexistent, portées par **better-auth** :

**SSO OpenID Connect (« le portail », Dex adossé à l'annuaire LDAP)** — la voie normale en production. Elle s'active **dès que `OIDC_CLIENT_ID` est renseigné** ; sans cette variable, le fournisseur n'est pas déclaré et aucune connexion réseau n'est tentée. C'est ce qui permet de développer en local sans dépendre de l'IdP.

**E-mail / mot de passe** — toujours actif côté serveur. Il sert au compte administrateur créé par le *seed* et de secours si le SSO est indisponible. `AUTH_DOMAIN` peut restreindre les adresses acceptées.

### Ce que Dex fournit à l'application

| Élément | Usage dans Catalogue |
|---|---|
| `openid`, `profile`, `email` | identité et adresse du compte |
| `groups` | **dérivation du rôle** : appartenance à `admins` → rôle global `admin`, sinon `user` |
| `federated:id` | identifiant fédéré, utilisé pour construire l'URL de l'avatar (`OIDC_NC_URL`) |

Le **rôle global** (`admin` / `user`) suit l'annuaire **à chaque connexion**, dans les deux sens : entrer dans le groupe `admins` l'accorde, en sortir le retire.

Auparavant il n'était posé qu'à la création du compte, et une personne retirée du groupe restait administratrice indéfiniment. La justification d'alors — préserver les attributions faites dans l'application — confondait deux choses : le rôle global, que l'annuaire connaît, et les **rôles par catégorie**, qu'il ne connaît pas. Ces derniers vivent dans une table distincte et ne sont **jamais** touchés par l'alignement.

> ⚠️ **Un garde-fou, et il est essentiel.** Si le claim `groups` est **absent** de la réponse de Dex — configuration incomplète, portée non accordée — aucun rôle n'est modifié. Sans cette distinction entre « claim absent » et « claim présent sans `admins` », une erreur de configuration rétrograderait tous les administrateurs d'un coup.
>
> Le **compte de secours** n'emprunte pas le SSO : son rôle n'est jamais aligné, et il reste la porte d'entrée si l'alignement se trompe.

### Poser un rôle à la main

Il faut pouvoir nommer administrateur quelqu'un qui n'est pas dans le groupe. Une modification faite depuis *Réglages → Utilisateurs & rôles* est donc une **décision** : elle marque le rôle `manuel`, et **l'annuaire cesse de le réévaluer**.

| Origine | Comportement à la connexion |
|---|---|
| `annuaire` (défaut) | le rôle est réévalué d'après le groupe `admins` |
| `manuel` | le rôle est **conservé**, quel que soit le groupe |

La contrepartie est réelle et assumée : **la révocation par l'annuaire ne s'applique plus à ces comptes**. Trois dispositions l'empêchent de devenir permanente par oubli :

- l'écran des rôles affiche « Posé à la main — non réévalué à la connexion » ;
- un bouton **rend la main à l'annuaire**, et le rôle redevient réévaluable à la connexion suivante ;
- `/api/lacunes` recense ces comptes : *« N comptes administrateurs dont le rôle a été posé à la main »*.

Un verrou sans moyen de le lever serait un verrou définitif ; un verrou invisible serait un oubli.

> Un utilisateur qui se connecte pour la première fois sans être dans `admins` obtient le rôle `user` : il est authentifié mais **n'a accès à rien** tant qu'un administrateur ne lui a pas donné de rôle sur au moins une catégorie. C'est le comportement attendu, pas une panne.

### Sous-chemin et URL de redirection

Quand l'application est servie sous un sous-chemin (`BASE_PATH=/catalogue`), le reverse proxy retire le préfixe avant de transmettre la requête : `BETTER_AUTH_URL` ne porte alors que l'origine, et l'URL de rappel calculée automatiquement perdrait le sous-chemin. `OIDC_REDIRECT_URI` permet de **forcer l'URL complète**, qui doit correspondre exactement à celle déclarée côté Dex.

### Comptes de service

Les clés `sk_…` donnent un accès machine à l'API, avec des *scopes* (`read`, `write`, `delete`, `admin`). Leur gestion est réservée aux administrateurs.

## Rôles & permissions

Contrairement à Sniff, les permissions ne sont **pas globales mais par catégorie** (un catalogue ou un domaine fonctionnel). Un utilisateur possède un rôle sur chaque catégorie séparément ; **sans ligne pour une catégorie, il n'y a aucun accès à cette catégorie**.

| Rôle | Attribution | Droits sur la catégorie |
|---|---|---|
| **admin** (global) | manuelle | tout, sur toutes les catégories, plus l'administration |
| **gestionnaire** | manuelle, par catégorie | lecture + écriture directe |
| **contributeur** | manuelle, par catégorie | lecture ; toute écriture devient une **demande de validation** |
| **lecteur** | manuelle, par catégorie | lecture seule |

Le mécanisme est porté par la garde `can({ category, level })` du middleware. Points notables :

- Le rôle global `admin` **court-circuite** la vérification.
- Les **comptes de service** passent la garde (leur périmètre est défini par leurs scopes).
- Le **contributeur** en écriture ne modifie rien directement : la requête est enregistrée dans `change_request` avec sa méthode, son chemin et son corps, puis rejouée telle quelle après approbation (jeton interne `x-internal-token`). L'import de fichiers lui est fermé.

La liste des catégories vit dans `apps/server/src/utils/categories.ts` — elle en compte une cinquantaine (dont `exigences-rgpd` et `clauses-iso27001`) et c'est elle qui fait foi : toute liste recopiée ici finirait fausse.

## Catalogues

L'application expose **114 catalogues**. **47** sont servis par un **routeur générique** (`crudRouter`) qui fournit d'un coup : liste paginée et filtrable, fiche, création, modification, suppression, import de fichier et **actions groupées**. Les autres ont un routeur dédié quand leur logique le justifie (applications, tiers, postes…).

> ⚠️ **Ordre de montage.** Le greffon d'actions groupées (`lotRoutes`) doit être monté **avant** toute route `/:id`. Monté après, `/lot` serait capturé par le paramètre dynamique et le serveur chercherait une fiche dont l'identifiant est « lot » — 404 systématique. Ce piège a réellement été rencontré.

### Actions groupées

Deux modes de désignation :

- **`ids`** — les lignes cochées à l'écran (cas courant, borné à une page) ;
- **`filtre`** — **tous** les résultats du filtre courant, y compris ceux qui ne sont pas affichés. Le serveur les résout lui-même avec la **même fonction** que la liste : l'utilisateur agit exactement sur ce qu'il a filtré. Transmettre des milliers d'identifiants depuis le navigateur serait par ailleurs irréaliste.

Toute opération dépose un **point d'annulation** en base (`annulation_lot`) et renvoie sa référence. Les points sont purgés au bout de **24 heures** : ils sont volumineux et sans valeur passé le moment où l'on peut encore changer d'avis.

```
PATCH  /api/<catalogue>/lot                  { ids | filtre, valeurs }
DELETE /api/<catalogue>/lot                  { ids | filtre }
GET    /api/<catalogue>/lot/compte?<filtre>  → { total }
POST   /api/<catalogue>/lot/annuler/:id      → rejoue l'état antérieur
```

## Import et export de fichiers

**Import** — chaque catalogue accepte un fichier tabulaire (`POST /api/<catalogue>/import`). Trois comportements à connaître :

- **Rapprochement par clé naturelle** (le nom, le plus souvent) : une ligne déjà présente est mise à jour, pas dupliquée.
- **Simulation par défaut** (`dryRun: true`). L'appel renvoie ce qui *serait* créé, mis à jour ou rejeté, sans rien écrire. L'interface montre ce compte avant de demander confirmation — importer 400 lignes sans savoir ce qu'elles vont produire est le meilleur moyen de polluer un catalogue.
- **Résolution des références par nom** : une colonne qui désigne un pôle, un responsable ou une composante est appariée par libellé, et **créée à la volée** si elle n'existe pas (voir `importRefs.ts`).

Limite connue : les colonnes multi-valuées (listes d'énumérations) ne sont pas gérées à l'import.

**Export** — CSV et ODS (LibreOffice). En mode paginé, l'export récupère **l'ensemble filtré**, pas seulement la page affichée : exporter 50 lignes en croyant en avoir 1 200 serait un piège silencieux.

## Ordonnanceurs

**Huit** traitements périodiques démarrent avec le serveur ; leur activité est visible dans les journaux.

| Ordonnanceur | Rythme | Rôle | Pour le couper |
|---|---|---|---|
| Échéances | une fois par jour à heure fixe (`ALERTS_DISPATCH_HOUR`, 8 h par défaut) | diffusion des dates qui approchent : expiration d'un accès VPN, fin de vie d'une technologie, fin de contrat d'un tiers, fin de support d'une application, revue d'homologation échue, réexamen d'une analyse d'impact RGPD (art. 35.11), revue périodique d'un fournisseur (les fournisseurs critiques NIS 2 sont signalés) | `ALERTS_DISPATCH_DISABLED` |
| GLPI | vérification toutes les 15 min, synchronisation à la fréquence configurée | reprise de l'inventaire | `GLPI_SYNC_DISABLED` |
| HarfangLab | idem | agents, moteurs, jeux de règles, rattachement des agents à leur unité | `HARFANGLAB_SYNC_DISABLED` |
| LDAP | idem | annuaire des personnes et des unités | `LDAP_SYNC_DISABLED` |
| Audit de surface | idem | relevé du moteur externe | `AUDIT_SYNC_DISABLED` |
| Notifications NIS 2 | toutes les 30 min | échéances 24 h / 72 h / 1 mois, import des incidents | `NIS2_AUTO_NOTIF_DISABLED` |
| Relevés | vérification toutes les heures, relevé des entrées de plus de 24 h | certificats TLS et sites exposés | `RELEVES_DISABLED` |
| Domaines surveillés | vérification toutes les 6 h, relevé hebdomadaire | découverte par Certificate Transparency et transfert de zone | `DOMAINES_RELEVE_DISABLED` |

Chaque variable se pose à `true` dans le `.env` ; aucune n'est nécessaire en exploitation normale.

> ⚠️ **Une synchronisation restée « en cours » expirait jamais, et bloquait l'ordonnanceur pour toujours.** Un serveur arrêté au mauvais moment laisse le statut `en_cours` en base ; la condition « ne pas lancer si une synchronisation tourne » devenait alors définitivement vraie, et plus rien ne partait — sans qu'aucune erreur n'apparaisse, puisque rien n'échouait. Au-delà de **deux heures**, une synchronisation est désormais tenue pour morte et une nouvelle peut partir. Constaté sur GLPI et sur l'audit de surface, corrigé pour les deux et pour tous les connecteurs (`utils/syncEtat.ts`).

## Journal d'audit

Toute mutation aboutie (`POST`, `PATCH`, `DELETE`) écrit une ligne : entité, identifiant, action, auteur, horodatage, et pour une modification le **différentiel champ par champ** (valeur avant → valeur après).

Deux règles qui ont leur importance :

- **Rien n'est journalisé si la requête a échoué.** Le hook s'exécute après *toute* réponse, y compris les erreurs ; sans ce garde-fou, une validation refusée ou une fiche introuvable produisait une entrée pour une modification qui n'avait jamais eu lieu — un journal faux, et c'est la pièce qu'on produit en audit de conformité.
- **Une action groupée produit UNE entrée**, sans identifiant de fiche : il n'y en a pas une seule. Le nombre de lignes touchées figure dans la notification associée.

La suppression enregistre l'état de la fiche avant effacement : la trace porte de quoi identifier ce qui a disparu, et non un identifiant devenu orphelin.

Les écritures d'un **contributeur** ne sont pas journalisées au dépôt de la demande, mais à son approbation — c'est là qu'elles prennent effet.

## Notifications et webhooks

Un même événement, de clé `<entite>:<action>` (`applications:update`, `serveurs:delete`…), alimente deux canaux : les **notifications Web Push** et les **webhooks sortants**. Chacun filtre sur les clés auxquelles il est abonné.

### Mise en forme des notifications

Le titre porte l'action, le corps ce qui a changé :

| Titre | Corps |
|---|---|
| Création | Annuaire Interne |
| Modification | Annuaire Interne — Criticité |
| Modification | Annuaire Interne — 5 champs modifiés |
| Suppression groupée | 6 applications |

Le nom est cherché dans les champs qui font office de titre (`nom`, `hostname`, `intitule`, `reference`, `libelle`, `email`) ; prénom et nom sont réunis pour une personne. Les champs modifiés sont listés jusqu'à trois, comptés au-delà — une notification qui déborde n'est plus lue. Aucun identifiant technique n'apparaît : il n'apprend rien à qui la reçoit.

### Règles

- **Une seule notification par requête**, donc une seule pour une action groupée quel que soit le nombre de lignes.
- **Aucune notification si l'opération a échoué** (même garde-fou que le journal).
- Les échecs d'envoi sont journalisés côté serveur (`🔕 push en échec`). Un abonnement expiré (404/410) est purgé silencieusement — c'est le comportement normal d'un navigateur désabonné.
- `POST /api/push/test` envoie une notification de vérification à ses propres abonnements : c'est ce qui permet de distinguer « le serveur n'a rien envoyé » de « le poste ne l'affiche pas ».

Les **webhooks** reçoivent la charge utile complète en JSON, avec un en-tête `x-webhook-secret` si un secret est défini.

## Connecteur GLPI

Synchronisation **en lecture** de l'inventaire depuis `https://glpi.example.org`, configurée dans `/glpi` (admin uniquement). Un ordonnanceur la relance **toutes les 15 minutes**.

Ce qui est repris : machines (avec système d'exploitation **et version**), entités sur **quatre** niveaux (composantes → départements → services → **pôles**), lieux (arborescence complète), et les **deux groupes GLPI**. Les machines sont **classées** automatiquement (serveur, poste de travail, appareil mobile, IoT, matériel industriel, équipement réseau) ; celles qui résistent restent « à classer » et sont proposées à l'arbitrage humain.

> La **version du système** est indispensable : sans elle, ni macOS ni les releases Windows ne peuvent être datés (voir *Fin de vie* ci-dessous).

**Les deux groupes sont repris, sans interprétation.** GLPI en porte deux, indépendants, et ne leur impose aucune signification :

| Champ GLPI | Option de recherche | Usage à l'l'établissement |
|---|---|---|
| `groups_id` — *Groupe* | 71 | **marque les machines critiques** |
| `groups_id_tech` — *Groupe technique* | 49 | équipe en charge, quand il est renseigné |

Le sens du groupe 71 est une **convention d'établissement**, pas une propriété de GLPI : un autre site s'en servirait pour désigner un propriétaire. C'est pourquoi la valeur est stockée brute et n'est traduite nulle part en dur. Les groupes GLPI étant arborescents, le **chemin complet** est conservé, comme pour l'entité et le lieu.

Dans la file « à classer », les deux s'affichent avec leurs libellés GLPI d'origine, le groupe technique seulement s'il diffère du premier. Ces valeurs restent sur la table de transit `glpi_machine` : le rattachement organisationnel des machines continue d'être dérivé de l'**entité**, qui est la source structurée.

> **Le quatrième niveau manquait.** GLPI porte des entités sur quatre niveaux — la direction du numérique y est un *service*, et ses pôles en sont les enfants — mais la synchronisation s'arrêtait au troisième. La table des pôles restait donc vide, et la liste de choix « Pôle » des formulaires l'était aussi, alors que les pôles existaient bien dans l'inventaire. Un quatrième segment rencontré **sous un service** crée désormais le pôle correspondant, marqué comme venant de GLPI.

### Ce qui identifie une machine

Le rapprochement machine ↔ fiche se fait **par le nom**, et cette clé est faillible. Deux garde-fous, tous deux nés de l'inventaire réel :

**Les noms qui n'identifient rien.** Certains agents renvoient un nom par défaut — `localhost` (trois machines, dans deux entités), `macOS`, `unknown`. Ce ne sont pas des noms. S'en servir comme clé rangerait trois machines derrière une seule fiche, et deux disparaîtraient du catalogue avec leur système, leur emplacement et leur criticité. Ces machines partent donc en file **« à classer »**, où la cellule tranche — en corrigeant le nom dans GLPI, de préférence.

**Le numéro de série** (option de recherche 5) est repris depuis août 2026. Deux entrées qui le partagent sont la **même machine physique** : c'est une preuve, là où un nom commun n'est qu'un indice. Les valeurs génériques du BIOS (`To be filled by O.E.M.`, `Default string`…) sont écartées : identiques sur des centaines de machines, elles feraient passer un parc entier pour un doublon.

### Doublons d'inventaire

Le Catalogue tient **une fiche par machine**. Quand plusieurs entrées GLPI désignent le même matériel, elles se rangent derrière la même fiche — ce qui est juste, et laisse dans GLPI des entrées à purger.

Mesure d'août 2026 : **219 entrées en doublon sur 8 859**, dont 180 noms dupliqués à l'intérieur d'une **seule** entité (machine réinventoriée) contre 14 sur plusieurs — ces derniers portant la marque d'une machine ayant changé d'entité.

Ce que le Catalogue en fait :

- le compte rendu de synchronisation annonce « N entrées en doublon derrière M fiches » — l'écart était auparavant absorbé en silence, et personne n'aurait vu s'il doublait ;
- un panneau de la page **Connecteur GLPI** donne la liste de purge, en séparant les doublons **certains** (même numéro de série) des **probables** (même nom seulement). La distinction évite de faire supprimer des machines réelles.

### Collision de nom

`serveur.hostname`, `poste_travail.nom`, `iot.nom` et `appareil_mobile.nom` sont **uniques**. Quand GLPI renomme une machine vers un nom qu'une autre fiche détient déjà, l'écriture est refusée par la base.

Le renommage est alors **omis** — tout le reste (système, version, rattachements) est mis à jour — et le conflit est compté puis nommé dans les journaux. On ne vole pas le nom, on ne fusionne pas, on ne supprime pas : chaque fiche porte peut-être de l'enrichissement cyber, et l'arbitrage revient à la cellule.

> Chaque machine est traitée **isolément** : un échec est compté et journalisé, il n'interrompt plus le parcours. Une seule collision arrêtait auparavant la synchronisation des 8 800 machines.

### Criticité portée par un groupe

La convention « ce groupe désigne des machines critiques » se **déclare** dans les réglages du connecteur, sous forme d'une table `groupe GLPI → criticité`. La synchronisation applique alors cette criticité aux serveurs, postes, appareils mobiles et objets connectés correspondants. Rien n'est écrit en dur : un groupe se renomme sans livrer une version.

Trois précautions, qui sont le cœur du dispositif :

- **On choisit dans une liste**, pas dans un champ libre : les groupes proposés sont ceux réellement rencontrés dans l'inventaire, avec leur nombre de machines. Une faute de frappe produirait une règle silencieusement inopérante.
- Le rapprochement accepte le **chemin complet** (`superadmin > critique`) comme le **seul nom de nœud** (`critique`), insensible à la casse et aux accents. Il reste **exact** sur les segments : « critique-bis » est un autre groupe.
- **Déclarer un nœud couvre tout son sous-arbre.** Une règle sur `critique` marque aussi `critique > Niveau 1 > Applicatif`. Sans cela, une règle n'aurait marqué que les 744 machines rattachées exactement au nœud, sur les 793 du sous-arbre — les 49 autres passant à travers **en silence**.
- **Une machine peut appartenir à plusieurs groupes** ; chacun est examiné séparément.
- **La règle la plus précise l'emporte**, puis la plus grave. C'est ce qui permet de traiter une branche autrement (`critique > Niveau 3` en « importante ») sans renoncer à la règle générale.
- Une machine qui **sort** du groupe **n'est jamais déclassée** automatiquement. Rétrograder une criticité sans décision humaine est une perte qu'on ne remarque qu'au moment où elle compte ; le retrait se fait à la main. Quand plusieurs règles s'appliquent, **la plus grave l'emporte**.

Contrôle : `bun run apps/server/test/verif-glpi-criticite.ts`.

## Connecteur HarfangLab (EDR)

Lecture seule de la console EDR, sur le même modèle que GLPI : réglages dans `/harfanglab` (admin), jeton **chiffré en base**, statut et date du dernier passage visibles. **Rien n'est jamais écrit dans HarfangLab.**

> L'en-tête d'authentification est `Authorization: Token <jeton>`. Le swagger de l'éditeur déclare le *nom* de l'en-tête mais **jamais le préfixe de la valeur** : ce format vient d'une vérification sur l'instance de l'établissement, pas de la documentation.
>
> Le jeton est **débarrassé des espaces et des sauts de ligne** avant usage. Un jeton copié depuis la console en rapporte souvent un ; HarfangLab répondait alors `401 Invalid token header. Token string should not contain spaces.` — une panne d'authentification dont la cause était invisible dans l'écran de réglages.

### Ce qui est repris

| Objet | Route | Ce qu'on en garde |
|---|---|---|
| **Flotte d'agents** | `GET /api/data/endpoint/Agent/` | identifiant, nom d'hôte, **numéro de série**, adresse matérielle, état, dernière remontée, version, système, politique |
| **État des moteurs** | *(inclus ci-dessus)* | `yara_mode`, `sigma_mode`, `ioc_mode`, `correlation_mode`, `driverblock_mode`, jeux de règles rattachés |
| **Révisions chargées** | *(inclus ci-dessus)* | les 7 compteurs `effective_*_revision` — un agent en retard sur sa politique se repère ainsi |
| **Listes blanches** | `GET /api/data/threat_intelligence/WhitelistRule/` | critères, cible, règle visée, commentaire, activation, **date de création**, expiration |

`Agent.policy` étant la politique **complète** et non un identifiant, un seul appel livre la flotte *et* l'état des moteurs par machine. C'est ce qui rend ce connecteur peu coûteux.

**Ce qui n'est délibérément PAS repris** : les alertes et détections (elles vivent dans Sniff, qui en fait des incidents), les règles elles-mêmes (seuls leurs jeux et révisions comptent ici), la télémétrie, les utilisateurs et les vulnérabilités. Ce connecteur sert à établir deux écarts, pas à dupliquer la console.

### Couverture du parc critique

L'écart que ce connecteur doit rendre visible : **les machines marquées critiques par leur groupe GLPI sur lesquelles aucun agent ne remonte**. L'inverse — un agent hors du groupe critique — est une information, pas une alerte.

Le rapprochement machine ↔ agent suit la même discipline que partout ici :

1. **numéro de série** — une preuve, une fois écartées les valeurs génériques du BIOS ;
2. **nom d'hôte** — un indice, et seulement s'il est unique **des deux côtés** ;
3. tout le reste est **ambigu** : compté, affiché, jamais tranché.

> Le **taux d'ambiguïté est affiché avec l'écart**, et c'est volontaire : c'est lui qui dit ce que valent les autres chiffres. Un rapprochement faux est pire qu'une absence de rapprochement, parce qu'il produit un chiffre — et qu'un chiffre est cru.

La date du dernier passage réussi accompagne toujours le résultat : sans elle, **une couverture parfaite et un connecteur en panne se ressemblent**.

### Tous les chiffres, pas seulement l'écart

« 793 machines critiques, 572 couvertes » laissait sans réponse deux questions que l'on se pose aussitôt : *et les agents qui ne sont pas sur une machine critique ?* et *ceux qui ne sont dans GLPI nulle part ?* La ventilation partitionne désormais **la totalité** des agents, en cas disjoints dont la somme se vérifie :

| Cas | Ce que ça veut dire |
|---|---|
| agent sur machine critique | la couverture attendue |
| agent sur machine GLPI **non critique** | protégé sans l'être au titre de la criticité — une information, pas un écart |
| agent **absent de GLPI** | aucune machine d'inventaire ne lui correspond : soit elle n'y est pas, soit le rapprochement a échoué |
| machine critique **sans agent** | l'écart |
| rapprochement ambigu | compté à part, jamais tranché |

Les chiffres publiés jusqu'ici n'ont pas bougé : le parc critique est rapproché **en premier**, et seuls les agents restants sont confrontés au reste de l'inventaire.

### Rattacher les agents à leur unité

Les agents portent l'unité déclarée dans la console (`additional_info.additional_info1`, par exemple `InfraProximite`). Ce libellé est **rapproché des unités du Catalogue** — établissement, composante, département, service, pôle — pour que la couverture EDR se lise par unité comme le reste de la cartographie.

Le rapprochement est **exact et unique** : une entité qui correspond à deux unités, ou à aucune, n'est **pas** rattachée d'office. Elle attend une décision, prise une fois dans les réglages du connecteur, et conservée — une entité peut ainsi être déclarée **avant** d'exister dans la console.

> Trois pôles de la direction du numérique (développement, systèmes, métiers) relèvent du seul service « Systèmes » côté GLPI. Le rattachement les y ramène, sans quoi les trois tiers du parc seraient comptés hors unité.

### État des moteurs

Un instantané par politique à chaque synchronisation, **comparé au précédent**. Tout changement est signalé : un moteur qui s'éteint ne produit pas d'erreur, il produit du silence.

> ⚠️ **Les modes sont des entiers 0..3 dont la signification n'est documentée nulle part** chez l'éditeur — ni énumération, ni description dans le swagger. L'application affiche donc la valeur brute et le changement (« passé de 2 à 0 »), **sans jamais traduire en « activé / désactivé »**. Traduire avant confirmation de HarfangLab reviendrait à inventer une information de sécurité. *Question ouverte auprès de l'éditeur.*
>
> Un premier relevé porte `null` en guise de comparaison, ce qui se distingue d'une liste vide — laquelle signifie « comparé, rien n'a changé ».

## Contenu des moteurs de détection

Les listes blanches disent ce que l'EDR **ne regarde plus**. Ces pages disent ce qu'il **regarde** — et c'est la moitié qui manquait pour analyser la couverture sans ouvrir la console.

Une page par moteur (`/edr/yara`, `/edr/sigma`, `/edr/ioc`, `/edr/correlation`, `/edr/driverblock`) plus `/edr/rulesets`. Les routes sont relevées dans le swagger de l'instance :

| Moteur | Ressource HarfangLab | Ce qu'on stocke |
|---|---|---|
| **YARA** | `YaraFile` | le **fichier `.yar` entier** |
| **Sigma** | `SigmaRule` | la règle YAML |
| **Corrélation** | `CorrelationRule` | la définition de la règle |
| **IOC** | `IOCRule` | type et valeur de l'indicateur |
| **Driver blocklist** | `DriverBlocklist` | type et valeur du pilote bloqué |
| **Jeux de règles** | `Ruleset` | compteurs par état, et **politiques rattachées** |

> Le moteur YARA n'expose **pas** de règle à l'unité : la ressource est `YaraFile`, et un fichier en porte plusieurs. Compter les lignes de la page YARA ne donne donc pas un nombre de règles. La page le dit.
>
> `Ruleset.engine` vaut `correlation | ioc | sigma | yara` : les **driver blocklists n'ont pas de jeu de règles** et vivent sur leur propre famille de routes. C'est une particularité de l'outil, pas un oubli.

### Ni échéance, ni revue — et c'est délibéré

Une liste blanche est une dérogation : elle se périme. Une règle de détection est la couverture elle-même. Lui coller une date de revue reviendrait à traiter la protection comme une exception à réexaminer, et noierait les vraies échéances sous des milliers de lignes qui n'en appellent aucune.

Ce qu'on veut voir ici est d'un autre ordre :

- **un jeu de règles rattaché à aucune politique** — du travail soigneusement constitué qui ne protège personne, et que rien ne signale dans la console ;
- **ce que l'établissement a écrit** (`provided_by_hlab = false`) par opposition à ce que l'éditeur fournit ;
- **le corps des règles, cherchable** : « quelle règle mentionne `mimikatz` ? » est exactement l'usage qui justifie d'avoir centralisé les contenus.

### Deux précautions de lecture

Les corps de règles ne sont pas lus au hasard : le swagger donne le schéma exact de `Ruleset` et les paramètres de `DriverBlocklist`, mais les noms de champs des règles varient d'un moteur et d'une version à l'autre. Le connecteur lit donc plusieurs noms plausibles et **conserve l'enregistrement complet** dans une colonne `brut` — sans quoi un champ non prévu disparaîtrait sans que personne s'en aperçoive.

L'API expose `state`, `global_state` **et** `effective_state` sans dire lequel prime. Les trois sont conservés ; l'interface affiche l'« effectif », le seul dont le nom affirme quelque chose.

Enfin, **l'échec d'un moteur n'emporte pas les quatre autres** : le moteur en échec garde son état précédent et le message de synchronisation le nomme. Un relevé partiel annoncé vaut mieux qu'un relevé partiel qui se prend pour complet.

## Listes blanches

Chaque liste blanche est un **angle mort volontaire**. Sans inventaire ni date de revue, la décision devient permanente par simple oubli, et plus personne ne sait ce que l'outil ne regarde plus.

**Deux sources, un seul inventaire** (page `/whitelists`) :

- **HarfangLab** porte la règle telle que l'EDR l'applique ;
- **Sniff** porte la décision prise lors d'un incident, avec son **motif obligatoire** et l'incident qui la justifie.

Ce sont souvent les mêmes objets vus de deux côtés. Les afficher séparément donnerait un inventaire faux et surtout ferait perdre le lien avec l'incident — la seule chose qui explique *pourquoi* la règle existe.

### La source est Sniff, plus l'EDR directement

Le Catalogue n'appelle plus `WhitelistRule` chez HarfangLab. **Sniff lit l'EDR et apparie les règles aux exclusions**, y compris à la main, et le Catalogue lit son inventaire (`GET /api/harfanglab/regles`).

La raison n'est pas d'économiser un appel. Le rapprochement est un **jugement** : le faire deux fois avec deux algorithmes garantit deux réponses, et le jour où elles divergent personne ne sait laquelle croire. Le Catalogue importe la décision au lieu de la deviner — l'heuristique « preuve / indice / ambiguïté » a été retirée, et `certitudeRapprochement` vaut désormais `certain` ou rien.

Sniff rend en outre deux choses que le Catalogue ne peut pas obtenir seul : **`presente`** (la règle est-elle encore dans l'EDR) et l'appariement lui-même, avec la date de revue qu'il porte.

> Le Catalogue continue d'appeler HarfangLab pour ce que Sniff ne regarde pas : les agents, l'état des moteurs, les jeux de règles et le contenu des règles de détection.

### Qui a une échéance, et pourquoi les autres n'en ont pas

**Relevé du 27 août 2026 : 4797 règles dans l'instance, dont 68 écrites par l'établissement.** Donner une échéance à toutes produirait des milliers de lignes perpétuellement échues, impossibles à solder — un compteur qui ne peut pas descendre est un compteur qu'on cesse de lire, et il noierait les 68 qui appellent vraiment une décision.

Quatre cas n'ont pas d'échéance, et **le motif est toujours rendu** : une date vide toute seule se lit comme un oubli, avec son motif elle se lit comme une décision.

| `sansEcheance` | Ce que ça veut dire |
|---|---|
| `editeur` | Livrée avec le produit (`provided_by_hlab`). Lui donner une échéance reviendrait à demander de justifier périodiquement le produit qu'on achète. |
| `disparue` | Retirée de l'EDR : l'angle mort est refermé, il n'y a plus rien à réexaminer. |
| `technique` | Étiquetée comme pièce de configuration par un marqueur déclaré. |
| `sans_date` | L'EDR n'a pas rendu de date de création. Retomber sur la date d'import donnerait une échéance fausse **et** rassurante. |
| `portee_par_sniff` | Appariée à un incident : la date naît là où naît la décision, c'est `exclusion.reviewDate` qui fait foi. |

Le filtre **Origine** est actif par défaut sur « écrites par l'établissement » : sans lui, le travail réel de la cellule est noyé sous les règles du produit.

> ⚠️ **Le tag ne classe rien aujourd'hui, et c'est mesuré.** Sur les 4797 règles, `WhitelistRule` n'expose **aucun** champ d'étiquettes — ni `tags`, ni `labels`, ni `categories`, ni `category`. Le mécanisme de marqueurs déclarés reste en place, il ne coûte rien et fonctionnera si l'éditeur en ajoute un, mais le tri réel se fait sur l'origine.

Une règle **disparue de l'EDR tout en portant encore une exclusion active** est un cas à part : une détection est revenue sans que personne l'ait décidé. `disparuesEncoreExclues` l'isole — mais comme un **renvoi vers Sniff**, pas comme un compteur propre : lever ce cas veut dire révoquer l'exclusion ou reposer la règle, et cette décision se prend à côté de l'incident qui l'a motivée.

Il n'est délibérément **pas** élargi aux règles disparues *sans* exclusion : celles-là sont classées `disparue`, l'angle mort est refermé, et il n'y a d'action pour personne. Un compteur sans action associée est la définition d'un compteur qu'on cesse de lire.

### Validité

**Un an à compter de la création dans l'outil d'origine — jamais depuis l'import.** Une règle posée il y a trois ans est échue depuis deux ans et le dit dès le premier inventaire : c'est précisément ce que cet inventaire sert à révéler.

Une **prolongation** repose la date de revue à aujourd'hui et redémarre le compteur. Le **nombre de prolongations est conservé** et affiché à partir de deux : une règle prolongée cinq fois n'est plus une mesure temporaire, et cela doit se voir.

### La bascule d'autorité, immédiate

Sniff pousse deux événements signés vers `POST /api/sniff/evenements` :

| Événement | Effet |
|---|---|
| `exclusion_appariee` | l'autorité passe à Sniff : `exclusion.reviewDate` devient l'échéance, la date locale cesse d'être entretenue, « Prolonger » disparaît |
| `exclusion_detachee` | l'autorité revient au Catalogue : l'échéance repart de la date de création |
| `revue_liste_blanche_proche` / `…_depassee` | la date de la revue devient celle de la règle, même mécanique |

**Une règle sans incident a désormais une revue chez Sniff**, isolée. Jusqu'ici la date naissait au Catalogue dans ce cas ; elle naît maintenant là où se prend la décision, et l'arbitrage est écrit une seule fois (`utils/whitelistsEcheance.ts`, repris par le relevé périodique comme par les événements) :

1. l'**exclusion** d'un incident prime — Sniff bascule alors sa revue isolée en « remplacée » ;
2. à défaut, la **revue isolée** fait foi ;
3. sans l'une ni l'autre, le Catalogue garde la main et date la règle lui-même.

L'`origine` accompagne chaque date (`exclusion` ou `revue`) : les deux ne se corrigent pas au même endroit chez Sniff, et envoyer quelqu'un sur la mauvaise fiche fait perdre la correction.

**Le détachement compte autant que l'appariement.** Ne traiter que le premier laisserait une règle sans échéance nulle part — l'inverse exact du problème que le mécanisme résout.

L'authentification se fait par **signature HMAC-SHA256** (`X-Slowpoke-Signature`), pas par session : l'appelant est une machine sans compte ici. Le secret se saisit dans les réglages du connecteur Sniff et vit chiffré en base. **Sans secret configuré, la route refuse** — accepter une charge non signée laisserait modifier des échéances réglementaires par une simple requête HTTP.

Le relevé périodique reste le filet : une livraison manquée se rattrape au passage suivant. Le webhook ne fait que supprimer la journée pendant laquelle deux dates coexisteraient.

### Qui prolonge quoi

La date de revue naît **là où naît la décision**. Deux applications qui prolongeraient la même règle produiraient deux dates, et le jour où elles divergeraient personne ne saurait laquelle fait foi.

| Liste blanche | Qui prolonge | Ce que fait l'autre |
|---|---|---|
| **Appariée à une exclusion** | **Sniff** | Le Catalogue l'affiche, l'alerte, et renvoie vers l'incident |
| **Écrite par l'établissement, non appariée** | **le Catalogue** | Personne d'autre ne la porte |
| **Sans échéance** (éditeur, disparue, technique, sans date) | personne | Il n'y a rien à prolonger |

L'appariement peut survenir **après** que le Catalogue a posé sa date — Sniff permet d'apparier à la main. L'autorité bascule alors immédiatement : dès que `exclusion` existe, c'est `exclusion.reviewDate` qui est affichée et alertée, la date locale cesse d'être entretenue, et le bouton disparaît. Sans cette préséance écrite, deux dates coexisteraient sur la même règle sans qu'aucune fasse foi.

Une exclusion née d'un incident se prolonge dans le dossier qui la motive, à côté de son motif et de sa portée. Le bouton du Catalogue disparaît alors — remplacé par la mention de l'endroit où agir, plutôt qu'un espace vide qui ressemblerait à un droit manquant. L'API refuse la prolongation avec un `409` qui nomme l'incident.

À l'inverse, une liste blanche **sans incident** n'est portée par personne d'autre : la refuser ici la laisserait échue sans recours. C'est le Catalogue qui la prolonge.

L'échéance est **calculée, jamais stockée** — une colonne se désynchroniserait dès la première prolongation. Elle alimente le moteur d'échéances (`whitelist_revue`), au même titre qu'une fin de contrat.

## Connecteur Slowpoke

Lecture seule des incidents de Sniff (`https://sniff.example.org`), via une **clé de service** (`sk_…`, scope lecture). Elle sert aussi au volet « Incidents » des fiches d'actifs (voir ci-dessous). Les incidents de gravité **critique ou élevée** créent automatiquement une **notification NIS 2** en brouillon, avec ses trois échéances réglementaires (24 h, 72 h, 1 mois). L'import manuel d'un incident précis est également possible.

### Incidents d'un actif

Les fiches serveur, poste de travail, appareil mobile et objet connecté portent un volet **Incidents de sécurité**, alimenté par Sniff.

Le rapprochement passe par l'**identifiant GLPI** : les deux applications synchronisent le même inventaire, `glpi_machine.glpi_id` ici et `incident_machine.glpi_id` là-bas désignent la même machine. Aucune n'a besoin des identifiants internes de l'autre.

**Le volet distingue quatre situations**, et cette distinction est tout l'intérêt du dispositif :

| État | Ce que ça veut dire |
|---|---|
| **Aucun incident** (vert) | la machine est reconnue dans l'inventaire, et Sniff ne lui rattache rien |
| **Rapprochement impossible** (ambre) | l'actif n'a pas d'identifiant GLPI — saisi à la main, ou jamais vu par la synchronisation |
| Connecteur inactif | on ne sait rien, faute de liaison |
| Erreur | Sniff a répondu, mais mal ; le motif est affiché |

**Dans les listes**, une pastille rouge « Incident » signale les machines concernées. Elle repose sur un relevé unique des incidents ouverts (mémorisé deux minutes) plutôt que sur un appel par ligne — cinquante lignes ne peuvent pas déclencher cinquante appels. Son absence ne prouve rien : machine hors inventaire, ou Sniff injoignable. **La fiche fait foi, la liste est une commodité.**

Le deuxième cas n'est pas une subtilité : une machine **saisie librement dans Sniff** — ce que fait le prestataire SOC pour tout ce que l'inventaire ne connaît pas — n'a pas d'identifiant GLPI et ne ressortira jamais de cette recherche. Afficher un volet vide sans réserve laisserait croire l'actif indemne. **Une liste vide ne vaut « aucun incident » que dans le premier cas.**

### La résolution, et ce qu'elle ne dit pas

Un incident clos porte une **résolution**, dont le vocabulaire appartient à Sniff. Le Catalogue l'**affiche** et ne la **compte** pas : aucun décompte d'ici ne classe un incident d'après sa résolution.

| Valeur | Ce que ça veut dire |
|---|---|
| `true_positive` | menace réelle, traitée |
| `risk_accepted` | réelle, **non corrigée** : le risque est assumé, et c'est la décision qui est tracée |
| `false_positive` | la détection était fausse |
| `benign` | détection juste, impact nul |
| `legitimate` | activité voulue et autorisée ; appelle une liste blanche |
| `duplicate` | même fait, compté ailleurs |
| *(absente)* | **la cellule n'a posé aucune résolution**, y compris sur une fiche close |

Trois confusions que les libellés seuls ne préviennent pas : `risk_accepted` n'est pas `true_positive` — rien n'a été corrigé ; `benign` n'est pas `false_positive` — l'un appelle une correction de règle, l'autre non, et les additionner masque les deux ; **une résolution absente ne vaut pas « bénin »**. Ce dernier cas se produit quand le SOC clôt son ticket pour un motif qui ne conclut rien ici : le **motif brut** est alors affiché à côté (`motifClotureSoc`), tel que le SOC l'a écrit.

Les **libellés affichés viennent de Sniff**, relayés par leur point d'entrée `/api/lectures` et non recopiés ici. Une table recopiée diverge le jour d'un renommage, et l'écran affiche alors une étiquette plausible et fausse. Si le relais échoue, la valeur brute s'affiche et l'infobulle le dit — jamais de traduction au jugé.

## Certificats TLS

C'était le **trou du moteur d'échéances**, et le plus coûteux : la seule catégorie dont le dépassement ne dégrade pas le service mais l'**arrête**. Tant qu'elle manquait, toute réponse « voici les alertes en cours » omettait en silence la panne la plus prévisible qui soit.

### La date est lue, jamais saisie

Le Catalogue se connecte au service et relève le certificat qu'il présente réellement. Une date d'expiration recopiée à la main est fausse dès le premier renouvellement — et **une date fausse est pire qu'une absence de date, parce qu'elle rassure**.

Deux détails du scan qui ont leur importance :

- **SNI est envoyé.** Sans lui, un hôte mutualisé présente son certificat par défaut et on relèverait l'échéance d'un tout autre service. Exception faite d'une cible désignée par son adresse IP, où le protocole l'interdit.
- **La validation n'est pas exigée pour se connecter.** On ne se connecte pas pour échanger des données mais pour *lire* : refuser la connexion sur un certificat expiré ou auto-signé empêcherait précisément de constater qu'il l'est. La validation est faite séparément et rapportée à part.

Un hôte momentanément injoignable **n'efface pas** le relevé précédent : sans cette précaution, une coupure réseau ferait disparaître les échéances connues.

### Trois alertes, deux natures

| Alerte | Nature | Échéance |
|---|---|---|
| `certificat_expiration` | échéance | la date du certificat |
| `certificat_invalide` | **état** — chaîne incomplète, racine inconnue, auto-signé | **aucune**, et c'est volontaire |

Pour l'utilisateur, une chaîne incomplète produit le même incident qu'une expiration. Mais elle n'a pas de date : lui en inventer une la transformerait en faux compte à rebours. Un certificat déjà expiré n'est pas compté deux fois.

### Alimenter l'inventaire

**À l'unité** — hôte, port, libellé, responsable. **Par liste** — collée ou importée, une entrée par ligne :

```
ent.example.org
https://moodle.example.org
mail.example.org:993 ; Messagerie
# les lignes commençant par # sont ignorées
```

Noms d'hôte, `hote:port` et URL complètes sont acceptés indifféremment ; un `;` ou une `,` fournit le libellé, de quoi coller un extrait de tableur sans le retravailler. Les doublons — casse et port explicite compris — ne créent qu'une entrée.

**L'import simule d'abord**, comme tous les imports du Catalogue : il annonce ce qui serait créé avant d'écrire. Ici s'ajoute une raison propre au scan — valider 300 lignes sans les avoir vues lancerait 300 connexions sortantes.

> Les **lignes écartées sont montrées**, pas ignorées en silence. Une ligne de titre de tableur ne doit jamais devenir une cible fantôme éternellement « injoignable », et une ligne rejetée sans le dire ferait manquer un certificat sans que personne ne le sache.

Les scans partent par paquets de huit : quelques centaines de connexions TLS simultanées ressemblent à un balayage et se font jeter par les pare-feu, y compris ceux de l'établissement.

### Découvrir les sites que personne n'a déclarés

Un inventaire alimenté à la main ne contient que ce dont on se souvient. Deux sources le complètent, page **Audit de surface → Domaines**, où l'on déclare autant de domaines qu'on veut.

**Certificate Transparency** — tout certificat publiquement émis est inscrit dans des journaux ouverts. Les lire pour `example.org` donne les noms pour lesquels un certificat existe, y compris ceux qu'aucune équipe n'a signalés. C'est une **lecture de journaux publics** : aucune requête n'est envoyée aux sites découverts, et l'établissement n'y apparaît pas.

**Transfert de zone (AXFR)** — facultatif, et c'est la seule source des sous-domaines servis par un **certificat joker**. Un `*.example.org` couvre mille noms sans qu'aucun n'apparaisse dans les journaux publics : sans la zone, ces sites restent invisibles. Le serveur DNS se renseigne par domaine, avec une clé TSIG facultative dont le secret vit **chiffré** en base. Sans serveur renseigné, seule la transparence s'applique.

> Un transfert refusé est dit comme tel, et distingué d'un serveur injoignable : le premier est une décision du serveur DNS, le second une panne ou un pare-feu. Les confondre ferait chercher au mauvais endroit.

Les noms trouvés n'entrent pas directement dans l'inventaire : ils arrivent dans la **file des découvertes à valider**, avec leur origine. Un nom découvert n'est pas forcément un service de l'établissement — et un inventaire qui se remplit tout seul cesse d'être un inventaire.

## Audit de surface externe

Le Catalogue n'audite rien lui-même. Un **moteur externe** relève ce qui est visible depuis Internet et rend des **constats** ; le Catalogue déclare le périmètre autorisé, reçoit, suit dans le temps et fait décider. Le partage est délibéré : le moteur voit l'extérieur sans rien savoir de l'inventaire, le Catalogue sait qui répond de quoi sans jamais sortir sur Internet.

C'est le même schéma que GLPI et Sniff — un connecteur de plus, pas une architecture nouvelle — avec une différence : **ici le Catalogue appelle, et le moteur ne l'appelle jamais.** Le moteur ne détient aucune clé du Catalogue, si bien que le compromettre ne compromet pas l'inventaire.

### Les deux routes, et ce qui n'est pas encore fixé

| Sens | Appel | Contenu |
|---|---|---|
| Catalogue → moteur | `POST <moteur>/perimetre` | domaines et plages déclarés, actifs inventoriés et surveillés, leurs pages cibles, le classement **validé** |
| moteur → Catalogue | `GET <moteur>/resultats?depuis=…` | les constats relevés depuis le curseur, et les actifs réellement relevés |

**Aucune redirection n'est suivie** : un moteur n'a aucune raison de rediriger, et suivre une redirection enverrait le jeton — ou le périmètre — là où personne ne l'a décidé.

> ⚠️ **Quatre points ne sont pas définis par le cahier des charges** (cahier des charges du moteur §9 ne fixe que la forme d'un constat), et sont donc des **hypothèses**, chacune isolée dans une fonction unique pour que la mise en conformité ne touche qu'un endroit :
>
> | Hypothèse | Où elle vit |
> |---|---|
> | en-tête d'authentification `Authorization: Bearer <jeton>` | `utils/auditClient.ts` |
> | enveloppe de `/resultats` : une liste, ou `{ constats, actifs?, jusqu_a? }` | `constatCycle.lireResultats` |
> | forme d'une page relevée et de ses scripts | `integriteScripts.lirePage` |
> | où le moteur porte le classement qu'il propose | `classement.classementDuConstat` |
>
> Tant que le moteur n'a pas arrêté sa forme, ces quatre fonctions sont le contrat.

### En attendant un moteur : parler à Artemis directement

Le connecteur a **deux dialectes**, choisis dans ses réglages.

`contrat` — le moteur porte `/perimetre`, `/resultats`, `/sante` et s'authentifie en `Bearer`. C'est la cible, et le jour où un moteur les porte, rien d'autre ne bouge.

`artemis` — le Catalogue parle à **Artemis** directement, parce qu'un Artemis nu ne porte pas ces routes et redirige vers sa page de connexion. Relevé sur une instance : API sous `/api`, en-tête **`x-api-token`** (et non `Authorization`), cibles déclarées par `POST /api/add` avec `{ "targets": [...] }`, résultats lus sur `GET /api/task-results`.

Tout ce que ce dialecte coûte tient dans `utils/artemis.ts` et dans un champ de réglage. Ce qu'il coûte, précisément :

- **Artemis ne connaît qu'une liste de cibles.** Le classement, les pages cibles et les plages d'adresses ne lui sont pas transmis — ils n'ont pas d'équivalent chez lui.
- **Aucune clé stable n'est fournie.** `id` et `analysis_id` changent à chaque passage ; les reprendre créerait un constat neuf à chaque relevé, et le cycle de vie s'effondrerait — plus de « déjà vu », plus de correction confirmée. La clé est donc **synthétisée** : module, cible, et le fait débarrassé de ce qui varie (versions, durées, dates dans le texte). Deux relevés d'un même port ouvert sur un nginx mis à jour donnent la **même** clé ; un port qui disparaît en donne une autre.
- **Aucune gravité.** Artemis dit « intéressant » ou rien ; l'échelle en a cinq. Le classement est écrit une fois, par module, et se relit.
- **Aucun filtre par date.** `created_at_gt` et `offset` sont acceptés et **ignorés** — mesuré sur une instance : une date en 2030 rend quand même des résultats. Le curseur filtre donc à la lecture. Un filtre côté serveur qu'on croit actif est pire qu'une absence de filtre.
- **Un module non rangé n'est pas traduit, il est nommé.** Il apparaît dans le compte rendu de synchronisation (`module Artemis non rangé : xxx (n)`). Le ranger au mieux ferait entrer dans l'inventaire des constats que personne ne retrouverait ; l'ignorer en silence ferait disparaître des trouvailles.

**Les CVE sont relevées.** `cve_lookup` et `nuclei` citent leurs identifiants dans le texte du résultat : ils sont extraits, dédoublonnés, triés, et portés par la **référence** du constat (`CVE-2023-31250 CVE-2024-45440 (artemis:cve_lookup)`) — c'est ce qu'on recopie dans un ticket. Deux conséquences :

- **Quand le résultat porte un score CVSS, c'est lui qui donne la gravité**, aux bornes du FIRST (≥ 9 critique, ≥ 7 élevée, ≥ 4 moyenne). Sans cette règle, toute CVE serait « élevée », y compris une faille mineure, et le compteur de critiques cesserait de vouloir dire quelque chose. Un score hors échelle est ignoré plutôt que ramené au plafond.
- **La clé stable suit les CVE**, pas le texte : « Drupal 10.1.4 vulnérable à CVE-2024-45440 » et « Drupal 10.1.6 vulnérable à CVE-2024-45440 » sont **un seul** constat, qui garde la décision prise. Une CVE de plus en fait un autre.

Les constats traduits passent par **le même `lireConstat`** que ceux d'un moteur conforme : la traduction n'a pas le droit de contourner les contrôles de format.

> Un port ouvert a sa propre catégorie, `port`. Il n'entrait dans aucune des douze autres : le ranger en `decouverte` l'aurait envoyé dans la file des noms à valider, en `vulnerabilite` il aurait annoncé un risque que personne n'a établi.

Contrôles : `bun apps/server/test/verif-artemis.ts`.

### La réponse du moteur est une donnée, pas une instruction

Le moteur relève des sites qu'il ne contrôle pas : un titre, un détail ou une preuve peuvent reprendre un texte servi par un site compromis. Tout est donc validé et **borné en longueur** (titre 300 caractères, détail 4 000, preuve 2 000), et une valeur hors format est **refusée et comptée**, jamais rangée « au mieux ». Un relevé daté de plus d'un jour dans l'avenir est refusé : horloge fausse ou donnée fabriquée, et il bloquerait le curseur au-delà de tous les relevés suivants.

### Le cycle de vie, la partie qui ment quand elle se trompe

Un constat corrigé qui réapparaît et reste « corrigé », une acceptation échue qui dure, un doublon à chaque relevé : chacun fait croire que le risque est traité. Quatre statuts, et des transitions explicites.

| Statut | Ce que ça veut dire |
|---|---|
| `ouvert` | relevé, rien n'a été décidé |
| `accepte` | risque assumé, **avec une échéance** — une acceptation n'est pas perpétuelle |
| `corrige` | **déclaré** corrigé par une personne : ce n'est pas vérifié |
| `reteste` | le moteur a relevé l'actif après la correction et n'a plus vu le constat |

L'**idempotence** tient à la `cle_stable` fournie par le moteur : un même constat vu deux semaines de suite reste **un** constat, avec un compteur d'observations. Un relevé qui n'est pas postérieur au dernier intégré est ignoré — relire la même page de résultats ne compte pas deux fois.

La **réouverture** est automatique dans trois cas, et seulement ceux-là : un constat corrigé revu *après* la correction (elle n'a pas tenu), un constat re-testé revu *après* le re-test, une acceptation **échue**. Un constat accepté dans son échéance reste accepté : c'est précisément ce qui a été décidé.

> **L'absence d'un constat ne prouve rien à elle seule.** Le moteur a pu ne pas relever l'actif. Une correction n'est donc confirmée que si l'actif a été relevé **après** la correction et que le constat n'y figure plus. Sans la liste des actifs relevés, aucune confirmation automatique : le constat reste « corrigé », c'est-à-dire déclaré et non vérifié. C'est la raison pour laquelle `actifs` est demandé au moteur.

Chaque décision garde son **motif et son auteur**. Un constat peut être **relié à un incident Sniff** — déclaré là-bas, relié ici : le connecteur Sniff est en lecture seule, le Catalogue ne crée pas l'incident.

### Intégrité des scripts servis

Le cas qui a motivé ce volet : sur un site de l'établissement, un `jquery.colorbox-min.js` de page de paiement ne correspondait plus à la bibliothèque publiée — un skimmer, servi aux visiteurs, **invisible depuis le code du site**.

Ce que le Catalogue peut faire sans auditer lui-même : conserver, par page cible, une **référence validée par une personne** (empreintes SHA-256 des scripts, domaines d'origine, présence de `integrity`), et signaler tout écart relevé ensuite — script modifié, script apparu, script disparu, nouveau domaine tiers.

Deux précautions écrites dans l'interface :

- **une page conforme à sa référence n'est pas une page saine** : la référence a pu être validée déjà compromise, et une porte dérobée côté serveur ne change aucun script servi ;
- un script se reconnaît à son **chemin**, pas à sa chaîne de requête — `?ver=` change à chaque mise à jour et ferait un faux écart à chacune.

### Classement paiement / sensible

Le classement — `paiement`, `sensible`, `standard` — est **proposé par le moteur et validé par une personne**. Ce qu'il déclenche (surveillance d'intégrité, revue plus fréquente) ne doit pas dépendre d'une proposition non relue. Un service **non classé** part au moteur à `null` : « non classé » n'est pas « standard ».

### Le tableau de bord : les manques sont des lignes

Trois lectures des mêmes constats ouverts — par **composante**, par **propriétaire**, par **classement** — et chacune est une **partition** : la somme de ses lignes fait le nombre de constats ouverts. Un constat qui tomberait entre deux lignes ferait dire au tableau moins que ce qui est ouvert.

D'où quatre lignes nommées plutôt qu'écartées : `(hors inventaire)`, `(sans propriétaire désigné)`, `(propriétaire sans composante)`, `(non classé)`. Les retirer rendrait le tableau plus propre et faux — et ce sont précisément les constats que personne n'a pour les traiter.

La composante d'un constat est celle du **propriétaire de son service** : c'est elle qui désigne l'interlocuteur. Un service sans propriétaire n'a donc pas de composante, et c'est dit.

Le tableau porte en outre les **vérifications faites de l'intérieur**, avec leur dénominateur et le sous-total des services **sensibles** : un relevé externe ne voit pas une porte dérobée côté serveur, et c'est sur ces services que son absence compte. Le rapport transmissible, lui, couvre par défaut les constats `ouvert`, `accepte` et `corrige` — pas seulement les ouverts : ce qui est accepté ou déclaré corrigé fait partie de ce qu'on doit à un interlocuteur.

### Les quatre pages

| Page | Ce qu'on y fait |
|---|---|
| **Audit de surface** (`/audit-surface`) | ce qui reste à décider : constats ouverts, découvertes non traitées |
| **Domaines** (`/audit-surface/domaines`) | déclarer les domaines, lancer les relevés, transférer ou importer une zone DNS |
| **Tableau de bord** (`/audit-surface/tableau`) | qui a quoi à traiter, la semaine écoulée, le rapport à transmettre |
| **Moteur** (`/audit-surface/connecteur`) | adresse, jeton, et le **périmètre autorisé**, relu avant l'envoi |

Un relevé externe se fait sur autorisation : ce qui part au moteur doit être ce qui a été décidé, et se relire avant l'envoi. C'est la raison d'être de la page « Moteur » — le périmètre y est déclaré, pas déduit.

### Où en est le moteur

Le cahier des charges du moteur (**cahier des charges du moteur**) et le POC d'évaluation vivent dans un dépôt séparé, `outil-audit-site` ; le moteur lui-même n'est pas dans ce dépôt. Côté Catalogue, tout ce qui précède est en place et ne dépend plus que de l'arrivée des constats — **`/api/audit-surface/resume` porte `configure`**, qui dit si un moteur est effectivement déclaré. Sans lui, zéro constat ne veut rien dire.

Deux réserves à connaître pour lire les premiers chiffres, tant que le moteur tourne **à côté du Catalogue** plutôt qu'à l'extérieur (phase de test, cahier des charges du moteur §3.1) :

- les constats de **ports et de services** ne valent pas pour ce que voit Internet : le chemin de sortie n'est pas le même, et un pare-feu traversé de l'intérieur produit des faux positifs comme des faux négatifs ;
- l'**intégrité des scripts** et le **cloaking** ne sont pas évalués de l'intérieur, parce qu'un code malveillant qui exclut les adresses de l'établissement y resterait invisible. Ces deux volets, et le classement, supposent l'hébergement externe (lot M3).

## Fin de vie des systèmes (EOL)

Le référentiel des systèmes est **construit depuis le parc réel** : sur un parc de plusieurs milliers de machines, personne ne saisira les systèmes à la main.

**Priorité stricte des dates** : saisie manuelle > endoflife.date > table interne de secours. Une décision humaine n'est jamais écrasée par une actualisation (`technologie.sourceEol` en garde la trace).

Deux dates distinctes sont conservées : **fin de support standard** et **fin de support étendu** (ESU Windows, ESM Ubuntu). Tant que la date étendue court, la machine **n'est pas** hors support — la compter obsolète serait un faux positif portant sur une part importante du parc.

### La clé de référentiel

Le rapprochement machine ↔ système ne se fait **pas** sur le nom d'OS brut, mais sur une **clé** calculée par `cleTechnologie(os, version)` :

| Cas | Clé | Pourquoi |
|---|---|---|
| Nom portant déjà sa version | inchangé (`Debian GNU/Linux 12`) | le nom est discriminant |
| Windows de bureau | nom + **release** (`… 11 Professionnel 24H2`) | 22H2 et 24H2 sont séparés de deux ans de support |
| Nom sans version | nom + **version majeure** (`macOS 14`) | « macOS » couvre plusieurs versions majeures |
| macOS 10.x | deux niveaux (`macOS 10.15`) | numérotation historique d'Apple : 10.15 = Catalina |

**Cette fonction est partagée** par la construction du référentiel, le tableau de bord, les pivots par périmètre, la page Périmètres (compte de machines hors support par composante/service/département/lieu) et la **décoration des catalogues** (voir ci-dessous). Si ces endroits calculaient la clé différemment, on compterait des machines qui ne sont pas celles du référentiel — un bug silencieux et faux.

### Où la fin de support se voit

Le statut n'est **jamais stocké** sur la machine : il est calculé à la lecture par `statutEol` (routeur `eol`) et injecté dans les réponses des catalogues *serveurs* et *postes de travail* via le crochet `decorate` du routeur CRUD générique (`crud.ts`). Chaque ligne lue porte alors `eolStatut`, `eolFinDeVie` et `eolFinDeVieEtendue` — des champs **calculés**, absents de la base, que le formulaire d'édition ne renvoie jamais. Côté interface : pastille « Fin de support » / « Support étendu » sur les cartes, bandeau d'alerte sur la fiche (hors support, support étendu, ou fin sous un an), compteur rouge par périmètre sur la page Périmètres.

**On ne devine pas.** Un Windows dont la release n'est pas renseignée dans GLPI reste en « date inconnue » plutôt que d'hériter des dates d'une release plus récente : une date fausse qui rassure est pire qu'un trou qui invite à compléter l'inventaire.

Quatre statuts sont distingués : *dépassé*, *support étendu*, *supporté — sans date annoncée* (l'éditeur confirme qu'il n'en publie pas, cas d'Apple), *date inconnue*.

## Référentiels

Six jeux de données de référence, administrés dans **Supervision → Référentiels**, avec leur source, la volumétrie attendue, celle réellement en base et un indicateur d'écart.

| Référentiel | Source | Volume |
|---|---|---|
| Exigences NIS 2 (ReCyF) | **CSV officiel ANSSI**, versionné dans le dépôt | 20 objectifs, 152 exigences |
| Correspondance ReCyF ↔ ISO | **table de comparaison officielle ANSSI**, versionnée dans le dépôt — importée avec NIS 2 | 353 renvois, niveaux élevé/moyen/faible, 64 observations |
| Mesures ISO/IEC 27002:2022 | saisie interne (traduction AFNOR protégée) | 93 mesures |
| Clauses ISO/IEC 27001:2022 | table des matières officielle, chapitres 4 à 10 — amendement climat Amd 1:2024 signalé sur 4.1 et 4.2 | 34 clauses |
| Exigences de sécurité du RGPD | règlement (UE) 2016/679, art. 5.1.f, 24, 25, 28, 30, 32, 33, 34, 35 — les 62 rapprochements vers NIS 2/ISO sont **non officiels**, marqués comme tels et modifiables | 29 exigences |
| Sections CNU | liste nationale | 80 sections |
| Populations | spécification de la cellule | 6 |

Le *seed* charge quatre de ces six jeux ; ISO 27001 et RGPD s'importent depuis la page.

**Règle commune** : l'import met à jour ce qui appartient à la **source** (intitulés, applicabilité, rattachements) et **jamais** ce qui appartient à la cellule (conformité déclarée, plans d'action, responsables, preuves).

Deux comportements à connaître :

- Quand la source **se contredit** — le ReCyF contient une exigence dont la référence dit « EE » mais dont la colonne *Cibles* dit « EI + EE » — l'anomalie est **tracée dans les notes** de l'exigence plutôt que tranchée silencieusement.
- Les exigences **présentes en base mais absentes de la source** sont signalées, jamais supprimées d'office : leur suppression emporte le travail rattaché, elle relève d'une décision explicite (`POST /api/referentiels/nis2/purger`).

## Sécurité

Un seul port est publié (`8080`, en HTTP) et n'est destiné qu'au reverse proxy du site, qui assure le TLS. Base, API et frontend ne sont jamais joignables directement.

Les connecteurs GLPI et Slowpoke sont en **lecture seule** : l'application ne peut rien écrire dans les systèmes sources. Le compte de service Slowpoke doit avoir le scope **lecture uniquement**.

Le journal d'audit enregistre l'auteur, l'entité et le différentiel de chaque mutation (`POST`, `PATCH`, `DELETE`).

### Voies de connexion

Quand le SSO est actif, `/login` ne propose que lui ; la connexion par mot de passe vit sur **`/login-secours`**, avec un lien discret mais présent — le masquer n'apporterait aucune sécurité et rendrait la page introuvable au seul moment où elle sert. Chaque usage est enregistré au journal d'audit et journalisé côté serveur.

`AUTH_SECOURS=false` ferme cette voie **côté API**, à condition que le SSO soit configuré (garde-fou contre le verrouillage total).

### Force brute

Comptage des échecs par adresse IP (10) **et** par compte visé (5), fenêtre de 15 minutes, blocage progressif jusqu'à une heure, réponse `429`. Le second axe couvre le *password spraying*, qu'un comptage par IP seul laisse passer. Le garde est monté **avant** better-auth : posé après, il ne freinerait rien.

### Protection des pages

Le middleware d'authentification est **global** : il s'applique à toutes les pages, sauf celles inscrites dans une liste explicite (`/login`, `/login-secours`). Il était auparavant déclaré page par page, et 9 pages sur 54 l'avaient oublié.

Ce que l'application **ne fait pas** : pas de second facteur d'authentification, pas de chiffrement applicatif des données au repos. Détail et conduite à tenir : [MCO §7 — Sécurité](Exploitation-MCO.md#7-sécurité) et [§8 — Mises à jour](Exploitation-MCO.md#8-mises-à-jour).

## Demandes de validation

Une écriture de **contributeur** n'est pas appliquée : elle est enregistrée dans `change_request` avec sa **méthode, son chemin et son corps**, puis rejouée telle quelle après approbation par un gestionnaire — via un jeton interne (`x-internal-token`) qui court-circuite la garde de permission le temps du rejeu.

Rejouer la requête d'origine, plutôt que de reconstruire l'écriture, garantit que ce qui est appliqué est **exactement** ce qui a été proposé, y compris les relations et les effets de bord du routeur concerné.

L'import de fichiers est fermé aux contributeurs : une demande de validation portant 400 lignes ne serait relue par personne.

## Sauvegardes

Un dump quotidien **vérifié** (taille et présence de tables), écrit hors du volume Docker. Le détail — automatisation, restauration, rotation, copie hors-site — est dans [Exploitation & MCO §5](Exploitation-MCO.md#5-sauvegardes).

Retenir : `deploy/migrer.sh` prend une sauvegarde **avant** toute migration et **annule la migration** si elle échoue.

## Compteurs réglementaires — le Catalogue est un miroir

Les échéances de l'article 23 (24 h / 72 h / 1 mois), la notification CNIL et le CERT RENATER se décident et se saisissent **dans Sniff**, pendant la conduite de l'incident, par la personne qui le conduit. Le Catalogue **lit, archive et alerte** — il ne décide plus rien.

### Pourquoi cette bascule

Les deux applications tenaient chacune une grille d'applicabilité. Elles concordaient partout **sauf sur P2** — celui que Sniff laisse délibérément « à évaluer », et que le Catalogue tranchait « applicable » tout seul, par une règle sur la gravité, sans trace ni auteur.

La pire conséquence n'est pas celle qu'on croit. Sur un incident que le RSSI aurait écarté, l'outil de **conformité** ouvrait un suivi, armait les délais, émettait les alertes — et si rien n'était déposé, **documentait lui-même un manquement qui n'en était peut-être pas un**. Dans un dossier opposable, c'est le mauvais sens de l'erreur.

Le Catalogue lit désormais `defaut` et `applicable` au lieu de recalculer : la divergence disparaît **par construction**, quelle que soit la grille en vigueur chez Sniff — y compris quand elle change, ce qui est le cas, la date d'entrée en vigueur de NIS 2 en France n'étant pas connue et la bascule P2 étant chez eux un réglage.

### Les champs qui comptent

| Champ | Ce qu'il dit |
|---|---|
| `defaut` | ce que la grille prévoit, **avant** toute décision humaine |
| `applicable` | la décision prise, ou `null` si personne n'a tranché |
| `court` | **le compteur doit-il être surveillé maintenant** : applicable ET rien de déposé |
| `deposeLe` · `reference` | ce qui a été effectivement déclaré, et sous quelle référence |
| `condition` | un **texte** qui change selon les réglages de Sniff — à afficher tel quel, jamais à analyser |

`defaut` et `applicable` restent **séparés** : les fusionner effacerait la différence entre « la grille dit oui » et « quelqu'un a décidé oui », qui est justement ce qu'un dossier doit montrer.

> Un compteur **déposé n'est jamais en retard**, même avec des heures restantes négatives. C'est `court` qui fait foi. Peindre en rouge un devoir accompli userait l'attention due aux vrais retards.

Une applicabilité **non tranchée** n'est ni un oui ni un non : c'est un travail à faire, sans date. Elle est donc alertée **sans échéance** (`dueDate: null`) et **groupée par incident** — la décision se prend une fois, pour tous les compteurs à la fois, et cinq alertes par incident noieraient les échéances réelles.

### Trois règles du miroir

- **Il ne s'efface jamais sur une panne.** Si Sniff ne répond pas, l'état précédent reste, avec sa date de fraîcheur (`source.dernierAccesAt`). Un miroir qui se vide sur une coupure réseau ferait taire des échéances réglementaires réelles.
- **Il ne recalcule rien.** Rejouer la règle ici reconstruirait la divergence qu'on vient de supprimer, avec un décalage en prime.
- **Il n'écrase pas un dépôt qu'il est seul à connaître.** Avant cette bascule, la preuve de déclaration ne vivait que dans le Catalogue ; Sniff l'ignore pour les incidents antérieurs. Recopier son `null` par-dessus transformerait un devoir accompli en manquement. Le compteur `deposesHorsSniff` les recense — ils sont à ressaisir chez eux.

Relevé toutes les **30 minutes**. Sur un délai de 24 h, cela en consomme un quarante-huitième — acceptable **parce que** le vrai compte à rebours est chez Sniff, en direct, devant la personne qui conduit l'incident. Le Catalogue rattrape ce qui échappe à la conduite ; il ne la remplace pas.

`notification_incident_nis2` est **conservée et n'est plus écrite** : elle garde les dépôts enregistrés avant la bascule.

## Registre pour l'assistant

Un appelant automatisé (assistant de la cellule, webhook, rapport) ne pose pas les mêmes questions qu'un humain devant l'écran : il ne cherche pas « la fiche qui s'appelle X », il demande « qu'est-ce qui expire », « qu'est-ce qui manque », « qu'est-ce qui a changé ».

Le contrat de lecture correspondant — quelle question à quelle adresse, ce que la réponse contient et surtout ce qu'elle ne dit pas — vit dans **[`doc/Registre-Assistant.md`](Registre-Assistant.md)**.

Le domaine **conformité** y tient une place à part, parce que les trois cadres n'emploient
pas le même vocabulaire : « conforme » se dit `fait` en NIS 2 et `conforme` en ISO 27001 et
RGPD, et `non_applicable` est une valeur de *conformité* chez ces deux derniers là où NIS 2
la range dans son *statut*. Les points d'entrée `/api/conformite/…` (écarts, plan, risques,
AIPD, résumé) rendent une forme homogène pour les trois — comparer ces valeurs entre cadres
soi-même mènerait à compter tout un référentiel comme non conforme.

Trois principes s'y appliquent à toutes les réponses destinées à un appelant extérieur :

- **un total compté par la base, séparé de la page** — l'appelant ne compte jamais lui-même ;
- **une date de fraîcheur par ligne** — sans elle, une donnée de six mois se cite avec le même aplomb qu'une donnée du matin ;
- **un tri documenté et stable**, se terminant toujours par une clé unique — sinon deux lignes égales permutent d'un appel à l'autre et l'une d'elles disparaît à la pagination.

### Champs calculés, et ce qu'ils ne peuvent pas faire

Cinq champs sont calculés à la lecture plutôt que stockés. Trois le sont en SQL — ils se
filtrent et se comptent. Deux le sont en JavaScript, dans `decorerEol()`, **après** que la
page soit revenue de la base : `eolStatut` et `incidentOuvert` n'existent pas au moment où
les lignes sont choisies, donc aucun `where` ne peut les atteindre et aucune page ne peut
les dénombrer.

Le recensement vit dans `/api/lectures`, bloc `champsCalcules`, avec ses colonnes
`filtrable` et `compte`. Il est rendu en charge utile et non écrit ici, pour la raison
habituelle : une table recopiée diverge.

`incidentOuvert` restera ainsi. Il vient d'un relevé de Sniff, pas d'une colonne ; le
matérialiser serait une troisième copie d'une donnée que Sniff détient, pour une question
à laquelle `/api/incidents/croisement` répond déjà.

`eolStatut` est passé en SQL, mais **pas** en réécrivant `cleTechnologie()` : celle-ci
normalise les releases Windows et la numérotation macOS à coups d'expressions régulières,
et la traduire l'aurait mise dans deux langages. Son propre commentaire dit ce que coûte
une divergence — « marquer obsolètes des milliers de postes parfaitement à jour, ou
l'inverse, bien plus grave ».

C'est donc son **résultat** qui est matérialisé, dans `serveur.technologie_cle` et
`poste_travail.technologie_cle` (migration `0052`). La fonction reste écrite une fois, en
JavaScript. Ce qui a été traduit en SQL ne compare que des dates, en cinq branches — et
`verif-eol-statut.ts` éprouve les deux implémentations sur la même table de cas, bornes
comprises. Deux représentations sans contrôle différentiel seraient une divergence en
attente ; avec, elles sont une redondance vérifiée.

**La reprise est le point délicat, pas le calcul.** `reconcilierClesTechnologie()` relit
TOUTES les lignes portant un OS et n'écrit que celles dont la clé diffère. Elle ne
s'accroche pas à la détection de changement du connecteur : une reprise qui ne visiterait
que les machines synchronisées laisserait à `null` toutes celles dont la fiche GLPI n'a pas
bougé, et la migration « réussirait » sur un parc à moitié évalué. Elle tourne après chaque
synchronisation GLPI et au démarrage du serveur — les deux, parce que l'une couvre les
machines que GLPI alimente et l'autre celles saisies à la main.

**La colonne part à `NULL`, sans valeur par défaut**, et `eolStatut` vaut alors `null` et
non `inconnu`. Une machine dont la clé n'est pas calculée n'est pas une machine dont on
ignore le support : c'est une machine qu'on n'a pas encore regardée. `clesNonEvaluees()`
les nomme séparément, plutôt que de les fondre dans les machines saines.

### Sites et services

Le certificat était l'objet du catalogue, ce qui est à l'envers : un certificat est une
**propriété** d'un service exposé, au même titre que ses technologies. `service_expose`
devient donc l'objet, et le certificat s'y rattache par `(hote, port)` — leur clé
fonctionnelle commune, sans troisième liste d'hôtes à entretenir.

**Pas « site web ».** Le modèle porte hôte et port : LDAPS 636, IMAPS 993, SMTPS 465 sont
des services exposés qui portent un certificat et aucune technologie web. Le `type` dit ce
qu'on doit attendre du relevé, faute de quoi « aucune technologie détectée » sur un annuaire
se lirait comme un trou d'inventaire. Le libellé de l'interface est « Sites et services »,
distinct du nom de la table : « Services » désigne déjà une entité d'organisation.

**Le scan est passif.** Une requête `GET /`, rien d'authentifié, aucun chemin réputé sensible
sondé, corps plafonné. Le Catalogue inventorie, il n'audite pas : « hors support » est un
fait daté, « vulnérable » un jugement qui demanderait un flux de vulnérabilités à jour.

**Il ne calcule aucune fin de vie.** Il alimente le référentiel `technologie`, et toute la
mécanique existante s'applique — clé, statuts, familles, enrichissement. La clé de
rapprochement n'existe que si la version est connue : rapprocher « WordPress » sans version
donnerait à tout le produit la date d'une release précise.

**Deux retards, deux décisions.** `derniereVersionBranche` appelle un correctif ;
`derniereVersionGenerale` une montée de version. Un serveur à jour sur une branche maintenue
est sain, même deux versions majeures derrière. `utils/versions.ts` compare par segments —
`1.41.9` contre `1.41.10` comparé comme chaîne annonce un serveur à jour qui ne l'est pas —
et ce qui ne se compare pas rend `null`, qui remonte en `version_inconnue`.

**L'agrégation au niveau du service** retient le pire état, et « inconnu » ne compte jamais
comme bon. Le dénombrement l'accompagne : « à jour sur 2 technologies détectées » n'est pas
« à jour ».

`/api/sites-services/etat` porte les états calculés, distinct du `/resume` générique qui
partitionne les colonnes. Deux routes sur le même chemin ne produisent aucune erreur — la
dernière montée gagne en silence, ce qui a masqué `/api/competences/resume` pendant un
déploiement entier.

### Regroupements déclarés

Les réponses fausses d'un assistant viennent presque toutes d'une agrégation qu'il fait
lui-même : regrouper des libellés d'OS pour répondre à « combien de Windows 10 dépassés »,
c'est décider sur des chaînes qu'on n'a pas écrites. Le regroupement se fait donc côté
serveur et il est **déclaré**.

`utils/familleOs.ts` classe un système à **deux niveaux** : la famille (`debian_12`,
`windows_server_2019`) et le groupe (`debian`, `windows_serveur`). Les deux répondent à des
questions différentes — « combien de Debian 12 » et « combien de Debian » — et l'appelant
n'a à sommer ni l'un ni l'autre.

**Une seule table ordonnée, quatre sorties dérivées** : la liste des familles, celle des
groupes, les périmètres et le classement. Écrites séparément, elles divergeraient : ajouter
une famille demanderait quatre modifications, en oublier une ne produirait aucune erreur.
Une première version de ce fichier portait ce défaut.

Le classement part de la **clé versionnée**, jamais du nom brut. L'ordre de la table EST le
classement, et plusieurs dépendances d'ordre cassent un décompte réel si on les inverse :
Windows Server avant les Windows de bureau, iPadOS avant iOS (« ipados » contient « ios »),
et les versions du plus récent au plus ancien. La version majeure est ancrée par `[^0-9]*` —
sans quoi « Red Hat Enterprise Linux Server 7.9 » tombait dans `rhel_9`.

**Le groupe est déclaré, pas déduit d'un préfixe de nom.** `centos_8` et `rhel_8` partagent
une base mais pas un cycle : CentOS 8 s'est arrêté fin 2021 quand RHEL 8 court jusqu'en 2029.
Un découpage sur le nom les aurait réunis, ce qui annulerait le détail qu'on vient d'ajouter.

`autre` fait partie du vocabulaire, et c'est ce qui garantit que la partition somme au total.
`famillesNonReconnues` en donne le détail clé par clé : un compteur seul ne dirait pas s'il
faut ajouter une famille ou corriger l'inventaire.

Chaque famille publie son **périmètre** dans `/api/lectures` — « 1 240 Windows 10 » ne dit
pas si les LTSC et les éditions IoT y sont. Le compilateur ne peut plus l'exiger, la table
étant construite à l'exécution ; c'est la dérivation qui l'assure, et un contrôle le vérifie.

Les croisements `machinesParFamilleEtStatut` et `machinesParGroupeEtStatut` ont pour valeurs
des **objets**, pas des nombres : leur déclaration porte `sousPartition`.

### Croiser deux axes : filtrer, puis lire `total`

« Combien de serveurs en production à l'UFR ST » a une réponse exacte en un appel :

```
GET /api/serveurs?statut=en_service&composanteId=<id>&pageSize=1  →  total
```

`critereDe` accepte **toute colonne de la table** — énumérations et clés étrangères
comprises — et les combine en ET ; plusieurs valeurs séparées par des virgules se combinent
en OU sur le même champ. Le `where` sert à la fois la page et le décompte, donc `total` est
le croisement, compté par la base.

Cette possibilité existait sans être annoncée : rien ne disait à l'appelant que
`composanteId` était filtrable, ni où retrouver l'identifiant de « UFR ST ». Le Catalogue en
faisait plus que ce que son contrat promettait, et l'assistant renonçait pour rien. **Un
contrat qui promet trop se corrige ; un contrat qui promet trop peu ne se découvre jamais.**

Le bloc `filtres` de `/api/lectures` le publie désormais, dérivé des colonnes : la liste des
filtres EST la liste des colonnes, donc elle ne peut pas diverger de ce qui est accepté.

Un tableau croisé pré-calculé aurait été pire : quinze couples par catalogue, choisis à
l'avance, là où le filtre répond à la combinaison que l'appelant a réellement en tête.

### Un résumé par catalogue, dérivé des colonnes

`GET <prefix>/resume` existe sur les 48 catalogues du routeur générique, et il est **dérivé
des colonnes de la table** : une partition par colonne d'énumération, une ventilation par
clé étrangère vers un référentiel connu. Ce sont exactement les axes des filtres de
recherche — type, environnement, criticité, statut, emplacement, composante — sans que
personne ait eu à les recopier.

Écrire un résumé par catalogue aurait été quarante-huit occasions d'en oublier un axe, et
**un axe oublié ne produit aucune erreur** : seulement une question sans réponse. C'est le
même défaut que les partitions incomplètes et que la liste de routes à paginer écrite à la
main, qui a laissé `competences` de côté deux fois.

`axes` énumère ce que la table porte. Un axe absent de cette liste signifie que la table ne
le porte **pas** — ce qui n'est pas la même chose qu'un axe dont aucune valeur n'est
renseignée. Un poste de travail n'a pas d'environnement ; ce n'est pas une lacune.

Une clé étrangère dont le référentiel n'est pas déclaré n'est **pas** ventilée : mieux vaut
ne pas rendre un axe que d'en rendre un dont on ne sait pas nommer les valeurs — une
ventilation par identifiants opaques serait illisible et se lirait pourtant comme une
réponse.

C'est le seul bloc de `/api/lectures` annoncé comme **exhaustif**, et pour cette raison :
les autres sont déclarés à la main.

### Ventilations : par axe organisationnel

« Combien de serveurs à l'UFR ST » n'avait aucune réponse — l'assistant répondait « le
décompte n'est pas disponible », ce qui était la seule réponse honnête que sa consigne lui
permettait.

**Une ventilation n'est pas une partition**, et les confondre casse un contrôle. Une
partition porte sur un vocabulaire fermé, dont les valeurs sont connues à la compilation ;
une ventilation porte sur un référentiel — composantes, services, pôles — dont les valeurs
sont des lignes de table qui changent sans déploiement. Exiger une liste complète ferait
rougir un contrôle à la création d'une composante, c'est-à-dire pour un événement normal.
Les deux blocs sont donc séparés dans `/api/lectures`.

Ce qui reste vrai des deux côtés : **la somme doit faire le total**. D'où
`sansRattachement`, qui compte les lignes que l'axe ne classe pas — sans lui, additionner
les composantes rend un parc plus petit que le parc, et rien ne le signale.

`axe` donne le point d'entrée qui énumère les valeurs : une composante absente de la
ventilation s'y lit « zéro », jamais « inconnue ».

Les trois axes du parc — composante, service, département — sont rendus ensemble parce
qu'ils ne se déduisent pas l'un de l'autre : une machine peut porter un service sans
composante. Une application ne porte qu'un **pôle**, et ventiler sur les autres axes
rendrait un décompte vide qu'on lirait comme « aucune application ».

### Partitions : un compteur par valeur

Les compteurs des résumés étaient énumérés à la main, et il en manquait — sur trois routes.
`/api/eol/etat` n'avait pas `ok`, soit l'état le plus nombreux du parc ;
`/api/technologies/parc` n'avait ni `ok` ni `supporte` ; `/api/conformite/resume` comptait
UNE des quatre valeurs de conformité de chaque cadre, si bien qu'on savait combien
d'exigences étaient conformes mais jamais combien ne l'étaient pas.

Aucune erreur, aucun test rouge : juste une catégorie absente de la réponse. Elle ne se
découvre qu'en sommant les lignes reçues, ce que la doctrine interdit précisément à
l'appelant.

`utils/partition.ts` dérive la partition de l'énumération : ajouter une valeur fait
apparaître son compteur sans que personne y pense. Deux règles s'y attachent :

- **une case à zéro n'est pas une case absente** — « 0 machine dépassée » est une réponse,
  l'absence du champ n'en est pas une ;
- **`partitionAvecNul` compte les valeurs nulles sous un nom explicite**, sans quoi la somme
  des parts ne fait pas le total, et une partition qui ne somme pas au total n'en est pas une.

Les partitions des trois cadres de conformité restent **distinctes** : « conforme » se dit
`fait` en NIS 2 et `conforme` ailleurs, et `non_applicable` est un statut chez le premier,
une conformité chez les deux autres. Les fusionner compterait un référentiel entier comme
non conforme.

### Un libellé court à côté de chaque lecture

`signifie` explique une valeur ; il ne tient pas dans une pastille. Un lecteur qui **affiche** la valeur a besoin de deux mots — et faute de les trouver, il écrit les siens. C'est arrivé ici même, sur la page des incidents : trois libellés de résolution y avaient été écrits de mémoire, dont deux devinés, et quatre valeurs du vocabulaire de Sniff n'étaient couvertes par aucun.

Chaque valeur des vocabulaires fermés porte donc un **`libelle`** à côté de son `signifie`, et le compilateur l'exige au même titre : ajouter une valeur à l'une des énumérations arrête la compilation tant que son libellé n'est pas écrit. Un vocabulaire ne peut pas être publié à moitié étiqueté.

Deux vocabulaires en sont exclus et **dérivent** leur libellé de la clé : les familles et les groupes de systèmes ne sont pas des énumérations écrites mais le produit des règles de classement. `windows_server_2019` se lit « Windows Server 2019 », `ubuntu_24_04` « Ubuntu 24.04 », `linux_autre` « Linux (autres versions) ». Neuf sigles s'écrivent — RHEL, macOS, SUSE… — les cinquante familles non, et celle qui sera ajoutée demain portera son libellé sans que personne l'écrive.

C'est la **réciproque de ce que publie Sniff** : même forme, mêmes clés des deux côtés. Un libellé se relaie, il ne se recopie pas — une table recopiée diverge le jour d'un renommage, et l'écran affiche alors une étiquette plausible et fausse.

### Lacunes : l'unité de `combien`

`combien` portait trois sens selon la lacune, sans que rien dans la réponse ne les
distingue : un nombre de fiches, un délai en jours, et un `1` qui signifiait « oui » et non
« un ». Le troisième existait parce que `combien` sert aussi de test d'existence — une
lacune n'est empilée que si `combien > 0`.

`unite` les sépare, et le compilateur l'exige : une lacune déclarée sans unité ne compile
pas. `depuis` porte en outre la date de dernière collecte sur les lacunes de fraîcheur —
une date ne peut pas être confondue avec un décompte, un délai logé dans un champ numérique
le peut.

### Compétences

`/api/competences/resume` part du **référentiel** et va vers les personnes.
`/api/matrice-competences` faisait l'inverse — il partait de `personne_competence` — si
bien qu'une compétence que personne ne détient n'y apparaissait pas du tout. La question
« avons-nous les compétences pour traiter un ransomware ? » ne pouvait donc structurellement
pas recevoir de réponse négative, soit le seul cas qui intéresse un audit.

Cinq états, et deux distinctions à ne pas écraser :

- **`non_evaluee` n'est pas `sous_niveau`.** Une compétence est une évaluation, pas une
  déclaration de l'intéressé : tant que personne n'a jugé, elle n'est ni acquise ni
  manquante. La première appelle une évaluation, la seconde une formation — ni le même acte
  ni le même budget, et un taux qui les agrège est faux.
- **`sans_exigence` est hors du dénominateur.** Sans niveau requis déclaré, ni la
  couverture ni le manque ne se constatent.

L'ordre des niveaux vient de `enum_range(null::competence_niveau)`, donc de l'ordre de
déclaration : une liste écrite dans le routeur serait une seconde copie du vocabulaire, et
ajouter un niveau rendrait les comparaisons fausses en silence.

### Résumé du parc

`/api/parc/resume` rend les décomptes du parc. Chaque compte porte son dénominateur ;
l'état des connecteurs précède les chiffres, parce qu'un zéro sur une source muette ne veut
rien dire ; et l'écart des doublons GLPI y est répété plutôt que renvoyé aux lacunes — le
chiffre le plus rond d'une réponse est celui qu'on cite en premier.

Le support des OS (`/api/eol/etat`) et la couverture EDR (`/api/harfanglab/couverture`) ne
sont pas recopiés : le résumé y renvoie par `voirAussi`.

### État RGPD des applications

`etatRgpd` est calculé à la lecture, jamais stocké : une colonne figée se désynchroniserait
dès l'ajout d'une exigence au référentiel, et une application marquée conforme le resterait
sans que personne ait répondu à la nouvelle question.

Quatre états, et la nuance entre les deux du milieu est tout l'intérêt du dispositif :
`ecart` est un manquement **mesuré**, `non_evalue` est du **travail à faire**. Les agréger
ferait apparaître une alerte sur 100 % du parc dès le premier jour.

L'expression SQL est écrite **une seule fois**, dans `expressionEtatRgpd()`, parce qu'elle
sert à trois endroits que PostgreSQL oblige à répéter : la colonne rendue, le filtre
`?etatRgpd=` (un alias de `select` n'est pas utilisable dans un `where`), et les compteurs
de `/api/conformite/resume`. `verif-etat-rgpd.ts` vérifie que le `case` n'apparaît qu'une
fois dans tout le serveur.

Le partage entre les deux points d'entrée suit une règle simple : `/api/lacunes` répond à
« ce que le Catalogue ne sait pas », donc seules les applications **non évaluées** y
figurent. Une application en écart est un fait connu et défavorable — elle se compte dans
le résumé, pas dans les lacunes.

### Pagination

Toute route de liste accepte `?page` **ou** `?pageSize` — l'un des deux suffit — et répond
alors `{ rows, total, page, pageSize }`. Sans ces paramètres, chaque route conserve la forme
qu'elle rendait auparavant : les écrans n'en envoient aucun. `pageSize` est plafonné à 200 et
vaut 50 par défaut.

La règle est écrite **une seule fois**, dans `apps/server/src/utils/pagination.ts`, et le
routeur générique comme les six routes écrites à la main l'appellent. Elle a d'abord existé
en double — une copie dans `crud.ts`, rien ailleurs — et c'est cette duplication qui a laissé
onze routes diverger pendant deux mois sans que rien ne le signale. `verif-pagination.ts`
vérifie aujourd'hui la fonction *et* le fait qu'elle soit branchée : une route de liste
ajoutée sans pagination fait rougir la série.

`/api/audit` fait exception à la conservation de forme : il rend l'enveloppe même sans
paramètre. Il n'y avait pas de forme historique à préserver — il rendait 200 lignes sans le
dire et sans total, une troncature indiscernable d'un journal complet.

## Routes API

Les routes sont auto-documentées en **OpenAPI**, exposées à **`/openapi`** (ex. `https://<votre-domaine>/openapi`).

## Développement

```bash
git clone https://sso.example.org/gitlab/ssi/catalogue.git
cd catalogue
bun install              # bun 1.3.10
cp .env.example .env
bun run typecheck        # tous les paquets
docker compose up -d     # pile complète, sur http://localhost:8080
```

Sans `OIDC_CLIENT_ID`, le SSO n'est pas déclaré : la connexion se fait par e-mail et mot de passe, ce qui permet de travailler sans dépendre de l'annuaire.

Procédure détaillée : [Installation §A.8](Installation.md#a8-environnement-de-développement).

## Déploiement

```bash
docker compose build server app
./deploy/migrer.sh                    # sauvegarde vérifiée PUIS migration
docker compose up -d --no-build server app
```

Ne jamais lancer `docker compose run --rm migrate` seul en production : passer par `deploy/migrer.sh`, qui refuse de migrer sans sauvegarde valide.
