"use client"

import { useState } from "react"
import { CopyButton } from "@/components/support/CopyButton"
import { cn } from "@/lib/cn"

/**
 * One payload: language chip, line count, copy, and expand. Collapsed to a
 * scrollable window so a 400-line trace never pushes the thread off screen.
 * `html` is pre-escaped and highlighted on the server — see lib/payload-highlight.
 */
export function PayloadBlock({
  label,
  lang,
  lines,
  body,
  html,
}: {
  label: string
  lang: string
  lines: number
  body: string
  html: string
}) {
  const [open, setOpen] = useState(false)
  const long = lines > 14

  return (
    <div className="overflow-hidden rounded-xl border border-tk-slate/20 bg-tk-onyx">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#16221F] px-2.5 py-1.5">
        <span className="shrink-0 rounded border border-[#54C3AB]/35 px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-[#54C3AB]">
          {lang}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-tk-linen">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-tk-linen/40">
          {lines} ln
        </span>
        <CopyButton text={body} tone="dark" />
        {long ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-md border border-white/15 px-2 py-0.5 font-mono text-[10.5px] text-tk-linen/65 transition-colors hover:border-[#54C3AB]/60 hover:text-[#54C3AB]"
          >
            {open ? "collapse" : "expand"}
          </button>
        ) : null}
      </div>
      <pre
        className={cn(
          "tk-payload overflow-auto px-3.5 py-3 font-mono text-[11.5px] leading-[1.65] text-[#CFD8D4]",
          open ? "max-h-none" : "max-h-64"
        )}
      >
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}
