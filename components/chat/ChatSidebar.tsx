"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, BookOpen, ChevronRight, ListChecks, Plus, Search } from "lucide-react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { monogram } from "@/lib/chat/desk-context"
import {
  agoLabel,
  dayBucket,
  dollars,
  durationLabel,
  listStamp,
  modelLabel,
  modelPool,
  type DayBucket,
} from "@/lib/chat/format"
import { PERSONAS } from "@/lib/chat/personas"
import { SKILL_DOCS } from "@/lib/chat/skills"
import type { WorkerStatus } from "@/lib/chat/worker-status"
import { StateDot } from "@/components/chat/Receipt"
import { SkillsDocs } from "@/components/chat/SkillsDocs"
import { onSkillsTab } from "@/components/chat/compose-bus"
import type { ThreadRow, ThreadState } from "@/components/chat/types"

const TAB_KEY = "tk-chat-tab"

type Tab = "requests" | "skills"

const BUCKETS: { key: DayBucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "earlier", label: "Earlier" },
]

/**
 * The queue.
 *
 * Threads filed under their most urgent state — a write waiting for Karol,
 * a turn a worker holds, a turn queued behind it — and only then by day.
 * The worker's heartbeat sits at the top because it gates everything below
 * it. The Skills tab is the same rail's other face: what you can start a
 * request with. The tab is remembered per browser because someone who opens
 * Skills tends to keep using it.
 */
export function ChatSidebar({
  threads,
  activeId,
  isNew,
  worker,
  now,
}: {
  threads: ThreadRow[]
  activeId: string | null
  isNew: boolean
  worker: WorkerStatus
  /** Server time, ISO — the day buckets must agree on both sides of hydration. */
  now: string
}) {
  const [tab, setTab] = useState<Tab>("requests")
  const [q, setQ] = useState("")
  const [desk, setDesk] = useState("")
  const [archivedOpen, setArchivedOpen] = useState(false)

  // Land on an archived thread (a link, a restore) and its group is open.
  useEffect(() => {
    if (threads.some((t) => t.archived && t.id === activeId)) setArchivedOpen(true)
  }, [threads, activeId])

  useEffect(() => {
    try {
      if (localStorage.getItem(TAB_KEY) === "skills") setTab("skills")
    } catch {
      /* ignore */
    }
    return onSkillsTab(() => pick("skills"))
  }, [])

  function pick(next: Tab) {
    setTab(next)
    setQ("")
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const at = new Date(now)
  const needle = q.trim().toLowerCase()
  const searched = needle
    ? threads.filter((t) => t.title.toLowerCase().includes(needle))
    : threads
  const visible = desk ? searched.filter((t) => t.agent === desk) : searched
  const active = visible.filter((t) => !t.archived)
  const archived = visible.filter((t) => t.archived)
  const byState = (state: ThreadState) => active.filter((t) => t.state === state)
  const idle = byState("idle")
  // The desks that actually have threads, in roster order — a filter, not a roster.
  const desks = Object.keys(PERSONAS).filter((name) => threads.some((t) => t.agent === name))

  const counts = {
    command: SKILL_DOCS.filter((d) => d.kind === "command").length,
    skill: SKILL_DOCS.filter((d) => d.kind === "skill").length,
    agent: SKILL_DOCS.filter((d) => d.kind === "agent").length,
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <Worker worker={worker} />
        <Link
          href={`${ROUTES.chat}?new`}
          aria-current={isNew ? "page" : undefined}
          className={cn(
            "ml-auto inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] border pl-2 pr-2.5 font-ui text-[12px] font-semibold",
            isNew
              ? "border-transparent bg-accent-soft text-accent-ink"
              : "border-line bg-card text-tk-onyx hover:border-line-strong"
          )}
        >
          <Plus className="size-3.5 text-accent-ink" aria-hidden />
          New
        </Link>
      </div>

      <div className="px-3 pb-2">
        <div
          role="tablist"
          aria-label="Sidebar"
          className="flex gap-0.5 rounded-[9px] border border-line bg-card p-[3px]"
        >
          <TabButton on={tab === "requests"} onClick={() => pick("requests")}>
            <ListChecks className="size-[13px]" aria-hidden />
            Requests
          </TabButton>
          <TabButton on={tab === "skills"} onClick={() => pick("skills")}>
            <BookOpen className="size-[13px]" aria-hidden />
            Skills
          </TabButton>
        </div>
      </div>

      {tab === "requests" ? (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Search requests" />

          {desks.length ? (
            <div className="mx-3 mb-1 flex flex-wrap gap-1" role="group" aria-label="Filter by desk">
              <DeskChip on={desk === ""} onClick={() => setDesk("")}>
                All
              </DeskChip>
              {desks.map((name) => (
                <DeskChip key={name} on={desk === name} onClick={() => setDesk(desk === name ? "" : name)}>
                  {PERSONAS[name].label}
                </DeskChip>
              ))}
            </div>
          ) : null}

          <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {threads.length === 0 ? (
              <p className="px-2 pt-3 text-xs text-ink-3">
                No requests yet. Ask something and one starts.
              </p>
            ) : visible.length === 0 ? (
              <p className="px-2 pt-3 text-xs text-ink-3">Nothing matches.</p>
            ) : null}

            <Group label="Needs you" state="needs" rows={byState("needs")} activeId={activeId} now={at} worker={worker} />
            <Group label="Running" state="running" rows={byState("running")} activeId={activeId} now={at} worker={worker} />
            <Group label="Queued" state="queued" rows={byState("queued")} activeId={activeId} now={at} worker={worker} />

            {BUCKETS.map((bucket) => {
              const rows = idle.filter((t) => dayBucket(t.lastMessageAt, at) === bucket.key)
              if (rows.length === 0) return null
              return (
                <Fragment key={bucket.key}>
                  <div className="px-2 pb-1 pt-3 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                    {bucket.label}
                  </div>
                  {rows.map((thread) => (
                    <Row key={thread.id} thread={thread} active={thread.id === activeId} now={at} worker={worker} />
                  ))}
                </Fragment>
              )
            })}

            {archived.length > 0 ? (
              <>
                <button
                  type="button"
                  aria-expanded={archivedOpen}
                  onClick={() => setArchivedOpen((open) => !open)}
                  className="mt-3 flex w-full items-center gap-1.5 rounded-md px-2 pb-1 pt-1 text-left font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3 hover:text-tk-onyx"
                >
                  <ChevronRight
                    className={cn(
                      "size-3 transition-transform motion-reduce:transition-none",
                      archivedOpen && "rotate-90"
                    )}
                    aria-hidden
                  />
                  Archived
                  <span className="ml-auto font-mono font-semibold tracking-normal">{archived.length}</span>
                </button>
                {archivedOpen
                  ? archived.map((thread) => (
                      <Row
                        key={thread.id}
                        thread={thread}
                        active={thread.id === activeId}
                        now={at}
                        worker={worker}
                        muted
                      />
                    ))
                  : null}
              </>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Find a skill or /command" />
          <p className="px-3.5 pb-1.5 text-[11px] leading-[1.45] text-ink-3">
            Slash commands run from the composer. Skills and agents load when
            you ask for them. Anything that writes shows a preview first.
          </p>
          <SkillsDocs query={q} />
          <div className="flex items-center justify-between gap-2 border-t border-line px-3.5 pb-3 pt-2 text-[10.5px] text-ink-3">
            <span>
              {counts.command} commands · {counts.skill} skills · {counts.agent} agents
            </span>
            <Link href={ROUTES.hivemind} className="font-semibold text-accent-ink">
              Hive mind map
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

/** The heartbeat, at the top because it gates the queue. */
function Worker({ worker }: { worker: WorkerStatus }) {
  const online = worker.online
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 font-ui text-[11px] font-semibold text-ink-2"
      title={
        online
          ? "The worker on the Mac that runs turns is listening."
          : "No worker is listening. Turns queue until one starts."
      }
    >
      <span
        className={cn(
          "size-[7px] shrink-0 rounded-full",
          online ? "bg-good ring-[3px] ring-good-soft" : "bg-warn ring-[3px] ring-warn-soft"
        )}
        aria-hidden
      />
      <span className="truncate">{online ? worker.name : worker.lastSeenAt ? "Worker offline" : "No worker"}</span>
      {worker.secondsAgo != null ? (
        <span className="shrink-0 font-mono font-medium text-ink-3">· {agoLabel(worker.secondsAgo)}</span>
      ) : null}
    </span>
  )
}

function Group({
  label,
  state,
  rows,
  activeId,
  now,
  worker,
}: {
  label: string
  state: ThreadState
  rows: ThreadRow[]
  activeId: string | null
  now: Date
  worker: WorkerStatus
}) {
  if (rows.length === 0) return null
  return (
    <>
      <div className="flex items-center gap-2 px-2 pb-1 pt-3 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
        <StateDot state={state} />
        {label}
        <span className="ml-auto font-mono font-semibold tracking-normal">{rows.length}</span>
      </div>
      {rows.map((thread) => (
        <Row key={thread.id} thread={thread} active={thread.id === activeId} now={now} worker={worker} />
      ))}
    </>
  )
}

function Row({
  thread,
  active,
  now,
  worker,
  muted,
}: {
  thread: ThreadRow
  active: boolean
  now: Date
  worker: WorkerStatus
  /** Archived rows read a step quieter until they are brought back. */
  muted?: boolean
}) {
  const { pulse, state } = thread
  const desk = thread.agent && PERSONAS[thread.agent] ? monogram(thread.agent) : null
  const when =
    state === "running" && pulse.live
      ? durationLabel(Math.max(0, now.getTime() - new Date(pulse.live.since).getTime()))
      : state === "queued"
        ? "next"
        : listStamp(thread.lastMessageAt, now)

  return (
    <Link
      href={ROUTES.chatThread(thread.id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 rounded-[9px] px-2 py-[7px]",
        active ? "bg-card shadow-card" : "hover:bg-well"
      )}
    >
      <span
        className={cn(
          "truncate text-[12.5px] font-semibold leading-[1.3]",
          active ? "text-accent-ink" : muted ? "text-ink-2" : "text-tk-onyx"
        )}
      >
        {thread.title}
      </span>
      <span className="pt-0.5 font-mono text-[10.5px] font-medium tabular-nums text-ink-3">{when}</span>
      <span className="col-span-2 flex min-w-0 items-center gap-1.5 truncate font-ui text-[11px] font-medium text-ink-3">
        {desk ? (
          <>
            <b className="font-mono font-semibold text-ink-2">{desk}</b>
            <Dot />
          </>
        ) : null}
        {pulse.waiting ? (
          <>
            <span className="truncate font-semibold text-warn">
              {pulse.waiting} waiting{pulse.waitingCount > 1 ? ` +${pulse.waitingCount - 1}` : ""}
            </span>
            {pulse.live ? <Dot /> : null}
          </>
        ) : null}
        {pulse.live ? (
          pulse.live.status === "queued" ? (
            <span className="truncate">{worker.online ? "waits for the running turn" : "waiting for a worker"}</span>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1 truncate font-semibold text-accent-ink">
              {modelLabel(pulse.live.model)}
              {pulse.live.rung > 0 ? (
                <>
                  <span className="font-medium text-ink-3">· rung {pulse.live.rung + 1}</span>
                  {pulse.live.detector ? (
                    <span className="inline-flex items-center gap-0.5">
                      <ArrowUpRight className="size-[11px]" aria-hidden />
                      {pulse.live.detector}
                    </span>
                  ) : null}
                </>
              ) : null}
            </span>
          )
        ) : null}
        {!pulse.waiting && !pulse.live ? (
          <>
            {pulse.lastModel && modelPool(pulse.lastModel) === "other" ? (
              <>
                <span className="truncate text-warn">{modelLabel(pulse.lastModel)}</span>
                <Dot />
              </>
            ) : null}
            <span className="font-mono">{pulse.cents > 0 ? dollars(pulse.cents) : desk ? "" : "no turns yet"}</span>
          </>
        ) : null}
      </span>
    </Link>
  )
}

function Dot() {
  return (
    <span aria-hidden className="opacity-60">
      ·
    </span>
  )
}

function DeskChip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "h-6 rounded-full border px-2 font-ui text-[11px] font-semibold",
        on
          ? "border-transparent bg-accent-soft text-accent-ink"
          : "border-line bg-card text-ink-2 hover:border-line-strong hover:text-tk-onyx"
      )}
    >
      {children}
    </button>
  )
}

function TabButton({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "inline-flex h-[24px] flex-1 items-center justify-center gap-1.5 rounded-[6px] font-ui text-[11.5px] font-semibold",
        on ? "bg-well text-tk-onyx ring-1 ring-line" : "text-ink-3 hover:text-tk-onyx"
      )}
    >
      {children}
    </button>
  )
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="mx-3 mb-1.5 flex h-[30px] items-center gap-2 rounded-[9px] border border-line bg-card px-2.5 text-ink-3 focus-within:border-line-strong">
      <Search className="size-3.5 shrink-0" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-tk-onyx outline-none placeholder:text-ink-3"
      />
    </label>
  )
}
