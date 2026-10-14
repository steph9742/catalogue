import { personne, pole, tiers, service, composante, entite, departement, population } from '@catalogue/database/tables'

// Résolution des entités liées à l'import : une colonne contient un NOM (ex.
export type ReferenceResolver = {
  column: string // clé présente dans la ligne importée (en-tête reconnu)
  fkField: string // colonne de la table principale à renseigner (ex. entiteId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any // table cible
  label: string // libellé pour le rapport (« Composante », « Responsable »…)
  naturalKey?: string // colonne d'identification (défaut 'nom')
  defaults?: Record<string, unknown> // champs obligatoires à la création
  create?: boolean // false = résolution seule (lie si existe, sinon ignore ; défaut true)
}

export const IMPORT_REFERENCES: Record<string, ReferenceResolver[]> = {
  applications: [
    { column: 'responsable', fkField: 'responsableId', table: personne, label: 'Responsable' },
    { column: 'editeur', fkField: 'editeurId', table: tiers, label: 'Éditeur', defaults: { type: 'editeur' } },
    // Un pôle exige désormais un service → on lie seulement s'il existe.
    { column: 'pole', fkField: 'poleId', table: pole, label: 'Pôle', create: false },
  ],
  composantes: [
    { column: 'entite', fkField: 'entiteId', table: entite, label: 'Entité' },
    { column: 'directeur', fkField: 'directeurId', table: personne, label: 'Directeur' },
    { column: 'rsa', fkField: 'rsaId', table: personne, label: 'RSA' },
  ],
  departements: [
    { column: 'composante', fkField: 'composanteId', table: composante, label: 'Composante', create: false },
    { column: 'directeur', fkField: 'directeurId', table: personne, label: 'Directeur' },
    { column: 'secretaire', fkField: 'secretaireId', table: personne, label: 'Secrétaire' },
  ],
  services: [
    { column: 'composante', fkField: 'composanteId', table: composante, label: 'Composante', create: false },
    { column: 'directeur', fkField: 'directeurId', table: personne, label: 'Directeur' },
  ],
  poles: [
    { column: 'service', fkField: 'serviceId', table: service, label: 'Service', create: false },
    { column: 'responsable', fkField: 'responsableId', table: personne, label: 'Responsable' },
  ],
  personnes: [
    { column: 'population', fkField: 'populationId', table: population, label: 'Population', create: false },
    { column: 'composante', fkField: 'composanteId', table: composante, label: 'Composante', create: false },
    { column: 'service', fkField: 'serviceId', table: service, label: 'Service', create: false },
    { column: 'departement', fkField: 'departementId', table: departement, label: 'Département', create: false },
  ],
}
