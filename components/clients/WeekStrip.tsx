import Link from "next/link"
import { AlarmClock, ArrowRight, Calendar, Receipt, Repeat } from "lucide-react"
import { cn } from "@/lib/cn"
import type { WeekData, WeekItem } from "@/lib/client-rooms"
import { markColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"

const REST_MAX = 5

/**
 * Three cards: today, tomorrow, and the rest of the week rolled up with a
 * day prefix on each line. This client's events in its colour, everyone
 * else's dimmed with their name, deadlines in red.
 */
export function WeekStrip({ week, client }: { week: WeekData; client: { slug: string; name: string; color: string } }) {
  // The Board always shows the current week; guard anyway so a -1 never slices from the end.
  const t = week.todayIndex < 0 ? 0 : week.todayIndex
  const today = week.items.filter((i) => i.day === t)
  const tomorrow = week.items.filter((i) => i.day === t + 1)
  const rest = week.items.filter((i) => i.day > t + 1)
  const restDays = week.days.slice(t + 2)
  return (
    <section className="flex min-w-0 flex-col gap-1.5" aria-label="This week">
      <div className="flex items-center gap-2 px-0.5">
        <h2 className="flex items-center gap-1.5 font-ui text-[13px] font-bold text-tk-onyx">
          <Calendar className="size-3.5" aria-hidden />
          This week
        </h2>
        <Link href={ROUTES.clientRoom(client.slug, "calendar")} className="inline-flex items-center gap-0.5 font-ui text-[11px] font-semibold text-accent-ink hover:underline">
          Calendar <ArrowRight className="size-2.5" aria-hidden />
        </Link>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-2 rail:grid-cols-3">
        <DayCard head={String(week.days[t]?.num ?? "")} sub="Today" today>
          {today.map((i) => (
            <Row key={i.id} item={i} color={client.color} />
          ))}
        </DayCard>
        <DayCard head={String(week.days[t + 1]?.num ?? "")} sub={`Tomorrow${week.days[t + 1] ? ` · ${week.days[t + 1].dow}` : ""}`}>
          {tomorrow.map((i) => (
            <Row key={i.id} item={i} color={client.color} />
          ))}
        </DayCard>
        <DayCard head={restDays.length ? `${restDays[0].num}–${restDays[restDays.length - 1].num}` : "—"} sub="Rest of the week">
          {rest.slice(0, REST_MAX).map((i) => (
            <Row key={i.id} item={i} color={client.color} day={week.days[i.day]?.dow} />
          ))}
          {rest.length > REST_MAX ? <p className="px-1.5 text-[11px] italic text-ink-3 opacity-70">+{rest.length - REST_MAX} more</p> : null}
        </DayCard>
      </div>
    </section>
  )
}

function DayCard({ head, sub, today = false, children }: { head: string; sub: string; today?: boolean; children: React.ReactNode }) {
  const empty = !children || (Array.isArray(children) && children.filter(Boolean).length === 0)
  return (
    <div
      className={cn(
        "flex min-h-[120px] min-w-0 flex-col gap-1 rounded-[10px] border border-line bg-card px-2 pb-2 pt-1.5 shadow-card max-rail:min-h-0 max-rail:flex-row max-rail:items-start max-rail:gap-3 max-rail:px-3 max-rail:py-2.5",
        today && "shadow-[inset_0_0_0_1.5px_rgb(var(--accent-ink-rgb))]"
      )}
    >
      <div className={cn("mb-0.5 flex items-baseline gap-1.5 font-ui text-[10.5px] font-semibold text-ink-3 max-rail:mb-0 max-rail:w-[76px] max-rail:shrink-0 max-rail:flex-col max-rail:items-start max-rail:gap-0 max-rail:pt-0.5", today && "text-accent-ink")}>
        <b className={cn("font-display text-sm font-bold text-tk-onyx", today && "text-accent-ink")}>{head}</b>
        {sub}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {empty ? <p className="px-1.5 text-[11px] italic text-ink-3 opacity-60 max-rail:px-0">Nothing scheduled</p> : children}
      </div>
    </div>
  )
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false })
}

function Row({ item, color, day }: { item: WeekItem; color: string; day?: string }) {
  const prefix = day ? <span className="w-[26px] shrink-0 font-ui text-[9px] font-bold uppercase tracking-[0.06em] opacity-80">{day}</span> : null
  if (item.kind === "due") {
    const Icon = item.flavour === "money" ? Receipt : item.flavour === "repeat" ? Repeat : AlarmClock
    const body = (
      <>
        {prefix}
        <Icon className="size-2.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{item.title}</span>
      </>
    )
    const cls = cn(
      "flex min-w-0 items-center gap-1.5 rounded-[5px] border-l-2 px-1.5 py-[3px] text-[11px] font-semibold leading-[1.2]",
      item.flavour === "repeat" ? "border-l-line-strong bg-well text-ink-3" : "border-l-bad bg-bad-soft text-bad"
    )
    return item.href ? (
      <Link href={item.href} className={cls} title={item.title}>
        {body}
      </Link>
    ) : (
      <div className={cls}>{body}</div>
    )
  }
  const cls = cn(
    "flex min-w-0 items-center gap-1.5 rounded-[5px] px-1.5 py-[3px] text-[11px] leading-[1.2]",
    item.mine ? "border border-line bg-card font-semibold text-tk-onyx" : "border-l-2 border-l-line-strong bg-well font-medium text-ink-3"
  )
  const style = item.mine ? ({ borderLeft: `2px solid ${markColor(color)}` } as React.CSSProperties) : undefined
  const body = (
    <>
      {prefix}
      {!item.allDay ? <span className="shrink-0 font-mono text-[9.5px] font-medium">{time(item.startsAt)}</span> : null}
      <span className="min-w-0 truncate">{item.title}</span>
      {item.who ? <span className="ml-auto shrink-0 font-ui text-[9px] font-semibold uppercase tracking-[0.04em]">{item.who}</span> : null}
    </>
  )
  return item.href ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={cls} style={style} title={item.title}>
      {body}
    </a>
  ) : (
    <div className={cls} style={style} title={item.title}>
      {body}
    </div>
  )
}
