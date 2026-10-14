// EXIGENCES DE SÉCURITÉ DU RGPD — règlement (UE) 2016/679. PÉRIMÈTRE.

export type ExigenceRgpd = {
  reference: string
  article: number
  intituleArticle: string
  intitule: string
  // À quel niveau l'exigence se vérifie. Voir `rgpdPortee` côté schéma.
  portee: 'etablissement' | 'application' | 'les_deux'
  ordre: number
}

// Lien proposé vers un autre cadre. `officiel: false` partout — voir plus bas.
export type LienRgpd = {
  reference: string // référence RGPD
  cible: 'nis2' | 'iso27001' | 'iso27002'
  cle: string // objectif ReCyF (numéro) ou référence ISO
  justification: string
}

const ART = {
  5: 'Principes relatifs au traitement des données à caractère personnel',
  24: 'Responsabilité du responsable du traitement',
  25: 'Protection des données dès la conception et protection des données par défaut',
  28: 'Sous-traitant',
  30: 'Registre des activités de traitement',
  32: 'Sécurité du traitement',
  33: "Notification à l'autorité de contrôle compétente d'une violation de données à caractère personnel",
  34: 'Communication à la personne concernée d\'une violation de données à caractère personnel',
  35: 'Analyse d\'impact relative à la protection des données',
} as const

export const exigencesRgpd: ExigenceRgpd[] = [
  { reference: '5.1.f', article: 5, intituleArticle: ART[5], portee: 'les_deux', ordre: 10,
    intitule: "Traiter les données de façon à garantir leur sécurité, y compris la protection contre le traitement non autorisé ou illicite, la perte, la destruction ou les dégâts d'origine accidentelle — principe d'intégrité et de confidentialité." },

  { reference: '24', article: 24, intituleArticle: ART[24], portee: 'etablissement', ordre: 20,
    intitule: "Mettre en œuvre des mesures techniques et organisationnelles appropriées pour s'assurer et être en mesure de DÉMONTRER que le traitement est conforme. Les réexaminer et les actualiser." },

  { reference: '25.1', article: 25, intituleArticle: ART[25], portee: 'application', ordre: 30,
    intitule: "Protection des données dès la conception : intégrer les garanties nécessaires dès la détermination des moyens du traitement, et non après coup." },
  { reference: '25.2', article: 25, intituleArticle: ART[25], portee: 'application', ordre: 31,
    intitule: "Protection des données par défaut : par défaut, seules les données nécessaires à chaque finalité sont traitées — quantité, étendue de la conservation, accessibilité. Un réglage par défaut permissif est une non-conformité." },

  { reference: '28.1', article: 28, intituleArticle: ART[28], portee: 'etablissement', ordre: 40,
    intitule: "Ne recourir qu'à des sous-traitants présentant des garanties suffisantes quant à la mise en œuvre de mesures techniques et organisationnelles appropriées. La garantie doit être établie AVANT le recours, pas constatée après." },
  { reference: '28.3.c', article: 28, intituleArticle: ART[28], portee: 'etablissement', ordre: 41,
    intitule: "Le contrat de sous-traitance prévoit que le sous-traitant applique les mesures de sécurité de l'article 32." },
  { reference: '28.3.h', article: 28, intituleArticle: ART[28], portee: 'etablissement', ordre: 42,
    intitule: "Le contrat prévoit que le sous-traitant met à disposition les informations nécessaires pour démontrer sa conformité, et permet les audits et inspections." },
  { reference: '28.4', article: 28, intituleArticle: ART[28], portee: 'etablissement', ordre: 43,
    intitule: "Le recours à un sous-traitant ultérieur est soumis aux mêmes obligations contractuelles. La chaîne de sous-traitance ne dilue pas les exigences." },

  { reference: '30.1.g', article: 30, intituleArticle: ART[30], portee: 'etablissement', ordre: 50,
    intitule: "Le registre des activités de traitement comporte, dans la mesure du possible, une description générale des mesures de sécurité techniques et organisationnelles." },

  { reference: '32.1.a', article: 32, intituleArticle: ART[32], portee: 'application', ordre: 60,
    intitule: "Pseudonymisation et chiffrement des données à caractère personnel." },
  { reference: '32.1.b', article: 32, intituleArticle: ART[32], portee: 'application', ordre: 61,
    intitule: "Garantir la confidentialité, l'intégrité, la disponibilité et la RÉSILIENCE constantes des systèmes et services de traitement." },
  { reference: '32.1.c', article: 32, intituleArticle: ART[32], portee: 'application', ordre: 62,
    intitule: "Rétablir la disponibilité des données et l'accès à celles-ci dans des délais appropriés en cas d'incident physique ou technique." },
  { reference: '32.1.d', article: 32, intituleArticle: ART[32], portee: 'les_deux', ordre: 63,
    intitule: "Tester, analyser et évaluer RÉGULIÈREMENT l'efficacité des mesures — la mise en place ne suffit pas, l'efficacité doit être éprouvée." },
  { reference: '32.2', article: 32, intituleArticle: ART[32], portee: 'application', ordre: 64,
    intitule: "Tenir compte des risques que présente le traitement, en particulier la destruction, la perte, l'altération, la divulgation ou l'accès non autorisés, de manière accidentelle ou illicite." },
  { reference: '32.4', article: 32, intituleArticle: ART[32], portee: 'etablissement', ordre: 65,
    intitule: "S'assurer que toute personne agissant sous l'autorité du responsable ou du sous-traitant, et ayant accès aux données, ne les traite que sur instruction." },

  { reference: '33.1', article: 33, intituleArticle: ART[33], portee: 'etablissement', ordre: 70,
    intitule: "Notifier la violation à l'autorité de contrôle dans les MEILLEURS DÉLAIS et, si possible, 72 HEURES au plus tard après en avoir pris connaissance — sauf si elle est peu susceptible d'engendrer un risque pour les droits et libertés. Au-delà de 72 h, la notification doit être motivée." },
  { reference: '33.2', article: 33, intituleArticle: ART[33], portee: 'etablissement', ordre: 71,
    intitule: "Le sous-traitant notifie toute violation au responsable du traitement dans les meilleurs délais. C'est le point de départ du délai de 72 h côté responsable." },
  { reference: '33.3', article: 33, intituleArticle: ART[33], portee: 'etablissement', ordre: 72,
    intitule: "La notification décrit la nature de la violation, les catégories et le nombre approximatif de personnes et d'enregistrements concernés, les coordonnées du DPO, les conséquences probables et les mesures prises ou envisagées." },
  { reference: '33.4', article: 33, intituleArticle: ART[33], portee: 'etablissement', ordre: 73,
    intitule: "Si les informations ne peuvent être fournies en une seule fois, elles peuvent l'être de manière échelonnée sans autre retard indu. L'incomplétude ne justifie pas d'attendre." },
  { reference: '33.5', article: 33, intituleArticle: ART[33], portee: 'etablissement', ordre: 74,
    intitule: "DOCUMENTER TOUTE violation — y compris celles qui ne sont pas notifiées : faits, effets, mesures prises. Cette documentation permet à l'autorité de vérifier le respect de l'article. La décision de ne pas notifier doit donc être traçable." },

  { reference: '34.1', article: 34, intituleArticle: ART[34], portee: 'etablissement', ordre: 80,
    intitule: "Communiquer la violation à la personne concernée dans les meilleurs délais lorsqu'elle est susceptible d'engendrer un RISQUE ÉLEVÉ pour ses droits et libertés." },
  { reference: '34.2', article: 34, intituleArticle: ART[34], portee: 'etablissement', ordre: 81,
    intitule: "La communication décrit, en termes clairs et simples, la nature de la violation et comporte au minimum les informations de l'article 33.3.b à d." },
  { reference: '34.3', article: 34, intituleArticle: ART[34], portee: 'etablissement', ordre: 82,
    intitule: "La communication n'est pas nécessaire si les données étaient protégées (chiffrement notamment), si des mesures ultérieures écartent le risque élevé, ou si elle exigerait des efforts disproportionnés — auquel cas une communication publique la remplace. Ces exemptions se justifient, elles ne se présument pas." },

  { reference: '35.1', article: 35, intituleArticle: ART[35], portee: 'application', ordre: 90,
    intitule: "Effectuer une analyse d'impact AVANT le traitement lorsque celui-ci, compte tenu de sa nature, sa portée, son contexte et ses finalités, est susceptible d'engendrer un risque élevé pour les droits et libertés des personnes." },
  { reference: '35.3', article: 35, intituleArticle: ART[35], portee: 'application', ordre: 91,
    intitule: "L'analyse est notamment requise en cas d'évaluation systématique et approfondie d'aspects personnels fondée sur un traitement automatisé (y compris le profilage) servant de base à des décisions produisant des effets juridiques ; de traitement à grande échelle de données sensibles ou relatives à des condamnations ; ou de surveillance systématique à grande échelle d'une zone accessible au public." },
  { reference: '35.2', article: 35, intituleArticle: ART[35], portee: 'application', ordre: 92,
    intitule: "Demander conseil au délégué à la protection des données lorsqu'il en existe un." },
  { reference: '35.7', article: 35, intituleArticle: ART[35], portee: 'application', ordre: 93,
    intitule: "L'analyse contient au minimum : une description systématique du traitement et de ses finalités ; une évaluation de la NÉCESSITÉ et de la PROPORTIONNALITÉ au regard des finalités ; une évaluation des risques pour les droits et libertés ; et les mesures envisagées pour y faire face — garanties, mesures de sécurité, mécanismes de preuve de la conformité." },
  { reference: '35.9', article: 35, intituleArticle: ART[35], portee: 'application', ordre: 94,
    intitule: "Le cas échéant, demander l'avis des personnes concernées ou de leurs représentants sur le traitement prévu." },
  { reference: '35.11', article: 35, intituleArticle: ART[35], portee: 'application', ordre: 95,
    intitule: "Procéder à un EXAMEN afin d'évaluer si le traitement est effectué conformément à l'analyse, au moins lorsque le risque change. Une analyse d'impact n'est pas un document que l'on classe." },
]

// CORRESPONDANCE PROPOSÉE — NON OFFICIELLE. L'ANSSI publie une table ReCyF ↔ ISO : elle est
// importée telle quelle et fait autorité.
export const rgpdSansEquivalent: Record<string, string> = {
  '35.9': "Recueillir l'avis des personnes concernées n'a d'équivalent ni dans NIS 2 ni dans l'ISO 27001. Ces cadres protègent l'établissement et la continuité du service ; le RGPD protège les personnes, et leur donne ici voix au chapitre. Aucun rapprochement ne serait honnête.",
}

export const liensRgpd: LienRgpd[] = [
  { reference: '5.1.f', cible: 'nis2', cle: '5', justification: "Le principe d'intégrité et de confidentialité recouvre la maîtrise des systèmes d'information de l'objectif 5." },
  { reference: '5.1.f', cible: 'iso27002', cle: 'A.5.1', justification: 'Le principe se décline en politiques de sécurité de l\'information.' },
  { reference: '5.1.f', cible: 'iso27002', cle: 'A.5.10', justification: "Utilisation correcte des informations : même exigence de traitement autorisé et licite." },

  { reference: '24', cible: 'nis2', cle: '2', justification: "L'obligation de démontrer la conformité est la traduction RGPD d'un cadre de gouvernance documenté." },
  { reference: '24', cible: 'iso27001', cle: '5.1', justification: 'Leadership et engagement de la direction — même responsabilité au sommet.' },
  { reference: '24', cible: 'iso27001', cle: '5.3', justification: "Rôles, responsabilités et autorités : la démonstration suppose de savoir qui répond de quoi." },
  { reference: '24', cible: 'iso27002', cle: 'A.5.4', justification: 'Responsabilités de la direction.' },

  { reference: '25.1', cible: 'nis2', cle: '7', justification: "Intégrer les garanties dès la conception relève de la sécurisation de l'architecture." },
  { reference: '25.1', cible: 'iso27002', cle: 'A.8.25', justification: 'Cycle de vie de développement sécurisé.' },
  { reference: '25.1', cible: 'iso27002', cle: 'A.8.27', justification: "Principes d'ingénierie et d'architecture sécurisés." },

  { reference: '25.2', cible: 'nis2', cle: '18', justification: 'La protection par défaut est une question de configuration initiale des ressources.' },
  { reference: '25.2', cible: 'iso27002', cle: 'A.8.9', justification: 'Gestion de la configuration : le réglage par défaut est un choix de configuration.' },

  { reference: '28.1', cible: 'nis2', cle: '3', justification: "Les garanties exigées du sous-traitant relèvent de la maîtrise de l'écosystème." },
  { reference: '28.1', cible: 'iso27002', cle: 'A.5.19', justification: 'Sécurité de l\'information dans les relations avec les fournisseurs.' },
  { reference: '28.1', cible: 'iso27002', cle: 'A.5.21', justification: 'Gestion de la sécurité dans la chaîne d\'approvisionnement des TIC.' },

  { reference: '28.3.c', cible: 'nis2', cle: '3', justification: 'Clauses de sécurité imposées contractuellement au fournisseur.' },
  { reference: '28.3.c', cible: 'iso27002', cle: 'A.5.20', justification: 'Sécurité de l\'information dans les accords conclus avec les fournisseurs.' },

  { reference: '28.3.h', cible: 'nis2', cle: '17', justification: "Le droit d'audit du sous-traitant est la contrepartie contractuelle de l'objectif d'audit." },
  { reference: '28.3.h', cible: 'iso27002', cle: 'A.5.20', justification: "L'obligation de mise à disposition des preuves figure dans l'accord fournisseur." },

  { reference: '28.4', cible: 'nis2', cle: '3', justification: 'La sous-traitance ultérieure fait partie de l\'écosystème à maîtriser.' },
  { reference: '28.4', cible: 'iso27002', cle: 'A.5.21', justification: 'Chaîne d\'approvisionnement des TIC : les exigences se propagent au rang suivant.' },

  { reference: '30.1.g', cible: 'nis2', cle: '1', justification: "Le registre RGPD et le recensement des SI décrivent le même parc sous deux angles." },
  { reference: '30.1.g', cible: 'iso27002', cle: 'A.5.9', justification: 'Inventaire des informations et autres actifs associés.' },

  { reference: '32.1.a', cible: 'nis2', cle: '5', justification: 'Chiffrement et pseudonymisation relèvent de la maîtrise des systèmes.' },
  { reference: '32.1.a', cible: 'iso27002', cle: 'A.8.24', justification: 'Utilisation de la cryptographie.' },

  { reference: '32.1.b', cible: 'nis2', cle: '13', justification: 'La résilience constante des services rejoint la continuité d\'activité.' },
  { reference: '32.1.b', cible: 'iso27002', cle: 'A.5.30', justification: 'Préparation des TIC pour la continuité d\'activité.' },
  { reference: '32.1.b', cible: 'iso27002', cle: 'A.8.14', justification: 'Redondance des moyens de traitement de l\'information.' },

  { reference: '32.1.c', cible: 'nis2', cle: '13', justification: 'Rétablir la disponibilité dans des délais appropriés = objectif de reprise.' },
  { reference: '32.1.c', cible: 'iso27002', cle: 'A.8.13', justification: 'Sauvegarde des informations.' },
  { reference: '32.1.c', cible: 'iso27002', cle: 'A.5.29', justification: 'Sécurité de l\'information pendant une perturbation.' },

  { reference: '32.1.d', cible: 'nis2', cle: '15', justification: "Le RGPD exige de tester l'efficacité : c'est l'objet des exercices et tests. ReCyF sépare test et audit, le RGPD non — les deux objectifs sont donc retenus." },
  { reference: '32.1.d', cible: 'nis2', cle: '17', justification: "Le RGPD exige aussi d'analyser et d'évaluer l'efficacité, ce que couvre l'audit de sécurité. Second volet du même paragraphe." },
  { reference: '32.1.d', cible: 'iso27001', cle: '9.2', justification: 'Audit interne du système de management.' },
  { reference: '32.1.d', cible: 'iso27002', cle: 'A.5.35', justification: 'Revue indépendante de la sécurité de l\'information.' },

  { reference: '32.2', cible: 'nis2', cle: '16', justification: 'Tenir compte des risques du traitement = approche par les risques.' },
  { reference: '32.2', cible: 'iso27001', cle: '6.1.2', justification: 'Appréciation des risques de sécurité de l\'information.' },

  { reference: '32.4', cible: 'nis2', cle: '4', justification: "L'encadrement des personnes ayant accès relève de la sécurité dans la gestion des ressources humaines." },
  { reference: '32.4', cible: 'iso27002', cle: 'A.6.3', justification: 'Sensibilisation, apprentissage et formation à la sécurité de l\'information.' },

  { reference: '33.1', cible: 'nis2', cle: '12', justification: "Notification sous 72 h : même mécanique de délai que l'article 23 de NIS 2, avec une autorité différente (CNIL et non ANSSI) et un point de départ propre." },
  { reference: '33.1', cible: 'iso27002', cle: 'A.5.24', justification: 'Planification et préparation de la gestion des incidents.' },
  { reference: '33.1', cible: 'iso27002', cle: 'A.6.8', justification: 'Signalement des événements de sécurité de l\'information.' },

  { reference: '33.2', cible: 'nis2', cle: '3', justification: "L'obligation de signalement par le sous-traitant se contractualise : elle relève de la maîtrise de l'écosystème." },
  { reference: '33.2', cible: 'iso27002', cle: 'A.5.20', justification: 'À prévoir dans l\'accord fournisseur.' },

  { reference: '33.3', cible: 'nis2', cle: '12', justification: 'Contenu de la déclaration : même exercice de qualification que pour NIS 2.' },
  { reference: '33.3', cible: 'iso27002', cle: 'A.5.26', justification: 'Réponse aux incidents de sécurité de l\'information.' },

  { reference: '33.4', cible: 'nis2', cle: '12', justification: "La notification échelonnée correspond aux jalons successifs de NIS 2 (24 h, 72 h, rapport final)." },
  { reference: '33.4', cible: 'iso27002', cle: 'A.5.26', justification: 'Réponse aux incidents : information au fil de l\'analyse.' },

  { reference: '33.5', cible: 'nis2', cle: '12', justification: 'Documenter toute violation, y compris non notifiée — traçabilité de la décision.' },
  { reference: '33.5', cible: 'iso27002', cle: 'A.5.27', justification: 'Tirer des enseignements des incidents de sécurité de l\'information.' },

  { reference: '34.1', cible: 'nis2', cle: '14', justification: "RAPPROCHEMENT IMPARFAIT, retenu en le signalant : l'objectif 14 vise les CRISES CYBER MAJEURES, alors qu'une violation notifiable aux personnes peut être bien plus modeste. Le rapprochement porte sur le savoir-faire de communication, pas sur le seuil de déclenchement — les deux dispositifs ne se déclenchent pas au même moment." },
  { reference: '34.1', cible: 'iso27002', cle: 'A.5.24', justification: 'La communication aux personnes concernées fait partie du plan de gestion des incidents.' },
  { reference: '34.2', cible: 'iso27002', cle: 'A.5.26', justification: 'Contenu de la communication : volet réponse à incident.' },
  { reference: '34.3', cible: 'iso27002', cle: 'A.8.24', justification: "L'exemption principale repose sur le chiffrement des données concernées." },

  // Volontairement PAS rapproché d'EBIOS RM : l'AIPD apprécie le risque pour les PERSONNES
  // CONCERNÉES, là où EBIOS apprécie le risque pour l'établissement.
  { reference: '35.1', cible: 'nis2', cle: '16', justification: "Analyse préalable au traitement : même logique d'approche par les risques, appliquée à un périmètre différent." },
  { reference: '35.1', cible: 'iso27001', cle: '6.1.2', justification: 'Appréciation des risques — méthode commune, objet du risque distinct.' },
  { reference: '35.3', cible: 'nis2', cle: '16', justification: 'Critères de déclenchement de l\'analyse.' },
  { reference: '35.2', cible: 'nis2', cle: '2', justification: 'Le recours au DPO relève de la gouvernance et des rôles définis.' },
  { reference: '35.7', cible: 'iso27001', cle: '6.1.2', justification: "Contenu de l'appréciation : description, évaluation des risques, mesures envisagées." },
  { reference: '35.7', cible: 'nis2', cle: '16', justification: 'Contenu attendu d\'une appréciation des risques.' },
  { reference: '35.11', cible: 'iso27001', cle: '9.3', justification: "Le réexamen lorsque le risque change rejoint la revue périodique du système de management." },
  { reference: '35.11', cible: 'nis2', cle: '16', justification: "Une appréciation des risques se réexamine : elle n'est pas un document que l'on classe." },
]
