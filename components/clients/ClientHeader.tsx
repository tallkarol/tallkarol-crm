import Link from "next/link"
import { Clock, LineChart } from "lucide-react"
import { ClientAvatar } from "@/components/clients/ClientAvatar"
import { ClientStatusMenu } from "@/components/clients/ClientStatusMenu"
import { AskDeskButton } from "@/components/clients/AskDeskButton"
import type { ClientShell } from "@/lib/client-rooms"
import type { ClientStatus } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { currentMonth } from "@/lib/timesheet"

/** The client header every room shares: who, status, and the three verbs. */
export function ClientHeader({ client, siteSlug }: { client: ClientShell; siteSlug: string | null }) {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5 sm:px-5">
      <ClientAvatar name={client.name} slug={client.slug} size="md" />
      <h1 className="flex min-w-0 flex-1 flex-col items-start gap-1 font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-tk-onyx rail:flex-row rail:items-center rail:gap-2">
        <span className="min-w-0 max-w-full truncate">{client.name}</span>
        <span className="inline-flex shrink-0">
          <ClientStatusMenu clientId={client.id} status={client.status as ClientStatus} />
        </span>
      </h1>
      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          href={ROUTES.timesheetFor(client.slug, currentMonth())}
          className="hidden h-[30px] items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 font-ui text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-tk-onyx lg:inline-flex"
        >
          <Clock className="size-3.5" aria-hidden />
          Timesheet
        </Link>
        {siteSlug ? (
          <Link
            href={`${ROUTES.insights}/${siteSlug}`}
            className="hidden h-[30px] items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 font-ui text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-tk-onyx lg:inline-flex"
          >
            <LineChart className="size-3.5" aria-hidden />
            Insights
          </Link>
        ) : null}
        <AskDeskButton />
      </div>
    </header>
  )
}
