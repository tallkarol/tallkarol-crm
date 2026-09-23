"use client"

import Link from "next/link"
import { useState } from "react"
import {
  BookOpen,
  ChevronDown,
  ClipboardList,
  Code,
  ExternalLink,
  FileText,
  FolderKanban,
  KeyRound,
  LifeBuoy,
  LineChart,
  Megaphone,
  RadioTower,
  SquareCheck,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/cn"
import type {
  BarTone,
  LinkIcon,
  RelatedRow,
  RelatedTone,
  SystemAction,
  SystemRow,
  SystemStatus,
} from "@/lib/client-monitors"

/**
 * The Monitors room's accordion: one row per system, three columns when open
 * (Health, Documentation & links, Related). Pure presentation — everything
 * it draws came pre-computed from `lib/client-monitors.ts`, so this file
 * never imports `@/db`.
 */

const KIND_LABEL = { site: "Site", app: "App", job: "Job" } as const

const LINK_ICON: Record<LinkIcon, LucideIcon> = {
  spec: FileText,
  repo: Code,
  insights: LineChart,
  ads: Megaphone,
  vault: KeyRound,
  external: ExternalLink,
}

const DOT_TONE: Record<SystemStatus, string> = {
  ok: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  unwatched: "border border-line-strong bg-transparent",
}

const HEADLINE_TONE: Record<SystemStatus, string> = {
  ok: "text-ink-2",
  warn: "text-warn font-semibold",
  bad: "text-bad font-semibold",
  unwatched: "text-ink-3 italic",
}

const BAR_TONE: Record<BarTone, string> = {
  ok: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  idle: "bg-line-strong",
}

const RELATED_TONE: Record<RelatedTone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  crit: "bg-bad-soft text-bad",
  teal: "bg-accent-soft text-accent-ink",
  muted: "bg-well text-ink-3",
  neutral: "bg-well text-ink-3",
}

function ActionLink({ action, compact = false }: { action: SystemAction; compact?: boolean }) {
  return (
    <Link
      href={action.href}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg font-ui text-[11px] font-semibold transition-colors motion-reduce:transition-none",
        compact ? "h-[24px] px-2" : "h-[26px] px-2.5",
        action.tone === "primary"
          ? "bg-bad-soft text-bad hover:opacity-80"
          : "border border-line bg-card text-ink-2 hover:border-line-strong hover:text-tk-onyx"
      )}
    >
      {action.label}
    </Link>
  )
}

function RelatedGroup({
  title,
  icon: Icon,
  rows,
}: {
  title: string
  icon: LucideIcon
  rows: RelatedRow[]
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 py-1 font-ui text-[11px] font-bold text-ink-2">
        <Icon className="size-3.5 text-ink-3" aria-hidden />
        {title}
        <span className="font-mono text-[10px] font-normal text-ink-3">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-2 pb-1.5 font-ui text-[11px] text-ink-3 opacity-70">none</p>
      ) : (
        <div className="flex flex-col">
          {rows.map((row, i) => (
            <Link
              key={`${row.label}:${i}`}
              href={row.href}
              scroll={false}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-tk-onyx hover:bg-well"
            >
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              {row.tone ? (
                <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 font-ui text-[10px] font-semibold", RELATED_TONE[row.tone])}>
                  {row.meta}
                </span>
              ) : (
                <span className="shrink-0 font-mono text-[10.5px] text-ink-3">{row.meta}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function SystemBody({ row }: { row: SystemRow }) {
  return (
    <div className="grid grid-cols-1 border-t border-line lg:grid-cols-[1.2fr_0.9fr_1fr]">
      {/* --------------------------------------------------------- Health */}
      <section className="flex flex-col gap-2.5 border-line px-3.5 py-3.5 lg:border-r">
        <p className="font-ui text-[9.5px] font-bold uppercase tracking-[.12em] text-ink-3">Health</p>
        {row.surfaces.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-[12px] text-ink-3">
            No monitor on this yet
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {row.surfaces.map((s, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border border-line px-2.5 py-1.5",
                  s.tone === "bad" ? "border-transparent bg-bad-soft" : s.tone === "warn" ? "border-transparent bg-warn-soft" : "bg-well"
                )}
              >
                <div className="truncate font-ui text-[9px] font-bold uppercase tracking-[.08em] text-ink-3">{s.label}</div>
                <div className="mt-0.5 flex items-center gap-1.5 font-ui text-[12px] font-bold text-tk-onyx">
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", BAR_TONE[s.tone])} />
                  {s.headline}
                </div>
                <div className="truncate font-mono text-[10px] text-ink-3">{s.detail}</div>
              </div>
            ))}
          </div>
        )}
        {row.bars.length > 0 ? (
          <div className="flex h-[26px] items-end gap-[2px]" aria-hidden>
            {row.bars.map((b, i) => (
              <span key={i} className={cn("min-w-0 flex-1 rounded-[1px] opacity-70", BAR_TONE[b.tone])} style={{ height: `${b.pct}%` }} />
            ))}
          </div>
        ) : null}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-ui text-[11.5px]">
          {row.facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="whitespace-nowrap text-ink-3">{k}</dt>
              <dd className="min-w-0 truncate font-semibold text-tk-onyx">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {row.actions.map((a, i) => (
            <ActionLink key={i} action={a} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- Documentation */}
      <section className="flex flex-col gap-1 border-line px-3.5 py-3.5 lg:border-r">
        <p className="font-ui text-[9.5px] font-bold uppercase tracking-[.12em] text-ink-3">Documentation &amp; links</p>
        <div className="flex flex-col">
          {row.links.map((l, i) => {
            const Icon = LINK_ICON[l.icon]
            const external = /^https?:\/\//.test(l.href)
            return (
              <Link
                key={i}
                href={l.href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 font-ui text-[12px] font-semibold text-tk-onyx hover:bg-well hover:text-accent-ink"
              >
                <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                <span className="shrink-0">{l.label}</span>
                <span className="min-w-0 flex-1 truncate text-right font-mono text-[10.5px] font-normal text-ink-3">{l.detail}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ------------------------------------------------------- Related */}
      <section className="flex flex-col gap-2 px-3.5 py-3.5">
        <p className="font-ui text-[9.5px] font-bold uppercase tracking-[.12em] text-ink-3">Related</p>
        <RelatedGroup title="Projects" icon={FolderKanban} rows={row.related.projects} />
        <RelatedGroup title="Tasks" icon={SquareCheck} rows={row.related.tasks} />
        <RelatedGroup title="Punch lists" icon={ClipboardList} rows={row.related.punchlists} />
        <RelatedGroup title="Tickets" icon={LifeBuoy} rows={row.related.tickets} />
        <RelatedGroup title="Docs" icon={BookOpen} rows={row.related.docs} />
      </section>
    </div>
  )
}

function SystemArticle({ row, open, onToggle }: { row: SystemRow; open: boolean; onToggle: () => void }) {
  const quick = row.actions[0]
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-card",
        row.status === "unwatched" ? "border-dashed border-line-strong shadow-none" : "border-line"
      )}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT_TONE[row.status])} />
          <span className="shrink-0 rounded-md border border-line bg-well px-1.5 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[.08em] text-ink-3">
            {KIND_LABEL[row.kind]}
          </span>
          <span className="shrink-0 font-ui text-[13px] font-bold text-tk-onyx">{row.name}</span>
          <span className="hidden shrink-0 truncate font-mono text-[11px] text-ink-3 sm:inline">{row.host}</span>
          <span className={cn("min-w-0 flex-1 truncate text-[12px]", HEADLINE_TONE[row.status])}>{row.headline}</span>
          <span className="hidden shrink-0 font-mono text-[10.5px] text-ink-3 md:inline">{row.checkedLabel}</span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-ink-3 transition-transform motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden
          />
        </button>
        {quick ? <ActionLink action={quick} compact /> : null}
      </div>
      {open ? <SystemBody row={row} /> : null}
    </article>
  )
}

export function SystemsAccordion({
  clientName,
  systems,
  summary,
}: {
  clientName: string
  systems: SystemRow[]
  summary: string
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const s of systems) initial[s.id] = s.status === "bad" || s.status === "warn"
    return initial
  })

  function expandAll() {
    const next: Record<string, boolean> = {}
    for (const s of systems) next[s.id] = true
    setOpen(next)
  }
  function collapseAll() {
    const next: Record<string, boolean> = {}
    for (const s of systems) next[s.id] = false
    setOpen(next)
  }

  if (systems.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-sm text-ink-3">
        Nothing wired for {clientName} yet — no site, app, or scheduled job.
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-0.5 pb-2">
        <h2 className="flex items-center gap-1.5 font-ui text-[12.5px] font-bold text-tk-onyx">
          <RadioTower className="size-3.5 text-ink-3" aria-hidden />
          Everything {clientName} has running
        </h2>
        <span className="font-ui text-[11.5px] text-ink-3">
          {systems.length} system{systems.length === 1 ? "" : "s"} · {summary}
        </span>
        <span className="grow" />
        <button
          type="button"
          onClick={expandAll}
          className="h-[24px] rounded-lg border border-line bg-card px-2 font-ui text-[11px] font-semibold text-ink-2 hover:border-line-strong hover:text-tk-onyx"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="h-[24px] rounded-lg border border-line bg-card px-2 font-ui text-[11px] font-semibold text-ink-2 hover:border-line-strong hover:text-tk-onyx"
        >
          Collapse all
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {systems.map((row) => (
          <SystemArticle
            key={row.id}
            row={row}
            open={Boolean(open[row.id])}
            onToggle={() => setOpen((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
          />
        ))}
      </div>
    </div>
  )
}
