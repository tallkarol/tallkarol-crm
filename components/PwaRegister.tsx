"use client"

import { useEffect } from "react"

/** Registers the service worker that makes the clock installable. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An unavailable worker costs installability, never the app itself.
      })
    }
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
  }, [])

  return null
}
