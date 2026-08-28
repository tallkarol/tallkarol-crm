import { PeekShell } from "@/components/peek/PeekShell"
import { GonePeek } from "@/components/peek/bits"
import { DeliverablePeek } from "@/components/peek/DeliverablePeek"
import { InvoicePeek } from "@/components/peek/InvoicePeek"
import { ProjectPeek } from "@/components/peek/ProjectPeek"
import { TaskPeek } from "@/components/peek/TaskPeek"
import { ROUTES } from "@/lib/nav"

/**
 * `?peek=<type>:<id>` → the card for that specific thing, rendered over
 * whatever page opened it. Types map 1:1 to the needs-attention rows; add a
 * case here when a new row type learns to peek.
 */
export function peekHref(base: string, type: string, id: string) {
  return `${base}?peek=${type}:${encodeURIComponent(id)}`
}

export async function PeekRouter({
  peek,
  closeHref,
}: {
  peek: string
  closeHref: string
}) {
  const idx = peek.indexOf(":")
  const type = idx === -1 ? peek : peek.slice(0, idx)
  const id = idx === -1 ? "" : decodeURIComponent(peek.slice(idx + 1))

  switch (type) {
    case "invoice":
      return (
        <PeekShell
          closeHref={closeHref}
          eyebrow={`Invoice · ${id}`}
          footer={{ href: ROUTES.invoice(id), label: "Open full invoice" }}
        >
          <InvoicePeek number={id} />
        </PeekShell>
      )
    case "task":
      return (
        <PeekShell
          closeHref={closeHref}
          eyebrow="Task"
          footer={{ href: ROUTES.tasks, label: "Open tasks board" }}
        >
          <TaskPeek id={id} />
        </PeekShell>
      )
    case "deliverable":
      return (
        <PeekShell closeHref={closeHref} eyebrow="Deliverable">
          <DeliverablePeek id={id} />
        </PeekShell>
      )
    case "project":
      return (
        <PeekShell
          closeHref={closeHref}
          eyebrow="Project"
          footer={{ href: ROUTES.project(id), label: "Open full project" }}
        >
          <ProjectPeek slug={id} />
        </PeekShell>
      )
    default:
      return (
        <PeekShell closeHref={closeHref} eyebrow="Not found">
          <GonePeek />
        </PeekShell>
      )
  }
}
