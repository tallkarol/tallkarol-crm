import { PeekShell } from "@/components/peek/PeekShell"
import { parsePeek, peekEyebrow } from "@/components/peek/frame"
import { AppHealthPeek } from "@/components/peek/AppHealthPeek"
import { SiteUptimePeek } from "@/components/peek/SiteUptimePeek"
import { GonePeek } from "@/components/peek/bits"
import { DeliverablePeek } from "@/components/peek/DeliverablePeek"
import { InvoicePeek } from "@/components/peek/InvoicePeek"
import { ProjectPeek } from "@/components/peek/ProjectPeek"
import { PunchlistPeek } from "@/components/peek/PunchlistPeek"
import { RunPeek } from "@/components/peek/RunPeek"
import { SessionPeek } from "@/components/peek/SessionPeek"
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
  const { type, id } = parsePeek(peek)
  // Shared with the instant frame (PeekPending), so the swap reads as one card.
  const eyebrow = peekEyebrow(type, id)

  switch (type) {
    case "invoice":
      return (
        <PeekShell
          closeHref={closeHref}
          eyebrow={eyebrow}
          footer={{ href: ROUTES.invoice(id), label: "Open full invoice" }}
        >
          <InvoicePeek number={id} />
        </PeekShell>
      )
    case "task":
      return (
        <PeekShell
          closeHref={closeHref}
          eyebrow={eyebrow}
          footer={{ href: ROUTES.tasks, label: "Open tasks board" }}
        >
          <TaskPeek id={id} />
        </PeekShell>
      )
    case "deliverable":
      return (
        <PeekShell closeHref={closeHref} eyebrow={eyebrow}>
          <DeliverablePeek id={id} />
        </PeekShell>
      )
    case "app":
      return (
        <PeekShell
          closeHref={closeHref}
          eyebrow={eyebrow}
          footer={{ href: ROUTES.client(id), label: "Open client" }}
        >
          <AppHealthPeek slug={id} />
        </PeekShell>
      )
    case "site":
      return (
        <PeekShell closeHref={closeHref} eyebrow={eyebrow}>
          <SiteUptimePeek slug={id} />
        </PeekShell>
      )
    case "project":
      return (
        <PeekShell
          closeHref={closeHref}
          eyebrow={eyebrow}
          footer={{ href: ROUTES.project(id), label: "Open full project" }}
        >
          <ProjectPeek slug={id} />
        </PeekShell>
      )
    case "punchlist":
      return (
        <PeekShell
          closeHref={closeHref}
          eyebrow={eyebrow}
          footer={{ href: ROUTES.punchlist(id), label: "Open full list" }}
        >
          <PunchlistPeek slug={id} base={closeHref.split("?")[0]} />
        </PeekShell>
      )
    case "run":
      return (
        <PeekShell closeHref={closeHref} eyebrow={eyebrow}>
          <RunPeek id={id} />
        </PeekShell>
      )
    case "session":
      return (
        <PeekShell closeHref={closeHref} eyebrow={eyebrow}>
          <SessionPeek sessionRef={id} />
        </PeekShell>
      )
    default:
      return (
        <PeekShell closeHref={closeHref} eyebrow={eyebrow}>
          <GonePeek />
        </PeekShell>
      )
  }
}
