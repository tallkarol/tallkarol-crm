"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowUp, Lock, MessagesSquare, Plus, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { DOCK_ORDER, deskFor, monogram, packLabel } from "@/lib/chat/desk-context"
import { deskBadges, loadDeskThread, openDesk, sendToDesk, type DeskThreadView } from "@/lib/chat/dock-actions"
import { dayLabel, modelLabel } from "@/lib/chat/format"
import { packKindOf } from "@/lib/chat/pack-lines"
import { PERSONAS } from "@/lib/chat/personas"
import { ROUTES } from "@/lib/nav"
import { Message } from "@/components/chat/Message"

/**
 * The desk dock: the nine desks on the right edge of every page, the page
 * deciding which one is up front and which pack it pins. A desk opens as a
 * panel — its latest thread on that pack (or a fresh one, per Settings),
 * what it remembers as "Last time", the same cards and feedback the chat
 * page shows — with a composer that is already addressed. Under 1024px the
 * dock is a button and the panel a sheet. Hidden on /chat, where the
 * thread already says who is speaking.
 */
export function DeskDock() {
  const pathname = usePathname()
  const context = deskFor(pathname)
  const [open, setOpen] = useState<{ agent: string; pack: string } | null>(null)
  const [view, setView] = useState<DeskThreadView | null>(null)
  const [badges, setBadges] = useState<Record<string, number>>({})
  const [sheet, setSheet] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  const refreshBadges = useCallback(() => {
    deskBadges().then(setBadges).catch(() => {})
  }, [])

  useEffect(() => {
    refreshBadges()
    const timer = setInterval(refreshBadges, 30_000)
    return () => clearInterval(timer)
  }, [refreshBadges])

  // A route change closes the sheet on a phone; the desktop panel stays.
  useEffect(() => {
    setSheet(false)
  }, [pathname])

  /** Which pack a desk gets when opened from this page. */
  function packFor(agent: string): string {
    const persona = PERSONAS[agent]
    if (!persona) return ""
    if (persona.pack === "me") return "me"
    if (context && context.agent === agent) return context.pack
    if (context && persona.pack && packKindOf(context.pack) === persona.pack) return context.pack
    return ""
  }

  const show = useCallback((agent: string, fresh = false) => {
    const pack = packFor(agent)
    setError(null)
    setOpen({ agent, pack })
    startTransition(async () => {
      const result = await openDesk({ agent, pack, fresh })
      if (!result.ok) setError(result.error)
      else setView(result.view)
    })
    // packFor reads the current context; the dock re-renders on every route anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.agent, context?.pack])

  // Poll the open thread: every 3 s while a turn is in flight (the chat
  // page's cadence), every 8 s otherwise so an approved card's result and a
  // handoff still arrive without a click.
  const threadId = view?.threadId ?? null
  const inFlight = view?.pending !== null && view?.pending !== undefined
  useEffect(() => {
    if (!open || !threadId) return
    const { agent, pack } = open
    const timer = setInterval(async () => {
      const result = await loadDeskThread({ threadId, agent, pack })
      if (result.ok) setView(result.view)
    }, inFlight ? 3000 : 8000)
    return () => clearInterval(timer)
  }, [open, threadId, inFlight])

  function close() {
    setOpen(null)
    setView(null)
    setSheet(false)
  }

  function submit(text: string) {
    if (!open) return
    setError(null)
    startTransition(async () => {
      const result = await sendToDesk({ threadId: view?.threadId ?? null, agent: open.agent, pack: open.pack, text })
      if (!result.ok) {
        setError(result.error)
        return
      }
      const loaded = await loadDeskThread({ threadId: result.threadId, agent: open.agent, pack: open.pack })
      if (loaded.ok) setView(loaded.view)
      refreshBadges()
    })
  }

  if (pathname === ROUTES.chat || pathname.startsWith(`${ROUTES.chat}/`)) return null

  const front = context?.agent ?? null

  const column = (
    <div className="flex flex-col items-center gap-1.5">
      {DOCK_ORDER.map((agent) => {
        const persona = PERSONAS[agent]
        const isOpen = open?.agent === agent
        const isFront = front === agent
        const count = badges[agent] ?? 0
        return (
          <button
            key={agent}
            type="button"
            onClick={() => (isOpen ? close() : show(agent))}
            aria-pressed={isOpen}
            title={`${persona.label} — ${persona.tagline}${persona.private ? " Private." : ""}`}
            className={cn(
              "relative grid size-9 shrink-0 place-items-center rounded-full border font-ui text-[10px] font-bold outline-accent-ink",
              isOpen
                ? "border-transparent bg-rail text-[--rail-active-icon]"
                : isFront
                  ? "border-accent-ink bg-accent-soft text-accent-ink"
                  : "border-line bg-well text-ink-2 hover:border-line-strong hover:text-tk-onyx"
            )}
          >
            {monogram(agent)}
            {count > 0 ? (
              <span
                className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-warn"
                aria-label={`${count} waiting on you`}
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )

  const panel = open ? (
    <Panel
      agent={open.agent}
      pack={open.pack}
      view={view}
      busy={busy}
      error={error}
      onFresh={() => show(open.agent, true)}
      onClose={close}
      onSend={submit}
    />
  ) : null

  return (
    <>
      {/* Desktop: the column on the right edge, the panel beside it. */}
      <div className="hidden lg:flex">
        {panel ? (
          <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-card" aria-label="Desk panel">
            {panel}
          </aside>
        ) : null}
        <aside className="flex w-[52px] shrink-0 flex-col items-center border-l border-line bg-card py-3" aria-label="Desks">
          {column}
        </aside>
      </div>

      {/* Phone and tablet: one button, then a sheet. */}
      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-label="Talk to a desk"
        className="fixed bottom-4 right-4 z-40 grid size-12 place-items-center rounded-full bg-rail text-[--rail-active-icon] shadow-overlay lg:hidden"
      >
        {front ? <span className="font-ui text-[11px] font-bold">{monogram(front)}</span> : <MessagesSquare className="size-5" />}
      </button>
      {sheet ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-scrim" aria-label="Close" onClick={() => setSheet(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Desks"
            className="absolute inset-x-0 bottom-0 flex h-[78vh] flex-col rounded-t-2xl border-t border-line-strong bg-card shadow-overlay"
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong" aria-hidden />
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5">
              {DOCK_ORDER.map((agent) => (
                <button
                  key={agent}
                  type="button"
                  onClick={() => show(agent)}
                  aria-pressed={open?.agent === agent}
                  title={PERSONAS[agent].label}
                  className={cn(
                    "relative grid size-9 shrink-0 place-items-center rounded-full border font-ui text-[10px] font-bold",
                    open?.agent === agent
                      ? "border-transparent bg-rail text-[--rail-active-icon]"
                      : front === agent
                        ? "border-accent-ink bg-accent-soft text-accent-ink"
                        : "border-line bg-well text-ink-2"
                  )}
                >
                  {monogram(agent)}
                  {(badges[agent] ?? 0) > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-warn" aria-hidden />
                  ) : null}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col border-t border-line">
              {panel ?? (
                <p className="px-4 py-6 text-sm text-ink-3">Pick a desk. {front ? `${PERSONAS[front].label} is up front on this page.` : ""}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Panel({
  agent,
  pack,
  view,
  busy,
  error,
  onFresh,
  onClose,
  onSend,
}: {
  agent: string
  pack: string
  view: DeskThreadView | null
  busy: boolean
  error: string | null
  onFresh: () => void
  onClose: () => void
  onSend: (text: string) => void
}) {
  const persona = PERSONAS[agent]
  const foot = useRef<HTMLDivElement>(null)
  const count = view?.messages.length ?? 0
  const pending = view?.pending ?? null

  useEffect(() => {
    foot.current?.scrollIntoView({ block: "end" })
  }, [count, pending])

  const now = new Date()
  const continuing = view?.threadId !== null && view?.mode === "continue"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2.5 border-b border-line px-3.5 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-rail font-ui text-[10px] font-bold text-[--rail-active-icon]">
          {monogram(agent)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-display text-[14px] font-semibold text-tk-onyx">
            {persona.label}
            {persona.private ? <Lock className="size-3 text-ink-3" aria-label="Private" /> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-ui text-[10.5px] text-ink-3">
            <span>
              {pack ? (
                <>
                  Pinned to <b className="font-semibold text-ink-2">{packLabel(pack)}</b>
                </>
              ) : persona.pack ? (
                "No pack pinned — the desk will ask"
              ) : (
                "No pack"
              )}
            </span>
            <span aria-hidden>·</span>
            {view?.threadId ? (
              <>
                <span>{continuing ? "continuing" : "new thread"}</span>
                <span aria-hidden>·</span>
                <Link href={ROUTES.chatThread(view.threadId)} className="font-semibold text-accent-ink hover:underline">
                  open in chat
                </Link>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <button type="button" onClick={onFresh} className="inline-flex items-center gap-0.5 font-semibold text-accent-ink hover:underline">
              <Plus className="size-3" aria-hidden />
              new thread
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-well hover:text-tk-onyx"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {view?.lastTime && view.lastTime.threadId !== view.threadId ? (
          <div className="mb-3 rounded-[10px] border border-line bg-well px-3 py-2.5 text-[12px] leading-[1.5] text-ink-2">
            <div className="mb-1 font-ui text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
              Last time · {dayLabel(view.lastTime.at, now)}
            </div>
            {view.lastTime.digest}
          </div>
        ) : null}

        {view && view.messages.length === 0 && !busy ? (
          <p className="py-4 text-[13px] text-ink-3">
            {persona.tagline} {pack ? `Pinned to ${packLabel(pack)}.` : ""}
          </p>
        ) : null}

        <div className="flex flex-col gap-4">
          {(view?.messages ?? []).map((message) => (
            <Message key={message.id} message={message} />
          ))}
          {pending ? (
            <div className="flex items-center gap-2 pl-8 font-ui text-[11px] text-ink-3">
              <span className="size-1.5 animate-pulse rounded-full bg-accent-ink" aria-hidden />
              Thinking · {modelLabel(pending.model)}
            </div>
          ) : null}
          {busy && !pending ? <div className="pl-8 font-ui text-[11px] text-ink-3">…</div> : null}
        </div>
        <div ref={foot} />
      </div>

      <DeskComposer label={persona.label} busy={busy} error={error} onSend={onSend} />
    </div>
  )
}

/** The box, already addressed — no `@`, no slug. Enter sends, Shift+Enter breaks a line. */
function DeskComposer({
  label,
  busy,
  error,
  onSend,
}: {
  label: string
  busy: boolean
  error: string | null
  onSend: (text: string) => void
}) {
  const [text, setText] = useState("")
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  function submit() {
    const value = text.trim()
    if (!value || busy) return
    setText("")
    onSend(value)
  }

  return (
    <div className="border-t border-line px-3 pb-3 pt-2">
      {error ? <p className="mb-2 rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">{error}</p> : null}
      <div className="flex items-end gap-2 rounded-[14px] border border-line-strong bg-card px-3 py-2 focus-within:border-accent-ink">
        <textarea
          ref={box}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={`Message the ${label.toLowerCase()}…`}
          aria-label={`Message the ${label}`}
          className="block max-h-[160px] min-h-[24px] w-full resize-none bg-transparent text-[13.5px] leading-[1.5] text-tk-onyx outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          aria-label="Send"
          className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-accent text-on-accent outline-accent-ink disabled:opacity-35"
        >
          <ArrowUp className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
