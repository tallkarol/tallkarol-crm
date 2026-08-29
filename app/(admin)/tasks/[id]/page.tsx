import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { TaskDetailBody } from "@/components/tasks/TaskDetail"
import { db } from "@/db"
import { tasks } from "@/db/schema"
import { ROUTES } from "@/lib/nav"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { id: string } }) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
    columns: { title: true },
  })
  return { title: task?.title ?? "Task" }
}

/** The same detail as the peek, with room for a long checklist. */
export default async function TaskPage({ params }: { params: { id: string } }) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, params.id),
    columns: { id: true },
  })
  if (!task) notFound()

  return (
    <>
      <PageHeader
        title="Task"
        actions={
          <Link
            href={ROUTES.tasks}
            className="inline-flex items-center gap-1.5 rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
          >
            <ArrowLeft className="size-3.5" />
            All tasks
          </Link>
        }
      />
      <div className="mt-6 max-w-2xl overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
        <TaskDetailBody id={params.id} />
      </div>
    </>
  )
}
