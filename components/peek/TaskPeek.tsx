import Link from "next/link"
import { eq } from "drizzle-orm"
import { GonePeek } from "@/components/peek/bits"
import { TaskDetailBody } from "@/components/tasks/TaskDetail"
import { db } from "@/db"
import { tasks } from "@/db/schema"

/**
 * The slide-over stays the primary detail — the right shape for "change one
 * thing and carry on". Anything that outgrows it opens the same body full
 * page at /tasks/[id].
 */
export async function TaskPeek({ id }: { id: string }) {
  const exists = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    columns: { id: true },
  })
  if (!exists) return <GonePeek />

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
