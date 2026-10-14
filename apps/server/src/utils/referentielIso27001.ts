// CLAUSES ISO/IEC 27001:2022 — table des matières, clauses 4 à 10. PÉRIMÈTRE.

export type ClauseIso27001 = {
  reference: string
  chapitre: number
  intitule: string
  intituleEn: string
  source: 'officiel' | 'traduction'
  // Ce que la clause exige, dans nos mots. Voir le commentaire du schéma : formulation et
  // non citation, la norme restant seule à faire foi.
  exigence: string
  // Amendement applicable, le cas échéant.
  amendement?: string
  // Posé par le `.map` de fin de liste : l'ordre suit la numérotation de la norme, qui ne
  // se trie pas alphabétiquement (10.1 viendrait avant 4.1).
  ordre: number
}

const O = 'officiel' as const

export const clausesIso27001: ClauseIso27001[] = ([
  // --- 4 Contexte de l'organisation ---------------------------------------------------
  { reference: '4.1', chapitre: 4, source: O, intituleEn: 'Understanding the organization and its context', intitule: "Compréhension de l'organisation et de son contexte", exigence: "Déterminer les enjeux internes et externes pertinents pour le système de management et sa capacité à atteindre les résultats attendus.", amendement: "ISO/IEC 27001:2022/Amd 1:2024 — ajoute une EXIGENCE : déterminer si le changement climatique est un enjeu pertinent." },
  { reference: '4.2', chapitre: 4, source: O, intituleEn: 'Understanding the needs and expectations of interested parties', intitule: 'Compréhension des besoins et attentes des parties intéressées', exigence: "Identifier les parties intéressées pertinentes et celles de leurs exigences qui s'appliquent au système de management, y compris légales et contractuelles.", amendement: "ISO/IEC 27001:2022/Amd 1:2024 — ajoute une note : les parties intéressées peuvent avoir des exigences liées au changement climatique." },
  { reference: '4.3', chapitre: 4, source: O, intituleEn: 'Determining the scope of the information security management system', intitule: "Détermination du domaine d'application du système de management de la sécurité de l'information", exigence: "Fixer le domaine d'application du système de management en tenant compte des enjeux, des exigences des parties intéressées et des interfaces avec les activités de tiers. Le tenir à disposition sous forme documentée." },
  { reference: '4.4', chapitre: 4, source: O, intituleEn: 'Information security management system', intitule: "Système de management de la sécurité de l'information", exigence: "Établir, mettre en œuvre, tenir à jour et améliorer en continu le système de management, y compris les processus nécessaires et leurs interactions." },

  // --- 5 Leadership --------------------------------------------------------------------
  { reference: '5.1', chapitre: 5, source: O, intituleEn: 'Leadership and commitment', intitule: 'Leadership et engagement', exigence: "La direction démontre son leadership : politique et objectifs compatibles avec la stratégie, intégration du système aux processus de l'organisation, ressources allouées, promotion de l'amélioration continue, soutien aux autres responsables." },
  { reference: '5.2', chapitre: 5, source: O, intituleEn: 'Policy', intitule: 'Politique', exigence: "Établir une politique de sécurité de l'information adaptée à l'organisation, servant de cadre aux objectifs, portant l'engagement de satisfaire les exigences applicables et d'améliorer le système. Documentée, communiquée en interne, mise à disposition des parties intéressées." },
  { reference: '5.3', chapitre: 5, source: O, intituleEn: 'Organizational roles, responsibilities and authorities', intitule: "Rôles, responsabilités et autorités au sein de l'organisation", exigence: "Attribuer et communiquer les responsabilités et autorités pour la conformité du système aux exigences, et pour le compte rendu de ses performances à la direction." },

  // --- 6 Planification -----------------------------------------------------------------
  { reference: '6.1', chapitre: 6, source: O, intituleEn: 'Actions to address risks and opportunities', intitule: 'Actions à mettre en œuvre face aux risques et opportunités', exigence: "Planifier les actions face aux risques et opportunités — voir les trois sous-clauses." },
  { reference: '6.1.1', chapitre: 6, source: O, intituleEn: 'General', intitule: 'Généralités', exigence: "Déterminer les risques et opportunités à traiter pour que le système atteigne ses résultats, prévienne les effets indésirables et s'améliore. Planifier les actions correspondantes et la façon d'en évaluer l'efficacité." },
  { reference: '6.1.2', chapitre: 6, source: O, intituleEn: 'Information security risk assessment', intitule: "Appréciation des risques de sécurité de l'information", exigence: "Définir et appliquer un processus d'appréciation des risques : critères d'acceptation et critères de réalisation, identification, analyse (conséquences, vraisemblance, niveau) et évaluation (comparaison aux critères, priorisation du traitement). Conserver les informations documentées." },
  { reference: '6.1.3', chapitre: 6, source: O, intituleEn: 'Information security risk treatment', intitule: "Traitement des risques de sécurité de l'information", exigence: "Définir et appliquer un processus de traitement : choisir les options, déterminer les mesures nécessaires, les COMPARER À L'ANNEXE A pour vérifier qu'aucune n'a été omise, produire une déclaration d'applicabilité justifiant inclusions et exclusions, formuler un plan de traitement et faire approuver les risques résiduels par leurs propriétaires." },
  { reference: '6.2', chapitre: 6, source: O, intituleEn: 'Information security objectives and planning to achieve them', intitule: "Objectifs de sécurité de l'information et plans pour les atteindre", exigence: "Établir des objectifs de sécurité aux fonctions et niveaux concernés : cohérents avec la politique, mesurables, tenant compte des exigences applicables et des résultats d'appréciation, surveillés, communiqués, mis à jour. Planifier ce qui sera fait, avec quelles ressources, par qui, pour quand, et comment les résultats seront évalués." },
  { reference: '6.3', chapitre: 6, source: O, intituleEn: 'Planning of changes', intitule: 'Planification des modifications', exigence: "Réaliser de façon PLANIFIÉE toute modification du système de management dont le besoin a été déterminé — et non au fil de l'eau." },

  // --- 7 Support -----------------------------------------------------------------------
  { reference: '7.1', chapitre: 7, source: O, intituleEn: 'Resources', intitule: 'Ressources', exigence: "Déterminer et fournir les ressources nécessaires à l'établissement, à la mise en œuvre, à la tenue à jour et à l'amélioration continue du système." },
  { reference: '7.2', chapitre: 7, source: O, intituleEn: 'Competence', intitule: 'Compétences', exigence: "Déterminer les compétences nécessaires des personnes dont le travail influe sur les performances de sécurité, s'assurer qu'elles sont acquises, agir si elles ne le sont pas, et conserver les preuves." },
  { reference: '7.3', chapitre: 7, source: O, intituleEn: 'Awareness', intitule: 'Sensibilisation', exigence: "S'assurer que les personnes concernées ont connaissance de la politique de sécurité, de leur contribution à l'efficacité du système, et des conséquences d'un non-respect des exigences." },
  { reference: '7.4', chapitre: 7, source: O, intituleEn: 'Communication', intitule: 'Communication', exigence: "Déterminer les besoins de communication interne et externe relatifs au système : sur quels sujets, à quels moments, avec qui, et par quels moyens." },
  { reference: '7.5', chapitre: 7, source: O, intituleEn: 'Documented information', intitule: 'Informations documentées', exigence: "Informations documentées — voir les trois sous-clauses." },
  { reference: '7.5.1', chapitre: 7, source: O, intituleEn: 'General', intitule: 'Généralités', exigence: "Le système comporte les informations documentées exigées par la norme, ainsi que celles jugées nécessaires à son efficacité." },
  { reference: '7.5.2', chapitre: 7, source: O, intituleEn: 'Creating and updating', intitule: 'Création et mise à jour', exigence: "Lors de leur création et de leur mise à jour, veiller à une identification, un format et un support appropriés, ainsi qu'à leur revue et à leur approbation." },
  { reference: '7.5.3', chapitre: 7, source: O, intituleEn: 'Control of documented information', intitule: 'Maîtrise des informations documentées', exigence: "Maîtriser les informations documentées : disponibilité et protection, distribution, accès, stockage, conservation, contrôle des modifications, durée de conservation et élimination. Y compris celles d'origine externe." },

  // --- 8 Fonctionnement ----------------------------------------------------------------
  { reference: '8.1', chapitre: 8, source: O, intituleEn: 'Operational planning and control', intitule: 'Planification et contrôle opérationnels', exigence: "Planifier, mettre en œuvre et maîtriser les processus nécessaires. Maîtriser les modifications planifiées, examiner les conséquences des modifications imprévues, et maîtriser les processus et produits fournis par l'extérieur." },
  { reference: '8.2', chapitre: 8, source: O, intituleEn: 'Information security risk assessment', intitule: "Appréciation des risques de sécurité de l'information", exigence: "Réaliser des appréciations des risques à intervalles planifiés, ou lorsqu'une modification significative survient, selon le processus établi au 6.1.2. Conserver les résultats." },
  { reference: '8.3', chapitre: 8, source: O, intituleEn: 'Information security risk treatment', intitule: "Traitement des risques de sécurité de l'information", exigence: "Mettre en œuvre le plan de traitement des risques et conserver les informations documentées sur les résultats." },

  // --- 9 Évaluation des performances ---------------------------------------------------
  { reference: '9.1', chapitre: 9, source: O, intituleEn: 'Monitoring, measurement, analysis and evaluation', intitule: 'Surveillance, mesurages, analyse et évaluation', exigence: "Déterminer ce qui doit être surveillé et mesuré, par quelles méthodes, quand, par qui, et à quel moment les résultats sont analysés et évalués. Conserver les preuves." },
  { reference: '9.2', chapitre: 9, source: O, intituleEn: 'Internal audit', intitule: 'Audit interne', exigence: "Audit interne — voir les deux sous-clauses." },
  { reference: '9.2.1', chapitre: 9, source: O, intituleEn: 'General', intitule: 'Généralités', exigence: "Réaliser des audits internes à intervalles planifiés, pour vérifier la conformité aux exigences propres à l'organisation et à celles de la norme, ainsi que l'efficacité de la mise en œuvre." },
  { reference: '9.2.2', chapitre: 9, source: O, intituleEn: 'Internal audit programme', intitule: "Programme d'audit interne", exigence: "Planifier, établir, mettre en œuvre et tenir à jour un programme d'audit : fréquence, méthodes, responsabilités, exigences de planification, comptes rendus. Garantir l'objectivité et l'impartialité des auditeurs, rapporter les résultats à la direction, conserver les preuves." },
  { reference: '9.3', chapitre: 9, source: O, intituleEn: 'Management review', intitule: 'Revue de direction', exigence: "Revue de direction — voir les trois sous-clauses." },
  { reference: '9.3.1', chapitre: 9, source: O, intituleEn: 'General', intitule: 'Généralités', exigence: "La direction procède, à intervalles planifiés, à la revue du système pour s'assurer qu'il reste approprié, adapté et efficace." },
  { reference: '9.3.2', chapitre: 9, source: O, intituleEn: 'Management review inputs', intitule: "Éléments d'entrée de la revue de direction", exigence: "Éléments d'entrée : suites données aux revues précédentes, évolutions du contexte et des exigences des parties intéressées, retour sur les performances (non-conformités et actions correctives, surveillance et mesures, résultats d'audit, atteinte des objectifs), retour des parties intéressées, résultats d'appréciation et état du plan de traitement, opportunités d'amélioration continue." },
  { reference: '9.3.3', chapitre: 9, source: O, intituleEn: 'Management review results', intitule: 'Résultats de la revue de direction', exigence: "Résultats : décisions relatives aux opportunités d'amélioration continue et aux changements à apporter au système. Conserver les informations documentées." },

  // --- 10 Amélioration -----------------------------------------------------------------
  { reference: '10.1', chapitre: 10, source: O, intituleEn: 'Continual improvement', intitule: 'Amélioration continue', exigence: "Améliorer en continu la pertinence, l'adéquation et l'efficacité du système de management." },
  { reference: '10.2', chapitre: 10, source: O, intituleEn: 'Nonconformity and corrective action', intitule: 'Non-conformité et action corrective', exigence: "Face à une non-conformité : réagir et en traiter les conséquences ; examiner sa cause pour déterminer si elle risque de se reproduire ou de survenir ailleurs ; mettre en œuvre les actions nécessaires ; en revoir l'efficacité ; modifier le système si besoin. Conserver les preuves de la nature de la non-conformité, des actions menées et de leurs résultats." },
] as Omit<ClauseIso27001, 'ordre'>[]).map((c, i) => ({ ...c, ordre: (i + 1) * 10 }))

/** Intitulé des chapitres, pour regrouper à l'affichage. */
export const chapitresIso27001: Record<number, string> = {
  4: "Contexte de l'organisation",
  5: 'Leadership',
  6: 'Planification',
  7: 'Supports',
  8: 'Fonctionnement',
  9: 'Évaluation de la performance',
  10: 'Amélioration',
}
