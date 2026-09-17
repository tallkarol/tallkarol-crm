"use client"

import { useState } from "react"

export type FlowOption = {
  from: string
  label: string
  total: number
  next: { label: string; n: number; out: boolean }[]
}

/** "Where you go next, after [page]" — the next page in the same session, as shares. */
export function NextPages({ flows }: { flows: FlowOption[] }) {
  const [from, setFrom] = useState(flows[0]?.from ?? "")
  const flow = flows.find((f) => f.from === from) ?? flows[0]
  if (!flow) return null
  const shown = flow.next.slice(0, 7)
  const max = Math.max(1, ...shown.map((s) => s.n))

  return (
    <div>
      <label className="flex flex-wrap items-center gap-2 font-ui text-[12px] font-semibold text-ink-2" htmlFor="activity-next-from">
        After
        <select
          id="activity-next-from"
          value={flow.from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-7 rounded-lg border border-line bg-card px-2 font-ui text-[12px] font-semibold text-ink"
        >
          {flows.map((f) => (
            <option key={f.from} value={f.from}>
              {f.label}
            </option>
          ))}
        </select>
        <span className="font-medium text-ink-3">{flow.total} visits</span>
      </label>
      <ul className="mt-3 flex flex-col gap-2">
        {shown.map((step) => (
          <li key={step.label} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_40px] items-center gap-2.5 text-[12.5px] text-ink-2">
            <span className="truncate">{step.label}</span>
            <span
              className="block h-2.5 min-w-[2px] rounded-r"
              style={{ width: `${(step.n / max) * 100}%`, background: step.out ? "var(--chart-prev)" : "var(--chart-teal)" }}
            />
            <span className="text-right font-medium tabular-nums text-ink">{Math.round((step.n / flow.total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
