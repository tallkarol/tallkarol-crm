/*
 * Deliberately minimal. The CRM is behind a login and every page is
 * per-account, so caching pages or API responses on a device would be a
 * staleness bug at best and a data leak at worst. This worker exists to make
 * the clock installable and to keep its own chrome — icons, manifest — instant.
 */

const SHELL = "tk-shell-v6"
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
// what lib/notify.ts sent: { title, body, url, kind, tag, actions }.
//
// `actions` is how a parked chat write gets decided without opening anything:
// each one names the endpoint to post to and the body to send, so this worker
// holds no opinion about which writes may be confirmed — the server decided
// that when it built the payload, under the same rule the queue row uses.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "TallKarol"
  const actions = Array.isArray(data.actions) ? data.actions.slice(0, 2) : []
  const options = {
    body: data.body || "",
    icon: "/icons/tk-192.png",
    badge: "/icons/tk-192.png",
    tag: data.tag || data.kind || undefined,
    renotify: false,
    // `actions` here is only what the platform draws: an id and a label. The
    // endpoint each one calls rides in `data`, which is ours and not read by
    // the browser, so a label cannot be made to point somewhere else.
    actions: actions.map((a) => ({ action: a.action, title: a.title })),
    data: { url: data.url || "/", kind: data.kind || "", actions },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

/**
 * Run one of those buttons.
 *
 * Same-origin, `credentials: "include"`, so the session cookie goes with it —
 * `authenticateTimeRequest` takes a session as well as a device token, which
 * is the whole reason this can work from a phone that has never been issued
 * a device token.
 *
 * The result is always said out loud. A button that silently failed would
 * leave you believing a write was filed, or discarded, when it was not.
 */
async function runNotificationAction(spec, fallbackUrl) {
  try {
    const response = await fetch(spec.post, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec.body || {}),
    })
    if (response.ok) {
      const done = spec.action === "confirm" ? "Confirmed" : "Discarded"
      await self.registration.showNotification(done, {
        body: "The write has been decided.",
        icon: "/icons/tk-192.png",
        badge: "/icons/tk-192.png",
        tag: `${spec.post}:done`,
        data: { url: fallbackUrl },
      })
      return true
    }
    let detail = `The CRM answered ${response.status}.`
    try {
      const payload = await response.json()
      if (payload && payload.error) detail = payload.error
    } catch {
      /* a non-JSON error body is still an error; the status line says enough */
    }
    await self.registration.showNotification("That did not go through", {
      body: `${detail} Open the CRM to decide it there.`,
      icon: "/icons/tk-192.png",
      badge: "/icons/tk-192.png",
      tag: `${spec.post}:failed`,
      data: { url: fallbackUrl },
    })
  } catch {
    await self.registration.showNotification("No connection", {
      body: "The write is still parked. Open the CRM when you are back online.",
      icon: "/icons/tk-192.png",
      badge: "/icons/tk-192.png",
      tag: `${spec.post}:offline`,
      data: { url: fallbackUrl },
    })
  }
  return false
}

// A tap carries the CRM path it is about. Reuse an open window if there is
// one — the installed PWA counts — otherwise open a new one. A tap on one of
// the buttons runs that button instead and opens nothing: the point of
// deciding from the notification is not having to go anywhere.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href

  if (event.action) {
    const specs = event.notification.data?.actions || []
    const spec = specs.find((a) => a && a.action === event.action)
    // An action we no longer recognise — an old notification after a deploy
    // that renamed one — falls through to opening the page, which is always
    // a safe answer.
    if (spec && spec.post) {
      event.waitUntil(runNotificationAction(spec, target))
      return
    }
  }

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
