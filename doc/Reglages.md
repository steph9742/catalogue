# Réglages de l'application

Ce que fait chaque réglage **dans l'application**, une fois installée. Pour l'installation elle-même — Dex, variables d'environnement, Docker, l'hôte — voir [Installation](Installation.md).

---

## 1 Utilisateurs & rôles (`/roles`) — administrateurs uniquement

Contrairement à Sniff, les droits ne sont **pas globaux** : chaque utilisateur reçoit un rôle **par catégorie**. Sans ligne pour une catégorie, il n'a aucun accès à cette catégorie.

| Rôle | Effet sur la catégorie |
|---|---|
| `lecteur` | lecture seule |
| `contributeur` | lecture ; toute écriture part en **demande de validation** |
| `gestionnaire` | lecture et écriture directe |

Le rôle global **admin** court-circuite tout et donne accès aux réglages, connecteurs et référentiels.

### Le rôle global suit l'annuaire

Pour un compte SSO, `admin` est déterminé par l'appartenance au groupe **`admins`** chez Dex, et **réévalué à chaque connexion** : entrer dans le groupe l'accorde, en sortir le retire.

**Sauf si vous le posez à la main depuis cette page.** Cocher ou décocher « Administrateur » marque le rôle `manuel` : l'annuaire ne le modifie plus, y compris si la personne quitte le groupe. C'est ce qui permet de nommer administrateur quelqu'un qui n'y figure pas.

La ligne indique alors « Posé à la main — non réévalué à la connexion », avec un lien **Rendre à l'annuaire** qui restitue le comportement automatique. Ces comptes sont aussi recensés par `/api/lacunes` : leur rôle échappant à la révocation, il doit rester visible.

Si le claim `groups` est **absent** de la réponse de Dex, aucun rôle n'est modifié : une configuration incomplète ne doit pas rétrograder tous les administrateurs. Le compte de secours, hors annuaire, conserve son rôle en toutes circonstances.

> ⚠️ Prévoyez **au moins deux administrateurs**. Sans admin, plus personne ne peut attribuer de rôles ni configurer les connecteurs.

## 2 Demandes de validation (`/demandes`)

File des écritures proposées par les contributeurs. Un gestionnaire de la catégorie approuve ou refuse ; à l'approbation, la requête d'origine est **rejouée telle quelle**.

## 3 Connecteur GLPI (`/glpi`) — administrateurs uniquement

Renseignez l'URL de l'API GLPI (`https://glpi.example.org`), l'`app_token` et le `user_token`, puis testez la connexion avant d'activer.

La synchronisation est **en lecture seule** — elle ne peut rien modifier dans GLPI. Elle reprend les machines (avec leur système **et sa version**), les entités sur trois niveaux (composantes → départements → services) et l'arborescence des lieux. Un ordonnanceur la relance **toutes les 15 minutes**.

Les machines sont classées automatiquement ; celles qui résistent restent « à classer » et sont proposées à l'arbitrage dans l'onglet dédié.

> Préférez un **compte GLPI de service** dédié à la synchronisation, plutôt que le jeton personnel d'un agent qui partira un jour.

## 4 Connecteur Sniff (`/incidents`) — administrateurs uniquement

Trois valeurs à renseigner :

| Champ | Rôle |
|---|---|
| **URL de Sniff** | `https://sniff.example.org` |
| **Clé de service** | `sk_…`, rôle `svc` en lecture. Chiffrée en base. |
| **Secret du webhook entrant** | à déclarer à l'identique côté Sniff. Chiffré en base. |

Ce connecteur alimente trois domaines : les **incidents**, l'**inventaire des listes blanches** de l'EDR, et les **compteurs réglementaires**.

### Le secret du webhook

Sniff pousse deux événements vers `…/api/sniff/evenements`, signés en HMAC-SHA256 :
`exclusion_appariee` et `exclusion_detachee`. Ils permettent la bascule immédiate de
l'autorité sur la date de revue d'une liste blanche, sans attendre le relevé suivant.

À déclarer côté Sniff dans **Réglages → Webhooks**, avec les deux événements et le même
secret.

Sans secret configuré, les événements sont **refusés** : une charge non signée permettrait
de modifier des échéances réglementaires par simple requête HTTP. Le relevé périodique
continue de fonctionner ; seule la mise à jour immédiate est indisponible, et l'écran des
réglages le signale.

### Ce que le Catalogue ne décide plus

L'applicabilité des compteurs réglementaires et l'enregistrement des déclarations relèvent
de Sniff, au niveau de l'incident. Le Catalogue relève ces compteurs **toutes les 30
minutes**, les conserve et émet les alertes correspondantes. Voir
[Compteurs réglementaires](Documentation.md#compteurs-réglementaires--le-catalogue-est-un-miroir).

## 4 bis Connecteur HarfangLab (`/harfanglab`) — administrateurs uniquement

| Champ | Rôle |
|---|---|
| **URL** | l'origine seule, sans `/api` — il est ajouté automatiquement |
| **Jeton d'API** | compte en **lecture**. Chiffré en base. |
| **Marqueurs des règles techniques** | facultatif, voir ci-dessous |
| **Rattachement des entités EDR** | à quelle unité du Catalogue correspond chaque entité de la console |

L'en-tête d'authentification est `Authorization: Token <jeton>`. Le swagger de l'éditeur
déclare le nom de l'en-tête sans jamais donner le préfixe de la valeur : ce format a été
vérifié sur l'instance de l'établissement.

Le connecteur lit la **flotte d'agents**, l'**état des moteurs de détection**, les **jeux de
règles** et le **contenu des règles** (YARA, Sigma, IOC, corrélation, driver blocklist). Les
**listes blanches ne sont pas lues ici** : Sniff les lit et les apparie aux exclusions, le
Catalogue lit son inventaire.

> **Marqueurs des règles techniques.** Relevé du 27 août 2026 sur les 4 797 règles de
> l'instance : `WhitelistRule` n'expose aucun champ d'étiquettes. Ce réglage ne classe donc
> rien aujourd'hui et peut rester vide. Le tri effectif se fait sur l'origine de la règle
> (`fourniParEditeur`).

> **Un jeton collé depuis la console emporte souvent un espace ou un retour à la ligne.**
> Il est nettoyé avant usage : sans cela, HarfangLab répond `401 Invalid token header` et
> rien dans l'écran ne laissait voir la cause.

Pour que l'**écart de couverture** soit calculable, les **groupes de criticité** doivent être
déclarés dans le connecteur GLPI. Sans eux, l'écart vaut zéro par construction.

### Rattacher les entités EDR aux unités

Les agents portent l'entité déclarée dans la console HarfangLab. Le connecteur la rapproche
des unités du Catalogue — établissement, composante, département, service, pôle — pour que la
couverture se lise par unité.

Le rapprochement automatique n'est fait que s'il est **exact et unique**. Une entité qui
ressemble à deux unités, ou à aucune, attend votre décision : elle s'affiche dans la liste
avec le nombre d'agents concernés, et le choix posé une fois est conservé. Une entité peut
être rattachée **avant** d'exister dans la console — ce qui permet de préparer l'arrivée d'un
périmètre sur l'EDR.

Les agents dont l'entité n'est rattachée à rien ne disparaissent pas des chiffres : ils sont
comptés sous « sans entité » ou « entité non rattachée », deux cas distincts.

## 4 ter Moteur d'audit de surface (`/audit-surface/connecteur`) — administrateurs uniquement

Le Catalogue appelle le moteur ; le moteur n'a **aucun** accès au Catalogue et n'en détient
aucune clé.

| Champ | Rôle |
|---|---|
| **Adresse du moteur** | en `https://`, sans quoi le jeton et le périmètre circuleraient en clair. Le `http://` n'est admis que sur une adresse **locale ou privée** — la phase de test, où le moteur tourne à côté du Catalogue |
| **Jeton** | porté par le Catalogue pour appeler le moteur. Chiffré en base |
| **À qui l'on parle** | `contrat` — le moteur porte /perimetre et /resultats ; `artemis` — le Catalogue parle à Artemis directement, en attendant |
| **Domaines autorisés** | les noms sur lesquels le relevé est permis |
| **Plages d'adresses autorisées** | idem, en IP |

**Le périmètre est déclaré, jamais déduit.** Un relevé externe se fait sur autorisation :
ce qui part au moteur est ce qui a été décidé, et la page le montre en entier avant l'envoi.
Les domaines et plages mal formés sont **rejetés et listés**, pas corrigés au mieux — une
cible fantôme resterait éternellement « injoignable » sans que personne sache pourquoi.

Partent aussi les **actifs inventoriés et surveillés** avec leurs pages cibles, et le
classement **validé** de chacun. Un service non classé part à `null` : « non classé » n'est
pas « standard », et le moteur ne doit pas traiter l'un pour l'autre.

> Aucune redirection n'est suivie. Un moteur n'a pas de raison de rediriger, et la suivre
> enverrait le jeton — ou le périmètre — à une adresse que personne n'a décidée.

En dialecte **Artemis**, l'adresse se saisit à la racine (`http://hôte:5050`, sans `/api`), le
jeton part en `x-api-token`, et seules les cibles sont transmises : le classement, les pages
cibles et les plages n'ont pas d'équivalent chez lui. Les modules qu'Artemis emploie et que le
Catalogue ne sait pas ranger sont **comptés et nommés** dans le compte rendu, jamais rangés au
hasard.

> Une seule redirection est suivie : celle qui n'ajoute que la barre oblique finale, sur la
> même origine — c'est celle que font les serveurs d'applications d'eux-mêmes. Toute autre est
> refusée **en nommant sa cible** : la suivre enverrait le jeton, ou le périmètre, à une
> adresse que personne n'a décidée. Une redirection vers une page de connexion signale un
> moteur qui n'expose pas le contrat.

L'ordonnanceur relance un passage à la fréquence configurée (**24 h** par défaut) ; l'échec
est **enregistré**, parce qu'un moteur en panne et un parc sans constat ne doivent pas se
ressembler.

## 5 Référentiels (`/referentiels`) — administrateurs uniquement

Les **six** jeux de données de référence, avec leur source, la volumétrie attendue, celle en base et un **indicateur d'écart** : exigences NIS 2 / ReCyF, mesures ISO 27002 (SoA), **clauses ISO 27001** (34 clauses des chapitres 4 à 10, amendement climat 2024 signalé sur 4.1 et 4.2), **exigences de sécurité du RGPD** (29 exigences ; ses 62 rapprochements vers NIS 2 et l'ISO ne sont **pas officiels** — aucune autorité ne publie cette correspondance — et restent à valider dans l'application), sections CNU et populations.

L'import NIS 2 charge aussi la **correspondance officielle ANSSI ReCyF ↔ ISO** : 353 renvois avec leur niveau (élevé / moyen / faible) et 64 observations, affichés sur la fiche de chaque exigence.

Le *seed* d'installation ne charge que quatre de ces six jeux : **ISO 27001 et RGPD s'importent depuis cette page**, et signalent un écart tant que ce n'est pas fait.

L'import **met à jour** ce qui appartient à la source et **jamais** votre travail : conformité déclarée, plans d'action, responsables et preuves sont conservés.

Si des exigences présentes en base ne figurent plus dans le fichier officiel, elles sont **signalées** avec un bouton de suppression distinct — parce que les supprimer emporte le travail qui y est rattaché.

## 5 bis Cadres de référence (`/reglages`) — administrateurs uniquement

Les cinq cadres que l'application sait porter — NIS 2 / ReCyF, ISO 27001, ISO 27002, ISO 27005 et RGPD — se cochent et se décochent dans `/reglages`. Décocher un cadre **masque ses pages du menu pour tout le monde** ; les données restent en base et réapparaissent intactes à la réactivation.

Deux limites à connaître :

- le masquage n'est **pas un contrôle d'accès** : une page masquée reste atteignable par son adresse pour qui en a le droit ;
- si une page « disparaît » du menu pour tous les utilisateurs, vérifier ici avant de chercher un défaut — c'est probablement un cadre décoché.

## 6 Entité NIS 2 (`/entite-nis2`)

Déclarez si l'établissement est **entité importante** ou **entité essentielle**. Ce choix détermine quelles exigences vous sont applicables — l'application n'affiche que celles-là.

## 7 Connexion / SSO

En production, la connexion passe par le **SSO OpenID Connect « le portail » (Dex)**. À la première connexion, le rôle global est dérivé de l'annuaire : membre du groupe `admins` → **admin**, sinon → **user**.

Un compte `user` est authentifié mais **n'a accès à rien** tant qu'un administrateur ne lui a pas attribué de rôle sur au moins une catégorie (A.1). Ce n'est pas une panne : Dex ne connaît pas les catégories, elles se gèrent dans l'application.

### Connexion de secours

Quand le SSO est actif, la page `/login` ne propose **que** lui : un formulaire de mot de passe affiché en permanence à côté inviterait à contourner l'annuaire au quotidien.

La connexion par mot de passe reste accessible sur **`/login-secours`**, avec un lien discret depuis `/login`. Ce lien est volontairement visible : le masquer n'apporterait aucune sécurité — l'adresse figure dans le code — et rendrait la page introuvable au seul moment où elle sert.

**Chaque usage est enregistré** au journal d'audit (`authentification` / `connexion_secours`) et journalisé côté serveur (`🔑 Connexion de SECOURS`). Une connexion qui contourne l'annuaire doit laisser une trace.

**Les tentatives sont limitées** : 10 échecs depuis une même adresse ou 5 sur un même compte déclenchent un blocage progressif (1 à 60 minutes). Voir [MCO §7](Exploitation-MCO.md#7-sécurité).

Cette voie peut être **fermée** par `AUTH_SECOURS=false` (voir [Installation §A.3](Installation.md#a3-fichier-env)) — en sachant qu'on renonce alors au filet de reprise en main.

## 8 Où se trouvent les réglages

Deux pages, deux portées, à ne pas confondre :

| Page | Pour qui | Contenu |
|---|---|---|
| **Réglages** (`/reglages`) | administrateurs | cadres de référence, connecteurs (GLPI, Sniff, HarfangLab, moteur d'audit), référentiels, entité NIS 2, certificats TLS, rôles, demandes de validation, comptes techniques, journal d'audit — avec l'état de chacun |
| **Mon profil** (`/profil`) | tout le monde | ses accès par domaine, ses notifications, l'ordre de son menu, l'affichage de ses listes |

`/reglages` sert de **point d'entrée** : les pages qu'elle rassemble existent aussi séparément, mais on ne les trouvait qu'en connaissant leur adresse. Elle signale au passage les écarts — référentiel désaligné, demandes en attente, connecteur non configuré, dernier relevé en échec, certificats inscrits mais jamais relevés.

### Portée des comptes de service

Une clé `sk_…` lit ce que ses **scopes** déclarent, et rien de plus :

| Scopes | Catégories lisibles |
|---|---|
| `read` ou `admin` | toutes |
| un ou plusieurs `cat:<clé>` | ces catégories seulement, même en présence de `read` |
| aucun des deux | **aucune** |

L'écriture exige `write` en complément de la portée. Un compte créé sans scope ne lit rien :
avant août 2026, il lisait au contraire l'intégralité du Catalogue, par un test de nullité
et non par une décision.

`/profil` répond à une question que l'application laissait sans réponse : **« à quoi ai-je droit ? »**. Les rôles étant attribués par catégorie, un utilisateur ne pouvait auparavant que constater un refus sans en comprendre la raison.

---

---

**Voir aussi** — [Installation](Installation.md) · [Guide utilisateur](Guide-Utilisateur.md) · [Exploitation & MCO](Exploitation-MCO.md)
