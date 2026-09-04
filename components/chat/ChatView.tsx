"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowUp, Terminal } from "lucide-react"
import { ApprovalCard } from "@/components/chat/ApprovalCard"
import { LadderTrace } from "@/components/chat/LadderTrace"
import { cn } from "@/lib/cn"
import { sendMessage } from "@/lib/chat/actions"
import type { ChatToolCall, ChatTurn } from "@/db/schema"

export type ChatMessageView = {
  id: string
  role: "user" | "assistant" | "tool" | "system"
  agent: string
  body: string
  createdAt: string
  turnId: string | null
  /** Turns answering this message — the ladder, when it climbed. */
  turns: ChatTurn[]
  calls: ChatToolCall[]
}

const SUGGESTIONS = [
  "What did I work on for Mineralife in June?",
  "Log 3 hours to Mineralife for the toll filling page",
  "Find the session where I fixed the UWD build",
]

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
  messages,
  waiting,
}: {
  threadId: string | null
  messages: ChatMessageView[]
  waiting: boolean
}) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
  const box = useRef<HTMLTextAreaElement>(null)
  const foot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.length, waiting])

  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => router.refresh(), 3000)
    return () => clearInterval(timer)
  }, [waiting, router])

  function submit(value: string) {
    const body = value.trim()
    if (!body || busy) return
    setError(null)
    setText("")
    startTransition(async () => {
      const result = await sendMessage({ threadId, text: body })
      if (!result.ok) {
        setError(result.error)
        setText(body)
        return
      }
      if (result.threadId !== threadId) router.push(`/chat?thread=${result.threadId}`)
      else router.refresh()
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <Empty onPick={submit} />
        ) : (
          <div className="flex flex-col gap-5 py-2">
            {messages.map((message) => (
              <Turn key={message.id} message={message} />
            ))}
            {waiting ? <Thinking /> : null}
          </div>
        )}
        <div ref={foot} />
      </div>

      <div className="shrink-0 pt-3">
        {error ? (
          <p className="mb-2 rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-card p-2 shadow-card focus-within:border-line-strong">
          <textarea
            ref={box}
            rows={1}
            value={text}
            placeholder="Ask, run, or log something…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit(text)
              }
            }}
            className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-tk-onyx outline-none placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={() => submit(text)}
            disabled={busy || !text.trim()}
            aria-label="Send"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent outline-accent-ink disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-ink-3">
          Reads answer straight away. Anything that writes shows a preview and
          waits for you.
        </p>
      </div>
    </div>
  )
}

function Turn({ message }: { message: ChatMessageView }) {
  if (message.role === "tool") return null

  const mine = message.role === "user"

  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[46rem] rounded-2xl px-4 py-2.5 text-sm",
          mine
            ? "bg-accent text-on-accent"
            : "border border-line bg-card text-tk-onyx shadow-card"
        )}
      >
        {!mine ? (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            {message.agent}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap">{message.body}</div>
      </div>

      <div className="w-full max-w-[46rem]">
        {message.turns.length ? <LadderTrace turns={message.turns} /> : null}
        {message.calls.map((call) =>
          call.mutating ? (
            <ApprovalCard key={call.id} call={call} />
          ) : (
            <ReadNote key={call.id} call={call} />
          )
        )}
      </div>
    </div>
  )
}

/** A read that already ran. Named, not dumped — the answer is in the reply. */
function ReadNote({ call }: { call: ChatToolCall }) {
  return (
    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-well px-2.5 py-1 text-[11px] text-ink-3">
      <Terminal className="size-3" />
      <span className="font-mono">{call.name}</span>
    </div>
  )
}

function Thinking() {
  return (
    <div className="flex items-center gap-2 px-1 text-xs text-ink-3">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-pulse rounded-full bg-ink-3"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </span>
      Working…
    </div>
  )
}

function Empty({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
      <div>
        <p className="text-sm font-semibold text-tk-onyx">
          Ask about the work, or tell it to do something.
        </p>
        <p className="mt-1 text-xs text-ink-3">
          It reads the timesheet, past sessions and the client roster.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-full border border-line bg-card px-3 py-1.5 text-xs text-tk-slate outline-accent-ink hover:border-line-strong"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
