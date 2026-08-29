"use client"

import { Fragment, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Lock, Plus, Trash2 } from "lucide-react"
import { MonthPicker } from "@/components/timesheet/MonthPicker"
import { cn } from "@/lib/cn"
import { clientColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"
import type { SheetState } from "@/lib/sheets"
import {
  formatSheetDate,
  formatSheetHours,
  hoursBetween,
  hoursToString,
  monthShort,
  parseDateInput,
  parseHoursInput,
  sumHours,
  weekLabel,
  weekStart,
} from "@/lib/timesheet"
import {
  createInvoiceFromTimesheet,
  deleteTimeEntry,
  saveTimeEntry,
} from "@/lib/timesheet-actions"
import { formatMoney } from "@/lib/work"

export type TimesheetRow = {
  id: string
  occurredOn: string
  startedAt: string
  endedAt: string
  hours: string
  summary: string
  source: string
  projectId: string | null
  invoiceId: string | null
  invoiceNumber: string | null
}

export type TimesheetProject = { id: string; name: string }

export type TimesheetAccount = {
  id: string
  name: string
  slug: string
  rateCents: number | null
  retainerSlug: string | null
  capHours: number | null
}

type Draft = {
  key: string
  id: string | null
  date: string
  occurredOn: string
  startedAt: string
  endedAt: string
  hours: string
  hoursLocked: boolean
  summary: string
  source: string
  projectId: string | null
  invoiceId: string | null
  invoiceNumber: string | null
}

const COLS = ["date", "start", "end", "hours", "summary"] as const
type Col = (typeof COLS)[number]

const SOURCE_CHIP: Record<string, { label: string; title: string; tone: string }> = {
  manual: {
    label: "man",
    title: "Typed into the sheet",
    tone: "bg-tk-slate/10 text-tk-slate/60",
  },
  clock: {
    label: "clock",
    title: "Approved from a clock-in",
    tone: "bg-tk-teal/10 text-tk-teal",
  },
  meeting: {
    label: "cal",
    title: "Logged from a calendar meeting",
    tone: "bg-emerald-100 text-emerald-800",
  },
}

function emptyDraft(): Draft {
  return {
    key: `new-${crypto.randomUUID()}`,
    id: null,
    date: "",
    occurredOn: "",
    startedAt: "",
    endedAt: "",
    hours: "",
    hoursLocked: false,
    summary: "",
    source: "manual",
    projectId: null,
    invoiceId: null,
    invoiceNumber: null,
  }
}

function fromRow(row: TimesheetRow): Draft {
  return {
    key: row.id,
    id: row.id,
    date: formatSheetDate(row.occurredOn),
    occurredOn: row.occurredOn,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    hours: formatSheetHours(row.hours),
    hoursLocked: true,
    summary: row.summary,
    source: row.source,
    projectId: row.projectId,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
  }
}

function hasWork(row: Draft) {
  return Boolean(
    row.startedAt.trim() ||
      row.endedAt.trim() ||
      row.summary.trim() ||
      (parseHoursInput(row.hours) ?? 0) > 0
  )
}

function resolveDate(
  row: Draft,
  rows: Draft[],
  index: number,
  month: string
) {
  if (row.occurredOn) return row.occurredOn
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i].occurredOn) return rows[i].occurredOn
  }
  return `${month}-01`
}

export function Timesheet({
  month,
  client,
  clients,
  entries,
  invoices,
  projects = [],
  monthsWithData = [],
  lock,
}: {
  month: string
  client: TimesheetAccount
  clients: TimesheetAccount[]
  entries: TimesheetRow[]
  invoices: { number: string; status: string }[]
  projects?: TimesheetProject[]
  monthsWithData?: string[]
  lock: { locked: boolean; state: SheetState }
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Draft[]>(() => [
    ...entries.map(fromRow),
    emptyDraft(),
  ])
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const rowsRef = useRef(rows)
  const saveTimers = useRef<Record<string, number>>({})
  rowsRef.current = rows

  const readOnly = lock.locked && !unlocked

  const [year, mon] = month.split("-").map(Number)
  const fallback = { year, month: mon }
  const billed = invoices[0] ?? null
  const unbilledHours = sumHours(
    rows.filter((row) => hasWork(row) && !row.invoiceId).map((row) => row.hours)
  )
  const totalHours = sumHours(rows.filter(hasWork).map((row) => row.hours))
  const totalCents =
    client.rateCents != null ? Math.round(totalHours * client.rateCents) : null
  const capPct =
    client.capHours && client.capHours > 0
      ? Math.min(100, Math.round((totalHours / client.capHours) * 100))
      : null
  const overCap =
    client.capHours != null && client.capHours > 0 && totalHours > client.capHours

  function patch(index: number, next: Partial<Draft>) {
    setRows((current) => {
      const copy = current.map((row, i) =>
        i === index ? { ...row, ...next } : row
      )
      const last = copy[copy.length - 1]
      if (last && hasWork(last)) copy.push(emptyDraft())
      rowsRef.current = copy
      return copy
    })
  }

  function queueSave(index: number) {
    const row = rowsRef.current[index]
    if (!row) return
    window.clearTimeout(saveTimers.current[row.key])
    saveTimers.current[row.key] = window.setTimeout(() => {
      void persist(row.key)
    }, 400)
  }

  function flushSave(index: number) {
    const row = rowsRef.current[index]
    if (row) window.clearTimeout(saveTimers.current[row.key])
    void persist(typeof row?.key === "string" ? row.key : index)
  }

  function applyClock(index: number, next: Partial<Draft>, current: Draft) {
    const merged = { ...current, ...next }
    if (
      !merged.hoursLocked &&
      merged.startedAt.trim() &&
      merged.endedAt.trim()
    ) {
      const computed = hoursBetween(merged.startedAt, merged.endedAt)
      if (computed != null) merged.hours = formatSheetHours(computed)
    }
    patch(index, merged)
    queueSave(index)
    return merged
  }

  function applyDate(index: number, raw: string) {
    const parsed = parseDateInput(raw, fallback)
    patch(index, {
      date: raw,
      occurredOn: parsed ?? "",
    })
    queueSave(index)
  }

  async function persist(target: number | string) {
    const index =
      typeof target === "number"
        ? target
        : rowsRef.current.findIndex((item) => item.key === target)
    const row = index >= 0 ? rowsRef.current[index] : undefined
    if (!row || !hasWork(row)) {
      if (row?.id && !hasWork(row)) {
        const id = row.id
        setRows((current) => {
          const next = current.filter((item) => item.key !== row.key)
          return next.some((item) => !item.id && !hasWork(item))
            ? next
            : [...next, emptyDraft()]
        })
        await deleteTimeEntry(id)
      }
      return
    }

    const occurredOn = resolveDate(row, rowsRef.current, index, month)
    const hours =
      parseHoursInput(row.hours) ??
      hoursBetween(row.startedAt, row.endedAt) ??
      (row.summary.trim() ? 0 : null)
    if (hours == null) return

    const parsedDate = parseDateInput(row.date, fallback)
    const day = parsedDate || occurredOn
    if (row.date.trim() && !parsedDate) {
      setStatus("Could not read that date. Try 3-Aug or 8/3.")
      return
    }

    setStatus(null)
    patch(index, {
      occurredOn: day,
      date: formatSheetDate(day),
      hours: formatSheetHours(hours),
    })

    const result = await saveTimeEntry({
      id: row.id ?? undefined,
      clientId: client.id,
      occurredOn: day,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      hours: hoursToString(hours),
      summary: row.summary,
      projectId: row.projectId,
    })
    if (!result.ok) {
      setStatus(result.error)
      return
    }
    setRows((current) =>
      current.map((item) =>
        item.key === row.key ? { ...item, id: result.id, occurredOn: day } : item
      )
    )
    if (day.slice(0, 7) !== month) {
      router.push(ROUTES.timesheetFor(client.slug, day.slice(0, 7)))
    }
  }

  async function remove(index: number) {
    const row = rows[index]
    if (!row || (!row.id && !hasWork(row))) return
    if (row.invoiceId && !window.confirm("This session is on an invoice. Delete it?")) {
      return
    }
    if (row.id) {
      const result = await deleteTimeEntry(row.id)
      if (!result.ok) {
        setStatus(result.error)
        return
      }
    }
    setRows((current) => {
      const next = current.filter((_, i) => i !== index)
      return next.some((item) => !item.id && !hasWork(item))
        ? next
        : [...next, emptyDraft()]
    })
  }

  async function onCreateInvoice() {
    setBusy(true)
    setStatus(null)
    const result = await createInvoiceFromTimesheet({
      clientId: client.id,
      month,
    })
    setBusy(false)
    if (!result.ok) {
      setStatus(result.error)
      return
    }
    router.push(ROUTES.invoice(result.number))
  }

  function unlock() {
    if (
      lock.state === "paid" &&
      !window.confirm(
        "This month is invoiced and paid. Editing it changes a total the client already settled. Unlock anyway?"
      )
    ) {
      return
    }
    setUnlocked(true)
  }

  function focusCell(row: number, col: Col) {
    const node = document.querySelector<HTMLInputElement>(
      `[data-sheet-cell="${row}-${col}"]`
    )
    node?.focus()
  }

  function onKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    col: Col
  ) {
    if (event.key === "Enter") {
      event.preventDefault()
      const next = index + (event.shiftKey ? -1 : 1)
      if (next >= 0 && next < rows.length) focusCell(next, col)
    }
  }

  /* Week bands: a 40-row month is a wall without them. */
  const weekTotals = new Map<string, number>()
  for (const row of rows) {
    if (!row.occurredOn || !hasWork(row)) continue
    const key = weekStart(row.occurredOn)
    weekTotals.set(key, (weekTotals.get(key) ?? 0) + Number(row.hours || 0))
  }

  const colCount = projects.length > 0 ? 7 : 6

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <label className="sr-only" htmlFor="sheet-client">
          Client
        </label>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: clientColor(client.slug) }}
          />
          <select
            id="sheet-client"
            value={client.slug}
            onChange={(event) =>
              router.push(ROUTES.timesheetFor(event.target.value, month))
            }
            className="rounded-lg border border-tk-slate/20 bg-white px-3 py-1.5 text-sm font-semibold text-tk-onyx outline-none focus:border-tk-teal"
          >
            {clients.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto">
          <MonthPicker
            clientSlug={client.slug}
            month={month}
            monthsWithData={monthsWithData}
          />
        </div>
      </div>

      {readOnly ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock className="size-4 shrink-0" />
          <p>
            <strong className="font-semibold">
              {lock.state === "paid" ? "Paid." : "Invoiced."}
            </strong>{" "}
            This sheet is on{" "}
            {billed ? (
              <Link
                href={ROUTES.invoice(billed.number)}
                className="font-semibold underline"
              >
                {billed.number}
              </Link>
            ) : (
              "an invoice"
            )}
            . Editing it changes a billed total.
          </p>
          <button
            type="button"
            onClick={unlock}
            className="ml-auto rounded-full border border-amber-700/40 px-3 py-1 text-xs font-semibold text-amber-900 hover:border-amber-700"
          >
            Unlock to edit
          </button>
        </div>
      ) : lock.locked ? (
        <p className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">
          Unlocked. Changes here move a billed total.
        </p>
      ) : null}

      <section className="mt-4 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-tk-slate/10 px-5 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-tk-slate/50">
              Invoice
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-tk-onyx">
              {client.name} — Karol Buczek (1099)
            </h2>
            <p className="mt-1 text-sm text-tk-slate/70">
              {monthShort(month)}
              {client.rateCents != null
                ? ` · ${formatMoney(client.rateCents)}/hr`
                : ""}
              {client.retainerSlug ? (
                <>
                  {" · "}
                  <Link
                    href={ROUTES.retainer(client.retainerSlug)}
                    className="font-semibold text-tk-teal hover:underline"
                  >
                    Retainer
                  </Link>
                </>
              ) : null}
            </p>

            {capPct != null ? (
              <div className="mt-3 max-w-[16rem]">
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-tk-linen"
                  role="img"
                  aria-label={`${formatSheetHours(totalHours)} of ${client.capHours} hours`}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${capPct}%`,
                      backgroundColor: overCap
                        ? "#B45309"
                        : clientColor(client.slug),
                    }}
                  />
                </div>
                <p
                  className={cn(
                    "mt-1 text-[11px]",
                    overCap ? "font-semibold text-amber-700" : "text-tk-slate/60"
                  )}
                >
                  {overCap
                    ? `${formatSheetHours(totalHours - (client.capHours ?? 0))} hr over the ${client.capHours} hr cap`
                    : `${formatSheetHours(totalHours) || 0} of ${client.capHours} hr cap`}
                </p>
              </div>
            ) : null}
          </div>

          <dl className="grid min-w-[12rem] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-tk-slate/70">Hours Worked</dt>
            <dd className="text-right font-semibold tabular-nums text-tk-onyx">
              {formatSheetHours(totalHours) || "0"}
            </dd>
            <dt className="text-tk-slate/70">Invoice Total</dt>
            <dd className="text-right font-semibold tabular-nums text-tk-onyx">
              {totalCents != null ? formatMoney(totalCents) : "—"}
            </dd>
          </dl>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tk-slate/10 px-5 py-3">
          <h3 className="text-sm font-semibold text-tk-onyx">Work Summary</h3>
          <div className="flex flex-wrap items-center gap-2">
            {billed ? (
              <Link
                href={ROUTES.invoice(billed.number)}
                className="text-xs font-semibold text-tk-teal hover:underline"
              >
                {billed.number}
              </Link>
            ) : null}
            {unbilledHours > 0 && client.rateCents != null ? (
              <button
                type="button"
                onClick={onCreateInvoice}
                disabled={busy}
                className="rounded-full bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen disabled:opacity-60"
              >
                {busy ? "Creating…" : "Create draft invoice"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-tk-slate/15 bg-tk-linen/60 text-left text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
                <th className="w-8 px-2 py-2 font-semibold">
                  <span className="sr-only">Row</span>
                </th>
                <th className="w-14 px-2 py-2 font-semibold">Src</th>
                <th className="w-[7.5rem] px-2 py-2 font-semibold">Date</th>
                <th className="w-[7.5rem] px-2 py-2 font-semibold">
                  Time Start
                </th>
                <th className="w-[7.5rem] px-2 py-2 font-semibold">Time End</th>
                <th className="w-[6.5rem] px-2 py-2 text-right font-semibold">
                  Hrs Worked
                </th>
                <th className="px-2 py-2 font-semibold">Session Highlights</th>
                {projects.length > 0 ? (
                  <th className="w-[10rem] px-2 py-2 font-semibold">Project</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const week = row.occurredOn ? weekStart(row.occurredOn) : null
                const prevWeek =
                  index > 0 && rows[index - 1].occurredOn
                    ? weekStart(rows[index - 1].occurredOn)
                    : null
                const bandHere = week != null && week !== prevWeek
                const chip = SOURCE_CHIP[row.source] ?? SOURCE_CHIP.manual

                return (
                  <Fragment key={row.key}>
                    {bandHere ? (
                      <tr className="bg-tk-linen/50">
                        <td
                          colSpan={colCount + (projects.length > 0 ? 1 : 0)}
                          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-tk-slate/55"
                        >
                          {weekLabel(week!)}
                          <span className="ml-2 font-mono tabular-nums text-tk-slate/45">
                            {formatSheetHours(weekTotals.get(week!) ?? 0) || "0"} hr
                          </span>
                        </td>
                      </tr>
                    ) : null}

                    <tr className="border-b border-tk-slate/10 last:border-0">
                      <td className="px-1 py-0.5">
                        {readOnly ? (
                          <span className="flex size-7 items-center justify-center text-tk-slate/20">
                            <Lock className="size-3" />
                          </span>
                        ) : row.id || hasWork(row) ? (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="flex size-7 items-center justify-center rounded text-tk-slate/30 hover:bg-tk-linen hover:text-tk-slate"
                            aria-label="Delete row"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : (
                          <span className="flex size-7 items-center justify-center text-tk-slate/20">
                            <Plus className="size-3.5" />
                          </span>
                        )}
                      </td>

                      <td className="px-1 py-0.5">
                        {row.id ? (
                          <span
                            title={chip.title}
                            className={cn(
                              "inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                              chip.tone
                            )}
                          >
                            {chip.label}
                          </span>
                        ) : null}
                      </td>

                      <td className="px-1 py-0.5">
                        <input
                          data-sheet-cell={`${index}-date`}
                          value={row.date}
                          readOnly={readOnly}
                          onChange={(e) => applyDate(index, e.target.value)}
                          onBlur={() => flushSave(index)}
                          onKeyDown={(e) => onKeyDown(e, index, "date")}
                          placeholder="3-Aug"
                          aria-label={`Date, row ${index + 1}`}
                          className={sheetInput(readOnly)}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          data-sheet-cell={`${index}-start`}
                          value={row.startedAt}
                          readOnly={readOnly}
                          onChange={(e) =>
                            applyClock(index, { startedAt: e.target.value }, row)
                          }
                          onBlur={() => flushSave(index)}
                          onKeyDown={(e) => onKeyDown(e, index, "start")}
                          placeholder="4:13 PM"
                          aria-label={`Start time, row ${index + 1}`}
                          className={sheetInput(readOnly, "tabular-nums")}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          data-sheet-cell={`${index}-end`}
                          value={row.endedAt}
                          readOnly={readOnly}
                          onChange={(e) =>
                            applyClock(index, { endedAt: e.target.value }, row)
                          }
                          onBlur={() => flushSave(index)}
                          onKeyDown={(e) => onKeyDown(e, index, "end")}
                          placeholder="5:04 PM"
                          aria-label={`End time, row ${index + 1}`}
                          className={sheetInput(readOnly, "tabular-nums")}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          data-sheet-cell={`${index}-hours`}
                          value={row.hours}
                          readOnly={readOnly}
                          onChange={(e) => {
                            patch(index, {
                              hours: e.target.value,
                              hoursLocked: true,
                            })
                            queueSave(index)
                          }}
                          onBlur={() => flushSave(index)}
                          onKeyDown={(e) => onKeyDown(e, index, "hours")}
                          inputMode="decimal"
                          placeholder="0.85"
                          aria-label={`Hours, row ${index + 1}`}
                          className={sheetInput(readOnly, "text-right tabular-nums")}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          data-sheet-cell={`${index}-summary`}
                          value={row.summary}
                          readOnly={readOnly}
                          onChange={(e) => {
                            patch(index, { summary: e.target.value })
                            queueSave(index)
                          }}
                          onBlur={() => flushSave(index)}
                          onKeyDown={(e) => onKeyDown(e, index, "summary")}
                          placeholder="Session highlights"
                          aria-label={`Highlights, row ${index + 1}`}
                          className={sheetInput(readOnly)}
                        />
                      </td>
                      {projects.length > 0 ? (
                        <td className="px-1 py-0.5">
                          <select
                            value={row.projectId ?? ""}
                            disabled={readOnly}
                            onChange={(e) => {
                              patch(index, { projectId: e.target.value || null })
                              if (row.id || hasWork(row)) flushSave(index)
                            }}
                            aria-label={`Project, row ${index + 1}`}
                            className="w-full rounded border border-transparent bg-transparent px-1.5 py-1.5 text-xs text-tk-slate outline-none hover:border-tk-slate/20 focus:border-tk-teal disabled:hover:border-transparent"
                          >
                            <option value="">— retainer</option>
                            {projects.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-tk-linen/40 text-sm">
                <td colSpan={5} className="px-3 py-2.5 text-tk-slate/70">
                  Hours Worked
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-tk-onyx">
                  {formatSheetHours(totalHours) || "0"}
                </td>
                <td colSpan={projects.length > 0 ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {status ? (
        <p className="mt-3 text-sm text-tk-slate/70" role="status">
          {status}
        </p>
      ) : readOnly ? (
        <p className="mt-3 text-sm text-tk-slate/50">
          Read-only while this month is billed. Unlock above if a correction is
          genuinely needed.
        </p>
      ) : (
        <p className="mt-3 text-sm text-tk-slate/50">
          Tab through cells like a sheet. Hours fill in from start and end.
          Leave the date blank to keep the day above.
        </p>
      )}
    </div>
  )
}

function sheetInput(readOnly: boolean, extra?: string) {
  return cn(
    "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-tk-onyx outline-none",
    "placeholder:text-tk-slate/30",
    readOnly
      ? "cursor-default text-tk-slate/75"
      : "hover:bg-tk-linen/50 focus:border-tk-teal/30 focus:bg-tk-teal/[0.04]",
    extra
  )
}
