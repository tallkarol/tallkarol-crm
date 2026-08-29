/*
 * Deliberately minimal. The CRM is behind a login and every page is
 * per-account, so caching pages or API responses on a device would be a
 * staleness bug at best and a data leak at worst. This worker exists to make
 * the clock installable and to keep its own chrome — icons, manifest — instant.
 */

const SHELL = "tk-clock-shell-v1"
const SHELL_FILES = [
  "/manifest.webmanifest",
  "/icons/clock-192.png",
  "/icons/clock-512.png",
  "/icons/clock-maskable-512.png",
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

  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request))
  )
})
