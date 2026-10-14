import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core'
import { id, timestamps } from './_shared'

// Connecteur Slowpoke (« Sniff ») — remontée LECTURE SEULE des incidents cyber, pour relier la
// carto à la gestion d'incidents et alimenter le suivi des délais de notification NIS 2 (24 h /
// 72 h / 1 mois).

export const connecteurSlowpoke = pgTable('connecteur_slowpoke', {
  id: id(),
  url: text('url'), // ex. https://slowpoke.example.org (origine, le proxy sert /api)
  cleService: text('cle_service'),
  // SECRET DU WEBHOOK ENTRANT, chiffré en base comme la clé de service. Sniff signe ses
  // événements en HMAC-SHA256 (`X-Slowpoke-Signature`).
  secretWebhook: text('secret_webhook'),
  actif: boolean('actif').notNull().default(false),
  // ⚠️ OBSOLÈTE — ne commande plus rien, conservé pour ne pas casser les lignes existantes.
  autoNotifier: boolean('auto_notifier').notNull().default(true),
  dernierAccesAt: timestamp('dernier_acces_at'),
  dernierStatut: text('dernier_statut').notNull().default('jamais'),
  dernierMessage: text('dernier_message'),
  ...timestamps(),
})
