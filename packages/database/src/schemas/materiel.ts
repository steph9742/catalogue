import { pgTable, pgEnum, text, date, boolean } from 'drizzle-orm/pg-core'
import { couvertureDetection, id, timestamps } from './_shared'
import { appCriticite } from './applications'

// SÛRETÉ DE FONCTIONNEMENT — à ne pas confondre avec la criticité MÉTIER.
export const criticiteSurete = pgEnum('criticite_surete', [
  'vitale',
  'critique',
  'importante',
  'mineure',
])
import { lieu } from './lieux'
import { personne, composante, service, departement } from './organisation'

// Cartographie MATÉRIELLE — inventaires d'actifs physiques, en tables typées séparées (postes
// de travail, IoT/objets connectés, machines industrielles).

// Statut de cycle de vie commun aux actifs matériels.
export const materielStatut = pgEnum('materiel_statut', [
  'actif',
  'en_stock',
  'en_panne',
  'reforme',
])

// --- Postes de travail (matériel, distinct des logiciels postes) ---------------------
export const posteTravailType = pgEnum('poste_travail_type', [
  'fixe',
  'portable',
  'tout_en_un',
  'client_leger',
  'autre',
])

export const posteTravail = pgTable('poste_travail', {
  id: id(),
  nom: text('nom').notNull().unique(),
  type: posteTravailType('type'),
  marque: text('marque'),
  modele: text('modele'),
  numeroSerie: text('numero_serie'),
  os: text('os'),
  osVersion: text('os_version'),
  // CLÉ DE RAPPROCHEMENT AVEC LE RÉFÉRENTIEL DE FIN DE VIE, matérialisée. Le couple (os,
  // osVersion) ne suffit pas à retrouver une technologie : « Windows 11 » ne dit rien du
  // support, c'est la release qui le détermine — 22H2 n'est plus suivie depuis octobre 2024
  // quand 24H2 l'est jusqu'en 2026.
  technologieCle: text('technologie_cle'),
  ip: text('ip'),
  adresseMac: text('adresse_mac'),
  localisation: text('localisation'),
  lieuId: text('lieu_id').references(() => lieu.id, { onDelete: 'set null' }),
  // Composante de rattachement (dérivée de l'entité GLPI, ou saisie).
  composanteId: text('composante_id').references(() => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references(() => departement.id, { onDelete: 'set null' }),
  utilisateurPrincipalId: text('utilisateur_principal_id').references(
    () => personne.id,
    { onDelete: 'set null' },
  ),
  criticite: appCriticite('criticite'),
  // Moyens de surveillance couvrant ce poste (cumulables). Voir _shared.ts — `aucune` est
  // un constat, pas un champ vide.
  couvertureDetection: couvertureDetection('couverture_detection').array(),
  statut: materielStatut('statut').notNull().default('actif'),
  dateAchat: date('date_achat'),
  garantieFin: date('garantie_fin'),
  notes: text('notes'),
  // Provient d'une synchronisation GLPI (inventaire).
  sourceGlpi: boolean('source_glpi').notNull().default(false),
  ...timestamps(),
})

// --- IoT / objets connectés ----------------------------------------------------------
export const iotCategorie = pgEnum('iot_categorie', [
  'camera',
  'capteur',
  'imprimante',
  'affichage',
  'controle_acces',
  'reseau',
  'autre',
])
export const iotExposition = pgEnum('iot_exposition', ['isole', 'interne', 'expose'])

export const iot = pgTable('iot', {
  id: id(),
  nom: text('nom').notNull().unique(),
  categorie: iotCategorie('categorie'),
  marque: text('marque'),
  modele: text('modele'),
  numeroSerie: text('numero_serie'),
  firmwareVersion: text('firmware_version'),
  // OS (ex. Raspberry Pi OS) — utile pour les objets à base d'OS remontés par GLPI.
  os: text('os'),
  ip: text('ip'),
  adresseMac: text('adresse_mac'),
  vlan: text('vlan'),
  localisation: text('localisation'),
  lieuId: text('lieu_id').references(() => lieu.id, { onDelete: 'set null' }),
  composanteId: text('composante_id').references(() => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references(() => departement.id, { onDelete: 'set null' }),
  exposition: iotExposition('exposition'),
  criticite: appCriticite('criticite'),
  statut: materielStatut('statut').notNull().default('actif'),
  responsableId: text('responsable_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  // Provient d'une synchronisation GLPI (inventaire).
  sourceGlpi: boolean('source_glpi').notNull().default(false),
  ...timestamps(),
})

// --- Appareils mobiles (tablettes, iPads, smartphones) -------------------------------
// Distincts des postes de travail : GLPI les inventorie comme « Computer » de type
// « Tablette » (ou nom ~ iPad), sans OS fiable. La classification les route ici.
export const appareilMobileCategorie = pgEnum('appareil_mobile_categorie', [
  'tablette',
  'smartphone',
  'liseuse',
  'autre',
])

export const appareilMobile = pgTable('appareil_mobile', {
  id: id(),
  nom: text('nom').notNull().unique(),
  categorie: appareilMobileCategorie('categorie'),
  // Type / facteur de forme brut GLPI (Tablette, modèle…).
  type: text('type'),
  marque: text('marque'),
  modele: text('modele'),
  numeroSerie: text('numero_serie'),
  os: text('os'),
  osVersion: text('os_version'),
  ip: text('ip'),
  adresseMac: text('adresse_mac'),
  localisation: text('localisation'),
  lieuId: text('lieu_id').references(() => lieu.id, { onDelete: 'set null' }),
  composanteId: text('composante_id').references(() => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references(() => departement.id, { onDelete: 'set null' }),
  utilisateurPrincipalId: text('utilisateur_principal_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  criticite: appCriticite('criticite'),
  statut: materielStatut('statut').notNull().default('actif'),
  notes: text('notes'),
  // Provient d'une synchronisation GLPI (inventaire).
  sourceGlpi: boolean('source_glpi').notNull().default(false),
  ...timestamps(),
})

// --- Machines industrielles (OT / SCADA) ---------------------------------------------
export const machineIndusFonction = pgEnum('machine_indus_fonction', [
  'automate',
  'ihm',
  'capteur',
  'robot',
  'variateur',
  'autre',
])
export const otProtocole = pgEnum('ot_protocole', [
  'modbus',
  'profinet',
  'opc_ua',
  'ethernet_ip',
  'bacnet',
  'autre',
])

export const machineIndus = pgTable('machine_indus', {
  id: id(),
  nom: text('nom').notNull().unique(),
  fonction: machineIndusFonction('fonction'),
  marque: text('marque'),
  modele: text('modele'),
  numeroSerie: text('numero_serie'),
  protocole: otProtocole('protocole'),
  firmwareVersion: text('firmware_version'),
  ip: text('ip'),
  vlan: text('vlan'),
  localisation: text('localisation'),
  lieuId: text('lieu_id').references(() => lieu.id, { onDelete: 'set null' }),
  composanteId: text('composante_id').references(() => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references(() => departement.id, { onDelete: 'set null' }),
  criticiteSurete: criticiteSurete('criticite_surete'),
  statut: materielStatut('statut').notNull().default('actif'),
  responsableId: text('responsable_id').references(() => personne.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  ...timestamps(),
})
