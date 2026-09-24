import { notFound } from "next/navigation"
import { cookies } from "next/headers"
import { BoardRoom } from "@/components/clients/BoardRoom"
import { SignalsCard } from "@/components/clients/SignalsCard"
import { WeekStrip } from "@/components/clients/WeekStrip"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { isoDay, loadBoard, loadClientShell } from "@/lib/client-rooms"
import { FOCUS_MODE_COOKIE, isFocusMode } from "@/lib/focus"
import { ROUTES } from "@/lib/nav"
import { tasksFor } from "@/lib/tasks"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const client = await loadClientShell(params.slug)
  return { title: client ? `${client.name} · Board` : params.slug }
}

/**
 * The Board — the client's landing room. Focus and the queue on top, then
 * this week beside Signals, then the horizon columns. Signed off 23 Sep 2026
 * from `~/Work/tallkarol/crm-hub-b-rooms.html`.
 */
export default async function ClientBoardPage(
  props: {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ peek?: string; focus?: string }>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const client = await loadClientShell(params.slug)
  if (!client) notFound()
  const now = new Date()
  const modeRaw = (await cookies()).get(FOCUS_MODE_COOKIE)?.value
  const mode = isFocusMode(modeRaw) ? modeRaw : "three"

  const [board, tasks] = await Promise.all([loadBoard(client, now), tasksFor({ clientId: client.id }, now)])

  return (
    <>
      {searchParams.peek ? <PeekRouter peek={searchParams.peek} closeHref={ROUTES.client(client.slug)} /> : null}
      <BoardRoom
        client={client}
        focus={board.focus.cards}
        tasks={tasks}
        mode={mode}
        today={isoDay(now)}
        takeover={searchParams.focus === "full"}
        middle={
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <WeekStrip week={board.week} client={client} />
            <SignalsCard signals={board.signals} clientSlug={client.slug} />
          </div>
        }
      />
    </>
  )
}
