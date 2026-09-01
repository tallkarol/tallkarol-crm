"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Dropdown, MenuHead, MenuOption } from "@/components/ui/Dropdown"
import { StatusMenu, type StatusOption } from "@/components/delivery/StatusMenu"
import { BAND_LABEL, BANDS, type BandId } from "@/lib/attention"
import type { DeliveryRow, DeliveryTotals } from "@/lib/delivery"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { PROJECT_STATUS_LABEL, RETAINER_STATUS_LABEL, formatMoney } from "@/lib/work"

/* ------------------------------------------------------------------ lenses */

type LensId = "all" | "needs-me" | "projects" | "retainers"

const LENSES: { id: LensId; label: string; question: string }[] = [
  { id: "all", label: "Everything", question: "Where does everything stand?" },
  { id: "needs-me", label: "Needs me", question: "What needs me right now?" },
  { id: "projects", label: "Projects", question: "What am I building?" },
  { id: "retainers", label: "Retainers", question: "How are the months going?" },
]

const PROJECT_STATUS_OPTIONS: StatusOption[] = [
  { value: "not_started", label: PROJECT_STATUS_LABEL.not_started, tone: "flat" },
  { value: "in_progress", label: PROJECT_STATUS_LABEL.in_progress, tone: "progress" },
  { value: "waiting_on_content", label: PROJECT_STATUS_LABEL.waiting_on_content, tone: "waiting" },
  { value: "on_hold", label: PROJECT_STATUS_LABEL.on_hold, tone: "waiting" },
  { value: "complete", label: PROJECT_STATUS_LABEL.complete, tone: "done" },
]

const RETAINER_STATUS_OPTIONS: StatusOption[] = [
  { value: "active", label: RETAINER_STATUS_LABEL.active, tone: "progress" },
  { value: "paused", label: RETAINER_STATUS_LABEL.paused, tone: "waiting" },
  { value: "ended", label: RETAINER_STATUS_LABEL.ended, tone: "flat" },
]

/* ------------------------------------------------------------------- parts */

function Tile({
  label,
  value,
  caption,
  alert,
  meter,
}: {
  label: string
  value: React.ReactNode
  caption: string
  alert?: boolean
  meter?: number
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-3 py-2.5",
        alert ? "border-[#8A5A05]/40 bg-[#8A5A05]/[0.05]" : "border-tk-slate/15 bg-white"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-tk-slate/60">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[22px] font-semibold leading-tight tracking-tight tabular-nums",
          alert ? "text-[#8A5A05]" : "text-tk-onyx"
        )}
      >
        {value}
      </p>
      {meter != null ? (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-tk-slate/10">
          <div
            className={cn("h-full rounded-full", meter >= 0.85 ? "bg-[#8A5A05]" : "bg-tk-teal")}
            style={{ width: `${Math.max(2, Math.round(meter * 100))}%` }}
          />
        </div>
      ) : null}
      <p className="mt-0.5 text-[11px] text-tk-slate/60">{caption}</p>
    </div>
  )
}

function Rail({ rail }: { rail: NonNullable<DeliveryRow["rail"]> }) {
  return (
    <span className="flex shrink-0 items-center gap-[2px]" aria-hidden>
      {rail.map((s) => (
        <span
          key={s.stage}
          title={`${s.count} ${s.label.toLowerCase()}`}
          className={cn(
            "h-[5px] w-[15px] rounded-[2px]",
            s.count === 0
              ? "bg-tk-slate/[0.13]"
              : s.stale
                ? "bg-[#8A5A05]"
                : "bg-tk-teal"
          )}
        />
      ))}
    </span>
  )
}

function CapMeter({ capacity }: { capacity: NonNullable<DeliveryRow["capacity"]> }) {
  const empty = capacity.hours <= 0
  return (
    <span className="flex min-w-[168px] shrink-0 items-center gap-2">
      <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-tk-slate/10">
        <span
          className={cn(
            "block h-full rounded-full",
            empty ? "bg-[#B4322A]" : capacity.pct >= 0.85 ? "bg-[#8A5A05]" : "bg-tk-teal"
          )}
          style={{ width: `${Math.max(3, Math.round(capacity.pct * 100))}%` }}
        />
      </span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-tk-slate">
        {capacity.hours.toFixed(1)} / {capacity.cap}h
      </span>
    </span>
  )
}

function Row({ row, openHref }: { row: DeliveryRow; openHref: string }) {
  const hot = row.flags.find((f) => f.severity === "hot")
  const lead = row.flags[0]

  return (
    <li className="flex min-h-[46px] items-center gap-2.5 border-b border-tk-slate/[0.09] pr-3 last:border-b-0 hover:bg-tk-linen/40">
      <span aria-hidden className="w-[3px] self-stretch" style={{ background: row.color }} />

      <Link
        href={openHref}
        scroll={false}
        className="flex min-w-[220px] shrink-0 items-baseline gap-2 py-2 pl-2.5 outline-none focus-visible:underline"
      >
        <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-tk-slate/60">
          {row.clientName}
        </span>
        <span className="truncate text-[13px] font-semibold text-tk-onyx">{row.name}</span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {row.kind === "project" ? (
          <StatusMenu
            options={PROJECT_STATUS_OPTIONS}
            current={row.status}
            title="Project status"
            target={{ kind: "project-status", id: row.id }}
          />
        ) : (
          <StatusMenu
            options={RETAINER_STATUS_OPTIONS}
            current={row.status}
            title="Retainer status"
            target={{ kind: "retainer-status", id: row.id }}
          />
        )}

        {row.rail && row.rail.some((s) => s.count > 0) ? (
          <>
            <Rail rail={row.rail} />
            <span className="shrink-0 text-[11px] text-tk-slate/60">{row.railNote}</span>
          </>
        ) : null}
        {row.capacity ? <CapMeter capacity={row.capacity} /> : null}

        {lead ? (
          <span className="min-w-0 truncate text-[11.5px] text-tk-slate/60">
            <span className="mx-1 text-tk-slate/25">·</span>
            <span
              className={cn(
                "font-semibold",
                hot ? "text-[#B4322A]" : "text-[#8A5A05]"
              )}
            >
              {lead.short}
            </span>
            {row.flags.length > 1 ? (
              <span className="ml-1.5 text-tk-slate/45">+{row.flags.length - 1}</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {row.moneyCents != null ? (
        <span
          className="shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-tk-onyx"
          title={row.moneyNote}
        >
          {formatMoney(row.moneyCents)}
        </span>
      ) : null}

      <Link
        href={openHref}
        scroll={false}
        aria-label={`Open ${row.clientName} ${row.name}`}
        className="shrink-0 rounded px-1 text-[15px] leading-none tracking-[1px] text-tk-slate/40 hover:text-tk-teal"
      >
        ⋯
      </Link>
    </li>
  )
}

/* ------------------------------------------------------------------ ledger */

export function DeliveryLedger({
  rows,
  totals,
  clients,
}: {
  rows: DeliveryRow[]
  totals: DeliveryTotals
  clients: { slug: string; name: string; color: string }[]
}) {
  const router = useRouter()
  const search = useSearchParams()
  const lensParam = search.get("lens")
  const lens: LensId = LENSES.some((l) => l.id === lensParam) ? (lensParam as LensId) : "all"
  const picked = (search.get("client") ?? "").split(",").filter(Boolean)

  function setQuery(next: { lens?: LensId; client?: string[] }) {
    const params = new URLSearchParams(search.toString())
    if (next.lens) {
      if (next.lens === "all") params.delete("lens")
      else params.set("lens", next.lens)
    }
    if (next.client) {
      if (next.client.length === 0) params.delete("client")
      else params.set("client", next.client.join(","))
    }
    params.delete("open")
    const qs = params.toString()
    router.replace(qs ? `${ROUTES.delivery}?${qs}` : ROUTES.delivery, { scroll: false })
  }

  /** The current view as a query string, so a modal link keeps the view. */
  const viewQuery = useMemo(() => {
    const params = new URLSearchParams(search.toString())
    params.delete("open")
    return params.toString()
  }, [search])

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (picked.length > 0 && !picked.includes(row.clientSlug)) return false
      if (lens === "needs-me") return row.band === "needs-you"
      if (lens === "projects") return row.kind === "project"
      if (lens === "retainers") return row.kind === "retainer"
      return true
    })
  }, [rows, lens, picked])

  const banded = useMemo(() => {
    return BANDS.map((band) => ({
      band,
      rows: visible.filter((r) => r.band === band),
    })).filter((group) => group.rows.length > 0)
  }, [visible])

  const capPct = totals.retainerCap > 0 ? totals.retainerHours / totals.retainerCap : 0
  const activeLens = LENSES.find((l) => l.id === lens) ?? LENSES[0]

  return (
    <>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          label="Needs you"
          value={totals.needsYou}
          alert={totals.needsYou > 0}
          caption={
            totals.hotRows > 0
              ? `${totals.hotRows} can't wait`
              : totals.needsYou > 0
                ? "worth a look"
                : "nothing outstanding"
          }
        />
        <Tile
          label="In delivery"
          value={totals.projectsInDelivery}
          caption={`projects · ${totals.workstreams} workstream${totals.workstreams === 1 ? "" : "s"}`}
        />
        <Tile
          label="Retainer month"
          value={
            <>
              {totals.retainerHours.toFixed(1)}
              <span className="text-[13px] text-tk-slate/60">/{totals.retainerCap}h</span>
            </>
          }
          caption="across active retainers"
          meter={capPct}
        />
        <Tile
          label="Unbilled"
          value={formatMoney(totals.unbilledCents)}
          alert={totals.unbilledCents > 0}
          caption={
            totals.unbilledCount === 0
              ? "nothing waiting"
              : `${totals.unbilledCount} deliverable${totals.unbilledCount === 1 ? "" : "s"} done`
          }
        />
        <Tile
          label="Draft invoices"
          value={formatMoney(totals.draftCents)}
          caption={totals.draftNote}
        />
      </div>

      <div
        data-menu-boundary
        className="mt-3.5 flex h-11 items-center gap-2 rounded-2xl border border-tk-slate/15 bg-white px-2.5"
      >
        <Dropdown label={activeLens.label} on={lens !== "all"} title={activeLens.question}>
          {(close) => (
            <>
              <MenuHead>Lens</MenuHead>
              {LENSES.map((item) => (
                <MenuOption
                  key={item.id}
                  checked={item.id === lens}
                  label={item.label}
                  count={
                    item.id === "needs-me"
                      ? totals.needsYou
                      : item.id === "projects"
                        ? rows.filter((r) => r.kind === "project").length
                        : item.id === "retainers"
                          ? rows.filter((r) => r.kind === "retainer").length
                          : rows.length
                  }
                  onSelect={() => {
                    close()
                    setQuery({ lens: item.id })
                  }}
                />
              ))}
            </>
          )}
        </Dropdown>

        <Dropdown
          label={
            picked.length === 0
              ? "Clients"
              : (clients.find((c) => c.slug === picked[0])?.name ?? picked[0])
          }
          on={picked.length > 0}
          count={picked.length}
        >
          {() => (
            <>
              <MenuHead onClear={picked.length ? () => setQuery({ client: [] }) : undefined}>
                Clients
              </MenuHead>
              {clients.map((c) => (
                <MenuOption
                  key={c.slug}
                  kind="check"
                  checked={picked.includes(c.slug)}
                  swatch={c.color}
                  label={c.name}
                  count={rows.filter((r) => r.clientSlug === c.slug).length}
                  onSelect={() =>
                    setQuery({
                      client: picked.includes(c.slug)
                        ? picked.filter((s) => s !== c.slug)
                        : [...picked, c.slug],
                    })
                  }
                />
              ))}
            </>
          )}
        </Dropdown>

        <p className="ml-auto pr-1 text-[11.5px] tabular-nums text-tk-slate/55">
          {visible.length === rows.length
            ? `${rows.length} engagement${rows.length === 1 ? "" : "s"}`
            : `${visible.length} of ${rows.length}`}
        </p>
      </div>

      {banded.length === 0 ? (
        <p className="mt-10 text-center text-sm text-tk-slate/70">
          {lens === "needs-me"
            ? "Nothing needs you. Genuinely."
            : "Nothing matches this view."}
        </p>
      ) : (
        banded.map((group) => (
          <section key={group.band} className="mt-5">
            <div className="flex items-center gap-2 px-0.5 pb-1.5">
              <h2
                className={cn(
                  "text-[10.5px] font-bold uppercase tracking-[0.11em]",
                  group.band === "needs-you" ? "text-[#8A5A05]" : "text-tk-slate/60"
                )}
              >
                {BAND_LABEL[group.band as BandId]}
              </h2>
              <span className="font-mono text-[10.5px] tabular-nums text-tk-slate/40">
                {group.rows.length}
              </span>
              <span className="h-px flex-1 bg-tk-slate/[0.09]" />
            </div>
            <ul className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white">
              {group.rows.map((row) => (
                <Row
                  key={`${row.kind}:${row.id}`}
                  row={row}
                  openHref={`${ROUTES.delivery}?${
                    viewQuery ? `${viewQuery}&` : ""
                  }open=${row.kind}:${encodeURIComponent(row.slug)}`}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
