import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { TaskDetailBody } from "@/components/tasks/TaskDetail"
import { ROUTES } from "@/lib/nav"
import { loadTaskDetail } from "@/lib/task-detail"
import { Card } from "@/components/ui/Card"

export const dynamic = "force-dynamic"

// Request-cached with the page and the body below: one read serves the
// title, the existence check and the card, where there were three.
export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const task = await loadTaskDetail(params.id)
  return { title: task?.title ?? "Task" }
}

/** The same detail as the peek, with room for a long checklist. */
export default async function TaskPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const task = await loadTaskDetail(params.id)
  if (!task) notFound()

  return (
    <>
      <PageHeader
        title="Task"
        actions={
          <Link
            href={ROUTES.tasks}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
          >
            <ArrowLeft className="size-3.5" />
            All tasks
          </Link>
        }
      />
      <Card className="mt-6 max-w-2xl overflow-hidden">
        <TaskDetailBody id={params.id} />
      </Card>
    </>
  )
}
