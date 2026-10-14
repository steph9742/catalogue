import { pgTable, pgEnum, text, integer, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'
import { lieu } from './lieux'
import { materielStatut } from './materiel'
import { composante, service, departement } from './organisation'

// Cartographie RÉSEAU — entièrement curée (pas d'import GLPI côté équipements).

// --- Équipements réseau (topologie physique) -----------------------------------------
export const equipementReseauType = pgEnum('equipement_reseau_type', [
  'switch',
  'routeur',
  'firewall',
  'borne_wifi',
  'load_balancer',
  'passerelle',
  'autre',
])

export const equipementReseau = pgTable('equipement_reseau', {
  id: id(),
  nom: text('nom').notNull().unique(),
  type: equipementReseauType('type'),
  marque: text('marque'),
  modele: text('modele'),
  numeroSerie: text('numero_serie'),
  osFirmware: text('os_firmware'),
  ipGestion: text('ip_gestion'),
  localisation: text('localisation'),
  lieuId: text('lieu_id').references(() => lieu.id, { onDelete: 'set null' }),
  composanteId: text('composante_id').references(() => composante.id, { onDelete: 'set null' }),
  serviceId: text('service_id').references(() => service.id, { onDelete: 'set null' }),
  departementId: text('departement_id').references(() => departement.id, { onDelete: 'set null' }),
  statut: materielStatut('statut').notNull().default('actif'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Zones de sécurité / VLAN / sous-réseaux (vue logique) ----------------------------
export const zoneReseauType = pgEnum('zone_reseau_type', [
  'zone_securite',
  'vlan',
  'sous_reseau',
  'dmz',
])
export const zoneNiveau = pgEnum('zone_niveau', [
  'non_maitrise',
  'exposee',
  'interne',
  'securisee',
  'critique',
])

export const zoneReseau = pgTable('zone_reseau', {
  id: id(),
  nom: text('nom').notNull().unique(),
  type: zoneReseauType('type'),
  vlanId: integer('vlan_id'),
  cidr: text('cidr'),
  niveau: zoneNiveau('niveau'),
  description: text('description'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Flux réseau autorisés (matrice de flux zone → zone) ------------------------------
export const fluxProtocole = pgEnum('flux_protocole', [
  'tcp',
  'udp',
  'icmp',
  'tout',
  'autre',
])
export const fluxStatut = pgEnum('flux_statut', [
  'autorise',
  'a_revoir',
  'interdit',
])

export const fluxReseau = pgTable('flux_reseau', {
  id: id(),
  nom: text('nom').notNull(),
  sourceZoneId: text('source_zone_id').references(
    (): AnyPgColumn => zoneReseau.id,
    { onDelete: 'set null' },
  ),
  destinationZoneId: text('destination_zone_id').references(
    (): AnyPgColumn => zoneReseau.id,
    { onDelete: 'set null' },
  ),
  protocole: fluxProtocole('protocole'),
  port: text('port'),
  statut: fluxStatut('statut').notNull().default('a_revoir'),
  justification: text('justification'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Topologie physique : liens entre équipements -------------------------------------
// Médium du lien (comment il est réalisé physiquement).
export const lienReseauType = pgEnum('lien_reseau_type', [
  'fibre',
  'cuivre',
  'vlan_trunk',
  'sans_fil',
  'autre',
])
// Portée : local (intra-site) ou MAN (inter-sites, réseau reliant plusieurs villes).
export const lienReseauPortee = pgEnum('lien_reseau_portee', ['local', 'man'])

export const lienReseau = pgTable('lien_reseau', {
  id: id(),
  nom: text('nom'),
  equipementAId: text('equipement_a_id').references(
    (): AnyPgColumn => equipementReseau.id,
    { onDelete: 'cascade' },
  ),
  equipementBId: text('equipement_b_id').references(
    (): AnyPgColumn => equipementReseau.id,
    { onDelete: 'cascade' },
  ),
  type: lienReseauType('type'),
  portee: lienReseauPortee('portee'),
  debit: text('debit'),
  portA: text('port_a'),
  portB: text('port_b'),
  description: text('description'),
  notes: text('notes'),
  ...timestamps(),
})

// --- Interconnexions externes (opérateurs, CERT de rattachement, Internet) -------------------------
export const interconnexionType = pgEnum('interconnexion_type', [
  'operateur',
  'renater',
  'internet',
  'partenaire',
  'autre',
])

export const interconnexionExterne = pgTable('interconnexion_externe', {
  id: id(),
  nom: text('nom').notNull().unique(),
  type: interconnexionType('type'),
  fournisseur: text('fournisseur'),
  equipementId: text('equipement_id').references(
    (): AnyPgColumn => equipementReseau.id,
    { onDelete: 'set null' },
  ),
  debit: text('debit'),
  description: text('description'),
  notes: text('notes'),
  ...timestamps(),
})
