"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type ActionResult = { ok: boolean; error?: string }

/**
 * Void a list you no longer mean to work, or bring a voided one back. Done
 * is never set here — it follows the items.
 */
export function ListStatusMenu({
  status,
  stored,
  action,
}: {
  status: "draft" | "open" | "done" | "void"
  stored: "draft" | "open" | "done" | "void"
  action: (status: "open" | "void") => Promise<ActionResult>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const next: "open" | "void" = stored === "void" ? "open" : "void"

  return (
    <span className="inline-flex items-center gap-2">
      {error ? <span className="text-xs font-semibold text-red-700">{error}</span> : null}
      <button
        type="button"
        disabled={pending || status === "draft"}
        onClick={() =>
          startTransition(async () => {
            const result = await action(next)
            if (!result.ok) setError(result.error ?? "That didn't save.")
            router.refresh()
          })
        }
        className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal disabled:opacity-40"
      >
        {next === "void" ? "Void list" : "Reopen list"}
      </button>
    </span>
  )
}
