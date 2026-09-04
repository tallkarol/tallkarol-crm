import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { BudgetMeters } from "@/components/chat/BudgetMeters"
import { ChatView, type ChatMessageView } from "@/components/chat/ChatView"
import { cn } from "@/lib/cn"
import { getSessionUser } from "@/lib/auth"
import { budgetState } from "@/lib/chat/budget"
import { listThreads, threadDetail } from "@/lib/chat/turns"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Chat" }
export const dynamic = "force-dynamic"

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { thread?: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [threads, budget] = await Promise.all([
    listThreads(user.id),
    budgetState(),
  ])

  const threadId = searchParams.thread ?? threads[0]?.id ?? null
  const detail = threadId ? await threadDetail(user.id, threadId) : null

  /**
   * Turns hang off the USER message they answer, not the assistant message
   * they produced — an escalation chain has one question and several attempts,
   * and only the question is guaranteed to exist while they are still running.
   */
  const messages: ChatMessageView[] = (detail?.messages ?? []).map((message) => ({
    id: message.id,
    role: message.role,
    agent: message.agent,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    turnId: message.turnId,
    turns:
      message.role === "user"
        ? (detail?.turns ?? []).filter((turn) => turn.messageId === message.id)
        : [],
    calls: (detail?.calls ?? []).filter(
      (call) => message.turnId != null && call.turnId === message.turnId
    ),
  }))

  const waiting = (detail?.turns ?? []).some(
    (turn) =>
      turn.status === "queued" ||
      turn.status === "claimed" ||
      turn.status === "running"
  )

  return (
    <>
      <PageHeader title="Chat" />

      <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3">
          <Link
            href={ROUTES.chat}
            className="rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-tk-slate outline-accent-ink hover:border-line-strong"
          >
            New thread
          </Link>

          {threads.length ? (
            <nav className="flex flex-col gap-0.5">
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`${ROUTES.chat}?thread=${thread.id}`}
                  className={cn(
                    "truncate rounded-lg px-3 py-1.5 text-xs outline-accent-ink",
                    thread.id === threadId
                      ? "bg-accent-soft font-semibold text-accent-ink"
                      : "text-ink-2 hover:bg-well"
                  )}
                >
                  {thread.title || "Untitled"}
                </Link>
              ))}
            </nav>
          ) : null}

          <BudgetMeters budget={budget} />
        </aside>

        <section className="flex min-h-[28rem] flex-col">
          <ChatView threadId={threadId} messages={messages} waiting={waiting} />
        </section>
      </div>
    </>
  )
}
