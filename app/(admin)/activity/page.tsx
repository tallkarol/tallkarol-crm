import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { Empty } from "@/components/activity/bits"
import { FilterMenu } from "@/components/activity/FilterMenu"
import { StreamView } from "@/components/activity/StreamView"
import { ControlsView } from "@/components/activity/views/ControlsView"
import { FrictionView } from "@/components/activity/views/FrictionView"
import { ModulesView } from "@/components/activity/views/ModulesView"
import { OverviewView } from "@/components/activity/views/OverviewView"
import { PagesView } from "@/components/activity/views/PagesView"
import { SpeedView } from "@/components/activity/views/SpeedView"
import { Card } from "@/components/ui/Card"
import { formatAge } from "@/lib/activity/format"
import { parseFilters, type ActivityFilters } from "@/lib/activity/summary/filters"
import { headerFacts, type HeaderFacts } from "@/lib/activity/summary/overview"
import { streamEvents } from "@/lib/activity/summary/stream"
import { getSessionUser } from "@/lib/auth"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { workspaceTimezone } from "@/lib/timezone"

export const metadata = { title: "Activity" }
export const dynamic = "force-dynamic"

const VIEWS = [
  ["overview", "Overview"],
  ["pages", "Pages"],
  ["controls", "Controls"],
  ["friction", "Friction"],
  ["speed", "Speed"],
  ["stream", "Stream"],
  ["modules", "Modules"],
] as const
type View = (typeof VIEWS)[number][0]

/**
 * How the CRM gets used — see ACTIVITY.md. Each view loads only its own
 * queries, and a view whose queries fail says so in place instead of taking
 * the page down.
 */
export default async function ActivityPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const now = new Date()
  const tz = await workspaceTimezone().catch(() => "Europe/Warsaw")
  const f = parseFilters(searchParams, now, tz)
  const view: View = VIEWS.some(([v]) => v === searchParams.view) ? (searchParams.view as View) : "overview"
  const facts: HeaderFacts = await headerFacts(f).catch(() => ({ firstAt: null, lastAt: null, hiddenTest: 0, trackedDays: 0 }))

  const href = (patch: Partial<Record<"view" | "days" | "surface" | "who" | "test", string | null>>) => {
    const next = {
      view: view as string,
      days: String(f.days),
      surface: f.surface as string,
      who: f.who as string,
      test: f.test ? "1" : null,
      ...patch,
    }
    const params = new URLSearchParams()
    if (next.view && next.view !== "overview") params.set("view", next.view)
    if (next.days && next.days !== "7") params.set("days", next.days)
    if (next.surface && next.surface !== "all") params.set("surface", next.surface)
    if (next.who && next.who !== "all") params.set("who", next.who)
    if (next.test === "1") params.set("test", "1")
    const qs = params.toString()
    return `${ROUTES.activity}${qs ? `?${qs}` : ""}`
  }

  const first = new Date(f.since).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz })
  const last = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz })
  const streamQuery = new URLSearchParams(
    Object.entries({ surface: f.surface, who: f.who, test: f.test ? "1" : "" }).filter(([, v]) => v && v !== "all")
  ).toString()

  return (
    <>
      <PageHeader
        title="Activity"
        actions={
          <>
            <nav className="flex gap-0.5 rounded-[10px] border border-line bg-well p-[3px]" aria-label="Window">
              {[7, 30, 90].map((d) => (
                <Link
                  key={d}
                  href={href({ days: String(d) })}
                  aria-current={f.days === d ? "page" : undefined}
                  className={cn(
                    "rounded-[8px] px-2.5 py-1 font-ui text-[11px] font-semibold",
                    f.days === d ? "bg-card text-ink shadow-card" : "text-ink-3 hover:text-ink"
                  )}
                >
                  {d} days
                </Link>
              ))}
            </nav>
            <FilterMenu
              label="Surface"
              current={f.surface}
              options={[
                ["all", "All"],
                ["browser", "Browser"],
                ["mac_app", "Mac app"],
                ["phone", "Phone"],
              ].map(([value, label]) => ({ value, label, href: href({ surface: value }) }))}
            />
            <FilterMenu
              label="Who"
              current={f.who}
              options={[
                ["all", "Everyone"],
                ["admin", "You"],
                ["customer", "Customers"],
              ].map(([value, label]) => ({ value, label, href: href({ who: value }) }))}
            />
          </>
        }
      />
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-ui text-[12px] font-medium text-ink-3">
        <span>How the CRM gets used</span>
        <span aria-hidden className="opacity-50">·</span>
        <span>
          {first} – {last}
        </span>
        <span aria-hidden className="opacity-50">·</span>
        <span>{tz.replace("_", " ")}</span>
        <span aria-hidden className="opacity-50">·</span>
        {facts.lastAt ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-good before:size-1.5 before:rounded-full before:bg-current before:content-['']">
            last event {formatAge(facts.lastAt, now, tz)}
          </span>
        ) : (
          <span>nothing recorded yet</span>
        )}
        {facts.hiddenTest ? (
          <>
            <span aria-hidden className="opacity-50">·</span>
            <Link href={href({ test: "1" })} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
              {facts.hiddenTest} verification {facts.hiddenTest === 1 ? "event" : "events"} hidden
            </Link>
          </>
        ) : null}
        {f.test ? (
          <>
            <span aria-hidden className="opacity-50">·</span>
            <Link href={href({ test: null })} className="font-semibold text-warn underline underline-offset-2">
              showing verification traffic
            </Link>
          </>
        ) : null}
      </p>

      <nav aria-label="Activity views" className="mt-5 flex gap-0.5 overflow-x-auto border-b border-line">
        {VIEWS.map(([key, label]) => (
          <Link
            key={key}
            href={href({ view: key })}
            aria-current={view === key ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 font-ui text-xs font-semibold transition-colors",
              view === key ? "border-accent-ink text-accent-ink" : "border-transparent text-ink-3 hover:text-ink"
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-5 flex flex-col gap-4">
        <ViewBoundary view={view} f={f} facts={facts} href={href} streamQuery={streamQuery} />
      </div>
    </>
  )
}

async function ViewBoundary({
  view,
  f,
  facts,
  href,
  streamQuery,
}: {
  view: View
  f: ActivityFilters
  facts: HeaderFacts
  href: (patch: { view: string }) => string
  streamQuery: string
}) {
  try {
    switch (view) {
      case "overview":
        return await OverviewView({ f, facts, hrefFor: (v) => (v === "overview" ? `${href({ view: "overview" })}#how-you-get-there` : href({ view: v })) })
      case "pages":
        return await PagesView({ f, facts })
      case "controls":
        return await ControlsView({ f })
      case "friction":
        return await FrictionView({ f })
      case "speed":
        return await SpeedView({ f })
      case "stream": {
        const events = await streamEvents(f, { limit: 150 })
        return <StreamView initial={events} tz={f.tz} query={streamQuery} />
      }
      case "modules":
        return await ModulesView({ f })
    }
  } catch (err) {
    console.error(`activity: the ${view} view failed:`, err)
    return (
      <Card>
        <Empty>This view could not be read from the database. The other views may still work — the error is in the server log.</Empty>
      </Card>
    )
  }
}
