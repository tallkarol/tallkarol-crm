/*
 * Deliberately minimal. The CRM is behind a login and every page is
 * per-account, so caching pages or API responses on a device would be a
 * staleness bug at best and a data leak at worst. This worker exists to make
 * the clock installable and to keep its own chrome — icons, manifest — instant.
 */

const SHELL = "tk-shell-v4"
const SHELL_FILES = [
  "/manifest.webmanifest",
  "/icons/tk-192.png",
  "/icons/tk-512.png",
  "/icons/tk-maskable-512.png",
  "/icons/clock-192.png",
]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const isShell =
    url.pathname === "/manifest.webmanifest" || url.pathname.startsWith("/icons/")
  if (!isShell) return

  // The manifest is where the name and icon come from, and Android reads it
  // through this worker. Network first, so a rename shows up on the next
  // visit instead of a device keeping "Tall Karol Clock" until its cache dies.
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      fetch(request)
        .then((fresh) => {
          const copy = fresh.clone()
          caches.open(SHELL).then((cache) => cache.put(request, copy))
          return fresh
        })
        .catch(() => caches.match(request))
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request))
  )
})

/* ---------------------------------------------------------------- push */

// Every push must show something on Chrome (userVisibleOnly). The payload is
// what lib/notify.ts sent: { title, body, url, kind, tag }.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "TallKarol"
  const options = {
    body: data.body || "",
    icon: "/icons/tk-192.png",
    badge: "/icons/tk-192.png",
    tag: data.tag || data.kind || undefined,
    renotify: false,
    data: { url: data.url || "/", kind: data.kind || "" },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// A tap carries the CRM path it is about. Reuse an open window if there is
// one — the installed PWA counts — otherwise open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    })
  )
})

// The push service rotated our subscription; re-subscribe with the same key
// and tell the CRM, or this browser goes quietly deaf.
self.addEventListener("pushsubscriptionchange", (event) => {
  const key = event.oldSubscription && event.oldSubscription.options.applicationServerKey
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        })
      )
      .catch(() => {})
  )
})
