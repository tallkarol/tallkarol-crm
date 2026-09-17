"use client"

import { useEffect } from "react"
import { flushActivity, track } from "@/lib/activity/client"
import { fingerprint } from "@/lib/activity/detect"

/** The portal's error boundary: a plain retry for the client, and a Friction row for Karol. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const message = (error.message || "Render error").split("\n")[0].slice(0, 200)
    const source = error.digest ? `digest:${error.digest}` : (error.stack?.split("\n")[1]?.trim() ?? "").slice(0, 160)
    track("error.client", { props: { message, source, fingerprint: fingerprint(`${message}|${source}`), boundary: true } })
    flushActivity()
  }, [error])

  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-card p-6 shadow-card">
      <h1 className="font-display text-lg font-semibold text-ink">Something went wrong loading this page</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">Please try again in a moment.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-5 h-9 rounded-[10px] bg-tk-teal px-4 font-ui text-[13px] font-semibold text-tk-linen hover:brightness-110"
      >
        Try again
      </button>
    </div>
  )
}
