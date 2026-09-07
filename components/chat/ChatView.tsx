"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react"
import { useRouter } from "next/navigation"
import {
  Activity,
  BarChart3,
  Clock,
  FileText,
  Inbox,
  ListChecks,
  PanelLeft,
  Pencil,
  Pin,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Unplug,
} from "lucide-react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { renameThread, sendMessage } from "@/lib/chat/actions"
import {
  dayKey,
  dayLabel,
  dollars,
  durationLabel,
  modelLabel,
} from "@/lib/chat/format"
import {
  ASK_STARTERS,
  CLIENT_STARTERS,
  QUICK_COMMANDS,
  type Starter,
} from "@/lib/chat/skills"
import type { WorkerStatus } from "@/lib/chat/worker-status"
import { Card } from "@/components/ui/Card"
import { useChatFrame } from "@/components/chat/ChatFrame"
import { Composer } from "@/components/chat/Composer"
import { Message } from "@/components/chat/Message"
import { requestCompose, requestSkillsTab } from "@/components/chat/compose-bus"
import type {
  ChatMessageView,
  PendingView,
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
  messages,
  pending,
  stats,
  worker,
  greeting,
  now,
}: {
  threadId: string | null
  title: string
  messages: ChatMessageView[]
  pending: PendingView | null
  stats: ThreadStats
  worker: WorkerStatus
  greeting: string
  /** Server time, ISO — day headings must agree on both sides of hydration. */
  now: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
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
    (value: string) => {
      const body = value.trim()
      if (!body) return
      setError(null)
      startTransition(async () => {
        const result = await sendMessage({ threadId, text: body })
        if (!result.ok) {
          setError(result.error)
          return
        }
        if (result.threadId !== threadId) router.push(`${ROUTES.chat}?thread=${result.threadId}`)
        else router.refresh()
      })
    },
    [threadId, router]
  )

  const at = new Date(now)

  return (
    <>
      <Header
        threadId={threadId}
        title={title}
        stats={stats}
        worker={worker}
        firstAt={messages[0]?.createdAt ?? null}
        now={at}
      />

      {empty ? (
        <EmptyThread greeting={greeting} onSend={submit} />
      ) : (
        <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-6 sm:px-7">
          <div className="mx-auto flex max-w-[47.5rem] flex-col gap-7">
            {messages.map((message, i) => {
              const first = i === 0 || dayKey(messages[i - 1].createdAt) !== dayKey(message.createdAt)
              return (
                <Fragment key={message.id}>
                  {first ? <DayRule label={dayLabel(message.createdAt, at)} /> : null}
                  <Message message={message} />
                </Fragment>
              )
            })}
            {pending ? (
              worker.online || pending.status === "running" ? (
                <Thinking pending={pending} />
              ) : (
                <Stranded worker={worker} />
              )
            ) : null}
            <div ref={foot} />
          </div>
        </div>
      )}

      <Composer onSend={submit} busy={busy} error={error} autoFocus={empty} />
    </>
  )
}

/* ---------- header ---------- */

function Header({
  threadId,
  title,
  stats,
  worker,
  firstAt,
  now,
}: {
  threadId: string | null
  title: string
  stats: ThreadStats
  worker: WorkerStatus
  firstAt: string | null
  now: Date
}) {
  const router = useRouter()
  const { setOpen } = useChatFrame()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [saving, startSaving] = useTransition()

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

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show threads and skills"
        className="grid size-[30px] shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-card hover:text-tk-onyx md:hidden"
      >
        <PanelLeft className="size-4" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
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
            className="w-full max-w-[40rem] rounded-md bg-card px-1.5 py-0.5 font-display text-[15px] font-semibold tracking-[-0.01em] text-tk-onyx outline-none ring-1 ring-line-strong"
          />
        ) : (
          <h1
            className={cn(
              "truncate font-display text-[15px] font-semibold leading-tight tracking-[-0.01em] text-tk-onyx",
              saving && "opacity-60"
            )}
          >
            {threadId ? title : "New thread"}
          </h1>
        )}
        <p className="mt-0.5 flex items-center gap-1.5 truncate font-ui text-[11px] text-ink-3">
          {threadId ? (
            <>
              {firstAt ? <span>{dayLabel(firstAt, now)}</span> : null}
              {stats.turns > 0 ? (
                <>
                  <Sep />
                  <span>
                    {stats.turns} {stats.turns === 1 ? "turn" : "turns"}
                  </span>
                  <Sep />
                  <span className="font-mono tabular-nums">{dollars(stats.cents)}</span>
                </>
              ) : null}
              {stats.chain ? (
                <>
                  <Sep />
                  <span className="truncate">{stats.chain}</span>
                </>
              ) : null}
            </>
          ) : (
            <span>Titled from your first line</span>
          )}
        </p>
      </div>

      <WorkerPill worker={worker} />

      {threadId ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename thread"
          title="Rename"
          className="grid size-[30px] shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-card hover:text-tk-onyx hover:ring-1 hover:ring-line"
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      ) : null}
    </header>
  )
}

function Sep() {
  return (
    <span className="opacity-50" aria-hidden>
      ·
    </span>
  )
}

function WorkerPill({ worker }: { worker: WorkerStatus }) {
  const online = worker.online
  return (
    <span
      className="hidden h-[26px] shrink-0 items-center gap-1.5 rounded-full border border-line bg-card pl-2 pr-2.5 font-ui text-[11px] font-semibold text-ink-2 sm:inline-flex"
      title={
        online
          ? "The worker on the Mac that runs turns is listening."
          : "No worker is listening. Turns queue until one starts."
      }
    >
      <span
        className={cn(
          "size-[7px] rounded-full",
          online ? "bg-good ring-[3px] ring-good-soft" : "bg-warn ring-[3px] ring-warn-soft"
        )}
        aria-hidden
      />
      {online ? (
        <>
          Worker
          <span className="font-mono font-medium text-ink-3">
            {worker.name}
            {worker.secondsAgo != null ? ` · ${worker.secondsAgo}s` : ""}
          </span>
        </>
      ) : (
        <>
          {worker.lastSeenAt ? "Worker offline" : "No worker"}
          {worker.secondsAgo != null ? (
            <span className="font-mono font-medium text-ink-3">· {ago(worker.secondsAgo)}</span>
          ) : null}
        </>
      )}
    </span>
  )
}

function ago(seconds: number) {
  if (seconds < 90) return `${seconds}s`
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`
  return `${Math.round(seconds / 3600)}h`
}

/* ---------- thread furniture ---------- */

function DayRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 font-ui text-[11px] font-semibold tracking-[0.02em] text-ink-3 before:h-px before:flex-1 before:bg-line before:content-[''] after:h-px after:flex-1 after:bg-line after:content-['']">
      {label}
    </div>
  )
}

/**
 * Wordless on purpose — the dots say it. `role="status"` and the label keep
 * the meaning for anyone who cannot see them, and `.tk-wave-dot` holds a
 * still resting state under reduced motion instead of freezing mid-rise.
 * The seconds count from when the worker took it, so a long turn reads as
 * long rather than as stuck.
 */
function Thinking({ pending }: { pending: PendingView }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  const elapsed = Math.max(0, Date.now() - new Date(pending.since).getTime())
  void tick

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full bg-rail text-[--rail-active-icon]"
          aria-hidden
        >
          <Sparkles className="size-3" />
        </span>
        <span className="font-ui text-[12.5px] font-semibold text-tk-onyx">Assistant</span>
        <span className="rounded-md border border-line bg-card px-1.5 py-0.5 font-mono text-[10.5px] text-ink-3">
          {modelLabel(pending.model)}
        </span>
      </div>
      <div
        role="status"
        aria-label="Working"
        className="flex items-center gap-2.5 pl-8 font-ui text-[11.5px] font-medium text-ink-3"
      >
        <span className="inline-flex h-3.5 items-center gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="tk-wave-dot size-[5px] rounded-full bg-ink-3"
              style={{ "--i": i } as CSSProperties}
            />
          ))}
        </span>
        <span suppressHydrationWarning>
          {pending.status === "queued"
            ? "Queued"
            : `Claimed by ${pending.claimedBy || "the worker"}`}{" "}
          · {durationLabel(elapsed)}
        </span>
      </div>
    </div>
  )
}

/**
 * Queued, but nothing is listening.
 *
 * Without this the page shows the dots forever and the honest answer — the
 * worker on the Mac is not running — is invisible. The question is not
 * lost: it stays queued and the worker picks it up the moment it starts.
 */
function Stranded({ worker }: { worker: WorkerStatus }) {
  return (
    <div className="ml-8 flex max-w-[36rem] items-start gap-2.5 rounded-xl bg-warn-soft px-3 py-2.5 text-xs leading-[1.45] text-warn">
      <Unplug className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div>
        <p className="font-ui font-bold">No worker attached. Nothing is running this.</p>
        <p className="mt-1">
          Your question is queued and answers the moment the worker is back.
          Start it on the Mac with <code className="font-mono">npm run chat:worker</code>.
          {worker.secondsAgo != null ? ` Last seen ${ago(worker.secondsAgo)} ago.` : ""}
        </p>
      </div>
    </div>
  )
}

/* ---------- the empty thread ---------- */

const ICON: Record<Starter["icon"], typeof Pin> = {
  pin: Pin,
  inbox: Inbox,
  clock: Clock,
  activity: Activity,
  reports: BarChart3,
  shield: ShieldCheck,
  punch: ListChecks,
  revenue: TrendingUp,
  file: FileText,
}

function EmptyThread({
  greeting,
  onSend,
}: {
  greeting: string
  onSend: (text: string) => void
}) {
  function start(starter: Starter) {
    if (starter.send) onSend(starter.text)
    else requestCompose({ text: starter.text })
  }

  return (
    <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-7">
      <div className="mx-auto flex min-h-full max-w-[47.5rem] flex-col justify-center gap-6">
        <div>
          <h2 className="font-display text-[28px] font-medium leading-[1.15] tracking-[-0.02em] text-tk-onyx [text-wrap:balance]">
            {greeting} What are we doing?
          </h2>
          <p className="mt-2 max-w-[56ch] text-sm text-ink-2">
            Ask about the work, or run a skill. Reads answer straight away.
            Anything that writes shows a preview and waits for you.
          </p>
        </div>

        <StarterGroup label="Ask" starters={ASK_STARTERS} onPick={start} />
        <StarterGroup
          label="For a client"
          hint="fill the blank in the composer"
          starters={CLIENT_STARTERS}
          onPick={start}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-ui text-[11px] font-semibold text-ink-3">Skills</span>
          {QUICK_COMMANDS.map((command) => (
            <button
              key={command}
              type="button"
              onClick={() => requestCompose({ text: command })}
              className="h-7 rounded-full border border-line bg-card px-2.5 font-mono text-xs text-accent-ink hover:border-line-strong"
            >
              {command}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              requestSkillsTab()
            }}
            className="h-7 rounded-full border border-line bg-card px-2.5 font-ui text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-tk-onyx"
          >
            All skills →
          </button>
        </div>
      </div>
    </div>
  )
}

function StarterGroup({
  label,
  hint,
  starters,
  onPick,
}: {
  label: string
  hint?: string
  starters: Starter[]
  onPick: (starter: Starter) => void
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2.5 font-ui text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
        {label}
        {hint ? (
          <span className="font-medium normal-case tracking-normal">{hint}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {starters.map((starter) => {
          const Icon = ICON[starter.icon]
          return (
            <Card
              key={starter.title}
              as="button"
              type="button"
              radius="xl"
              interactive
              onClick={() => onPick(starter)}
              className="flex flex-col items-start gap-2.5 p-3.5 text-left"
            >
              <span className="grid size-[30px] place-items-center rounded-[9px] bg-accent-soft text-accent-ink">
                <Icon className="size-[15px]" aria-hidden />
              </span>
              <span>
                <span className="block font-ui text-[13px] font-semibold text-tk-onyx">
                  <Blanks text={starter.title} />
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.4] text-ink-3">
                  {starter.sub}
                </span>
              </span>
            </Card>
          )
        })}
      </div>
    </div>
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
