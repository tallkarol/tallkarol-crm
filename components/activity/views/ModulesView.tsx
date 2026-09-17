import { Code, Panel } from "@/components/activity/bits"
import { ModuleSwitch } from "@/components/activity/ModuleSwitch"
import { CATALOG } from "@/lib/activity/catalog"
import type { ModuleKey } from "@/lib/activity/define"
import { formatAge, formatCount } from "@/lib/activity/format"
import { MODULES } from "@/lib/activity/modules"
import { RAW_DAYS } from "@/lib/activity/rollup"
import { activityFlags, readIngestStats } from "@/lib/activity/settings"
import type { ActivityFilters } from "@/lib/activity/summary/filters"
import { moduleStats, storageFacts } from "@/lib/activity/summary/modules"
import { cn } from "@/lib/cn"

function bytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export async function ModulesView({ f }: { f: ActivityFilters }) {
  const [flags, stats, storage, ingest] = await Promise.all([activityFlags(), moduleStats(f), storageFacts(f), readIngestStats()])

  const coverage: Record<ModuleKey, string> = {
    pages: `${CATALOG.routes.length} routes known to the catalog`,
    navigation: "rides on every page view",
    controls: `${CATALOG.controls.length} ${CATALOG.controls.length === 1 ? "control" : "controls"} in the catalog`,
    peeks: "every ?peek= kind, read from the URL",
    actions: `${CATALOG.actions.wrapped} of ${CATALOG.actions.total} actions wrapped`,
    errors: "window errors, rejections, both error boundaries",
    vitals: "every full load; INP on every visit",
    frustration: "rage click, quick back, abandon, flip-flop",
    devices: "not built yet",
    portal: `${formatCount(storage.customers)} customer events in this window`,
  }

  return (
    <>
      <Panel title="Modules" sub="a switched-off module never attaches its listener, and ingest drops what a stale tab still sends" flush>
        <div className="hidden grid-cols-[52px_minmax(0,1.4fr)_minmax(0,1fr)_96px_96px] gap-3.5 border-b border-line px-5 pb-2 font-ui text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 md:grid">
          <span>On</span>
          <span>Module</span>
          <span>Captured by</span>
          <span className="text-right">Events</span>
          <span className="text-right">Last event</span>
        </div>
        <ul>
          {MODULES.map((m) => {
            const on = flags[m.key]
            const stat = stats[m.key]
            return (
              <li
                key={m.key}
                className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1.5 border-t border-line px-5 py-3 first:border-t-0 md:grid-cols-[52px_minmax(0,1.4fr)_minmax(0,1fr)_96px_96px]"
              >
                <ModuleSwitch moduleKey={m.key} label={m.label} on={on} available={m.available} />
                <div className="min-w-0">
                  <b className={cn("block font-ui text-[13px] font-semibold", on ? "text-ink" : "text-ink-3")}>{m.label}</b>
                  <span className="block text-[12px] leading-snug text-ink-3">{m.description}</span>
                </div>
                <div className="col-start-2 min-w-0 font-mono text-[11px] leading-normal text-ink-2 md:col-start-auto">
                  {m.capturedBy}
                  <span className="block font-ui text-[11px] font-semibold text-ink-3">{coverage[m.key]}</span>
                </div>
                <div className="col-start-2 font-ui text-[13px] font-semibold tabular-nums text-ink md:col-start-auto md:text-right">
                  {m.available ? (stat ? formatCount(stat.events) : "0") : "—"}
                  <span className="block text-[11px] font-medium text-ink-3">{f.days} days</span>
                </div>
                <div className="col-start-2 font-ui text-[12.5px] font-semibold text-ink md:col-start-auto md:text-right">
                  {stat?.lastAt ? formatAge(stat.lastAt, f.now, f.tz) : "—"}
                </div>
              </li>
            )
          })}
        </ul>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Ingest" sub={`${f.days} days unless noted`}>
          <ul className="flex flex-col">
            {[
              ["Events stored", formatCount(storage.stored), ""],
              ["Verification traffic, hidden", formatCount(storage.synthetic), "headless Chrome from verify runs"],
              ["From customers", formatCount(storage.customers), "client portal sessions"],
              [
                "Undeclared props dropped",
                formatCount(ingest.dropped),
                ingest.lastDropped ? `all time · last: ${ingest.lastDropped}` : "all time",
              ],
              ["Refused or rate-limited", formatCount(ingest.refused + ingest.rateLimited), "all time"],
              ["Table size", bytes(storage.tableBytes), storage.oldestAt ? `oldest raw event ${formatAge(storage.oldestAt, f.now, f.tz)}` : "empty"],
              [
                "Daily rollups",
                formatCount(storage.dailyRows),
                storage.dailyThrough ? `days before ${RAW_DAYS} days old, through ${storage.dailyThrough}` : `nothing is ${RAW_DAYS} days old yet`,
              ],
            ].map(([label, value, note]) => (
              <li key={label} className="flex items-baseline justify-between gap-3 border-t border-line py-2 text-[12.5px] text-ink-2 first:border-t-0 first:pt-0">
                <span>
                  {label}
                  {note ? <small className="block text-[11.5px] text-ink-3">{note}</small> : null}
                </span>
                <b className="whitespace-nowrap font-semibold tabular-nums text-ink">{value}</b>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="What is never stored">
          <ul className="flex list-disc flex-col gap-2 pl-4 text-[12.5px] leading-normal text-ink-2">
            <li>
              <b className="font-semibold text-ink">Anything typed.</b> Inputs record a length and whether they were sent.
            </li>
            <li>
              <b className="font-semibold text-ink">Undeclared props.</b> Each event kind lists the keys it may carry in <Code>lib/activity/modules</Code>. Everything else
              is dropped and counted on the left.
            </li>
            <li>
              <b className="font-semibold text-ink">Amounts, notes, message bodies, IP addresses.</b> The user agent becomes a surface.
            </li>
            <li>
              <b className="font-semibold text-ink">Names.</b> Record ids are stored and names are looked up when the page renders. Rage clicks name a data-track id, or
              only the region and element type — never a label, which can carry a client&apos;s name.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  )
}
