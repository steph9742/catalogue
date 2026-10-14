// Service worker minimal pour les notifications push du Catalogue.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  }
  catch {
    data = { title: 'Catalogue', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Catalogue'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      tag: data.event || undefined,
      data,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/alertes'))
})
