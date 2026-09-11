"use client"

import { Fragment, useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, ChevronRight, MessagesSquare, Plus, Search } from "lucide-react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { dayBucket, listStamp, type DayBucket } from "@/lib/chat/format"
import { PERSONAS } from "@/lib/chat/personas"
import { SKILL_DOCS } from "@/lib/chat/skills"
import { BudgetMeters } from "@/components/chat/BudgetMeters"
import { SkillsDocs } from "@/components/chat/SkillsDocs"
import { onSkillsTab } from "@/components/chat/compose-bus"
import type { BudgetView, ThreadRow } from "@/components/chat/types"

const TAB_KEY = "tk-chat-tab"

type Tab = "threads" | "skills"

const BUCKETS: { key: DayBucket; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "earlier", label: "Earlier" },
]

/**
 * Two things in one rail: the threads, and the skills you can start one
 * with. The tab is remembered per browser because someone who opens the
 * Skills tab tends to keep using it.
 */
export function ChatSidebar({
  threads,
  activeId,
  isNew,
  budget,
  now,
}: {
  threads: ThreadRow[]
  activeId: string | null
  isNew: boolean
  budget: BudgetView
  /** Server time, ISO — the day buckets must agree on both sides of hydration. */
  now: string
}) {
  const [tab, setTab] = useState<Tab>("threads")
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
  // The desks that actually have threads, in roster order — a filter, not a roster.
  const desks = Object.keys(PERSONAS).filter((name) => threads.some((t) => t.agent === name))

  const counts = {
    command: SKILL_DOCS.filter((d) => d.kind === "command").length,
    skill: SKILL_DOCS.filter((d) => d.kind === "skill").length,
    agent: SKILL_DOCS.filter((d) => d.kind === "agent").length,
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2.5 pt-3.5">
        <div
          role="tablist"
          aria-label="Sidebar"
          className="flex gap-0.5 rounded-[10px] border border-line bg-well p-[3px]"
        >
          <TabButton on={tab === "threads"} onClick={() => pick("threads")}>
            <MessagesSquare className="size-[13px]" aria-hidden />
            Threads
          </TabButton>
          <TabButton on={tab === "skills"} onClick={() => pick("skills")}>
            <BookOpen className="size-[13px]" aria-hidden />
            Skills
          </TabButton>
        </div>
      </div>

      {tab === "threads" ? (
        <>
          <Link
            href={`${ROUTES.chat}?new`}
            aria-current={isNew ? "page" : undefined}
            className={cn(
              "mx-3 mb-2 flex h-[34px] items-center gap-2 rounded-[10px] border px-3 font-ui text-[12.5px] font-semibold",
              isNew
                ? "border-transparent bg-accent-soft text-accent-ink"
                : "border-line bg-card text-tk-onyx hover:border-line-strong"
            )}
          >
            <Plus className="size-3.5 text-accent-ink" aria-hidden />
            New thread
          </Link>

          <SearchBox value={q} onChange={setQ} placeholder="Search threads" />

          {desks.length ? (
            <div className="mx-3 mb-1.5 flex flex-wrap gap-1" role="group" aria-label="Filter by desk">
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

          <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {threads.length === 0 ? (
              <p className="px-2 pt-3 text-xs text-ink-3">
                No threads yet. Ask something and one starts.
              </p>
            ) : visible.length === 0 ? (
              <p className="px-2 pt-3 text-xs text-ink-3">No thread matches.</p>
            ) : null}

            {BUCKETS.map((bucket) => {
              const rows = active.filter(
                (t) => dayBucket(t.lastMessageAt, at) === bucket.key
              )
              if (rows.length === 0) return null
              return (
                <Fragment key={bucket.key}>
                  <div className="px-2 pb-1 pt-3 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
                    {bucket.label}
                  </div>
                  {rows.map((thread) => (
                    <ThreadLink
                      key={thread.id}
                      thread={thread}
                      active={thread.id === activeId}
                      now={at}
                    />
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
                  <span className="ml-auto font-semibold tracking-normal opacity-80">
                    {archived.length}
                  </span>
                </button>
                {archivedOpen
                  ? archived.map((thread) => (
                      <ThreadLink
                        key={thread.id}
                        thread={thread}
                        active={thread.id === activeId}
                        now={at}
                        muted
                      />
                    ))
                  : null}
              </>
            ) : null}
          </div>

          <BudgetMeters budget={budget} />
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

function ThreadLink({
  thread,
  active,
  now,
  muted,
}: {
  thread: ThreadRow
  active: boolean
  now: Date
  /** Archived rows read a step quieter until they are brought back. */
  muted?: boolean
}) {
  return (
    <Link
      href={`${ROUTES.chat}?thread=${thread.id}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-lg px-2 py-[7px]",
        active ? "bg-accent-soft" : "hover:bg-well"
      )}
    >
      <span
        className={cn(
          "block truncate text-[12.5px] font-medium",
          active ? "font-semibold text-accent-ink" : muted ? "text-ink-2" : "text-tk-onyx"
        )}
      >
        {thread.title}
      </span>
      <span className="mt-0.5 flex items-center gap-1.5 font-ui text-[11px] text-ink-3">
        {thread.needsYou ? (
          <>
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            <span className="font-semibold text-warn">Needs you</span>
            <span aria-hidden>·</span>
          </>
        ) : null}
        {thread.agent && PERSONAS[thread.agent] ? (
          <>
            <span className="font-semibold text-ink-2">{PERSONAS[thread.agent].label}</span>
            <span aria-hidden>·</span>
          </>
        ) : null}
        <span>{listStamp(thread.lastMessageAt, now)}</span>
      </span>
    </Link>
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
        "inline-flex h-[26px] flex-1 items-center justify-center gap-1.5 rounded-[7px] font-ui text-xs font-semibold",
        on ? "bg-card text-tk-onyx shadow-card" : "text-ink-3 hover:text-tk-onyx"
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
    <label className="mx-3 mb-1.5 flex h-8 items-center gap-2 rounded-[10px] border border-line bg-well px-2.5 text-ink-3 focus-within:border-line-strong focus-within:bg-card">
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
