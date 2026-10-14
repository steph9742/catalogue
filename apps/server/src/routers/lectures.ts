import { Elysia } from 'elysia'
import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { connecteurSlowpoke } from '@catalogue/database/tables'
import { dechiffrer } from '../utils/secrets'
import { lireLecturesSniff } from '../utils/slowpokeClient'
import { certificatStatut, edrMoteur, whitelistCertitude, whitelistSource } from '@catalogue/database/tables'
import { betterAuth } from '../middleware/auth'
import { MOTIFS_SANS_ECHEANCE } from '../utils/whitelistsEcheance'
import { DOMAINES_LACUNES, UNITES_LACUNE } from './lacunes'
import { ETATS_RGPD } from './rgpd'
import { STATUTS_EOL } from './eol'
import { PERIMETRE_FAMILLE, PERIMETRE_GROUPE } from '../utils/familleOs'
import { CATALOGUES_GENERIQUES } from '../utils/cataloguesGeneriques'
import { filtresDe } from '../utils/resumeGenerique'
import { MOTIFS_SANS_ECHEANCE as MOTIFS } from '../utils/whitelistsEcheance'
import { ETATS_COMPETENCE } from './competencesResume'
import { ETATS_MISE_A_JOUR } from '../utils/versions'
import type { ETATS_CERTIFICAT } from '../utils/certificatEtat'
import {
  aipdStatut, appCriticite, appExposition, appHebergement, appSensibilite, appStatut,
  certificatSource, competenceNiveau, criticiteSurete, iso27001Conformite, nis2Conformite,
  nis2Statut, nis2StatutEntite, rgpdConformite, serviceType, detectionCertitude,
} from '@catalogue/database/tables'

// COMMENT LIRE LES RÉPONSES — les valeurs qui ressemblent à une réponse et n'en sont pas.

/**
 * VOCABULAIRES FERMÉS — chaque valeur porte sa lecture, et le compilateur l'exige.
 */
type Vocabulaire<T extends string> = Record<T, string>

// PAS DE CHAMP DE LOCALISATION, et c'est délibéré. Une première version portait un champ
// `route`.
type Lecture = {
  cle: string
  champ: string
  valeur: string
  signifie: string
  neSignifiePas: string
  consequence: string
  ouCorriger: string
}

const LECTURES: Lecture[] = [
  {
    // Même clé que chez Sniff : les deux applications parlent du même champ, et un lecteur
    // qui suit les deux points d'entrée doit pouvoir les rapprocher.
    cle: 'resolution-absente',
    champ: 'incidents[].resolution',
    valeur: 'null',
    signifie: 'Sniff n\'a pas conclu sur cet incident. Une fiche close pour « pas de risque de sécurité » ou '
      + '« sans objet » est désormais close SANS résolution : Sniff n\'en déduit plus.',
    neSignifiePas: 'Un incident bénin. L\'absence de conclusion n\'est pas une conclusion.',
    consequence: 'Compter ces fiches comme bénignes minorerait les incidents réels. Le motif brut du SOC est '
      + 'rendu à côté, dans `motifClotureSoc`, et la définition qui fait foi est celle de Sniff, relayée dans '
      + '`sniff` par ce même point d\'entrée.',
    ouCorriger: 'Sniff — fiche de l\'incident.',
  },
  {
    cle: 'resolution-risque-assume',
    champ: 'incidents[].resolution',
    valeur: 'risk_accepted',
    signifie: 'Incident réel, non corrigé, dont le risque est assumé.',
    neSignifiePas: 'Un incident traité. « Assumé » et « traité » sont deux états différents, et les fondre ferait '
      + 'disparaître une décision de la lecture.',
    consequence: 'Agréger `risk_accepted` à `true_positive` annoncerait un traitement qui n\'a pas eu lieu.',
    ouCorriger: 'Sniff — fiche de l\'incident.',
  },
  {
    cle: 'donnees-personnelles-non-tranche',
    champ: 'donneesPersonnelles.traite',
    valeur: 'null',
    signifie: 'La question n\'a pas été tranchée pour cette application.',
    neSignifiePas: 'Que l\'application ne traite pas de données personnelles.',
    consequence: 'Une réponse qui conclut à l\'absence de données personnelles serait infondée. Le champ a trois valeurs : true, false, null.',
    ouCorriger: 'Catalogue — fiche de l\'application, volet RGPD.',
  },
  {
    cle: 'application-rgpd-non-evaluee',
    champ: 'etatRgpd',
    valeur: 'non_evalue',
    signifie: 'Les exigences RGPD de cette application n\'ont pas été évaluées, ou pas toutes.',
    neSignifiePas: 'Un écart. Un écart suppose qu\'une exigence a été REGARDÉE et répondue « non conforme ».',
    consequence: 'Agréger `non_evalue` aux écarts annoncerait un manquement sur toute application que personne '
      + 'n\'a encore examinée — soit la totalité du parc au premier jour. `hors_perimetre` n\'entre dans aucun '
      + 'des deux décomptes : l\'application ne traite pas de données personnelles. Les décomptes fermes sont '
      + 'dans /api/conformite/resume, bloc `applicationsRgpd` ; le filtre `?etatRgpd=` les reproduit ligne à ligne.',
    ouCorriger: 'Catalogue — fiche de l\'application, volet RGPD.',
  },
  {
    cle: 'exigence-rgpd-non-evaluee',
    champ: 'donneesPersonnelles.exigences[].etat',
    valeur: 'null',
    signifie: 'L\'exigence n\'a pas été évaluée pour cette application.',
    neSignifiePas: 'Qu\'elle est respectée.',
    consequence: 'Ces exigences ne doivent être comptées ni du côté conforme ni du côté non conforme.',
    ouCorriger: 'Catalogue — fiche de l\'application, volet RGPD.',
  },
  {
    cle: 'conformite-non-evaluee',
    champ: 'conformite',
    valeur: 'null',
    signifie: 'L\'exigence n\'a jamais été évaluée.',
    neSignifiePas: 'Qu\'elle est conforme, ni qu\'elle ne l\'est pas.',
    consequence: 'Ces exigences sont incluses dans les écarts par défaut. `nonEvaluees=false` les exclut, au prix de masquer ce qu\'on ignore.',
    ouCorriger: 'Catalogue — fiche de l\'exigence, champ Conformité.',
  },
  {
    cle: 'vocabulaires-conformite',
    champ: 'conformite',
    valeur: 'fait | conforme',
    signifie: '« Conforme » se dit `fait` en NIS 2 et `conforme` en ISO 27001 et RGPD. `non_applicable` est une valeur de conformité chez les deux derniers, et une valeur de STATUT chez NIS 2.',
    neSignifiePas: 'Que les trois cadres partagent un vocabulaire.',
    consequence: 'Comparer ces valeurs d\'un cadre à l\'autre compte tout un référentiel comme non conforme. Les points d\'entrée /api/conformite rendent une forme homogène.',
    ouCorriger: 'Rien à corriger : c\'est une propriété des référentiels.',
  },
  {
    cle: 'cadres-non-lus',
    champ: 'cadresLus',
    valeur: 'cadre absent de la liste',
    signifie: 'L\'appelant n\'a pas le droit de lire ce cadre.',
    neSignifiePas: 'Que ce cadre est sans écart.',
    consequence: 'Un total d\'écarts calculé sans ce cadre n\'est pas le total de l\'établissement.',
    ouCorriger: 'Catalogue — Réglages, portée du compte de service.',
  },
  {
    cle: 'agent-edr-inconnu',
    champ: 'agentEdr',
    valeur: 'inconnu',
    signifie: 'Le connecteur EDR n\'a jamais abouti : aucun agent n\'est connu du Catalogue.',
    neSignifiePas: 'Qu\'aucun agent n\'est installé sur la machine.',
    consequence: 'L\'écart de couverture n\'est pas calculable. Le champ a trois valeurs : present, absent, inconnu.',
    ouCorriger: 'Catalogue — Réglages, connecteur HarfangLab.',
  },
  {
    cle: 'ecart-couverture-sans-regles',
    champ: 'reglesDeclarees',
    valeur: '0',
    signifie: 'Aucun groupe GLPI n\'est déclaré comme marqueur de criticité.',
    neSignifiePas: 'Qu\'aucune machine critique n\'est sans agent.',
    consequence: 'L\'écart vaut zéro par construction, ce qui ressemble à une couverture parfaite.',
    ouCorriger: 'Catalogue — Réglages, connecteur GLPI, correspondance groupe → criticité.',
  },
  {
    cle: 'moteurs-modes-non-documentes',
    champ: 'modes.*',
    valeur: 'entier',
    signifie: 'La valeur telle que l\'API de l\'éditeur la rend.',
    neSignifiePas: 'Un état « activé » ou « désactivé » : la sémantique de ces entiers n\'est documentée ni dans le swagger ni ailleurs.',
    consequence: 'Seuls les CHANGEMENTS d\'un relevé à l\'autre sont exploitables. Traduire ces valeurs serait inventer une information de sécurité.',
    ouCorriger: 'Question ouverte auprès de HarfangLab.',
  },
  {
    cle: 'premier-releve-moteurs',
    champ: 'changements',
    valeur: 'null',
    signifie: 'Premier relevé : il n\'y a rien à comparer.',
    neSignifiePas: 'Qu\'aucun changement n\'a eu lieu — cela se dit avec un tableau vide.',
    consequence: 'Annoncer « aucun changement » sur un premier relevé donnerait une assurance qui n\'a pas été vérifiée.',
    ouCorriger: 'Se résout au relevé suivant.',
  },
  {
    cle: 'compteur-depose',
    champ: 'court',
    valeur: 'false avec des jours restants négatifs',
    signifie: 'La déclaration a été déposée, ou le compteur n\'est pas applicable.',
    neSignifiePas: 'Un retard.',
    consequence: 'C\'est `court` qui détermine ce qui doit être surveillé, jamais la date seule. Signaler un devoir accompli use l\'attention due aux vrais retards.',
    ouCorriger: 'Rien à corriger.',
  },
  {
    cle: 'applicabilite-non-determinee',
    champ: 'aTrancher',
    valeur: 'true',
    signifie: 'L\'applicabilité du compteur n\'a pas été déterminée.',
    neSignifiePas: 'Que le compteur est non applicable.',
    consequence: 'Aucun délai n\'est décompté, et on ne sait pas s\'il aurait dû l\'être. L\'alerte correspondante ne porte pas d\'échéance.',
    ouCorriger: 'Sniff — sur l\'incident, onglet Conduite.',
  },
  {
    cle: 'technologie-sans-date',
    champ: 'statut',
    valeur: 'inconnu',
    signifie: 'Aucune date de fin de vie n\'est renseignée pour cette technologie.',
    neSignifiePas: 'Que la technologie est maintenue.',
    consequence: 'Ces technologies échappent au décompte des obsolescences.',
    ouCorriger: 'Catalogue — Réglages, Fin de vie des systèmes.',
  },
  {
    cle: 'eol-statut-non-evalue',
    champ: 'eolStatut',
    valeur: 'null',
    signifie: 'La clé de rapprochement avec le référentiel de fin de vie n\'a pas encore été calculée pour '
      + 'cette machine, ou la machine ne porte pas d\'OS renseigné.',
    neSignifiePas: '« Support inconnu » — qui se dit `inconnu` et signifie que la machine EST rapprochée, mais '
      + 'que le référentiel ne porte pas de date.',
    consequence: 'Ces machines ne doivent être comptées ni parmi les supportées ni parmi les dépassées. Les '
      + 'fondre dans les saines ferait lire un parc à moitié traité comme un parc à jour. La reprise se fait '
      + 'à chaque synchronisation GLPI et au démarrage du serveur : ce nombre a vocation à tomber à zéro.',
    ouCorriger: 'Catalogue — Réglages, connecteur GLPI : relancer une synchronisation. Si la valeur persiste, '
      + 'l\'OS de la machine n\'est pas renseigné dans l\'inventaire.',
  },
  {
    cle: 'depasses-minorant',
    champ: 'machinesDepassees',
    valeur: 'entier',
    signifie: 'Le nombre de machines dont le système est hors support ET dont la date de fin est connue.',
    neSignifiePas: 'Le nombre de machines hors support. Les systèmes sans date connue ne sont comptés ni '
      + 'parmi les dépassés ni parmi les supportés : ils sont hors du décompte.',
    consequence: 'C\'est un MINORANT, jamais un total. `resume.osSansDate` donne le nombre de systèmes '
      + 'concernés et `resume.avertissement` est non nul dès qu\'il y en a — à répercuter tel quel. Le même '
      + 'raisonnement vaut pour `machinesSupportees`, minorant lui aussi.',
    ouCorriger: 'Catalogue — Réglages, Fin de vie des systèmes : compléter la version des systèmes sans date, '
      + 'ou saisir la date à la main.',
  },
  {
    cle: 'incident-ouvert-non-filtrable',
    champ: 'incidentOuvert',
    valeur: 'true',
    signifie: 'Au moins un incident ouvert dans Sniff vise cette machine, au dernier relevé.',
    neSignifiePas: 'Un critère de recherche, ni un décompte. L\'absence de marque ne prouve rien non plus : '
      + 'une machine absente de l\'inventaire GLPI ne peut pas être rapprochée.',
    consequence: 'Le champ ne vient pas de la base — il est posé à partir d\'un relevé de Sniff, donc aucun '
      + 'filtre ne peut l\'atteindre et aucune page ne peut le compter. La question « quelles machines sont '
      + 'sous incident ? » se pose depuis /api/incidents/croisement, jamais depuis la machine. Cette limite '
      + 'est délibérée : un miroir des incidents ouverts serait une troisième copie d\'une donnée que Sniff '
      + 'détient, pour une question qui a déjà sa route.',
    ouCorriger: 'Sniff — sur l\'incident. Le rapprochement suppose la machine présente dans l\'inventaire GLPI.',
  },
  {
    cle: 'service-jamais-scanne',
    champ: 'dernierScanAt',
    valeur: 'null',
    signifie: 'Le service n\'a jamais été relevé.',
    neSignifiePas: 'Qu\'il va bien. Aucun de ses états n\'a été constaté.',
    consequence: 'Les trois pastilles valent « inconnu » et le service ne doit être compté ni parmi les '
      + 'sains ni parmi les défaillants. `etat.jamaisScanne` le dit sur la fiche, `jamaisScanne` sur '
      + '/api/sites-services/etat, et l\'avertissement y est non nul dès qu\'il y en a.',
    ouCorriger: 'Catalogue — Sites et services : lancer un relevé.',
  },
  {
    cle: 'technologies-non-detectees',
    champ: 'technologies',
    valeur: 'tableau vide',
    signifie: 'Aucune technologie n\'a été détectée sur ce service.',
    neSignifiePas: 'Qu\'il n\'en porte aucune. Un proxy inverse qui supprime les en-têtes rend un site '
      + 'indétectable.',
    consequence: 'Sur un service de type `messagerie` ou `annuaire`, une liste vide est NORMALE — ils '
      + 'n\'ont ni CMS ni en-tête HTTP. Sur un `web`, c\'est une détection en échec. Lire `service.type` '
      + 'avant de conclure.',
    ouCorriger: 'Rien à corriger si le type n\'est pas `web`. Sinon, vérifier ce que le proxy laisse passer.',
  },
  {
    cle: 'etat-service-sur-technologies',
    champ: 'etat.etat',
    valeur: 'a_jour',
    signifie: 'Aucune des technologies DÉTECTÉES n\'appelle de correctif.',
    neSignifiePas: 'Que le service est à jour. L\'état ne porte que sur ce qui a été détecté.',
    consequence: '`etat.surTechnologies` donne le dénombrement, et il doit accompagner toute citation : '
      + '« à jour sur 2 technologies détectées » n\'est pas « à jour ». La règle d\'agrégation est rendue '
      + 'dans `regleAgregation`, pas à deviner.',
    ouCorriger: 'Rien à corriger : c\'est une limite de la détection, pas un défaut de saisie.',
  },
  {
    cle: 'version-masquee',
    champ: 'certitude',
    valeur: 'absente',
    signifie: 'Le produit est détecté, sa version masquée par l\'administrateur.',
    neSignifiePas: 'Une anomalie. Masquer la version d\'un serveur est une bonne pratique.',
    consequence: 'Aucune fin de support ni retard de version ne peut en être déduit : `technologieCle` '
      + 'est nulle, et rapprocher le produit sans version lui donnerait la date d\'une release précise.',
    ouCorriger: 'Rien à corriger. La version peut être saisie à la main si elle est connue par ailleurs.',
  },
  {
    cle: 'entetes-jamais-releves',
    champ: 'hsts',
    valeur: 'null',
    signifie: 'L\'en-tête n\'a jamais été relevé : le service n\'a pas répondu, ou pas encore été scanné.',
    neSignifiePas: 'Que l\'en-tête est absent, ce qui se dit `false`.',
    consequence: 'Compter les `null` parmi les absents ferait apparaître comme non conformes des '
      + 'services jamais interrogés. `enTetes.jamaisReleves` les dénombre à part.',
    ouCorriger: 'Catalogue — Sites et services : lancer un relevé.',
  },
  {
    cle: 'incident-non-rapproche',
    champ: 'machines[].rapprochee',
    valeur: 'false',
    signifie: 'La machine n\'a pas d\'identifiant GLPI : aucune fiche ne peut lui être rattachée.',
    neSignifiePas: 'Que l\'incident est sans enjeu.',
    consequence: 'Criticité, composante et présence d\'un agent sont inconnues pour cette machine, mais l\'incident existe.',
    ouCorriger: 'Sniff — rattacher la machine à son entrée d\'inventaire.',
  },
  {
    cle: 'source-hors-portee',
    champ: 'lisible',
    valeur: 'false',
    signifie: 'La catégorie est hors de la portée du compte appelant.',
    neSignifiePas: 'Que le référentiel est vide.',
    consequence: 'Un décompte nul n\'est pas interprétable. Même règle pour un bloc `null` dans /api/conformite/resume.',
    ouCorriger: 'Catalogue — Réglages, portée du compte de service.',
  },
  {
    cle: 'miroir-non-releve',
    champ: 'source.dernierAccesAt',
    valeur: 'null ou ancien',
    signifie: 'Le relevé chez la source n\'a jamais abouti, ou date.',
    neSignifiePas: 'Que rien n\'est en cours.',
    consequence: 'Le miroir n\'est jamais vidé sur une panne : il vieillit. Toute donnée citée doit être datée.',
    ouCorriger: 'Catalogue — Réglages, connecteur Sniff.',
  },
  {
    cle: 'recherche-non-exhaustive',
    champ: 'total',
    valeur: 'entier',
    signifie: 'Le nombre de correspondances trouvées, au plus `parType` par type d\'entité.',
    neSignifiePas: 'Un décompte. `exhaustif` vaut systématiquement false.',
    consequence: 'Cette route sert à retrouver une fiche, jamais à compter. Pour compter, utiliser un point d\'entrée d\'état.',
    ouCorriger: 'Rien à corriger.',
  },
  {
    cle: 'combien-sans-unite',
    champ: 'combien',
    valeur: 'entier',
    signifie: 'Ce que compte `unite` : des enregistrements (`fiches`), un délai en jours (`jours`), ou la '
      + 'seule vérité de la condition (`presence`, où 1 signifie « oui » et non « un »).',
    neSignifiePas: 'Un nombre d\'enregistrements par défaut. Trois unités coexistent dans la même liste.',
    consequence: 'Lire `combien` sans `unite` affiche un délai comme un décompte — « 34 » présenté comme un '
      + 'nombre de machines. Additionner des lignes d\'unités différentes produit un total qui ne mesure '
      + 'rien. Sur `jours`, citer `depuis`, qui porte la date : une date ne peut pas être confondue avec un '
      + 'décompte, un délai si.',
    ouCorriger: 'Rien à corriger dans la donnée : lire `unite` avant `combien`.',
  },
  {
    cle: 'doublons-inventaire',
    champ: 'doublons_inventaire',
    valeur: 'entier',
    signifie: 'Des fiches GLPI distinctes portent le même numéro de série.',
    neSignifiePas: 'Rien à propos du nombre de machines physiques.',
    consequence: 'Les décomptes de parc sont surévalués d\'autant. Un total de fiches n\'est pas un nombre de machines.',
    ouCorriger: 'GLPI — purger les entrées périmées.',
  },
  {
    cle: 'codes-de-reponse',
    champ: 'code HTTP',
    valeur: '403 | 404 | 503',
    signifie: '403 : hors de la portée du compte. 404 : l\'objet n\'existe pas sous ce nom. 503 : une source amont est inactive.',
    neSignifiePas: 'Un 404 ou un 503 n\'est pas un défaut de droits, et un 503 n\'est pas une absence de données.',
    consequence: 'Les confondre fait conclure à tort qu\'un domaine est inaccessible. Un 404 sur /api/dossier/application propose les noms proches ; un 503 porte un champ `consequence` à répercuter tel quel.',
    ouCorriger: 'Selon le cas : la portée du compte, le nom demandé, ou le connecteur amont.',
  },
  {
    cle: 'certificat-lu-nest-pas-valide',
    champ: 'certificat.dernierStatut',
    valeur: 'ok',
    signifie: 'Le dernier relevé du certificat a ABOUTI.',
    neSignifiePas: 'Que le certificat est valide. Un certificat expiré depuis un an se lit parfaitement, et rend `ok`.',
    consequence: 'Répondre « certificat valide » sur `dernierStatut: ok` inverse la nouvelle sur un service en '
      + 'panne. L\'état exploitable est `etat.certificat` sur /api/sites-services/liste et /api/sites-services/:id/fiche, '
      + 'vocabulaire `service.certificat` : il croise le relevé, la validation de chaîne et la date de fin.',
    ouCorriger: 'Catalogue — Sites et services, bouton « Relever » sur la fiche du service.',
  },
  {
    cle: 'service-version-inconnue-partielle',
    champ: 'etat.etat',
    valeur: 'version_inconnue',
    signifie: 'Au moins une technologie du service masque sa version, donc son état de mise à jour ne peut pas être établi.',
    neSignifiePas: 'Qu\'aucune technologie n\'a été vérifiée. Un service dont deux technologies sur trois sont à jour rend aussi `version_inconnue`.',
    consequence: 'Annoncer « rien n\'est vérifié » là où presque tout l\'est fait perdre le travail déjà fait. '
      + 'Le drapeau `etat.partiel` vaut `true` exactement dans ce cas, et `etat.verifiees` donne le nombre de '
      + 'technologies dont la version est connue, sur `etat.surTechnologies`. Masquer sa version est une bonne '
      + 'pratique : ce n\'est pas une anomalie à signaler.',
    ouCorriger: 'Rien à corriger côté Catalogue : la version est absente de ce que le service publie.',
  },
]

// --- Vocabulaires, valeur par valeur ---------------------------------------------------

const SANS_ECHEANCE: Vocabulaire<typeof MOTIFS_SANS_ECHEANCE[number]> = {
  editeur: 'Règle fournie par l\'éditeur avec le produit. Elle ne relève d\'aucune décision de la cellule et n\'est pas soumise à revue.',
  technique: 'Règle de configuration de l\'EDR, identifiée par un marqueur déclaré. Distincte d\'une dérogation.',
  disparue: 'Règle absente de l\'EDR au dernier relevé : elle ne s\'applique plus, et n\'appelle donc pas de revue.',
  sans_date: 'L\'EDR n\'a pas fourni de date de création. L\'échéance n\'est pas calculable ; la date d\'import n\'est pas utilisée comme substitut.',
  portee_par_sniff: 'Règle appariée à une exclusion : la date de revue est portée par Sniff, sur l\'incident.',
}

const STATUT_CERTIFICAT: Vocabulaire<typeof certificatStatut.enumValues[number]> = {
  jamais: 'Le certificat n\'a jamais été relevé : sa date d\'expiration est inconnue et il n\'apparaît dans aucune alerte d\'échéance.',
  ok: 'Le certificat a été lu. Cela ne préjuge pas de sa validité : un certificat expiré est lu correctement.',
  injoignable: 'L\'hôte n\'a pas répondu. Le relevé précédent est conservé et peut être périmé.',
  tls_erreur: 'La poignée de main TLS a échoué. Distinct d\'un hôte injoignable : le service répond mais la négociation échoue.',
  invalide: 'Le certificat a été lu mais non validé : chaîne incomplète, racine inconnue ou auto-signé.',
}

const MOTEUR_EDR: Vocabulaire<typeof edrMoteur.enumValues[number]> = {
  yara: 'Fichiers `.yar`. L\'API n\'expose pas de règle YARA à l\'unité : un fichier en contient plusieurs, et le décompte n\'est pas un nombre de règles.',
  sigma: 'Règles de détection sur les journaux, au format YAML.',
  ioc: 'Indicateurs de compromission : couples type/valeur. Un décompte nul est possible et ne vaut pas absence de couverture.',
  correlation: 'Règles rapprochant plusieurs évènements pour en former une détection.',
  driverblock: 'Pilotes bloqués. Famille de routes distincte : les jeux de règles de l\'EDR ne couvrent pas ce moteur.',
}

const SOURCE_WHITELIST: Vocabulaire<typeof whitelistSource.enumValues[number]> = {
  harfanglab: 'Règle connue de l\'EDR seul : aucune exclusion Sniff ne lui est rattachée.',
  sniff: 'Exclusion décidée dans Sniff sans règle EDR appariée.',
  les_deux: 'Règle EDR appariée à une exclusion Sniff : le motif et la date de revue viennent de l\'incident.',
}

const CERTITUDE_RAPPROCHEMENT: Vocabulaire<typeof whitelistCertitude.enumValues[number]> = {
  certain: 'Appariement établi sur la référence d\'outil, transmis par Sniff. C\'est une décision humaine, non une déduction.',
  probable: 'Appariement établi sur la portée et non sur une référence d\'outil : un indice, pas une preuve. À signaler dans toute réponse qui s\'y appuie.',
}

const DOMAINE_LACUNE: Vocabulaire<typeof DOMAINES_LACUNES[number]> = {
  'acces': 'Comptes et rôles : administrateurs dont le rôle échappe à l\'annuaire.',
  'certificats': 'Certificats TLS surveillés : jamais relevés, ou dont l\'hôte ne répond plus.',
  'conformite': 'NIS 2, ISO 27001, RGPD, déclaration d\'applicabilité et compteurs réglementaires.',
  'connecteurs': 'GLPI, Sniff, HarfangLab : inactivité, relevé périmé, règle de criticité non déclarée. Le domaine qui invalide le plus de réponses.',
  'edr': 'Jeux de règles de détection rattachés à aucune politique.',
  'listes-blanches': 'Exclusions sans motif écrit, ou non rattachées à un incident.',
  'parc': 'Serveurs, postes et inventaire GLPI : responsable absent, criticité absente, doublons.',
  'rgpd': 'Analyses d\'impact sans date de réexamen, applications sans volet RGPD ouvert.',
  'risques': 'Risques identifiés sans traitement décidé.',
}

// La clé a la forme `entite.champ`. La partie après le point EST le nom du champ JSON,
// et c'est de là que l'index par champ est dérivé — personne ne le tient à jour.
const ETAT_RGPD: Vocabulaire<typeof ETATS_RGPD[number]> = {
  hors_perimetre: 'L\'application ne traite pas de données personnelles. Elle n\'entre ni dans les écarts ni dans les conformes, et son absence des deux décomptes n\'est pas une omission.',
  ecart: 'Au moins une exigence a été évaluée et répondue « non conforme ». C\'est un manquement mesuré, opposable en revue.',
  conforme: 'Toutes les exigences applicables ont été évaluées, aucune en écart. L\'article 35 en est exclu : il est porté par le bloc d\'analyse d\'impact.',
  non_evalue: 'Personne n\'a répondu, ou pas à tout. C\'est du travail à faire, PAS un manquement : l\'agréger aux écarts annoncerait une non-conformité sur tout ce que personne n\'a encore regardé.',
}

const STATUT_EOL: Vocabulaire<typeof STATUTS_EOL[number]> = {
  depasse: 'Le support standard de l\'éditeur a pris fin, et aucun contrat étendu ne court. La machine ne reçoit plus de correctif de sécurité.',
  etendu: 'Le support standard est dépassé, mais un contrat étendu court encore. À NE PAS compter parmi les technologies hors support : le renouvellement est une échéance, pas un manquement.',
  bientot: 'La fin de support est dans moins d\'un an. Rien n\'est encore exposé ; c\'est une échéance de planification.',
  ok: 'Support standard en cours, échéance connue et à plus d\'un an.',
  supporte: 'Aucune date de fin n\'existe, et la source le CONFIRME — publication continue (Arch), ou éditeur qui n\'annonce pas ses fins à l\'avance (macOS). Distinct de `inconnu` : ici la source a répondu.',
  inconnu: 'Aucune date n\'est renseignée et aucune source ne l\'a confirmée. Ne signifie PAS que la technologie est maintenue : signifie que personne ne sait. Ces machines échappent au décompte des obsolescences.',
}

const NIVEAU_COMPETENCE: Vocabulaire<typeof competenceNiveau.enumValues[number]> = {
  notion: 'Connaît le sujet et sait à qui s\'adresser. Ne conduit pas seul.',
  intermediaire: 'Traite les cas courants seul, demande de l\'aide sur les cas atypiques.',
  confirme: 'Autonome sur l\'ensemble du domaine, y compris en situation dégradée.',
  expert: 'Fait référence dans l\'établissement, forme et arbitre.',
}

const ETAT_COMPETENCE: Vocabulaire<typeof ETATS_COMPETENCE[number]> = {
  couverte: 'Au moins une personne est évaluée au niveau requis ou au-dessus.',
  sous_niveau: 'Détenue, mais par personne au niveau exigé. Appelle une FORMATION.',
  non_evaluee: 'Quelqu\'un est rattaché, mais personne n\'a jugé son niveau. Une compétence est une évaluation, pas une déclaration de l\'intéressé : elle n\'est ni acquise ni manquante. Appelle une ÉVALUATION, ce qui n\'est ni le même acte ni le même budget qu\'une formation.',
  sans_detenteur: 'Aucune personne n\'est rattachée à cette compétence du référentiel. Trou total — le cas que /api/matrice-competences ne pouvait pas montrer, puisqu\'elle part des personnes.',
  sans_exigence: 'Le référentiel ne déclare aucun niveau requis. Ni la suffisance ni l\'insuffisance ne se constatent : ces compétences sont HORS du dénominateur `jugeables`.',
}

const REGIME_NIS2: Vocabulaire<typeof nis2StatutEntite.enumValues[number]> = {
  essentielle: 'Entité essentielle au sens de NIS 2. Régime de contrôle le plus strict, supervision ex ante.',
  importante: 'Entité importante. Mêmes obligations de sécurité et de notification, supervision ex post.',
  non_assujettie: 'L\'établissement a EXAMINÉ la question et conclu qu\'il n\'entre pas dans le champ.',
  a_determiner: 'La question n\'a pas été tranchée. Ne signifie PAS « non assujettie » : conclure à l\'absence d\'obligations sur cette valeur reviendrait à répondre à une question que personne n\'a posée.',
}

const UNITE_LACUNE: Vocabulaire<typeof UNITES_LACUNE[number]> = {
  fiches: 'Un nombre d\'enregistrements. `sur` porte alors le dénominateur.',
  jours: 'Un DÉLAI en jours, pas un décompte. `depuis` porte la date de dernière collecte — c\'est elle qu\'il faut citer, le délai n\'en est qu\'une commodité.',
  presence: 'La condition est vraie. `combien` vaut 1 et ne signifie PAS « un élément » : un connecteur inactif n\'est pas « un connecteur inactif sur un total ». Ne jamais additionner cette valeur avec des `fiches`.',
}

// TROIS VOCABULAIRES DE CONFORMITÉ, ET NON UN. C'est le piège d'origine du Catalogue, et le
// plus coûteux : « conforme » se dit `fait` en NIS 2 et `conforme` en ISO 27001 comme en RGPD.
const CONFORMITE_NIS2: Vocabulaire<typeof nis2Conformite.enumValues[number]> = {
  fait: 'Exigence satisfaite. C\'est la valeur qui vaut « conforme » chez NIS 2 — le mot `conforme` n\'existe pas dans ce vocabulaire.',
  partiellement: 'Satisfaite en partie. Un écart subsiste ; ne pas compter cette exigence parmi les conformes.',
  tres_partiellement: 'Amorcée seulement. Distincte de `partiellement` : l\'écart est majeur, la gradation porte du sens et ne doit pas être aplatie.',
  pas_du_tout: 'Non satisfaite, et cela a été constaté. À ne pas confondre avec `null`, qui signifie que personne n\'a regardé.',
}

const CONFORMITE_ISO27001: Vocabulaire<typeof iso27001Conformite.enumValues[number]> = {
  conforme: 'Clause satisfaite.',
  partielle: 'Satisfaite en partie ; un écart subsiste.',
  non_conforme: 'Non satisfaite, et cela a été constaté. Distinct de `null`, qui signifie non évaluée.',
  non_applicable: 'La clause ne s\'applique pas au périmètre. C\'est une valeur de CONFORMITÉ ici, là où NIS 2 la range dans son STATUT — l\'écart entre les deux référentiels est réel.',
}

const CONFORMITE_RGPD: Vocabulaire<typeof rgpdConformite.enumValues[number]> = {
  conforme: 'Exigence satisfaite.',
  partielle: 'Satisfaite en partie ; un écart subsiste.',
  non_conforme: 'Non satisfaite, et cela a été constaté. Distinct de `null`, qui signifie non évaluée.',
  non_applicable: 'L\'exigence ne s\'applique pas au traitement considéré, avec sa justification.',
}

const STATUT_NIS2: Vocabulaire<typeof nis2Statut.enumValues[number]> = {
  a_faire: 'Travail non engagé.',
  en_cours: 'Travail engagé, non achevé.',
  fait: 'Travail achevé. Distinct de `conformite: fait` : l\'un dit que le travail est terminé, l\'autre que l\'exigence est satisfaite. Ils ne sont pas égaux et n\'ont pas à l\'être.',
  non_applicable: 'L\'exigence ne s\'applique pas. Chez NIS 2 c\'est un STATUT, chez l\'ISO et le RGPD une valeur de CONFORMITÉ.',
}

// La famille d'OS : son PÉRIMÈTRE est la lecture. « 1 240 Windows 10 » ne dit pas si les
// LTSC et les éditions IoT y sont ; le vocabulaire, lui, le dit valeur par valeur.
const FAMILLE_OS: Vocabulaire<string> = PERIMETRE_FAMILLE

// Le NIVEAU DE REGROUPEMENT : « combien de Debian » sans avoir à savoir quelles versions
// existent. Chaque groupe énumère les familles qu'il contient.
const GROUPE_OS: Vocabulaire<string> = PERIMETRE_GROUPE

const CRITICITE_APP: Vocabulaire<typeof appCriticite.enumValues[number]> = {
  vitale: 'Son arrêt interrompt une mission de l\'établissement.',
  critique: 'Criticité affirmée SANS niveau précisé — ce que dit une source qui ne différencie pas, un groupe GLPI par exemple. Ni `vitale` ni `essentielle` : trancher à sa place inventerait une précision qu\'on n\'a pas.',
  essentielle: 'Son arrêt dégrade fortement le service, sans l\'interrompre.',
  importante: 'Son arrêt gêne le service.',
  secondaire: 'Son arrêt est supportable le temps d\'un rétablissement ordinaire.',
}

const CRITICITE_SURETE: Vocabulaire<typeof criticiteSurete.enumValues[number]> = {
  vitale: 'Une défaillance met en cause la sécurité des personnes. Criticité de SÛRETÉ, à ne jamais additionner avec la criticité métier des serveurs.',
  critique: 'Une défaillance a des conséquences physiques graves sans mettre en cause des vies.',
  importante: 'Une défaillance dégrade un procédé sans conséquence physique grave.',
  mineure: 'Une défaillance reste sans conséquence physique.',
}

const STATUT_APP: Vocabulaire<typeof appStatut.enumValues[number]> = {
  en_projet: 'Décidée, pas encore déployée. N\'expose rien.',
  en_deploiement: 'Mise en place en cours ; peut déjà exposer un service.',
  en_production: 'En service. C\'est la population à considérer par défaut pour toute question de risque.',
  en_maintenance: 'En service, sous maintenance particulière.',
  en_decommissionnement: 'Sortie engagée mais NON terminée : l\'application expose encore.',
  retiree: 'Hors service. À exclure des décomptes de risque, et à conserver pour l\'historique.',
}

const EXPOSITION_APP: Vocabulaire<typeof appExposition.enumValues[number]> = {
  interne: 'Accessible depuis le réseau de l\'établissement seulement.',
  dmz: 'Dans une zone tampon, accessible depuis l\'extérieur de manière contrôlée.',
  internet: 'Accessible depuis Internet. C\'est la valeur à croiser avec la criticité pour une question de surface d\'attaque.',
}

const HEBERGEMENT_APP: Vocabulaire<typeof appHebergement.enumValues[number]> = {
  interne: 'Hébergée sur l\'infrastructure de l\'établissement.',
  cloud: 'Hébergée chez un fournisseur, infrastructure administrée par l\'établissement.',
  saas: 'Service en ligne administré par l\'éditeur : l\'établissement ne maîtrise ni le socle ni les correctifs.',
  hybride: 'Répartie entre interne et externe.',
}

const SENSIBILITE_APP: Vocabulaire<typeof appSensibilite.enumValues[number]> = {
  publique: 'Données destinées à être publiées.',
  interne: 'Données d\'usage interne, sans enjeu particulier de confidentialité.',
  restreinte: 'Diffusion limitée à un cercle identifié.',
  confidentielle: 'Divulgation dommageable. À croiser avec `exposition` : confidentielle et exposée sur Internet est la combinaison à surveiller.',
}

const STATUT_AIPD: Vocabulaire<typeof aipdStatut.enumValues[number]> = {
  non_requise: 'Une analyse d\'impact a été jugée non requise, et cette décision est enregistrée. Distinct de `null`, qui signifie que la question n\'a pas été posée.',
  a_faire: 'Nécessaire et non commencée.',
  en_cours: 'Nécessaire et engagée.',
  terminee: 'Achevée. Vérifier `aipdRevueDate` : une AIPD terminée sans date de réexamen est un écart RGPD art. 35.11.',
}

const SOURCE_CERTIFICAT: Vocabulaire<typeof certificatSource.enumValues[number]> = {
  manuel: 'Ajouté à la main par la cellule.',
  import: 'Ajouté par import d\'une liste de sites.',
  scan: 'Découvert par le balayage automatique.',
}

const MOTIF_SANS_ECHEANCE: Vocabulaire<typeof MOTIFS[number] | 'avec_echeance'> = {
  editeur: 'Règle fournie par l\'éditeur avec le produit.',
  technique: 'Règle de configuration de l\'EDR, identifiée par un marqueur déclaré.',
  disparue: 'Règle absente de l\'EDR au dernier relevé.',
  sans_date: 'L\'EDR n\'a pas fourni de date de création.',
  portee_par_sniff: 'Échéance portée par Sniff, sur l\'incident.',
  avec_echeance: 'La règle PORTE une échéance. C\'est le complément des motifs ci-dessus, et sans lui la partition ne sommerait pas au total.',
}

const TYPE_SERVICE: Vocabulaire<typeof serviceType.enumValues[number]> = {
  web: 'Site web. Le scan applicatif s\'y applique : serveur web, langage, CMS sont attendus.',
  messagerie: 'Service de messagerie (SMTPS, IMAPS, POPS). Aucune technologie web n\'est attendue — une liste vide y est NORMALE, pas une détection en échec.',
  annuaire: 'Annuaire (LDAPS). Aucune technologie web n\'est attendue.',
  autre: 'Autre service exposé portant un certificat. Ce qu\'on doit y attendre n\'est pas déterminé.',
}

const ETAT_MISE_A_JOUR: Vocabulaire<typeof ETATS_MISE_A_JOUR[number]> = {
  a_jour: 'La version installée est la dernière de sa branche, et la branche est maintenue.',
  correctif_disponible: 'La branche est maintenue, des correctifs ne sont pas appliqués. Même branche, sans rupture : c\'est une mise à jour, pas un projet.',
  non_maintenue: 'La branche ne reçoit plus rien, quelle que soit la version installée. Inutile de corriger : il faut migrer. Cet état prime sur le retard de correctif.',
  version_inconnue: 'La version installée ou la version de référence manque, ou les deux ne sont pas comparables. N\'est PAS « à jour » : c\'est l\'absence d\'information, et elle ne doit jamais se lire comme une bonne nouvelle.',
}

const CERTITUDE_DETECTION: Vocabulaire<typeof detectionCertitude.enumValues[number]> = {
  certain: 'La version est explicitement annoncée par le service — en-tête ou balise `generator`. C\'est une déclaration du site, non une déduction.',
  probable: 'Le produit est déduit d\'un chemin d\'actif (`/wp-content/`, `/typo3conf/`). Un indice, pas une preuve, et la version n\'en découle pas.',
  absente: 'Le produit est détecté, sa version masquée. Masquer la version est une bonne pratique : ce n\'est PAS une anomalie, mais aucune fin de support ne peut en être déduite.',
}

/**
 * L'ÉTAT du certificat, dérivé de son relevé et de sa date. À ne pas confondre avec
 * `certificat.dernierStatut`, qui dit si la LECTURE a réussi.
 */
const ETAT_CERTIFICAT: Vocabulaire<typeof ETATS_CERTIFICAT[number]> = {
  valide: 'Le certificat est lu, sa chaîne validée, et son expiration est à plus de 30 jours.',
  expire_bientot: 'Le certificat est valide mais expire dans moins de 30 jours. C\'est une échéance, pas encore une panne.',
  expire: 'La date de fin est passée. Les navigateurs refusent le service.',
  invalide: 'Le certificat est lu mais sa chaîne n\'est pas validée : chaîne incomplète, racine inconnue ou auto-signé.',
  injoignable: 'L\'hôte n\'a pas répondu au dernier relevé. L\'état réel du certificat est inconnu — ce n\'est pas « pas de certificat ».',
  jamais_releve: 'Le couple hôte/port est inventorié, mais aucun relevé n\'a jamais abouti.',
  aucun: 'Aucun certificat n\'est inventorié pour ce couple hôte/port.',
}

export const VOCABULAIRES = {
  'whitelist.sansEcheance': SANS_ECHEANCE,
  'certificat.dernierStatut': STATUT_CERTIFICAT,
  'edr.moteur': MOTEUR_EDR,
  'whitelist.source': SOURCE_WHITELIST,
  'whitelist.certitudeRapprochement': CERTITUDE_RAPPROCHEMENT,
  'lacunes.domaine': DOMAINE_LACUNE,
  'lacunes.unite': UNITE_LACUNE,
  'application.etatRgpd': ETAT_RGPD,
  'technologie.eolStatut': STATUT_EOL,
  'competence.niveau': NIVEAU_COMPETENCE,
  'competence.etat': ETAT_COMPETENCE,
  'entiteNis2.statut': REGIME_NIS2,
  'nis2.conformite': CONFORMITE_NIS2,
  'iso27001.conformite': CONFORMITE_ISO27001,
  'rgpd.conformite': CONFORMITE_RGPD,
  'nis2.statut': STATUT_NIS2,
  'eol.famille': FAMILLE_OS,
  'eol.groupe': GROUPE_OS,
  'parc.criticite': CRITICITE_APP,
  'machineIndus.criticiteSurete': CRITICITE_SURETE,
  'application.statut': STATUT_APP,
  'application.exposition': EXPOSITION_APP,
  'application.hebergement': HEBERGEMENT_APP,
  'application.sensibilite': SENSIBILITE_APP,
  'aipd.statut': STATUT_AIPD,
  'certificat.source': SOURCE_CERTIFICAT,
  'whitelist.motifSansEcheance': MOTIF_SANS_ECHEANCE,
  'service.type': TYPE_SERVICE,
  'service.etatMiseAJour': ETAT_MISE_A_JOUR,
  'service.certificat': ETAT_CERTIFICAT,
  'detection.certitude': CERTITUDE_DETECTION,
} as const

// --- LIBELLÉS COURTS ------------------------------------------------------------------
// POURQUOI ILS EXISTENT. `signifie` explique une valeur ; il ne tient pas dans une pastille.
type ClesEtiquetees = Exclude<keyof typeof VOCABULAIRES, 'eol.famille' | 'eol.groupe'>

const LIBELLES: { [K in ClesEtiquetees]: Record<keyof (typeof VOCABULAIRES)[K], string> } = {
  'whitelist.sansEcheance': {
    editeur: 'Fournie par l\'éditeur',
    technique: 'Règle technique',
    disparue: 'Règle disparue',
    sans_date: 'Date de création absente',
    portee_par_sniff: 'Portée par Sniff',
  },
  'certificat.dernierStatut': {
    jamais: 'Jamais relevé',
    ok: 'Relevé',
    injoignable: 'Hôte injoignable',
    tls_erreur: 'Erreur TLS',
    invalide: 'Chaîne non validée',
  },
  'edr.moteur': {
    yara: 'YARA',
    sigma: 'Sigma',
    ioc: 'IOC',
    correlation: 'Corrélation',
    driverblock: 'Driver blocklist',
  },
  'whitelist.source': {
    harfanglab: 'HarfangLab seul',
    sniff: 'Sniff seul',
    les_deux: 'Les deux',
  },
  'whitelist.certitudeRapprochement': {
    certain: 'Appariement certain',
    probable: 'Appariement probable',
  },
  'lacunes.domaine': {
    acces: 'Accès',
    certificats: 'Certificats',
    conformite: 'Conformité',
    connecteurs: 'Connecteurs',
    edr: 'EDR',
    'listes-blanches': 'Listes blanches',
    parc: 'Parc',
    rgpd: 'RGPD',
    risques: 'Risques',
  },
  'application.etatRgpd': {
    hors_perimetre: 'Hors périmètre',
    ecart: 'Écart constaté',
    conforme: 'Conforme',
    non_evalue: 'Non évaluée',
  },
  'technologie.eolStatut': {
    depasse: 'Hors support',
    etendu: 'Support étendu',
    bientot: 'Fin sous 1 an',
    ok: 'Supporté',
    // `ok` et `supporte` ne se fondent pas : l'un repose sur une date future connue,
    // l'autre sur une déclaration sans date. Le libellé doit garder la différence.
    supporte: 'Supporté — sans date annoncée',
    inconnu: 'Support inconnu',
  },
  'competence.niveau': {
    notion: 'Notion',
    intermediaire: 'Intermédiaire',
    confirme: 'Confirmé',
    expert: 'Expert',
  },
  'competence.etat': {
    couverte: 'Couverte',
    sous_niveau: 'Sous le niveau requis',
    non_evaluee: 'Non évaluée',
    sans_detenteur: 'Sans détenteur',
    sans_exigence: 'Sans niveau requis',
  },
  'entiteNis2.statut': {
    essentielle: 'Entité essentielle',
    importante: 'Entité importante',
    non_assujettie: 'Non assujettie',
    a_determiner: 'À déterminer',
  },
  'lacunes.unite': {
    fiches: 'Fiches',
    jours: 'Jours',
    presence: 'Présence',
  },
  'nis2.conformite': {
    fait: 'Fait',
    partiellement: 'Partiellement',
    tres_partiellement: 'Très partiellement',
    pas_du_tout: 'Pas du tout',
  },
  'iso27001.conformite': {
    conforme: 'Conforme',
    partielle: 'Partielle',
    non_conforme: 'Non conforme',
    non_applicable: 'Non applicable',
  },
  'rgpd.conformite': {
    conforme: 'Conforme',
    partielle: 'Partielle',
    non_conforme: 'Non conforme',
    non_applicable: 'Non applicable',
  },
  'nis2.statut': {
    a_faire: 'À faire',
    en_cours: 'En cours',
    fait: 'Fait',
    non_applicable: 'Non applicable',
  },
  'parc.criticite': {
    vitale: 'Vitale',
    critique: 'Critique',
    essentielle: 'Essentielle',
    importante: 'Importante',
    secondaire: 'Secondaire',
  },
  'machineIndus.criticiteSurete': {
    vitale: 'Vitale',
    critique: 'Critique',
    importante: 'Importante',
    mineure: 'Mineure',
  },
  'application.statut': {
    en_projet: 'En projet',
    en_deploiement: 'En déploiement',
    en_production: 'En production',
    en_maintenance: 'En maintenance',
    en_decommissionnement: 'En décommissionnement',
    retiree: 'Retirée',
  },
  'application.exposition': {
    interne: 'Interne',
    dmz: 'DMZ',
    internet: 'Internet',
  },
  'application.hebergement': {
    interne: 'Interne',
    cloud: 'Cloud',
    saas: 'SaaS',
    hybride: 'Hybride',
  },
  'application.sensibilite': {
    publique: 'Publique',
    interne: 'Interne',
    restreinte: 'Restreinte',
    confidentielle: 'Confidentielle',
  },
  'aipd.statut': {
    non_requise: 'Non requise',
    a_faire: 'À faire',
    en_cours: 'En cours',
    terminee: 'Terminée',
  },
  'certificat.source': {
    manuel: 'Saisi à la main',
    import: 'Importé',
    scan: 'Découvert au balayage',
  },
  'whitelist.motifSansEcheance': {
    editeur: 'Fournie par l\'éditeur',
    technique: 'Règle technique',
    disparue: 'Règle disparue',
    sans_date: 'Date de création absente',
    portee_par_sniff: 'Portée par Sniff',
    avec_echeance: 'Avec échéance',
  },
  'service.type': {
    web: 'Web',
    messagerie: 'Messagerie',
    annuaire: 'Annuaire',
    autre: 'Autre',
  },
  'service.etatMiseAJour': {
    a_jour: 'À jour',
    correctif_disponible: 'Correctif disponible',
    non_maintenue: 'Version non maintenue',
    version_inconnue: 'Version inconnue',
  },
  // L'ÉTAT du certificat, et non l'état de sa lecture : `certificat.dernierStatut` a ses
  // propres libellés, disjoints, et les deux se ressemblent assez pour être confondus.
  'service.certificat': {
    valide: 'Valide',
    expire_bientot: 'Expire bientôt',
    expire: 'Expiré',
    invalide: 'Invalide',
    injoignable: 'Hôte injoignable',
    jamais_releve: 'Jamais relevé',
    aucun: 'Aucun certificat',
  },
  'detection.certitude': {
    certain: 'Version annoncée',
    probable: 'Produit déduit',
    absente: 'Version masquée',
  },
}

// Les clés de familles sont déjà des libellés en puissance : `windows_server_2019` se lit «
// Windows Server 2019 », `ubuntu_24_04` se lit « Ubuntu 24.04 ».
const SIGLES_OS: Record<string, string> = {
  rhel: 'RHEL', centos: 'CentOS', almalinux: 'AlmaLinux', suse: 'SUSE',
  macos: 'macOS', ios: 'iOS', ipados: 'iPadOS', bsd: 'BSD', os: 'OS',
}

/**
 * Le libellé d'une famille ou d\'un groupe de systèmes, DÉRIVÉ de sa clé.
 */
export function libelleOs(cle: string): string {
  if (cle === 'autre') return 'Autre'
  const segments = cle.split('_')
  const versions = segments[segments.length - 1] === 'autre' ? segments.slice(0, -1) : segments
  let texte = ''
  for (const m of versions) {
    const mot = SIGLES_OS[m] ?? (/^\d+$/.test(m) ? m : m.charAt(0).toUpperCase() + m.slice(1))
    // Un nombre qui suit un nombre complète la version ; il ne commence pas un mot.
    texte += texte === '' ? mot : (/\d$/.test(texte) && /^\d+$/.test(m) ? '.' : ' ') + mot
  }
  return versions.length === segments.length ? texte : `${texte} (autres versions)`
}

/**
 * Le libellé court d'une valeur. `valeur` elle-même si le vocabulaire n\'en déclare pas —
 * inatteignable pour les vocabulaires écrits, que le compilateur tient complets, et c'est le
 * seul comportement honnête pour une clé inconnue : afficher la valeur brute plutôt qu'une
 * étiquette plausible.
 */
export function libelleValeur(cleVocabulaire: string, valeur: string): string {
  if (cleVocabulaire === 'eol.famille' || cleVocabulaire === 'eol.groupe') return libelleOs(valeur)
  return (LIBELLES as Record<string, Record<string, string>>)[cleVocabulaire]?.[valeur] ?? valeur
}

// --- Applicabilité par champ -----------------------------------------------------------
// POURQUOI CE BLOC EXISTE. Un vocabulaire fermé rend un contrôle de fraîcheur gratuit : une
// valeur absente de la liste ne peut signifier qu'une chose, le catalogue du lecteur est
// périmé.

type Homonyme = { champ: string, ailleurs: string, discriminer: string }

const HOMONYMES: readonly Homonyme[] = [
  {
    champ: 'type',
    ailleurs: '`type` est porté par presque tous les catalogues sur des vocabulaires disjoints : '
      + 'serveurs (vm, physique), postes de travail, appareils mobiles, prestataires, audits, '
      + 'équipements réseau, flux.',
    discriminer: 'N\'appliquer `service.type` qu\'aux objets venant de /api/sites-services.',
  },
  {
    champ: 'etat',
    ailleurs: '`etat` désigne aussi l\'état d\'une exigence RGPD par application '
      + '(conforme, partielle, non_conforme, non_applicable), dans /api/applications, '
      + '/api/rgpd, /api/conformite et /api/dossier/application.',
    discriminer: 'N\'appliquer `competence.etat` qu\'aux objets venant de /api/competences/resume.',
  },
  {
    champ: 'niveau',
    ailleurs: '`niveau` désigne aussi le niveau de gravité d\'un incident (P1, P2…) sur les échéances '
      + 'réglementaires, et le niveau d\'un droit d\'accès (read, write, admin) dans les portées.',
    discriminer: 'N\'appliquer `competence.niveau` qu\'aux objets venant de /api/matrice-competences, '
      + '/api/personnes/:id/competences et /api/competences/resume.',
  },
  {
    champ: 'statut',
    ailleurs: '`statut` est le nom de champ le plus repris de l\'API : incidents, actions, non-conformités, '
      + 'AIPD, connecteurs et matériels en portent un, sur des vocabulaires disjoints.',
    discriminer: 'N\'appliquer `entiteNis2.statut` qu\'à la réponse de /api/entite-nis2, qui est un objet '
      + 'unique et non une liste.',
  },
  {
    champ: 'source',
    ailleurs: '/api/referentiels, /api/eol, /api/conformite (non-conformités), /api/incidents et '
      + '/api/reseau rendent un champ `source` en TEXTE LIBRE. Sur /api/certificats, c\'est un autre '
      + 'vocabulaire fermé : manuel, import, scan.',
    discriminer: 'N\'appliquer `whitelist.source` qu\'aux objets venant de /api/whitelists.',
  },
  {
    champ: 'dernierStatut',
    ailleurs: 'Les connecteurs (Sniff, HarfangLab, GLPI) rendent un `dernierStatut` sur un jeu de '
      + 'valeurs disjoint : jamais, ok, erreur, en_cours.',
    discriminer: 'N\'appliquer `certificat.dernierStatut` qu\'aux objets venant de /api/certificats.',
  },
]

// Un même vocabulaire porté par plusieurs champs. Ceux-ci ne créent aucune ambiguïté : les
// valeurs sont les mêmes, seul le contenant change.
const AUTRES_EMPLACEMENTS: Record<string, readonly string[]> = {
  domaine: ['domainesConnus[]', 'domainesExamines[]', 'domainesAvecLacune[]'],
  moteur: ['parMoteur[].moteur', 'paramètre de chemin de /api/edr/regles/{moteur}'],
  // Aussi la valeur du paramètre `?etatRgpd=` de /api/applications, qui refuse en 422
  // toute valeur hors de cette liste plutôt que de l'ignorer.
  etatRgpd: ['paramètre de requête `?etatRgpd=` de /api/applications'],
  // Un seul vocabulaire pour trois endroits. /api/technologies/parc rendait auparavant
  // `hors_support` au lieu de `depasse` et n'avait pas `etendu` : deux vocabulaires pour le
  // même concept dans la même API, et un filtre fermé sur l'un partait en 422 sur l'autre.
  eolStatut: ['champ `statut` de /api/technologies/parc', 'champ `statut` de /api/eol/etat',
    'paramètres de requête `?eolStatut=` (/api/serveurs, /api/postes-travail) et `?statut=` (/api/technologies/parc)'],
}

type EntreeVocabulaire = {
  cle: string
  champ: string
  applicable: boolean
  valeurs: { valeur: string, libelle: string, signifie: string }[]
  aussi?: readonly string[]
  ailleurs?: string
  discriminer?: string
}

export function vocabulairesParChamp(): EntreeVocabulaire[] {
  const parChamp = new Map<string, string[]>()
  for (const cle of Object.keys(VOCABULAIRES)) {
    const champ = cle.slice(cle.lastIndexOf('.') + 1)
    parChamp.set(champ, [...(parChamp.get(champ) ?? []), cle])
  }
  const homonymes = new Map(HOMONYMES.map(h => [h.champ, h]))

  return Object.entries(VOCABULAIRES).map(([cle, table]) => {
    const champ = cle.slice(cle.lastIndexOf('.') + 1)
    const partage = (parChamp.get(champ) ?? []).filter(autre => autre !== cle)
    const homonyme = homonymes.get(champ)
    return {
      cle,
      champ,
      // Le contrôle « valeur inconnue donc catalogue périmé » ne tient que si ce nom de
      // champ ne désigne qu'un seul vocabulaire, partout.
      applicable: partage.length === 0 && !homonyme,
      valeurs: Object.entries<string>(table).map(([valeur, signifie]) => ({ valeur, libelle: libelleValeur(cle, valeur), signifie })),
      ...(AUTRES_EMPLACEMENTS[champ] ? { aussi: AUTRES_EMPLACEMENTS[champ] } : {}),
      // LES DEUX SOURCES SE CUMULENT, elles ne se remplacent pas. La collision CALCULÉE (deux
      // vocabulaires publiés sur le même nom) et l'homonyme DÉCLARÉ (le nom repris ailleurs en
      // texte libre) disent des choses différentes, et le second n'est pas déductible.
      ...(homonyme || partage.length
        ? {
            ailleurs: [
              partage.length ? `Le champ \`${champ}\` porte aussi : ${partage.join(', ')}.` : '',
              homonyme?.ailleurs ?? '',
            ].filter(Boolean).join(' '),
            discriminer: homonyme?.discriminer
              ?? 'Déterminer l\'entité avant d\'appliquer une liste de valeurs.',
          }
        : {}),
    }
  })
}

// --- Champs calculés ---------------------------------------------------------------------
// OÙ LE CONTRAT PEUT MENTIR SANS QUE PERSONNE S'EN APERÇOIVE. Un champ calculé à la lecture
// existe, se lit, et ne se compte pas forcément.
type ChampCalcule = {
  // UN TABLEAU, ET NON UNE CHAÎNE. Cette liste est destinée à être appariée AUTOMATIQUEMENT aux
  // champs d'une réponse : une chaîne « incidentOuvert, incidentGravite » ne correspondrait à
  // aucun nom de champ JSON, et la mise en garde ne se déclencherait jamais — un contrôle qui
  // ne peut pas s'exécuter est…
  champs: string[]
  porte: string
  calcule: 'sql' | 'javascript'
  /** Le champ peut-il servir de critère de recherche ? */
  filtrable: string | false
  /** Où lire le décompte ferme. `false` : il n'en existe aucun. */
  compte: string | false
  /** Ce qu'une réponse fondée sur ce champ ne doit pas affirmer. */
  piege: string
}

const CHAMPS_CALCULES: ChampCalcule[] = [
  {
    champs: ['etatRgpd'],
    porte: 'applications',
    calcule: 'sql',
    filtrable: '?etatRgpd= (valeur hors vocabulaire refusée en 422)',
    compte: '/api/conformite/resume, bloc applicationsRgpd',
    piege: '`non_evalue` n\'est pas un écart, et `hors_perimetre` n\'entre dans aucun des deux décomptes.',
  },
  {
    champs: ['joursRestants'],
    porte: 'certificats',
    calcule: 'sql',
    filtrable: '?probleme=true, ?expireAvant=, ?statut=',
    compte: '/api/certificats/resume',
    piege: 'Nul quand le certificat n\'a jamais été relevé : une échéance inconnue n\'est pas une échéance lointaine.',
  },
  {
    champs: ['echeance', 'sansEcheance'],
    porte: 'listes blanches',
    calcule: 'sql',
    filtrable: '?avecEcheance=, ?origine=, ?disparues=, ?sansMotif=',
    compte: '/api/whitelists/resume',
    piege: 'Une échéance nulle n\'est pas un oubli : `sansEcheance` en donne toujours le motif.',
  },
  {
    champs: ['eolStatut'],
    porte: 'serveurs, postes de travail',
    calcule: 'sql',
    filtrable: '?eolStatut= (valeur hors vocabulaire refusée en 422)',
    compte: '/api/eol/etat',
    piege: 'Le rapprochement passe par une clé matérialisée à la synchronisation. Une machine dont la clé '
      + 'n\'a pas encore été calculée rend `eolStatut: null` — ce qui n\'est PAS « support inconnu » mais '
      + '« pas encore évalué », et ne doit être compté ni parmi les machines saines ni parmi les dépassées. '
      + 'Une machine sans OS n\'a pas de clé, et ce n\'est pas une lacune.',
  },
  {
    champs: ['incidentOuvert', 'incidentGravite', 'incidentStatut'],
    porte: 'serveurs, postes de travail',
    calcule: 'javascript',
    filtrable: false,
    compte: false,
    piege: 'Indicateur d\'affichage, pas critère de recherche. Ne vient pas de la base mais d\'un relevé de '
      + 'Sniff : aucun filtre ne peut l\'atteindre. La question se pose depuis /api/incidents/croisement, '
      + 'jamais depuis la machine. L\'absence de marque ne prouve rien : une machine hors inventaire GLPI '
      + 'n\'est pas rapprochable.',
  },
]

// --- Partitions ---------------------------------------------------------------------
// POURQUOI CE BLOC EXISTE. C'est prudent, et c'est une inférence — elle marche tant que les
// clés SONT les valeurs, et échoue en silence sinon.
type Partition = {
  route: string
  /** Chemin du bloc dans la réponse, en notation pointée depuis la racine. */
  chemin: string
  /** Clé dans `vocabulaires`. */
  vocabulaire: string
  /** Les clés JSON attendues, DÉRIVÉES — voir `partitionsPubliees()`. */
  cles: string[]
  /**
   * Quand les clés NE SONT PAS les valeurs : le lien qui manquait. `null` lorsque les clés sont
   * les valeurs elles-mêmes.
   */
  alias: Record<string, string> | null
  /** Nom du compteur des valeurs nulles, s'il existe. Sans lui la somme ne fait pas le total. */
  nul: string | null
  /**
   * CE QUE LA PARTITION COMPTE, quand plusieurs partitions du même vocabulaire coexistent.
   */
  note: string | null
  /**
   * CE QUI EST COMPTÉ — la population, et non l'unité. `note` disait « machines » sur deux
   * partitions dont les totaux différaient de 281.
   */
  population: string
  /**
   * CROISEMENT : le vocabulaire du SECOND niveau, quand les valeurs de ce bloc sont elles-mêmes
   * des partitions et non des nombres.
   */
  sousPartition: string | null
}

type DeclarationPartition = Omit<Partition, 'cles'>

const PARTITIONS: DeclarationPartition[] = [
  { route: '/api/conformite/resume', chemin: 'nis2.parConformite', vocabulaire: 'nis2.conformite', alias: null, nul: 'non_evaluee', note: 'Exigences NIS 2 du référentiel, par niveau de conformité.', population: 'exigences du référentiel', sousPartition: null },
  { route: '/api/conformite/resume', chemin: 'nis2.parStatut', vocabulaire: 'nis2.statut', alias: null, nul: 'non_renseigne', note: 'Les MÊMES exigences, par avancement du travail. Ne pas additionner avec `parConformite` : ce sont deux lectures d\'une même population.', population: 'exigences du référentiel', sousPartition: null },
  { route: '/api/conformite/resume', chemin: 'iso27001.parConformite', vocabulaire: 'iso27001.conformite', alias: null, nul: 'non_evaluee', note: 'Clauses ISO 27001 du référentiel, par niveau de conformité.', population: 'exigences du référentiel', sousPartition: null },
  { route: '/api/conformite/resume', chemin: 'rgpd.parConformite', vocabulaire: 'rgpd.conformite', alias: null, nul: 'non_evaluee', note: 'Exigences RGPD du référentiel d\'établissement — PAS l\'état RGPD des applications, qui se lit dans `applicationsRgpd`.', population: 'exigences du référentiel', sousPartition: null },
  { route: '/api/eol/etat', chemin: 'resume.machinesParStatut', vocabulaire: 'technologie.eolStatut', alias: null, nul: null, note: 'Fiches GLPI, regroupées par clé de technologie versionnée. Total plus élevé que celui de /api/technologies/parc : il inclut les mobiles, les machines industrielles, les fiches non classées et les doublons de numéro de série. Un total de fiches n\'est pas un nombre de machines physiques.', population: 'fiches GLPI portant un OS — toutes classifications (serveurs, postes, mobiles, machines industrielles, non classées) et doublons de numéro de série compris', sousPartition: null },
  { route: '/api/eol/etat', chemin: 'resume.osParStatut', vocabulaire: 'technologie.eolStatut', alias: null, nul: null, note: 'SYSTÈMES DISTINCTS, pas machines. « 3 systèmes dépassés » peut représenter 3 machines ou 3 000.', population: 'systèmes distincts du parc GLPI', sousPartition: null },
  {
    route: '/api/eol/etat',
    chemin: 'resume',
    vocabulaire: 'technologie.eolStatut',
    // LES COMPTEURS HISTORIQUES. Noms conservés pour ne pas rompre les appelants en place,
    // et c'est ce lien-là qu'aucun recouvrement ne pouvait deviner.
    sousPartition: null,
    population: 'fiches GLPI portant un OS — toutes classifications (serveurs, postes, mobiles, machines industrielles, non classées) et doublons de numéro de série compris',
    note: 'Les MÊMES nombres que `resume.machinesParStatut`, sous les noms historiques. Redondant à dessein : rompre ces noms casserait les appelants en place.',
    alias: {
      machinesDepassees: 'depasse',
      machinesEtendues: 'etendu',
      machinesBientot: 'bientot',
      machinesOk: 'ok',
      machinesSupportees: 'supporte',
      machinesInconnues: 'inconnu',
    },
    nul: null,
  },
  { route: '/api/technologies/parc', chemin: 'comptes.parEolStatut', vocabulaire: 'technologie.eolStatut', alias: null, nul: null, note: 'TECHNOLOGIES du référentiel (tous types, pas seulement les OS), pas machines.', population: 'technologies du référentiel, tous types', sousPartition: null },
  { route: '/api/technologies/parc', chemin: 'comptes.machinesParEolStatut', vocabulaire: 'technologie.eolStatut', alias: null, nul: null, note: 'Fiches du CATALOGUE (serveurs et postes), sur la même clé versionnée que /api/eol/etat. Population plus étroite : l\'écart avec /api/eol/etat n\'est pas un défaut. `comptes.machinesSansCle` donne les fiches pas encore rapprochées, comptées dans `inconnu`.', population: 'fiches serveur et poste de travail du catalogue, dédoublonnées par nom', sousPartition: null },
  {
    route: '/api/competences/resume',
    chemin: 'etats',
    vocabulaire: 'competence.etat',
    sousPartition: null,
    population: 'compétences du référentiel',
    note: 'Compétences du référentiel, une par ligne. `jugeables` exclut `sans_exigence` du dénominateur.',
    alias: {
      couverte: 'couverte',
      sousNiveau: 'sous_niveau',
      nonEvaluee: 'non_evaluee',
      sansDetenteur: 'sans_detenteur',
      sansExigence: 'sans_exigence',
    },
    nul: null,
  },
  { route: '/api/eol/etat', chemin: 'resume.machinesParGroupe', vocabulaire: 'eol.groupe', alias: null, nul: null, sousPartition: null, population: 'fiches GLPI portant un OS', note: 'MACHINES par GROUPE — « combien de Debian », toutes versions confondues. Niveau au-dessus de `machinesParFamille` ; `resume.famillesDuGroupe` dit quelles familles composent chaque groupe.' },
  { route: '/api/eol/etat', chemin: 'resume.osParGroupe', vocabulaire: 'eol.groupe', alias: null, nul: null, sousPartition: null, population: 'systèmes distincts du parc GLPI', note: 'SYSTÈMES DISTINCTS par groupe, pas machines.' },
  { route: '/api/eol/etat', chemin: 'resume.machinesParGroupeEtStatut', vocabulaire: 'eol.groupe', alias: null, nul: null, sousPartition: 'technologie.eolStatut', population: 'fiches GLPI portant un OS', note: 'CROISEMENT groupe × état de support. Les valeurs sont des OBJETS et non des nombres, voir `sousPartition`.' },
  { route: '/api/eol/etat', chemin: 'resume.machinesParFamille', vocabulaire: 'eol.famille', alias: null, nul: null, sousPartition: null, population: 'fiches GLPI portant un OS', note: 'MACHINES par famille de système, calculée depuis la clé VERSIONNÉE et non depuis le nom. Le périmètre de chaque famille — variantes, éditions, releases — est dans le vocabulaire `eol.famille`.' },
  { route: '/api/eol/etat', chemin: 'resume.osParFamille', vocabulaire: 'eol.famille', alias: null, nul: null, sousPartition: null, population: 'systèmes distincts du parc GLPI', note: 'SYSTÈMES DISTINCTS par famille, pas machines.' },
  { route: '/api/eol/etat', chemin: 'resume.machinesParFamilleEtStatut', vocabulaire: 'eol.famille', alias: null, nul: null, sousPartition: 'technologie.eolStatut', population: 'fiches GLPI portant un OS', note: 'CROISEMENT famille × état de support — « combien de Windows 10 dépassés ». Les valeurs sont des OBJETS et non des nombres : chaque famille porte sa propre partition d\'état, voir `sousPartition`.' },
  { route: '/api/parc/resume', chemin: 'serveurs.parCriticite', vocabulaire: 'parc.criticite', alias: null, nul: 'non_renseignee', sousPartition: null, population: 'serveurs du catalogue', note: 'Criticité MÉTIER. `critique` sans niveau précisé est une valeur à part entière, pas un synonyme de `vitale`.' },
  { route: '/api/parc/resume', chemin: 'postesTravail.parCriticite', vocabulaire: 'parc.criticite', alias: null, nul: 'non_renseignee', sousPartition: null, population: 'postes de travail du catalogue', note: 'Criticité métier des postes.' },
  { route: '/api/parc/resume', chemin: 'machinesIndus.parCriticiteSurete', vocabulaire: 'machineIndus.criticiteSurete', alias: null, nul: 'non_renseignee', sousPartition: null, population: 'machines industrielles du catalogue', note: 'Criticité de SÛRETÉ, vocabulaire distinct de la criticité métier. Les additionner produirait un chiffre sans référent.' },
  { route: '/api/applications/resume', chemin: 'parStatut', vocabulaire: 'application.statut', alias: null, nul: 'non_renseigne', sousPartition: null, population: 'applications du catalogue', note: 'Cycle de vie. `en_decommissionnement` expose ENCORE : ne pas le compter avec `retiree`.' },
  { route: '/api/applications/resume', chemin: 'parExposition', vocabulaire: 'application.exposition', alias: null, nul: 'non_renseignee', sousPartition: null, population: 'applications du catalogue', note: 'Surface d\'exposition réseau, à croiser avec `parSensibilite` et `parCriticite`.' },
  { route: '/api/applications/resume', chemin: 'parHebergement', vocabulaire: 'application.hebergement', alias: null, nul: 'non_renseigne', sousPartition: null, population: 'applications du catalogue', note: 'Où tourne l\'application. `saas` signifie que l\'établissement ne maîtrise ni le socle ni les correctifs.' },
  { route: '/api/applications/resume', chemin: 'parSensibilite', vocabulaire: 'application.sensibilite', alias: null, nul: 'non_renseignee', sousPartition: null, population: 'applications du catalogue', note: 'Sensibilité des données traitées.' },
  { route: '/api/applications/resume', chemin: 'parCriticite', vocabulaire: 'parc.criticite', alias: null, nul: 'non_renseignee', sousPartition: null, population: 'applications du catalogue', note: 'Même vocabulaire de criticité que le parc, population différente : ne pas rapprocher les deux.' },
  { route: '/api/applications/resume', chemin: 'parEtatRgpd', vocabulaire: 'application.etatRgpd', alias: null, nul: null, sousPartition: null, population: 'applications du catalogue', note: 'Mêmes nombres que `applicationsRgpd` de /api/conformite/resume.' },
  { route: '/api/certificats/resume', chemin: 'parStatut', vocabulaire: 'certificat.dernierStatut', alias: null, nul: null, sousPartition: null, population: 'certificats surveillés', note: 'PARTITION, contrairement aux compteurs voisins (`expires`, `invalides`, `injoignables`) qui se recoupent et dont la somme ne veut rien dire.' },
  { route: '/api/certificats/resume', chemin: 'parSource', vocabulaire: 'certificat.source', alias: null, nul: null, sousPartition: null, population: 'certificats surveillés', note: 'Comment le certificat est entré dans l\'inventaire.' },
  { route: '/api/whitelists/resume', chemin: 'parSource', vocabulaire: 'whitelist.source', alias: null, nul: null, sousPartition: null, population: 'règles de liste blanche', note: 'PARTITION, contrairement aux compteurs voisins qui se recoupent.' },
  { route: '/api/whitelists/resume', chemin: 'parMotifSansEcheance', vocabulaire: 'whitelist.motifSansEcheance', alias: null, nul: null, sousPartition: null, population: 'règles de liste blanche', note: 'Pourquoi une règle n\'a pas d\'échéance. `avec_echeance` est le complément : sans lui la somme ne ferait pas le total.' },
  { route: '/api/conformite/resume', chemin: 'aipd.parStatut', vocabulaire: 'aipd.statut', alias: null, nul: 'non_renseigne', sousPartition: null, population: 'volets RGPD ouverts sur une application', note: '`non_renseigne` n\'est pas `non_requise` : la première dit que personne n\'a tranché, la seconde qu\'une décision est enregistrée.' },
]

// --- Ventilations -----------------------------------------------------------------------
// UNE VENTILATION N'EST PAS UNE PARTITION, et les confondre casserait un contrôle.
type Ventilation = {
  route: string
  chemin: string
  /** Le point d'entrée qui énumère les valeurs de l\'axe. Une valeur absente de la
   *  ventilation s'y lit « zéro », jamais « inconnue ». */
  axe: string
  population: string
  /** Le compteur des lignes que l'axe ne classe pas. Toujours présent. */
  sansRattachement: string
  note: string
}

const VENTILATIONS: Ventilation[] = [
  { route: '/api/parc/resume', chemin: 'serveurs.parComposante', axe: '/api/composantes', population: 'serveurs du catalogue', sansRattachement: 'sansRattachement', note: 'Serveurs par composante — « combien de serveurs à l\'UFR ST ».' },
  { route: '/api/parc/resume', chemin: 'serveurs.parService', axe: '/api/services', population: 'serveurs du catalogue', sansRattachement: 'sansRattachement', note: 'Serveurs par service. Ne se déduit PAS de la ventilation par composante : une machine peut porter un service sans composante.' },
  { route: '/api/parc/resume', chemin: 'serveurs.parDepartement', axe: '/api/departements', population: 'serveurs du catalogue', sansRattachement: 'sansRattachement', note: 'Serveurs par département.' },
  { route: '/api/parc/resume', chemin: 'postesTravail.parComposante', axe: '/api/composantes', population: 'postes de travail du catalogue', sansRattachement: 'sansRattachement', note: 'Postes de travail par composante.' },
  { route: '/api/parc/resume', chemin: 'postesTravail.parService', axe: '/api/services', population: 'postes de travail du catalogue', sansRattachement: 'sansRattachement', note: 'Postes de travail par service.' },
  { route: '/api/parc/resume', chemin: 'postesTravail.parDepartement', axe: '/api/departements', population: 'postes de travail du catalogue', sansRattachement: 'sansRattachement', note: 'Postes de travail par département.' },
  { route: '/api/parc/resume', chemin: 'machinesIndus.parComposante', axe: '/api/composantes', population: 'machines industrielles du catalogue', sansRattachement: 'sansRattachement', note: 'Machines industrielles par composante.' },
  { route: '/api/parc/resume', chemin: 'machinesIndus.parService', axe: '/api/services', population: 'machines industrielles du catalogue', sansRattachement: 'sansRattachement', note: 'Machines industrielles par service.' },
  { route: '/api/parc/resume', chemin: 'machinesIndus.parDepartement', axe: '/api/departements', population: 'machines industrielles du catalogue', sansRattachement: 'sansRattachement', note: 'Machines industrielles par département.' },
  { route: '/api/parc/resume', chemin: 'appareilsMobiles.parComposante', axe: '/api/composantes', population: 'appareils mobiles du catalogue', sansRattachement: 'sansRattachement', note: 'Appareils mobiles par composante.' },
  { route: '/api/parc/resume', chemin: 'appareilsMobiles.parService', axe: '/api/services', population: 'appareils mobiles du catalogue', sansRattachement: 'sansRattachement', note: 'Appareils mobiles par service.' },
  { route: '/api/parc/resume', chemin: 'appareilsMobiles.parDepartement', axe: '/api/departements', population: 'appareils mobiles du catalogue', sansRattachement: 'sansRattachement', note: 'Appareils mobiles par département.' },
  { route: '/api/applications/resume', chemin: 'parPole', axe: '/api/poles', population: 'applications du catalogue', sansRattachement: 'sansRattachement', note: 'Applications par pôle. Le pôle est le SEUL axe organisationnel que porte une application : elle ne se rattache ni à une composante ni à un service.' },
]

export function ventilationsPubliees(): Ventilation[] { return VENTILATIONS }

// --- Filtres ------------------------------------------------------------------------
// LE CROISEMENT EXISTE, ET IL N'ÉTAIT PAS ANNONCÉ. « Combien de serveurs en production à l'UFR
// ST » a une réponse exacte en un appel : `/api/serveurs?statut=…&composanteId=…&pageSize=1`
// rend le `total` croisé, compté par la base sur les deux critères.
const PARAMS_COMMUNS = [
  { param: 'q', role: 'recherche en texte libre sur toutes les colonnes textuelles, y compris les énumérations' },
  { param: 'page', role: 'numéro de page ; déclenche l\'enveloppe { rows, total, page, pageSize }' },
  { param: 'pageSize', role: 'taille de page, plafonnée à 200, 50 par défaut ; l\'un des deux suffit' },
  { param: 'sort', role: 'colonne de tri' },
  { param: 'dir', role: 'asc | desc' },
]

export function filtresPublies() {
  return CATALOGUES_GENERIQUES.map(c => ({
    catalogue: c.name,
    prefix: c.prefix,
    // Tout filtre se combine avec les autres en ET, et plusieurs valeurs séparées par des
    // virgules se combinent en OU sur le même champ.
    filtres: filtresDe(c.table),
  }))
}

/**
 * Les clés attendues, DÉRIVÉES du vocabulaire — jamais recopiées. Sans alias, ce sont les
 * valeurs elles-mêmes, plus le compteur des nulles.
 */
export function partitionsPubliees(): Partition[] {
  return PARTITIONS.map((d) => {
    const table = (VOCABULAIRES as Record<string, Record<string, string>>)[d.vocabulaire]
    const cles = d.alias
      ? Object.keys(d.alias)
      : [...Object.keys(table ?? {}), ...(d.nul ? [d.nul] : [])]
    return { ...d, cles }
  })
}

// Le relais est mis en cache : ce point d'entrée se charge une fois par session, mais une
// instance Sniff lente ne doit pas le ralentir à chaque appel.
const CACHE_SNIFF_MS = 10 * 60 * 1000
let cacheSniff: { pose: number, valeur: unknown } | null = null

/**
 * Les mises en garde de Sniff, ou la raison de leur absence. `lues: false` AVEC son motif,
 * jamais un objet vide : « Sniff ne dit rien » et « nous n'avons pas pu lire Sniff » ne se
 * ressemblent pas, et le second ne doit pas se lire comme le premier.
 */
async function relaiSniff(): Promise<{ lues: boolean, motif?: string, contenu?: unknown }> {
  if (cacheSniff && Date.now() - cacheSniff.pose < CACHE_SNIFF_MS) return { lues: true, contenu: cacheSniff.valeur }
  const [cfg] = await db.select().from(connecteurSlowpoke).where(eq(connecteurSlowpoke.id, 'connecteur-slowpoke-singleton')).limit(1)
  const cle = dechiffrer(cfg?.cleService)
  if (!cfg?.url || !cle || !cfg.actif) {
    return { lues: false, motif: 'Connecteur Sniff inactif ou non configuré : ses mises en garde ne peuvent pas être lues.' }
  }
  try {
    const contenu = await lireLecturesSniff({ url: cfg.url, cleService: cle })
    if (contenu === null) return { lues: false, motif: 'Cette instance Sniff ne publie pas /api/lectures (instance à mettre à jour).' }
    cacheSniff = { pose: Date.now(), valeur: contenu }
    return { lues: true, contenu }
  }
  catch (e) {
    return { lues: false, motif: e instanceof Error ? e.message : String(e) }
  }
}

export const lecturesRouter = new Elysia({ name: 'lectures', prefix: '/api/lectures' })
  .use(betterAuth)
  .guard({ detail: { tags: ['Pilotage'] } })

  .get('/', async () => ({
    total: LECTURES.length,
    // LES MISES EN GARDE DE SNIFF, relayées en direct et non recopiées : le Catalogue transmet
    // des champs dont la définition vit chez eux.
    sniff: await relaiSniff(),
    // LA LIMITE DE CE QUI EST GARANTI, énoncée avec la garantie. Les deux moitiés de ce point
    // d'entrée n'offrent pas la même solidité, et le taire laisserait croire qu'elles se
    // valent.
    garantie: {
      vocabulairesFermes: {
        exhaustif: true,
        couverts: Object.keys(VOCABULAIRES),
        comment: 'Chaque vocabulaire est un `Record<Valeur, string>` dont le type des clés vient de '
          + 'l\'énumération elle-même. Ajouter une valeur arrête la compilation tant que sa lecture '
          + 'n\'est pas écrite. Constaté en ajoutant `usb` à `edrMoteur` : « Property \'usb\' is missing ».',
        controleDeFraicheur: 'Sur une entrée `applicable: true`, une valeur absente de `valeurs` ne peut '
          + 'signifier qu\'une chose : le catalogue du lecteur est périmé. Sur une entrée '
          + '`applicable: false`, le nom du champ est porté ailleurs par un autre vocabulaire ou par du '
          + 'texte libre — `ailleurs` dit où, `discriminer` dit à quelle condition le contrôle vaut. '
          + 'Appliqué sans cette condition, il signale une péremption sur une réponse saine.',
      },
      partitions: {
        exhaustif: false,
        couverts: PARTITIONS.length,
        comment: 'Chaque entrée dit OÙ se trouve un bloc de compteurs, QUEL vocabulaire il partitionne, et '
          + 'ses clés exactes — dérivées du vocabulaire, jamais recopiées. `alias` donne le lien quand les '
          + 'clés ne sont PAS les valeurs (`machinesDepassees` → `depasse`), cas qu\'un appariement par '
          + 'recouvrement ne peut pas reconnaître. `nul` nomme le compteur des valeurs nulles : sans lui, la '
          + 'somme des parts ne fait pas le total. Cette liste est écrite à la main — une partition ajoutée '
          + 'demain n\'y figurera que si quelqu\'un l\'écrit — mais ses CLÉS, elles, ne peuvent pas se '
          + 'périmer. Elle sert aussi de marqueur de version : si une partition est listée ici et absente de '
          + 'la réponse correspondante, c\'est une régression ; si elle n\'est listée ni ici ni là, la '
          + 'version déployée ne la porte pas encore.',
      },
      filtres: {
        // EXHAUSTIF pour la même raison que les résumés : la liste des filtres EST la liste des
        // colonnes, et `critereDe` accepte exactement celles-là.
        exhaustif: true,
        couverts: CATALOGUES_GENERIQUES.length,
        comment: 'Ne couvre QUE les catalogues du routeur générique. Les routes dédiées '
          + '(/api/whitelists, /api/certificats, /api/applications…) ont leurs propres filtres, décrits '
          + 'dans leur documentation OpenAPI et non ici.',
      },
      resumesParAxe: {
        // EXHAUSTIF, et c'est le seul bloc de cette réponse à pouvoir le dire. Les partitions
        // et les ventilations ci-dessus sont déclarées à la main : une omission ne produit
        // aucune erreur.
        exhaustif: true,
        comment: 'Chaque catalogue du routeur générique expose `GET <prefix>/resume`, dérivé de ses '
          + 'COLONNES : une partition par énumération, une ventilation par clé étrangère vers un '
          + 'référentiel connu. Ce sont exactement les axes des filtres de recherche. `axes` y énumère ce '
          + 'que la table porte : un axe absent de cette liste signifie que la table ne le porte PAS, ce '
          + 'qui n\'est pas la même chose qu\'un axe dont aucune valeur n\'est renseignée. Les blocs '
          + '`partitions` et `ventilations` ci-dessus ne recensent donc QUE les résumés écrits à la main '
          + '— ceux des routes dédiées.',
      },
      ventilations: {
        exhaustif: false,
        couverts: VENTILATIONS.length,
        comment: 'Une ventilation n\'est PAS une partition : son axe est un référentiel, pas un vocabulaire '
          + 'fermé. Ses valeurs changent sans déploiement, et exiger une liste complète ferait rougir un '
          + 'contrôle à la création d\'une composante. `axe` donne le point d\'entrée qui les énumère : une '
          + 'valeur absente de la ventilation s\'y lit « zéro », jamais « inconnue ». `sansRattachement` '
          + 'compte les lignes que l\'axe ne classe pas — sans lui, additionner les composantes rend un parc '
          + 'plus petit que le parc.',
      },
      champsCalcules: {
        exhaustif: false,
        couverts: CHAMPS_CALCULES.length,
        comment: 'Un champ calculé à la lecture existe, se lit, et ne se compte pas forcément. Rien dans une '
          + 'réponse ne distingue un champ porté par une colonne d\'un champ posé après coup — c\'est en '
          + 'produisant une réponse fausse qu\'on découvre la différence. `filtrable: false` interdit de s\'en '
          + 'servir comme critère ; `compte: false` interdit de le dénombrer, y compris sur une page complète. '
          + 'Cette liste est écrite à la main : un champ calculé ajouté demain n\'y figurera que si quelqu\'un '
          + 'l\'écrit.',
      },
      champsAmbigus: {
        exhaustif: false,
        couverts: LECTURES.length,
        comment: 'RIEN ne relie un champ nouvellement ajouté à cette liste. Un champ à trois états créé '
          + 'demain n\'y figurera que si quelqu\'un l\'écrit. Cette moitié demande donc une relecture '
          + 'humaine, là où la précédente se défend seule.',
      },
    },
    tri: 'ordre de déclaration, du plus fréquent au plus rare',
    // Où le contrat peut mentir sans que personne s'en aperçoive : un champ qui existe,
    // qui se lit, et qui ne se compte pas.
    champsCalcules: CHAMPS_CALCULES,
    // Les blocs de compteurs, avec le vocabulaire qu'ils partitionnent et leurs clés exactes.
    partitions: partitionsPubliees(),
    // Les décomptes par axe ORGANISATIONNEL. Distincts des partitions : leur axe est un
    // référentiel, ses valeurs changent sans déploiement.
    ventilations: VENTILATIONS,
    // Les filtres acceptés par chaque catalogue, dérivés de ses colonnes. C'est ce qui
    // rend le croisement possible : filtrer, puis lire `total`.
    filtres: {
      commentCroiser: 'Pour « combien de X en Y à Z » : appeler <prefix> avec un paramètre par axe et '
        + '`pageSize=1`, puis lire `total`. Il est compté par la base sur le croisement, jamais déduit des '
        + 'lignes rendues. Les filtres se combinent en ET ; plusieurs valeurs séparées par des virgules se '
        + 'combinent en OU sur le même champ. Un axe `referentiel` attend un IDENTIFIANT, pas un libellé — '
        + '`axe` donne le point d\'entrée où le retrouver.',
      neJamaisFaire: 'Multiplier deux proportions pour estimer un croisement. Les axes ne sont pas '
        + 'indépendants : la part des serveurs en production diffère d\'une composante à l\'autre.',
      communs: PARAMS_COMMUNS,
      catalogues: filtresPublies(),
    },
    lectures: LECTURES,
    // VOCABULAIRES FERMÉS — chaque valeur AVEC son libellé court et sa lecture, et non la seule
    // liste des valeurs possibles.
    vocabulaires: vocabulairesParChamp(),
  }), {
    auth: ['user', 'admin', 'svc'],
    detail: {
      summary: 'Comment lire les réponses : les valeurs qui ressemblent à une réponse et n\'en sont pas.',
      description: 'À charger une fois par session. Chaque entrée dit ce qu\'une valeur SIGNIFIE, ce qu\'elle '
        + 'NE SIGNIFIE PAS, la conséquence sur une réponse fondée dessus, et OÙ la corriger. '
        + '`vocabulaires` a la même forme : un tableau dont chaque entrée porte `cle`, `champ` et '
        + 'TOUTES les valeurs du vocabulaire AVEC leur libellé court (`libelle`, pour afficher) et leur '
        + 'lecture (`signifie`, pour comprendre). Le compilateur exige une entrée par valeur, libellé '
        + 'compris : ajouter une valeur à l\'une de ces énumérations arrête la compilation tant que sa '
        + 'lecture n\'est pas écrite. Un libellé se relaie, il ne se recopie pas : une table recopiée '
        + 'diverge le jour d\'un renommage, et l\'écran affiche alors une étiquette plausible et fausse. `applicable` dit si le nom de champ suffit à identifier le '
        + 'vocabulaire ; quand il vaut false, `discriminer` donne la condition. Aucune des deux moitiés '
        + 'ne localise les routes : un champ transverse comme `conformite` apparaît dans des dizaines de '
        + 'réponses, et l\'énumérer reviendrait à ne le documenter que là où l\'on a pensé. Ce point '
        + 'd\'entrée remplace toute table recopiée dans une documentation tierce : une table recopiée '
        + 'diverge, une charge utile non.',
    },
  })
