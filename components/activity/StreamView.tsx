"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Laptop, Monitor, Search, Smartphone } from "lucide-react"
import { formatClock, formatCls, formatMs } from "@/lib/activity/format"
import { routeLabel } from "@/lib/activity/routes"
import type { StreamEvent } from "@/lib/activity/summary/stream"
import { cn } from "@/lib/cn"

const POLL_MS = 5000
const KEEP = 300

const SURFACE = {
  browser: { label: "Browser", Icon: Monitor },
  mac_app: { label: "Mac app", Icon: Laptop },
  phone: { label: "Phone", Icon: Smartphone },
} as const

function prop(e: StreamEvent, key: string): string {
  const v = e.props[key]
  return v === undefined || v === null ? "" : String(v)
}

/** One line of plain words per event; the expanded row shows the stored record itself. */
function detail(e: StreamEvent): string {
  switch (e.kind) {
    case "page.view":
      return `via ${prop(e, "via") || "?"}`
    case "page.leave":
      return `active ${formatMs(e.durationMs)} · ${prop(e, "reason")}`
    case "nav.palette":
      return `to ${routeLabel(prop(e, "to") || "/")} · ${prop(e, "chars") || 0} characters typed`
    case "control.use": {
      const value = prop(e, "value")
      const chars = prop(e, "chars")
      return `${e.target ?? ""}${value ? ` = ${value}` : ""}${chars ? ` · ${chars} characters${prop(e, "sent") === "true" ? ", sent" : ""}` : ""}`
    }
    case "peek.open":
      return `${prop(e, "peek")}${prop(e, "id") ? ` · ${prop(e, "id")}` : ""}`
    case "peek.close":
      return `${prop(e, "peek")} · ${prop(e, "acted") === "true" ? "acted inside" : "no action"}`
    case "action.run":
      return `${e.target ?? ""}${prop(e, "message") ? ` · ${prop(e, "message")}` : ""}`
    case "error.client":
      return prop(e, "message")
    case "frustration.rage":
      return `${e.target ?? ""} · ${prop(e, "clicks")} clicks`
    case "frustration.quickback":
      return `back to ${routeLabel(prop(e, "to") || "/")} after ${formatMs(Number(prop(e, "stayedMs")))}`
    case "frustration.abandon":
      return `${e.target ?? ""} · ${prop(e, "chars")} characters`
    case "frustration.flipflop":
      return `${e.target ?? ""} · ${prop(e, "value")}`
    default:
      return e.kind.startsWith("vitals.") ? prop(e, "rating") : e.target ?? ""
  }
}

function result(e: StreamEvent) {
  const time = e.kind === "vitals.cls" ? formatCls(Number(prop(e, "value"))) : e.durationMs !== null ? formatMs(e.durationMs) : ""
  return (
    <>
      {time}
      {e.ok === true ? <span className="ml-1.5 font-semibold text-good">ok</span> : null}
      {e.ok === false ? <span className="ml-1.5 font-semibold text-bad">failed</span> : null}
    </>
  )
}

export function StreamView({ initial, tz, query }: { initial: StreamEvent[]; tz: string; query: string }) {
  const [events, setEvents] = useState(initial)
  const [live, setLive] = useState(true)
  const [open, setOpen] = useState<number | null>(null)
  const [moduleFilter, setModuleFilter] = useState("all")
  const [pageFilter, setPageFilter] = useState("all")
  const [q, setQ] = useState("")
  const [fresh, setFresh] = useState<Set<number>>(new Set())
  const latest = useRef(initial[0]?.id ?? 0)

  useEffect(() => {
    if (!live) return
    let stopped = false
    const poll = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const res = await fetch(`/api/activity/stream?after=${latest.current}${query ? `&${query}` : ""}`, { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { events: StreamEvent[] }
        if (stopped || !data.events.length) return
        latest.current = Math.max(latest.current, ...data.events.map((e) => e.id))
        setFresh(new Set(data.events.map((e) => e.id)))
        setEvents((prev) => [...data.events, ...prev].slice(0, KEEP))
      } catch {
        /* the next poll tries again */
      }
    }
    const timer = window.setInterval(poll, POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [live, query])

  const modules = useMemo(() => Array.from(new Set(events.map((e) => e.module))).sort(), [events])
  const routes = useMemo(() => Array.from(new Set(events.map((e) => e.route))).sort(), [events])

  const visible = events.filter((e) => {
    if (moduleFilter !== "all" && e.module !== moduleFilter) return false
    if (pageFilter !== "all" && e.route !== pageFilter) return false
    if (q) {
      const hay = `${e.kind} ${e.target ?? ""} ${e.route} ${routeLabel(e.route)}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  // Sessions as bands, newest band first; rows inside newest first.
  const bands: { session: string; events: StreamEvent[] }[] = []
  const bandIndex = new Map<string, number>()
  visible.forEach((e) => {
    const key = e.session || "unknown"
    const i = bandIndex.get(key)
    if (i === undefined) {
      bandIndex.set(key, bands.length)
      bands.push({ session: key, events: [e] })
    } else bands[i].events.push(e)
  })

  const selectClass = "h-8 rounded-[10px] border border-line bg-card px-2.5 font-ui text-[12px] font-semibold text-ink"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="activity-stream-module">Module</label>
        <select id="activity-stream-module" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className={selectClass}>
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="activity-stream-page">Page</label>
        <select id="activity-stream-page" value={pageFilter} onChange={(e) => setPageFilter(e.target.value)} className={selectClass}>
          <option value="all">All pages</option>
          {routes.map((r) => (
            <option key={r} value={r}>{routeLabel(r)}</option>
          ))}
        </select>
        <label className="flex h-8 min-w-[200px] items-center gap-2 rounded-[10px] border border-line bg-card px-2.5 text-ink-3" htmlFor="activity-stream-q">
          <Search className="size-3.5" aria-hidden />
          <input
            id="activity-stream-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Event kind, control or action"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <span className="flex-1" />
        <button
          type="button"
          aria-pressed={live}
          onClick={() => setLive((l) => !l)}
          className={cn(
            "inline-flex h-8 items-center gap-2 rounded-[10px] border bg-card px-3 font-ui text-[12px] font-semibold",
            live ? "border-good/40 text-good" : "border-line text-ink-2"
          )}
        >
          <i className={cn("inline-block size-2 rounded-full", live ? "bg-good motion-safe:animate-pulse" : "bg-ink-3")} />
          {live ? "Live" : "Paused"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        {bands.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-ink-3">
            {events.length ? "Nothing matches those filters." : "No events yet. They arrive here within a few seconds of anyone using the CRM."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <tbody>
                {bands.map((band) => {
                  const first = band.events[band.events.length - 1]
                  const last = band.events[0]
                  const surface = SURFACE[last.surface as keyof typeof SURFACE] ?? SURFACE.browser
                  const views = band.events.filter((e) => e.kind === "page.view").length
                  return (
                    <Fragment key={band.session}>
                      <tr>
                        <td colSpan={5} className="border-b border-line bg-well px-5 py-2 font-ui text-[11.5px] font-bold text-ink">
                          <span className="inline-flex items-center gap-1.5">
                            <surface.Icon className="size-3.5 text-ink-3" aria-hidden />
                            {surface.label}
                          </span>
                          {last.role === "customer" ? (
                            <span className="ml-2 rounded-full bg-accent-soft px-2 py-px text-[10.5px] text-accent-ink">
                              customer{last.client ? ` · ${last.client}` : ""}
                            </span>
                          ) : null}
                          {last.synthetic ? <span className="ml-2 rounded-full bg-warn-soft px-2 py-px text-[10.5px] text-warn">verification</span> : null}
                          <span className="ml-2 font-mono text-[11px] font-medium text-ink-3">
                            {formatClock(first.at, tz, false)} – {formatClock(last.at, tz, false)} · {views} {views === 1 ? "view" : "views"} · {band.events.length} events
                          </span>
                        </td>
                      </tr>
                      {band.events.map((e) => {
                        const expanded = open === e.id
                        const { id: _id, ...record } = e
                        return (
                          <Fragment key={e.id}>
                            <tr
                              tabIndex={0}
                              aria-expanded={expanded}
                              onClick={() => setOpen(expanded ? null : e.id)}
                              onKeyDown={(k) => {
                                if (k.key === "Enter" || k.key === " ") {
                                  k.preventDefault()
                                  setOpen(expanded ? null : e.id)
                                }
                              }}
                              className={cn(
                                "cursor-pointer outline-none focus-visible:bg-well",
                                expanded ? "bg-well" : "hover:bg-well",
                                fresh.has(e.id) && "motion-safe:animate-[tk-fade-in_.6s_ease-out]"
                              )}
                            >
                              <td className="w-[86px] whitespace-nowrap border-b border-line py-2 pl-5 pr-3 font-mono text-[11.5px] text-ink-3">{formatClock(e.at, tz)}</td>
                              <td className="whitespace-nowrap border-b border-line px-3 py-2">
                                <span className="rounded-[5px] border border-line bg-well px-1.5 py-px font-mono text-[11px] text-ink-2">{e.kind}</span>
                              </td>
                              <td className="whitespace-nowrap border-b border-line px-3 py-2 text-ink-2">{routeLabel(e.route)}</td>
                              <td className="max-w-[420px] truncate border-b border-line px-3 py-2 font-mono text-[11.5px] text-ink">{detail(e)}</td>
                              <td className="whitespace-nowrap border-b border-line py-2 pl-3 pr-5 text-right tabular-nums text-ink-2">{result(e)}</td>
                            </tr>
                            {expanded ? (
                              <tr>
                                <td colSpan={5} className="border-b border-line bg-well px-5 pb-3 pt-0">
                                  <pre className="overflow-x-auto rounded-[10px] border border-line bg-card px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-ink">
                                    {JSON.stringify(record, null, 2)}
                                  </pre>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
