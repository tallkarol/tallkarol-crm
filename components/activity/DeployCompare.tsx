"use client"

import { useState } from "react"
import { cn } from "@/lib/cn"

export type DeployOption = {
  deploy: string
  title: string
  note: string
  cells: { label: string; value: string; detail: string; tone: "good" | "bad" | "" }[]
}

/** Before and after a deploy: the metrics on that deploy against the seven days before it went live. */
export function DeployCompare({ options }: { options: DeployOption[] }) {
  const [deploy, setDeploy] = useState(options[0]?.deploy ?? "")
  const current = options.find((o) => o.deploy === deploy) ?? options[0]
  if (!current) return null
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5">
        <label htmlFor="activity-deploy" className="sr-only">
          Deploy
        </label>
        <select
          id="activity-deploy"
          value={current.deploy}
          onChange={(e) => setDeploy(e.target.value)}
          className="h-7 max-w-full rounded-lg border border-line bg-card px-2 font-ui text-[12px] font-semibold text-ink"
        >
          {options.map((o) => (
            <option key={o.deploy} value={o.deploy}>
              {o.title}
            </option>
          ))}
        </select>
        <span className="font-ui text-[11.5px] font-medium text-ink-3">{current.note}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        {current.cells.map((c) => (
          <div key={c.label} className="bg-card px-4 py-3">
            <div className="font-ui text-[11.5px] font-semibold text-ink-3">{c.label}</div>
            <div className="mt-1 font-display text-[18px] font-semibold tracking-tight text-ink">{c.value}</div>
            <div className={cn("mt-0.5 font-ui text-[11px] font-semibold", c.tone === "good" ? "text-good" : c.tone === "bad" ? "text-bad" : "text-ink-3")}>
              {c.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
