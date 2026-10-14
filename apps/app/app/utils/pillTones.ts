// Correspondance valeur d'enum → teinte de pill (voir components/ui/Pill.vue).
export const appStatutTone = (v: string | null | undefined): string => ({
  en_production: 'emerald',
  en_projet: 'blue',
  en_deploiement: 'blue',
  en_maintenance: 'amber',
  en_decommissionnement: 'orange',
  retiree: 'gray',
}[v ?? ''] ?? 'gray')

// CRITICITÉ — une seule table, employée partout. Elle était recopiée dans chaque entrée de
// `COLUMN_TONES`, et les copies ont divergé : quand l'échelle a été scindée (« critique » →
// `essentielle`, « mineure » → `secondaire`), seule celle-ci a suivi.
export const TONE_CRITICITE: Record<string, string> = {
  vitale: 'red',
  essentielle: 'orange',
  importante: 'amber',
  secondaire: 'emerald',
  // « critique » sert dans les DEUX échelles : criticité métier sans niveau précisé, et sûreté
  // de fonctionnement des machines industrielles.
  critique: 'orange',
  mineure: 'emerald',
}

export const appCriticiteTone = (v: string | null | undefined): string => TONE_CRITICITE[v ?? ''] ?? 'gray'

// Couverture de détection : `aucune` doit sauter aux yeux — c'est le trou qu'on cherche.
export const couvertureDetectionTone = (v: string | null | undefined): string => ({
  soc_externe: 'primary',
  wazuh: 'blue',
  epp: 'emerald',
  aucune: 'red',
}[v ?? ''] ?? 'gray')

export const appExpositionTone = (v: string | null | undefined): string => ({
  internet: 'red',
  dmz: 'amber',
  interne: 'emerald',
}[v ?? ''] ?? 'gray')

// Teinte des pills des catalogues génériques, par « <catalogue>.<colonne> » → valeur.
const COLUMN_TONES: Record<string, Record<string, string>> = {
  'serveurs.statut': { actif: 'emerald', arrete: 'amber', decommissionne: 'gray' },
  'serveurs.type': { vm: 'blue', physique: 'gray' },
  'serveurs.criticite': TONE_CRITICITE,
  'appareils-mobiles.criticite': TONE_CRITICITE,
  'serveurs.environnement': { production: 'red', preproduction: 'amber', recette: 'blue', developpement: 'gray' },
  'tiers.type': { editeur: 'blue', prestataire_it: 'primary', prestataire_non_it: 'purple' },
  'tiers.niveauAcces': { permanent: 'amber', ponctuel: 'blue', aucun: 'gray' },
  'vpn.statut': { actif: 'emerald', suspendu: 'amber', expire: 'red', revoque: 'red', en_attente: 'blue' },
  'technologies.categorie': { base_de_donnees: 'blue', langage: 'purple', framework: 'primary', runtime: 'amber', serveur_web: 'emerald', os: 'gray' },
  'poles.type': { cyber: 'red', systemes: 'blue', reseaux: 'primary', dev: 'purple', support: 'amber' },
  // Cartographie matérielle
  'postes-travail.criticite': TONE_CRITICITE,
  'postes-travail.statut': { actif: 'emerald', en_stock: 'blue', en_panne: 'amber', reforme: 'gray' },
  'iot.criticite': TONE_CRITICITE,
  'iot.statut': { actif: 'emerald', en_stock: 'blue', en_panne: 'amber', reforme: 'gray' },
  'iot.exposition': { isole: 'emerald', interne: 'blue', expose: 'red' },
  'machines-indus.criticiteSurete': TONE_CRITICITE,
  'machines-indus.statut': { actif: 'emerald', en_stock: 'blue', en_panne: 'amber', reforme: 'gray' },
  'lieux.type': { site: 'blue', batiment: 'primary', salle: 'amber', baie: 'gray' },
  // Cartographie réseau
  'equipements-reseau.type': { firewall: 'red', routeur: 'blue', switch: 'primary', borne_wifi: 'purple', load_balancer: 'amber' },
  'equipements-reseau.statut': { actif: 'emerald', en_stock: 'blue', en_panne: 'amber', reforme: 'gray' },
  'zones-reseau.niveau': { non_maitrise: 'red', exposee: 'amber', interne: 'blue', securisee: 'emerald', critique: 'orange' },
  'zones-reseau.type': { dmz: 'amber', zone_securite: 'primary', vlan: 'blue', sous_reseau: 'gray' },
  'flux-reseau.statut': { autorise: 'emerald', a_revoir: 'amber', interdit: 'red' },
  // Actifs primaires
  'actifs-informationnels.sensibilite': { publique: 'gray', interne: 'blue', restreinte: 'amber', confidentielle: 'red' },
  'processus.criticite': TONE_CRITICITE,
  // Couche SMSI / ISO 27001
  'actifs-smsi.categorie': { primaire: 'primary', support: 'blue' },
  'risques-smsi.proprieteImpactee': { disponibilite: 'blue', integrite: 'amber', confidentialite: 'red' },
  'actifs-smsi.disponibilite': { faible: 'emerald', modere: 'blue', eleve: 'amber', critique: 'red' },
  'actifs-smsi.integrite': { faible: 'emerald', modere: 'blue', eleve: 'amber', critique: 'red' },
  'actifs-smsi.confidentialite': { faible: 'emerald', modere: 'blue', eleve: 'amber', critique: 'red' },
  'risques-smsi.vraisemblance': { rare: 'emerald', possible: 'blue', probable: 'amber', quasi_certain: 'red' },
  'risques-smsi.gravite': { mineure: 'emerald', significative: 'amber', grave: 'orange', critique: 'red' },
  'risques-smsi.statut': { identifie: 'blue', evalue: 'blue', en_traitement: 'amber', traite: 'emerald', accepte: 'gray' },
  'mesures-smsi.theme': { organisationnelles: 'primary', personnes: 'purple', physiques: 'amber', technologiques: 'blue' },
  'mesures-smsi.statut': { a_faire: 'gray', en_cours: 'amber', mise_en_oeuvre: 'emerald', a_ameliorer: 'orange' },
  'exigences-legales.conformite': { conforme: 'emerald', partiellement: 'amber', non_conforme: 'red', a_evaluer: 'gray' },
  'exigences-legales.type': { loi: 'primary', reglement: 'blue', directive: 'purple', contrat: 'amber', norme: 'emerald' },
  'parties-interessees.type': { interne: 'blue', externe: 'purple' },
  'parties-interessees.influence': { faible: 'gray', moyenne: 'amber', forte: 'red' },
  'competences.niveauRequis': { notion: 'gray', intermediaire: 'blue', confirme: 'emerald', expert: 'primary' },
  'opportunites.gain': { faible: 'gray', modere: 'blue', eleve: 'emerald', majeur: 'primary' },
  'opportunites.statut': { identifiee: 'gray', evaluee: 'blue', en_cours: 'amber', realisee: 'emerald', abandonnee: 'gray' },
  'exigences-nis2.conformite': { fait: 'emerald', partiellement: 'amber', tres_partiellement: 'orange', pas_du_tout: 'red' },
  'exigences-nis2.statut': { a_faire: 'gray', en_cours: 'amber', fait: 'emerald', non_applicable: 'gray' },
  'actions-nis2.statut': { a_faire: 'gray', en_cours: 'amber', fait: 'emerald', abandonnee: 'gray' },
  'actions-nis2.priorite': { basse: 'gray', moyenne: 'blue', haute: 'orange', critique: 'red' },
  'objectifs-nis2.domaine': { gouvernance: 'primary', protection: 'blue', defense: 'red', resilience: 'emerald' },
  'objectifs-nis2.applicabilite': { ei_ee: 'blue', ee: 'purple' },
  'mesures-smsi.typeMesure': { preventive: 'blue', detective: 'amber', corrective: 'purple' },
  'evenements-redoutes.critere': { disponibilite: 'blue', integrite: 'amber', confidentialite: 'red' },
  'evenements-redoutes.gravite': { mineure: 'emerald', significative: 'amber', grave: 'orange', critique: 'red' },
  'flux-applicatifs.sens': { unidirectionnel: 'blue', bidirectionnel: 'primary' },
  'liens-reseau.type': { fibre: 'blue', cuivre: 'amber', vlan_trunk: 'primary', sans_fil: 'purple' },
  'liens-reseau.portee': { local: 'gray', man: 'red' },
  'interconnexions-externes.type': { renater: 'primary', internet: 'red', operateur: 'blue', partenaire: 'purple' },
  // Gouvernance SMSI (clauses 4-10)
  'objectifs-smsi.statut': { a_faire: 'gray', en_cours: 'amber', atteint: 'emerald', abandonne: 'gray' },
  'documents-smsi.type': { politique: 'primary', procedure: 'blue', instruction: 'purple', enregistrement: 'gray', guide: 'amber' },
  'documents-smsi.statut': { brouillon: 'gray', en_validation: 'amber', valide: 'emerald', en_revision: 'blue', obsolete: 'gray' },
  'audits-smsi.type': { interne: 'blue', externe: 'purple', certification: 'primary' },
  'audits-smsi.statut': { planifie: 'gray', en_cours: 'amber', realise: 'blue', cloture: 'emerald' },
  'revues-direction.statut': { planifiee: 'amber', realisee: 'emerald' },
  'non-conformites.type': { non_conformite: 'red', action_amelioration: 'blue' },
  'non-conformites.gravite': { mineure: 'amber', majeure: 'red' },
  'non-conformites.statut': { ouverte: 'red', en_cours: 'amber', close: 'emerald' },
}

// null/vide → gris ; valeur mappée → sa teinte ; sinon primary (coloré par défaut).
export const columnTone = (catalogue: string, column: string, value: unknown): string =>
  (value == null || value === '' ? 'gray' : (COLUMN_TONES[`${catalogue}.${column}`]?.[String(value)] ?? 'primary'))
