import { pgTable, pgEnum, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'

// Connecteur GLPI (inventaire natif, v11, apirest.php). La distinction serveur / poste — que
// GLPI ne fait PAS et pour laquelle l'université n'a AUCUNE convention de nommage — est déduite
// de l'OS, avec une file « à classer » pour tout ce qui est ambigu.

// --- Configuration du connecteur (singleton) ---------------------------------------
export const glpiSyncStatut = pgEnum('glpi_sync_statut', ['jamais', 'ok', 'erreur', 'en_cours'])

export const connecteurGlpi = pgTable('connecteur_glpi', {
  id: id(),
  url: text('url'), // ex. https://glpi.example.org (sans /apirest.php)
  appToken: text('app_token'),
  userToken: text('user_token'),
  actif: boolean('actif').notNull().default(false),
  // Fréquence de synchronisation automatique (heures). 0 = manuel uniquement.
  frequenceHeures: integer('frequence_heures').notNull().default(24),
  dernierSyncAt: timestamp('dernier_sync_at'),
  dernierStatut: glpiSyncStatut('dernier_statut').notNull().default('jamais'),
  dernierMessage: text('dernier_message'),
  // Compteurs du dernier run : { total, serveurs, postes, aClasser, ignores }.
  dernierComptes: jsonb('dernier_comptes'),
  // Forme : [{ groupe: 'Machines critiques', criticite: 'vitale' }, …] GLPI n'attache aucun
  // sens à ses groupes : c'est l'établissement qui en donne un.
  groupesCriticite: jsonb('groupes_criticite'),
  ...timestamps(),
})

// --- Machine vue dans GLPI (staging + mémoire de classement) ------------------------
// Chaque « Computer » de GLPI a une ligne ici. Le classement (auto par OS, ou décidé à la main)
// est MÉMORISÉ : un re-sync ne réécrase jamais une décision humaine (`classementManuel`).
export const glpiClassement = pgEnum('glpi_classement', [
  'a_classer',
  'serveur',
  'poste',
  'appareil_mobile',
  'iot',
  'ignore',
])

export const glpiMachine = pgTable('glpi_machine', {
  id: id(),
  glpiId: text('glpi_id').notNull().unique(),
  nom: text('nom').notNull(),
  // Type / facteur de forme GLPI (châssis SMBIOS) : Desktop, Notebook, Rack Mount, QEMU…
  // Sert de signal principal de classification serveur/poste (voir glpiClassify).
  type: text('type'),
  os: text('os'),
  osVersion: text('os_version'),
  // Chemin d'entité GLPI (ex. Le 2e segment donne la composante.
  entite: text('entite'),
  // Chemin de LIEU GLPI brut (ex.
  lieu: text('lieu'),
  // GROUPES GLPI — deux champs DISTINCTS, repris tels quels, SANS leur prêter de sens.
  groupe: text('groupe'),
  groupeTechnique: text('groupe_technique'),
  // NUMÉRO DE SÉRIE — la seule identité qui ne ment pas. Le nom ne suffit pas à identifier une
  // machine : GLPI accumule des entrées périmées (219 doublons constatés sur 8 859 machines en
  // août 2026), et certains agents d'inventaire renvoient un nom par défaut — « localhost », «
  // macOS » — qui ne désigne…
  numeroSerie: text('numero_serie'),
  // Champs bruts utiles renvoyés par GLPI (numéro de série, modèle, statut…).
  donneesBrutes: jsonb('donnees_brutes'),
  classement: glpiClassement('classement').notNull().default('a_classer'),
  classementManuel: boolean('classement_manuel').notNull().default(false),
  // Id de la ligne serveur/poste liée (null tant que « à classer » / « ignore »).
  cibleId: text('cible_id'),
  vuAuSync: boolean('vu_au_sync').notNull().default(true),
  ...timestamps(),
})
