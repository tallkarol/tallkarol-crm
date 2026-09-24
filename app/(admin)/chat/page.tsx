import { redirect } from "next/navigation"
import { ChatFrame } from "@/components/chat/ChatFrame"
import { ChatSidebar } from "@/components/chat/ChatSidebar"
import { ChatView } from "@/components/chat/ChatView"
import { ContextPanel } from "@/components/chat/ContextPanel"
import type {
  ChatMessageView,
  PendingView,
  ThreadRow,
  ThreadState,
  ThreadStats,
} from "@/components/chat/types"
import { getSessionUser } from "@/lib/auth"
import { modelChain } from "@/lib/chat/format"
import { usageRail } from "@/lib/usage/rail"
import { PERSONAS } from "@/lib/chat/personas"
import { threadState } from "@/lib/chat/requests"
import { messageViews, pendingView } from "@/lib/chat/views"
import {
  listArchivedThreads,
  listThreads,
  threadDetail,
  threadPulses,
} from "@/lib/chat/turns"
import { workerStatus } from "@/lib/chat/worker-status"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Chat" }
export const dynamic = "force-dynamic"

/**
 * One frame the height of the window: the queue on the left, the thread in
 * the middle, the context panel on the right, only the thread scrolling.
 * The shell hands this route a flex column instead of a scrolling canvas
 * (FULL_BLEED in AppShell).
 *
 *   /chat              the newest thread
 *   /chat?thread=<id>  that thread
 *   /chat?new          the launcher; the first line starts a thread
 */
export default async function ChatPage(
  props: {
    searchParams: Promise<{ thread?: string; new?: string }>
  }
) {
  const searchParams = await props.searchParams
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [threads, archivedThreads, usage, worker] = await Promise.all([
    listThreads(user.id),
    listArchivedThreads(user.id),
    usageRail(),
    workerStatus(),
  ])
  const all = [...threads, ...archivedThreads]
  const pulses = await threadPulses(
    user.id,
    all.map((t) => t.id)
  )

  const isNew = searchParams.new !== undefined
  const threadId = isNew ? null : (searchParams.thread ?? threads[0]?.id ?? null)
  const detail = threadId ? await threadDetail(user.id, threadId) : null
  if (threadId && !detail) redirect(ROUTES.chat)

  const now = new Date()
  const turns = detail?.turns ?? []
  const calls = detail?.calls ?? []
  const last = turns[turns.length - 1] ?? null

  /**
   * Turns hang off the USER message they answer — an escalation chain has
   * one question and several attempts. The ledger groups the rows back
   * into requests (lib/chat/requests.ts).
   */
  const messages: ChatMessageView[] = detail ? messageViews(detail) : []
  const pending: PendingView | null = detail ? pendingView(detail) : null

  const stats: ThreadStats = {
    turns: turns.length,
    cents: turns.reduce((sum, t) => sum + Number(t.costCents), 0),
    chain: modelChain(turns.map((t) => t.model)),
    job: last?.jobType ?? "",
    model: [...turns].reverse().find((t) => t.status === "done")?.model ?? last?.model ?? "",
  }

  const state: ThreadState = threadId ? threadState(pulses[threadId]) : "idle"

  const rows: ThreadRow[] = all.map((thread) => {
    const pulse = pulses[thread.id] ?? {
      waiting: null,
      waitingCount: 0,
      live: null,
      lastModel: "",
      cents: 0,
    }
    return {
      id: thread.id,
      title: thread.title || "Untitled",
      agent: thread.agent,
      pack: thread.pack,
      lastMessageAt: thread.lastMessageAt.toISOString(),
      archived: thread.archivedAt !== null,
      state: threadState(pulse),
      pulse,
    }
  })

  const persona =
    detail?.thread.agent && PERSONAS[detail.thread.agent]
      ? {
          name: detail.thread.agent,
          label: PERSONAS[detail.thread.agent].label,
          private: detail.thread.private,
        }
      : null
  const task = detail?.thread.task
    ? { id: detail.thread.task.id, title: detail.thread.task.title }
    : null

  return (
    <ChatFrame
      routeKey={threadId ?? "new"}
      sidebar={
        <ChatSidebar
          threads={rows}
          activeId={threadId}
          isNew={isNew || (threadId === null && threads.length === 0)}
          worker={worker}
          now={now.toISOString()}
        />
      }
      context={
        detail ? (
          <ContextPanel
            agent={detail.thread.agent}
            pack={detail.thread.pack}
            privateThread={detail.thread.private}
            task={task}
            stats={stats}
            calls={calls}
            firstAt={messages[0]?.createdAt ?? null}
            usage={usage}
            now={now.toISOString()}
          />
        ) : null
      }
    >
      <ChatView
        threadId={threadId}
        title={detail?.thread.title || "Untitled"}
        archived={detail?.thread.archivedAt != null}
        task={task}
        persona={persona}
        pack={detail?.thread.pack ?? ""}
        state={state}
        messages={messages}
        pending={pending}
        stats={stats}
        worker={worker}
        now={now.toISOString()}
      />
    </ChatFrame>
  )
}
