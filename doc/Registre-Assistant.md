# Registre pour l'assistant

Réponse au document de besoin « Ce dont l'assistant a besoin du Catalogue » (lot E, 27/08/2026).

Ce fichier est le **contrat de lecture** du Catalogue pour un appelant automatisé. Il dit quelle question poser à quelle adresse, ce que la réponse contient, et — surtout — ce qu'elle **ne dit pas**.

> Tout ce qui suit est en **lecture seule**. Aucun point d'entrée listé ici n'écrit, ne déclenche de synchronisation, ne pose ni ne lève de liste blanche.

## Comment appeler

Clé de service `sk_…` dans l'en-tête `x-service-key` ou `Authorization: Bearer`. La documentation OpenAPI complète est servie sur `/openapi`.

### La portée d'un compte de service est désormais déclarée

Le document de besoin avait raison de s'en inquiéter : `readableCategories` renvoyait toutes les catégories dans la branche `!user`, et le middleware ne renseigne pas `ctx.user` pour un compte de service. **La lecture totale venait d'un test de nullité, pas d'une décision** — au point qu'un compte sans aucun scope lisait tout autant.

C'est tranché, dans le sens que la cellule souhaitait, mais **écrit** :

| Scopes du compte | Ce qu'il lit |
|---|---|
| `read` (ou `admin`) | toutes les catégories |
| un ou plusieurs `cat:<clé>` | ces catégories seulement, même en présence de `read` |
| aucun des deux | **rien** |

L'écriture exige `write` **en plus** de la portée : un compte de lecture ne peut pas écrire au motif qu'il voit. La garde par catégorie consulte les mêmes scopes — elle laissait auparavant passer toute clé valide.

⚠️ **À vérifier avant la première mise en service** : un compte créé sans `read` perdra son accès. `select name, scopes from service_account;`

## Les questions d'état

C'était la demande centrale, et elle est juste : `/api/recherche` trouve *l'entité qui s'appelle X*, ce qu'on ne demande presque jamais à un assistant.

### a. Listes blanches — « pourquoi cette alerte ne remonte plus ? »

```
GET /api/whitelists?source=&active=&echues=&sansMotif=
GET /api/whitelists/resume
```

Renvoie `{ total, tri, resultats }`. Chaque ligne porte son `motif`, l'incident Sniff qui la justifie (`sniffIncidentId`), `dateCreation`, `dateRevision`, `prolongations`, `certitudeRapprochement` et une **`echeance` calculée** (un an après la dernière revue, ou après la création si jamais revue — **jamais depuis l'import**).

Tri : échéance croissante, puis libellé. Le libellé en second rend l'ordre stable — sans lui, deux règles de même échéance permutent et une ligne peut disparaître à la pagination.

Deux avertissements à répercuter dans les réponses :
- `certitudeRapprochement = 'probable'` signifie que le lien avec Sniff repose sur la **portée**, pas sur une référence d'outil. C'est un indice, pas une preuve.
- une liste blanche **sans motif** est indéfendable en revue ; le filtre `sansMotif=true` les isole.

### b. Écart de couverture EDR et moteurs éteints

```
GET /api/harfanglab/couverture
GET /api/harfanglab/moteurs
```

*(Le nom est `couverture`, pas `ecarts` : le reste de l'API est en français, et deux noms pour une même chose finissent toujours par diverger.)*

`couverture` renvoie l'écart, **plus `dernierSyncAt` et `dernierStatut`**. Ces deux champs ne sont pas décoratifs : sans eux, une couverture parfaite et un connecteur en panne se ressemblent. Un `dernierStatut: 'jamais'` rend l'écart dénué de sens, de même qu'un `reglesDeclarees: 0` (aucun groupe critique déclaré).

`comptes.ambigus` compte les rapprochements **non tranchés**. C'est le chiffre qui dit ce que valent les autres : un rapprochement faux est pire qu'une absence de rapprochement, parce qu'il produit un nombre — et qu'un nombre est cru.

> ⚠️ `moteurs` : les valeurs de `modes` sont des **entiers dont la signification n'est documentée nulle part chez l'éditeur**. Ne jamais les traduire en « activé » / « désactivé ». Seuls les **changements** sont exploitables. `changements: null` veut dire « premier relevé, rien à comparer » — ce qui n'est pas `[]`, qui veut dire « comparé, rien n'a changé ».

### c. Contenu des moteurs de détection — « que surveille-t-on réellement ? »

```
GET /api/edr/regles/{yara|sigma|ioc|correlation|driverblock}?q=&actif=&origine=
GET /api/edr/regles/{moteur}/{id}
GET /api/edr/rulesets?sansPolitique=true
GET /api/edr/resume
```

`{ total, depart, limite, tri, resultats }`. La recherche `q` porte aussi sur le **corps des règles** : « quelle règle mentionne `mimikatz` ? » a une réponse.

Ni échéance ni revue ici, contrairement aux listes blanches : une règle de détection n'est pas une dérogation. Ce qui appelle une décision, c'est `rulesets?sansPolitique=true` — un jeu de règles que rien n'utilise.

> La page YARA compte des **fichiers**, pas des règles : HarfangLab n'expose pas de règle YARA à l'unité.

### d. Conformité — écarts, plan, risques, AIPD

Les catalogues servent déjà chaque référentiel ligne à ligne. Ce qu'ils ne servaient pas, c'est la question qu'on pose réellement. Cinq points d'entrée, forme unique pour les trois cadres :

```
GET /api/conformite/resume
GET /api/conformite/ecarts?cadre=nis2|iso27001|rgpd|tous&sansPlan=&nonEvaluees=
GET /api/conformite/plan?cadre=&enRetard=true
GET /api/conformite/risques
GET /api/conformite/aipd
```

> ⚠️ **Les trois cadres n'emploient pas le même vocabulaire de conformité**, et c'est le piège de ce domaine :
>
> | Cadre | Valeurs |
> |---|---|
> | NIS 2 | `fait` · `partiellement` · `tres_partiellement` · `pas_du_tout` |
> | ISO 27001 | `conforme` · `partielle` · `non_conforme` · `non_applicable` |
> | RGPD | `conforme` · `partielle` · `non_conforme` · `non_applicable` |
>
> « Conforme » se dit `fait` chez NIS 2 et `conforme` ailleurs ; et `non_applicable` est une valeur de **conformité** chez ISO et RGPD, alors que NIS 2 la range dans son `statut`. Ne jamais comparer ces valeurs entre cadres — `/ecarts` s'en charge et rend une forme homogène.

**`/ecarts`** — tout ce qui n'est pas conforme, avec `reference`, `intitule`, `conformite`, `plan`, `echeance`, `preuve`, `responsable`, `urlAbsolue`, `majLe`.

- Les exigences **jamais évaluées sont incluses par défaut** : une exigence qu'on n'a jamais regardée n'est pas une exigence conforme. `nonEvaluees=false` pour les exclure.
- Ce qui est explicitement **non applicable est exclu** : c'est une décision, pas un écart.
- `sansPlan=true` isole les écarts **sans plan d'action écrit** — l'écart dont personne ne s'est saisi.
- **`cadresLus` dit quels cadres l'appelant a pu lire.** Un cadre absent faute de droits n'est **pas** un cadre sans écart : sans ce champ, un compte restreint annoncerait « zéro écart » sur un référentiel qu'il n'a pas le droit de voir.

**`/plan`** — actions NIS 2 et non-conformités ISO. Deux sources, parce que les cadres travaillent différemment : une action NIS 2 est rattachée à une exigence, une non-conformité ISO porte sa propre correction. `enRetard` est **calculé à la lecture**, jamais stocké — une colonne serait fausse le lendemain. Le champ `enRetard` figure aussi au niveau de la réponse : c'est le total en retard **avant** filtrage.

**`/risques`** — menace, vulnérabilité, vraisemblance, gravité, traitement, niveau résiduel, propriétaire. `sansTraitement` isole les risques pour lesquels **aucun traitement n'a été décidé**.

**`/aipd`** — analyses d'impact par application. Deux marqueurs valent l'essentiel :
- `revueEchue` — le réexamen de l'article 35.11 est dépassé ;
- `sansDateDeRevue` — l'AIPD est **terminée** et n'a **aucune** date de réexamen. C'est le cas le plus discret : elle compte comme faite dans tous les tableaux et ne se rouvrira jamais.

**`/resume`** — compteurs par cadre. Un bloc à **`null` signifie « pas le droit de lire »**, jamais « rien à signaler ».

### d bis. Audit de surface — « que verrait un auditeur depuis Internet ? »

```
GET /api/audit-surface/resume
GET /api/audit-surface/constats?statut=&gravite=&categorie=&serviceId=
GET /api/audit-surface/tableau
GET /api/audit-surface/rapport?par=composante|proprietaire&statuts=ouvert,accepte,corrige
GET /api/audit-surface/decouvertes
```

`resume` porte `configure` **avant** les compteurs, et c'est l'ordre dans lequel il faut les
lire : **`configure: false` signifie qu'aucun constat ne peut arriver**, donc que zéro constat
ne veut rien dire. `dernierSyncAt` et `dernierStatut` disent la fraîcheur — un moteur en panne
et un parc sain se ressemblent sans eux.

Les **découvertes sont comptées à part** (`decouvertesAValider`) et exclues de `constats` : ce
sont des noms d'hôte trouvés, pas des défauts de sécurité, et les additionner gonflerait le
chiffre qui sert à juger l'exposition.

Les constats sont rendus **par gravité décroissante dans l'ordre du vocabulaire** — critique,
élevée, moyenne, faible, info — et non par ordre alphabétique, qui placerait « faible » avant
« moyenne ».

**Deux lectures à ne pas confondre**, et c'est le piège de ce domaine :

- `corrige` veut dire **déclaré corrigé par une personne**. Seul `reteste` dit que le moteur
  est repassé après la correction sans revoir le constat. Compter les deux ensemble comme
  « réglés » annoncerait des corrections non vérifiées.
- `accepte` n'est pas « réglé » non plus : c'est un risque assumé, avec une échéance, et le
  constat se rouvre dès qu'il est revu après elle.

`tableau` rend **trois partitions des constats ouverts** — par composante, par propriétaire,
par classement — dont la somme des `total` vaut `ouverts`. Il porte en outre les
**vérifications de l'intérieur**, avec leur dénominateur et le sous-total des services
sensibles : c'est là que leur absence compte.

`rapport` est la version transmissible, par `composante` ou par `proprietaire`, sur les
statuts demandés — `ouvert,accepte,corrige` par défaut, ce qui n'est donc **pas** le même
périmètre que `tableau`. Il rend les `statuts` retenus avec ses lignes : les lire évite de
citer un rapport pour autre chose que ce qu'il couvre.

Des deux côtés, les lignes `(hors inventaire)`, `(sans propriétaire désigné)`,
`(propriétaire sans composante)` et `(non classé)` **font partie de la partition**. Ce ne sont
pas des anomalies de données à écarter — ce sont les constats dont personne n'est désigné
responsable.

### e. Les référentiels ligne à ligne

```
GET /api/exigences-nis2?page=1&pageSize=50&<colonne>=<valeur>&sort=&dir=
GET /api/exigences-rgpd?page=1&pageSize=50&…
```

Servies par le routeur générique : **n'importe quelle colonne** sert de filtre, `q` cherche en texte libre, `sort`/`dir` fixent le tri. **Avec `page` ou `pageSize`, la réponse est `{ rows, total, page, pageSize }`** — c'est la forme à utiliser, le total y est séparé de la page. Sans ces paramètres, la réponse est le tableau complet et il faudrait le compter soi-même : à éviter.

### f. Échéances — `/api/alerts` couvre bien ce besoin

```
GET /api/alerts
```

Un tableau ; chaque entrée porte `type`, `severity`, `message`, `entite`, `entiteId`, `dueDate`.

**Le trou des certificats est comblé** — il valait mieux le combler que l'annoncer à perpétuité. `certificat_expiration` figure désormais parmi les échéances, aux côtés des VPN, fins de vie, contrats, fins de support, revues d'homologation, réexamens d'AIPD, revues de tiers et revues de listes blanches.

`certificat_invalide` est rapporté **sans `dueDate`**, et c'est délibéré : une chaîne incomplète produit le même incident qu'une expiration, mais elle n'a pas de date. Lui en inventer une en ferait un faux compte à rebours. Un `dueDate: null` signifie donc « état, pas échéance ».

```
GET /api/certificats?probleme=true
GET /api/certificats/echeances?jours=30
GET /api/certificats/resume
```

## Dans chaque réponse

- **Des champs, pas un libellé.** `/api/recherche` renvoie désormais `majLe` et `urlAbsolue` en plus du libellé ; les points d'entrée d'état renvoient les champs qui répondent à la question (motif et date de revue pour une liste blanche, etc.).
- **Une date de fraîcheur.** `updatedAt` sur les fiches, `majLe` en recherche, `vuAuSync` sur tout ce qui vient d'un connecteur, `dernierSyncAt` sur les connecteurs eux-mêmes.
- **Une URL absolue.** `urlAbsolue` en recherche, `url` sur les listes blanches. Elle est composée de `BETTER_AUTH_URL` + `BASE_PATH`, transmis séparément au serveur. **Si l'origine n'est pas configurée, le chemin relatif est rendu tel quel** plutôt qu'une adresse fabriquée : une URL fausse est plus nuisible qu'une URL relative, parce qu'elle a l'air d'une adresse.
- **Un total séparé de la page.** `{ total, resultats }` ou `{ rows, total, page, pageSize }`, compté par la base.
- **Un tri stable et documenté.** Chaque liste renvoie son `tri` en clair, et chaque tri se termine par une clé unique — sans quoi deux lignes égales permutent d'un appel à l'autre et l'une d'elles disparaît à la pagination.

### Afficher une valeur : `libelle`, et non `signifie`

`/api/lectures` donne, pour chaque valeur des vocabulaires fermés, un **`libelle`** court à côté de `signifie`. Le premier sert à **afficher** — deux mots, pour une pastille ou un tableau ; le second à **comprendre**, et c'est une phrase.

Ne recopiez ni l'un ni l'autre dans vos propres tables : une table recopiée diverge le jour d'un renommage, et l'écran affiche alors une étiquette plausible et fausse. Une valeur inconnue s'affiche **brute** plutôt que traduite au jugé.

Le compilateur exige un libellé par valeur : un vocabulaire fermé en porte toujours un. Les familles et les groupes de systèmes font exception et le **dérivent** de leur clé — ils ne sont pas une énumération écrite mais le produit des règles de classement.

### Ce que `/api/recherche` ne fait pas

Elle cherche par **libellé seulement**, au plus `parType` résultats par type. Elle renvoie `exhaustif: false` et `tronque` : **son `total` n'est pas un décompte**. Pour compter quoi que ce soit, utiliser un point d'entrée d'état.

## Nommage : Sniff, pas Slowpoke

**Slowpoke** est le nom du dépôt et de la pile technique ; **Sniff** est le nom de l'application. Le Catalogue écrit « Sniff » partout, et c'est le terme à employer dans les réponses. `doc/Passation.md` écrivait « Sniff/Slowpoke » : à ne pas reprendre.
