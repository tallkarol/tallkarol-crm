"use client"

import { Fragment, useCallback, useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Archive,
  ArchiveRestore,
  ListChecks,
  Lock,
  PanelLeft,
  PanelRight,
  Pencil,
} from "lucide-react"
import { DESKS } from "@/lib/chat/personas"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { archiveThread, renameThread, sendMessage } from "@/lib/chat/actions"
import { packLabel } from "@/lib/chat/desk-context"
import { dollars } from "@/lib/chat/format"
import { type LadderPick } from "@/lib/chat/models"
import {
  ASK_STARTERS,
  CLIENT_STARTERS,
  QUICK_COMMANDS,
  type Starter,
} from "@/lib/chat/skills"
import type { WorkerStatus } from "@/lib/chat/worker-status"
import { useChatFrame } from "@/components/chat/ChatFrame"
import { Composer, type Addressee } from "@/components/chat/Composer"
import { Ledger } from "@/components/chat/Ledger"
import { deskSpeaker, Mark } from "@/components/chat/Marks"
import { requestCompose, requestSkillsTab } from "@/components/chat/compose-bus"
import type {
  ChatMessageView,
  PendingView,
  ThreadState,
  ThreadStats,
} from "@/components/chat/types"

/**
 * The thread.
 *
 * Turns run somewhere else — a worker on the Mac claims them — so the page
 * polls while anything is in flight rather than holding a socket open. Three
 * seconds is slower than a stream and completely adequate for work that takes
 * tens of seconds; a stream can come later without changing the contract.
 */
export function ChatView({
  threadId,
  title,
  archived,
  task,
  persona,
  pack,
  state,
  messages,
  pending,
  stats,
  worker,
  now,
}: {
  threadId: string | null
  title: string
  archived: boolean
  /** Set when the thread was opened from a task — it solves, and links back. */
  task: { id: string; title: string } | null
  /** Set when the thread is addressed to a desk persona. */
  persona: PersonaPill | null
  /** Raw: `clients/mineralife`, `products/momentum`, `me`, or "". */
  pack: string
  /** What the queue files this thread under. */
  state: ThreadState
  messages: ChatMessageView[]
  pending: PendingView | null
  stats: ThreadStats
  worker: WorkerStatus
  /** Server time, ISO — day headings must agree on both sides of hydration. */
  now: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const foot = useRef<HTMLDivElement>(null)

  const waiting = pending !== null
  const empty = messages.length === 0

  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" })
  }, [messages.length, waiting])

  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(timer)
  }, [waiting, router])

  const submit = useCallback(
    async (value: string, ladder?: LadderPick, attachmentIds: string[] = []): Promise<boolean> => {
      const body = value.trim()
      if (!body && attachmentIds.length === 0) return false
      setError(null)
      setBusy(true)
      try {
        const result = await sendMessage({ threadId, text: body, ladder, attachmentIds })
        if (!result.ok) {
          setError(result.error)
          return false
        }
        if (result.threadId !== threadId) router.push(`${ROUTES.chat}?thread=${result.threadId}`)
        else router.refresh()
        return true
      } finally {
        setBusy(false)
      }
    },
    [threadId, router]
  )

  const addressee: Addressee = {
    name: persona?.name ?? null,
    label: persona?.label ?? "Assistant",
    pack: packLabel(pack) || null,
    private: persona?.private ?? false,
    task: task?.title ?? null,
  }

  return (
    <>
      <Header
        threadId={threadId}
        title={title}
        archived={archived}
        task={task}
        persona={persona}
        pack={pack}
        state={state}
        stats={stats}
      />

      {empty ? (
        <Launcher onSend={submit} busy={busy} error={error} addressee={addressee} />
      ) : (
        <>
          <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-5 sm:px-6">
            <div className="max-w-[46rem]">
              <Ledger
                messages={messages}
                pending={pending}
                worker={worker}
                speaker={task ? "Solver" : persona ? persona.label : "Assistant"}
                now={now}
              />
              <div ref={foot} />
            </div>
          </div>
          <Composer
            key={threadId ?? "new"}
            onSend={submit}
            busy={busy}
            error={error}
            addressee={addressee}
          />
        </>
      )}
    </>
  )
}

/* ---------- header ---------- */

type PersonaPill = { name: string; label: string; private: boolean }

function Header({
  threadId,
  title,
  archived,
  task,
  persona,
  pack,
  state,
  stats,
}: {
  threadId: string | null
  title: string
  archived: boolean
  task: { id: string; title: string } | null
  persona: PersonaPill | null
  pack: string
  state: ThreadState
  stats: ThreadStats
}) {
  const router = useRouter()
  const { setOpen, contextOpen, setContextOpen } = useChatFrame()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [saving, startSaving] = useTransition()
  const [archiving, startArchiving] = useTransition()

  /**
   * Archiving leaves the thread: the list has moved it to the Archived group
   * and the newest active thread takes its place. Restoring stays put — you
   * are looking at the thread you just brought back.
   */
  function setArchived(next: boolean) {
    if (!threadId) return
    startArchiving(async () => {
      const result = await archiveThread({ threadId, archived: next })
      if (!result.ok) return
      if (next) router.push(ROUTES.chat)
      else router.refresh()
    })
  }

  useEffect(() => {
    setDraft(title)
    setEditing(false)
  }, [title, threadId])

  function save() {
    const next = draft.trim()
    setEditing(false)
    if (!threadId || !next || next === title) {
      setDraft(title)
      return
    }
    startSaving(async () => {
      const result = await renameThread({ threadId, title: next })
      if (result.ok) router.refresh()
      else setDraft(title)
    })
  }

  const slug = packLabel(pack)

  return (
    <header className="flex h-[50px] shrink-0 items-center gap-2.5 border-b border-line px-4 sm:px-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show requests and skills"
        className="grid size-[30px] shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-well hover:text-tk-onyx md:hidden"
      >
        <PanelLeft className="size-4" aria-hidden />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                save()
              }
              if (e.key === "Escape") {
                setDraft(title)
                setEditing(false)
              }
            }}
            aria-label="Thread name"
            maxLength={120}
            className="w-full max-w-[40rem] rounded-md bg-well px-1.5 py-0.5 font-display text-[15px] font-semibold tracking-[-0.01em] text-tk-onyx outline-none ring-1 ring-line-strong"
          />
        ) : (
          <h1
            className={cn(
              "truncate font-display text-[15px] font-semibold leading-tight tracking-[-0.01em] text-tk-onyx",
              saving && "opacity-60"
            )}
          >
            {threadId ? title : "New request"}
          </h1>
        )}

        {threadId ? (
          <>
            {task ? (
              <Link
                href={ROUTES.task(task.id)}
                title={task.title}
                className="hidden h-6 max-w-[16rem] shrink-0 items-center gap-1.5 rounded-[7px] border border-line bg-well px-2 font-mono text-[11px] font-medium text-ink-2 hover:border-line-strong hover:text-tk-onyx sm:inline-flex"
              >
                <ListChecks className="size-3 shrink-0 text-accent-ink" aria-hidden />
                <span className="truncate">solve · {task.title}</span>
              </Link>
            ) : persona ? (
              <span
                title={
                  persona.private
                    ? `Addressed to ${persona.label}. Private — never in a shared view.`
                    : `Addressed to ${persona.label}. @name switches desks.`
                }
                className="hidden h-6 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-[7px] border border-line bg-well pl-1 pr-2 font-mono text-[11px] font-medium text-ink-2 sm:inline-flex"
              >
                <Mark speaker={deskSpeaker(persona.name)} size="sm" />
                <span className="truncate">
                  {persona.name}
                  {slug ? ` · ${slug}` : ""}
                </span>
                {persona.private ? <Lock className="size-3 shrink-0 text-ink-3" aria-hidden /> : null}
              </span>
            ) : null}
            {archived ? <Pill tone="mute">Archived</Pill> : null}
            {state === "needs" ? (
              <Pill tone="warn">Needs you</Pill>
            ) : state === "running" ? (
              <Pill tone="run">Running</Pill>
            ) : state === "queued" ? (
              <Pill tone="mute">Queued</Pill>
            ) : null}
          </>
        ) : (
          <span className="hidden shrink-0 font-ui text-[11px] text-ink-3 sm:inline">Titled from your first line</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {threadId && stats.turns > 0 ? (
          <span className="mr-2 hidden font-mono text-[11px] tabular-nums text-ink-3 sm:inline">
            {stats.turns} {stats.turns === 1 ? "turn" : "turns"} · {dollars(stats.cents)}
          </span>
        ) : null}
        {threadId ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Rename thread"
              title="Rename"
              className="grid size-[30px] place-items-center rounded-lg text-ink-3 hover:bg-well hover:text-tk-onyx"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={archiving}
              onClick={() => setArchived(!archived)}
              aria-label={archived ? "Restore thread" : "Archive thread"}
              title={archived ? "Restore" : "Archive"}
              className="grid size-[30px] place-items-center rounded-lg text-ink-3 hover:bg-well hover:text-tk-onyx disabled:opacity-50"
            >
              {archived ? (
                <ArchiveRestore className="size-4" aria-hidden />
              ) : (
                <Archive className="size-4" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => setContextOpen(!contextOpen)}
              aria-pressed={contextOpen}
              aria-label={contextOpen ? "Hide context" : "Show context"}
              title="Context"
              className={cn(
                "hidden size-[30px] place-items-center rounded-lg xl:grid",
                contextOpen ? "bg-well text-tk-onyx ring-1 ring-line" : "text-ink-3 hover:bg-well hover:text-tk-onyx"
              )}
            >
              <PanelRight className="size-4" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </header>
  )
}

function Pill({ tone, children }: { tone: "warn" | "run" | "mute"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] shrink-0 items-center rounded-full px-2 font-ui text-[10px] font-bold uppercase tracking-[0.06em]",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "run" && "bg-accent-soft text-accent-ink",
        tone === "mute" && "bg-well text-ink-3 ring-1 ring-line"
      )}
    >
      {children}
    </span>
  )
}

/* ---------- the launcher: a request that has not started ---------- */

/** What picking a desk types: its address, plus the pack it needs ("me", or a blank to fill). */
function deskAddress(desk: (typeof DESKS)[number]) {
  return `@${desk.name} ${desk.pack && desk.pack !== "me" ? "[slug] " : desk.pack === "me" ? "me " : ""}`
}

function Launcher({
  onSend,
  busy,
  error,
  addressee,
}: {
  onSend: (text: string) => Promise<boolean>
  busy: boolean
  error: string | null
  addressee: Addressee
}) {
  function start(starter: Starter) {
    if (starter.send) void onSend(starter.text)
    else requestCompose({ text: starter.text })
  }

  // `?to=coach` (⌘K's "Talk to coach") picks that desk as its button would,
  // then leaves the URL so a reload does not type it again.
  const router = useRouter()
  const to = useSearchParams().get("to")
  useEffect(() => {
    if (!to) return
    const desk = DESKS.find((d) => d.name === to)
    if (desk) requestCompose({ text: deskAddress(desk) })
    router.replace(`${ROUTES.chat}?new`)
  }, [to, router])

  return (
    <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-6 sm:px-8 sm:pt-[6vh]">
      <div className="mx-auto flex max-w-[54rem] flex-col gap-7">
        <Composer
          key="launch"
          variant="launch"
          onSend={onSend}
          busy={busy}
          error={error}
          autoFocus
          addressee={addressee}
        />

        <section>
          <Label hint="@name in the box does the same">Desks</Label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DESKS.map((desk) => (
              <button
                key={desk.name}
                type="button"
                title={desk.tagline}
                onClick={() => requestCompose({ text: deskAddress(desk) })}
                className="flex items-start gap-2.5 rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-left hover:border-line-strong hover:bg-well"
              >
                <Mark speaker={deskSpeaker(desk.name)} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-ui text-[12.5px] font-semibold text-tk-onyx">
                    {desk.label}
                    {desk.private ? <Lock className="size-3 text-ink-3" aria-label="Private" /> : null}
                  </span>
                  <span className="mt-px block text-[11px] leading-[1.4] text-ink-3">{desk.tagline}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <section>
            <Label>Ask</Label>
            {ASK_STARTERS.map((starter) => (
              <Line key={starter.title} onClick={() => start(starter)}>
                <Blanks text={starter.title} />
              </Line>
            ))}
          </section>
          <section>
            <Label hint="fills the blank">For a client</Label>
            {CLIENT_STARTERS.map((starter) => (
              <Line key={starter.title} onClick={() => start(starter)}>
                <Blanks text={starter.title} />
              </Line>
            ))}
          </section>
          <section>
            <Label>Run</Label>
            {QUICK_COMMANDS.map((command) => (
              <Line key={command} mono onClick={() => requestCompose({ text: command })}>
                {command.replace(/^\//, "")}
              </Line>
            ))}
            <button
              type="button"
              onClick={() => requestSkillsTab()}
              className="mt-1.5 px-1.5 font-ui text-[11.5px] font-semibold text-accent-ink hover:underline"
            >
              All skills →
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <h3 className="mb-2 flex items-baseline gap-2 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
      {children}
      {hint ? <span className="font-medium normal-case tracking-normal">{hint}</span> : null}
    </h3>
  )
}

function Line({
  mono,
  onClick,
  children,
}: {
  mono?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left leading-[1.35] text-ink-2 hover:bg-well hover:text-tk-onyx",
        mono ? "font-mono text-[12px] font-medium" : "text-[12.5px] font-medium"
      )}
    >
      <span className="shrink-0 font-semibold text-accent-ink" aria-hidden>
        {mono ? "/" : "›"}
      </span>
      <span className="min-w-0">{children}</span>
    </button>
  )
}

/** `[client]` in a starter reads as the blank it is. */
function Blanks({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/g).map((part, i) =>
        /^\[[^\]]+\]$/.test(part) ? (
          <span key={i} className="text-accent-ink">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  )
}
