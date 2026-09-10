import { redirect } from "next/navigation"
import { ChatFrame } from "@/components/chat/ChatFrame"
import { ChatSidebar } from "@/components/chat/ChatSidebar"
import { ChatView } from "@/components/chat/ChatView"
import type {
  BudgetView,
  ChatMessageView,
  PendingView,
  ThreadRow,
  ThreadStats,
} from "@/components/chat/types"
import { getSessionUser } from "@/lib/auth"
import { budgetState } from "@/lib/chat/budget"
import { CHAT_ZONE, modelChain } from "@/lib/chat/format"
import { PERSONAS, describePack } from "@/lib/chat/personas"
import {
  listArchivedThreads,
  listThreads,
  pendingThreadIds,
  threadDetail,
} from "@/lib/chat/turns"
import { workerStatus } from "@/lib/chat/worker-status"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Chat" }
export const dynamic = "force-dynamic"

/**
 * One frame the height of the window: the thread rail on the left, the
 * thread on the right, only the thread scrolling. The shell hands this
 * route a flex column instead of a scrolling canvas (FULL_BLEED in AppShell).
 *
 *   /chat              the newest thread
 *   /chat?thread=<id>  that thread
 *   /chat?new          an empty composer; the first line starts a thread
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: { thread?: string; new?: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [threads, archivedThreads, pendingIds, budget, worker] = await Promise.all([
    listThreads(user.id),
    listArchivedThreads(user.id),
    pendingThreadIds(user.id),
    budgetState(),
    workerStatus(),
  ])

  const isNew = searchParams.new !== undefined
  const threadId = isNew ? null : (searchParams.thread ?? threads[0]?.id ?? null)
  const detail = threadId ? await threadDetail(user.id, threadId) : null
  if (threadId && !detail) redirect(ROUTES.chat)

  const now = new Date()
  const turns = detail?.turns ?? []
  const calls = detail?.calls ?? []

  /**
   * Turns hang off the USER message they answer — an escalation chain has
   * one question and several attempts. The assistant message that closed a
   * chain carries it too, so the ladder reads as a footnote under the reply.
   */
  const messages: ChatMessageView[] = (detail?.messages ?? []).map((message) => {
    const produced = message.turnId ? turns.find((t) => t.id === message.turnId) : null
    const chain =
      message.role === "user"
        ? turns.filter((t) => t.messageId === message.id)
        : produced
          ? turns.filter((t) => t.messageId === produced.messageId)
          : []
    return {
      id: message.id,
      role: message.role,
      agent: message.agent,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      turnId: message.turnId,
      chain,
      calls: message.turnId ? calls.filter((c) => c.turnId === message.turnId) : [],
    }
  })

  const inFlight = turns.find(
    (t) => t.status === "queued" || t.status === "claimed" || t.status === "running"
  )
  const pending: PendingView | null = inFlight
    ? {
        model: inFlight.model,
        claimedBy: inFlight.claimedBy,
        since: (inFlight.startedAt ?? inFlight.claimedAt ?? inFlight.createdAt).toISOString(),
        status: inFlight.status as PendingView["status"],
      }
    : null

  const stats: ThreadStats = {
    turns: turns.length,
    cents: turns.reduce((sum, t) => sum + Number(t.costCents), 0),
    chain: modelChain(turns.map((t) => t.model)),
  }

  const rows: ThreadRow[] = [...threads, ...archivedThreads].map((thread) => ({
    id: thread.id,
    title: thread.title || "Untitled",
    lastMessageAt: thread.lastMessageAt.toISOString(),
    needsYou: pendingIds.has(thread.id),
    archived: thread.archivedAt !== null,
  }))

  const budgetView: BudgetView = {
    period: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: CHAT_ZONE }).format(
      budget.periodStart
    ),
    other: {
      spentCents: budget.other.spentCents,
      limitCents: budget.other.limitCents,
      reserveCents: budget.other.reserveCents,
      fraction: budget.other.fraction,
      level: budget.other.level,
      cutoff: budget.other.cutoff,
      routineExhausted: budget.other.routineExhausted,
    },
    cursor: { spentCents: budget.cursor.spentCents, turns: budget.cursor.turns },
  }

  return (
    <ChatFrame
      routeKey={threadId ?? "new"}
      sidebar={
        <ChatSidebar
          threads={rows}
          activeId={threadId}
          isNew={isNew || (threadId === null && threads.length === 0)}
          budget={budgetView}
          now={now.toISOString()}
        />
      }
    >
      <ChatView
        threadId={threadId}
        title={detail?.thread.title || "Untitled"}
        archived={detail?.thread.archivedAt != null}
        task={
          detail?.thread.task
            ? { id: detail.thread.task.id, title: detail.thread.task.title }
            : null
        }
        persona={
          detail?.thread.agent && PERSONAS[detail.thread.agent]
            ? {
                name: detail.thread.agent,
                label: PERSONAS[detail.thread.agent].label,
                pack: describePack(detail.thread.pack),
                private: detail.thread.private,
              }
            : null
        }
        messages={messages}
        pending={pending}
        stats={stats}
        worker={worker}
        greeting={greeting(now, user.name)}
        now={now.toISOString()}
      />
    </ChatFrame>
  )
}

function greeting(now: Date, name: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: CHAT_ZONE }).format(now)
  )
  const part = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"
  const first = name.trim().split(/\s+/)[0]
  return first ? `${part}, ${first}.` : `${part}.`
}
