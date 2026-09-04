"use client"

import { useEffect, useState } from "react"

type State = "checking" | "unsupported" | "denied" | "off" | "on" | "busy"

function toKey(base64: string) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/**
 * Opt this browser in. The permission prompt has to come from a tap —
 * browsers refuse it otherwise — so nothing here runs on load except the
 * check of where things stand.
 */
export function PushToggle() {
  const [state, setState] = useState<State>("checking")
  const [note, setNote] = useState<string | null>(null)
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !publicKey) {
      setState("unsupported")
      return
    }
    if (Notification.permission === "denied") {
      setState("denied")
      return
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"))
  }, [publicKey])

  async function enable() {
    setState("busy")
    setNote(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState("denied")
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toKey(publicKey),
        }))
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error(`CRM answered ${res.status}`)
      setState("on")
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err))
      setState("off")
    }
  }

  async function disable() {
    setState("busy")
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
    } finally {
      setState("off")
    }
  }

  async function test() {
    setNote(null)
    const res = await fetch("/api/push/test", { method: "POST" })
    const data = await res.json().catch(() => ({}))
    setNote(
      data.sent > 0
        ? `Sent to ${data.sent} device${data.sent === 1 ? "" : "s"}.`
        : `Nothing sent — ${data.pruned ?? 0} pruned, ${data.failed ?? 0} failed.`
    )
  }

  const button =
    "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50"

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-tk-slate">
        {state === "checking" && "Checking this browser…"}
        {state === "unsupported" && "This browser can't receive push. On iPhone or iPad, add the CRM to the Home Screen first."}
        {state === "denied" && "Notifications are blocked for this site in the browser's settings."}
        {state === "off" && "This device isn't receiving push."}
        {state === "on" && "This device is receiving push."}
        {state === "busy" && "Working…"}
      </span>
      {state === "off" && (
        <button type="button" onClick={enable} className={`${button} bg-accent text-tk-linen hover:bg-tk-teal/90`}>
          Enable on this device
        </button>
      )}
      {state === "on" && (
        <>
          <button type="button" onClick={test} className={`${button} bg-accent text-tk-linen hover:bg-tk-teal/90`}>
            Send a test
          </button>
          <button type="button" onClick={disable} className={`${button} border border-line text-tk-slate hover:text-tk-onyx`}>
            Turn off here
          </button>
        </>
      )}
      {note && <span className="text-xs text-ink-3">{note}</span>}
    </div>
  )
}
