import webpush from 'web-push'
import { eq } from 'drizzle-orm'
import { db } from '@catalogue/database'
import { webhook, pushSubscription } from '@catalogue/database/tables'

// Diffusion d'un événement (clé `<entite>:<action>` ou `echeance:<type>`) vers les
// webhooks (POST JSON, ex. n8n) et les abonnements push, filtrés par souscription.

let vapidReady: boolean | null = null
function ensureVapid() {
  if (vapidReady !== null) return vapidReady
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@localhost', pub, priv)
    vapidReady = true
  }
  else {
    vapidReady = false
  }
  return vapidReady
}

export async function notifyWebhooks(eventKey: string, payload: Record<string, unknown>) {
  const hooks = (await db.select().from(webhook).where(eq(webhook.actif, true)))
    .filter(h => (h.events ?? []).includes(eventKey))
  await Promise.allSettled(hooks.map(h =>
    fetch(h.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(h.secret ? { 'x-webhook-secret': h.secret } : {}) },
      body: JSON.stringify(payload),
    }),
  ))
}

export async function notifyPush(eventKey: string, payload: Record<string, unknown>) {
  if (!ensureVapid()) {
    console.warn(`🔕 push ignoré (${eventKey}) — VAPID non configuré`)
    return
  }
  const subs = (await db.select().from(pushSubscription))
    .filter(s => (s.events ?? []).includes(eventKey))
  if (!subs.length) return
  await Promise.allSettled(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      )
    }
    catch (e) {
      const err = e as { statusCode?: number, body?: string, message?: string }
      // 404/410 : le navigateur s'est désabonné — on purge, c'est normal et silencieux.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.delete(pushSubscription).where(eq(pushSubscription.id, s.id))
        return
      }
      // Tout le reste était avalé sans trace : une notification qui n'arrive pas ne
      // laissait AUCUN indice côté serveur, et le diagnostic devenait impossible.
      console.error(`🔕 push en échec (${eventKey}) — ${err.statusCode ?? '?'} ${(err.body ?? err.message ?? '').slice(0, 160)}`)
    }
  }))
}

export async function notify(eventKey: string, payload: Record<string, unknown>) {
  await Promise.allSettled([notifyWebhooks(eventKey, payload), notifyPush(eventKey, payload)])
}
