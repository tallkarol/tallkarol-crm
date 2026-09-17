"use client"

import Link from "next/link"
import { useEffect } from "react"
import { Card } from "@/components/ui/Card"
import { flushActivity, track } from "@/lib/activity/client"
import { fingerprint } from "@/lib/activity/detect"
import { ROUTES } from "@/lib/nav"

/**
 * The admin error boundary. Until activity logging there was none, so a
 * render error showed Next's default page and left no trace. The error is
 * recorded (Activity → Friction) and the shell stays up around this card.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const message = (error.message || "Render error").split("\n")[0].slice(0, 200)
    const source = error.digest ? `digest:${error.digest}` : (error.stack?.split("\n")[1]?.trim() ?? "").slice(0, 160)
    track("error.client", { props: { message, source, fingerprint: fingerprint(`${message}|${source}`), boundary: true } })
    flushActivity()
  }, [error])

  return (
    <div className="mx-auto mt-16 max-w-md">
      <Card className="p-6">
        <h1 className="font-display text-lg font-semibold text-ink">This page hit an error</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          It has been recorded under Activity → Friction. Try again, or go back to the dashboard.
        </p>
        {error.digest ? <p className="mt-2 font-mono text-[11px] text-ink-3">digest {error.digest}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="h-9 rounded-[10px] bg-tk-teal px-4 font-ui text-[13px] font-semibold text-tk-linen hover:brightness-110"
          >
            Try again
          </button>
          <Link
            href={ROUTES.home}
            className="inline-flex h-9 items-center rounded-[10px] border border-line bg-card px-4 font-ui text-[13px] font-semibold text-ink hover:border-line-strong"
          >
            Dashboard
          </Link>
        </div>
      </Card>
    </div>
  )
}
