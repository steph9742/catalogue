function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function usePush() {
  const config = useRuntimeConfig()
  const baseURL = config.public.serverBaseUrl as string
  const supported = import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window

  const reg = () => navigator.serviceWorker.register('/sw.js')
  const getSub = async () => (supported ? (await reg()).pushManager.getSubscription() : null)

  const push = (endpoint: string | undefined, keys: unknown, events: string[]) =>
    $fetch('/api/push/subscribe', { baseURL, method: 'POST', credentials: 'include', body: { endpoint, keys, events } })

  async function status(): Promise<{ subscribed: boolean, events: string[] }> {
    const sub = await getSub()
    if (!sub) return { subscribed: false, events: [] }
    const json = sub.toJSON()
    try {
      const s = await $fetch<{ events?: string[] } | null>('/api/push/subscription', {
        baseURL, credentials: 'include', query: { endpoint: json.endpoint },
      })
      return { subscribed: true, events: s?.events ?? [] }
    }
    catch {
      return { subscribed: true, events: [] }
    }
  }

  async function subscribe(events: string[]) {
    if (!supported) throw new Error('Notifications non supportées par ce navigateur.')
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') throw new Error('Permission refusée.')
    const r = await reg()
    await navigator.serviceWorker.ready
    const vapid = await $fetch<{ publicKey: string | null }>('/api/push/vapid', { baseURL, credentials: 'include' })
    if (!vapid.publicKey) throw new Error('VAPID non configuré côté serveur.')
    let sub = await r.pushManager.getSubscription()
    if (!sub) {
      sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) })
    }
    const json = sub.toJSON()
    await push(json.endpoint, json.keys, events)
  }

  async function saveEvents(events: string[]) {
    const sub = await getSub()
    if (!sub) return subscribe(events)
    const json = sub.toJSON()
    await push(json.endpoint, json.keys, events)
  }

  async function unsubscribe() {
    const sub = await getSub()
    if (!sub) return
    const json = sub.toJSON()
    await sub.unsubscribe()
    await $fetch('/api/push/unsubscribe', { baseURL, method: 'POST', credentials: 'include', body: { endpoint: json.endpoint } })
  }

  return { supported, status, subscribe, saveEvents, unsubscribe }
}
