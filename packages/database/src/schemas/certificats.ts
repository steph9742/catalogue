import { pgTable, pgEnum, text, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'

// CERTIFICATS TLS. Le moteur d'échéances couvrait les VPN, les fins de support, les contrats et
// les revues — mais PAS les certificats, dont l'expiration provoque pourtant la panne la plus
// franche et la plus visible de toutes.

export const certificatSource = pgEnum('certificat_source', ['manuel', 'import', 'scan'])
export const certificatStatut = pgEnum('certificat_statut', [
  'jamais', // jamais scanné
  'ok',
  'injoignable', // hôte ou port qui ne répond pas
  'tls_erreur', // la poignée de main TLS échoue
  'invalide', // certificat lu, mais non validé (auto-signé, chaîne incomplète…)
])

export const certificat = pgTable('certificat', {
  id: id(),
  // Ce qu'on surveille. `hote` + `port` sont la clé fonctionnelle : deux services
  // distincts sur le même hôte ont des certificats distincts.
  hote: text('hote').notNull(),
  port: integer('port').notNull().default(443),
  libelle: text('libelle'),
  proprietaire: text('proprietaire'),
  notes: text('notes'),
  source: certificatSource('source').notNull().default('manuel'),
  // Un certificat qu'on ne veut plus surveiller n'est pas supprimé : on garde la trace
  // qu'il a existé, et pourquoi on a cessé de le suivre.
  surveille: boolean('surveille').notNull().default(true),

  // --- Relevé, alimenté par le scan et par lui seul ---------------------------------
  sujet: text('sujet'),
  emetteur: text('emetteur'),
  // Noms alternatifs : un certificat couvre souvent plusieurs noms, et c'est en général
  // celui qu'on n'avait pas noté qui tombe.
  nomsAlternatifs: jsonb('noms_alternatifs').$type<string[]>(),
  numeroSerie: text('numero_serie'),
  empreinte: text('empreinte'),
  algorithme: text('algorithme'),
  dateDebut: timestamp('date_debut'),
  // LA colonne qui justifie la table.
  dateFin: timestamp('date_fin'),
  autoSigne: boolean('auto_signe'),
  // Résultat de la validation par la chaîne de confiance du système. Distinct de « expiré » :
  // un certificat valide aujourd'hui peut être rejeté par un client si sa chaîne est
  // incomplète, et l'incident est le même pour l'utilisateur.
  chaineValide: boolean('chaine_valide'),
  erreurValidation: text('erreur_validation'),
  /**
   * ENREGISTREMENTS CAA qui s'appliquent à l\'hôte (RFC 8659, remontée de l\'arbre DNS).
   */
  caa: jsonb('caa').$type<string[] | null>(),

  dernierScanAt: timestamp('dernier_scan_at'),
  dernierStatut: certificatStatut('dernier_statut').notNull().default('jamais'),
  dernierMessage: text('dernier_message'),
  /**
   * Le service exposé auquel ce certificat appartient. NULLABLE, et le restera : un certificat
   * importé avant que son service ne soit déclaré doit rester lisible.
   */
  serviceId: text('service_id'),
  ...timestamps(),
}, t => [
  index('certificat_hote_port_idx').on(t.hote, t.port),
  // L'accès principal : « qu'est-ce qui expire bientôt ».
  index('certificat_date_fin_idx').on(t.dateFin),
])
