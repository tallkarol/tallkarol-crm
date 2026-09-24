import Link from "next/link"
import { GonePeek } from "@/components/peek/bits"
import { TaskDetailBody } from "@/components/tasks/TaskDetail"
import { loadTaskDetail } from "@/lib/task-detail"

/**
 * The slide-over stays the primary detail — the right shape for "change one
 * thing and carry on". Anything that outgrows it opens the same body full
 * page at /tasks/[id].
 *
 * One read: `loadTaskDetail` is request-cached, so the body below reuses this
 * row instead of fetching it again. The card used to check the row existed
 * and then read it in full, two round trips before its own reads began.
 */
export async function TaskPeek({ id }: { id: string }) {
  const task = await loadTaskDetail(id)
  if (!task) return <GonePeek />

  return (
    <>
      <TaskDetailBody id={id} />
      <div className="border-t border-line px-6 py-3">
        <Link
          href={`/tasks/${id}`}
          className="text-xs font-semibold text-tk-teal hover:underline"
        >
          Open full page ↗
        </Link>
      </div>
    </>
  )
}
