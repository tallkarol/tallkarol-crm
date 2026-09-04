import { formatSheetDate, formatSheetHours } from "@/lib/timesheet"

export type TimesheetSession = {
  id: string
  occurredOn: string
  startedAt?: string | null
  endedAt?: string | null
  hours: string
  summary: string
}

export function TimesheetTable({ entries }: { entries: TimesheetSession[] }) {
  const rows = [...entries].sort((a, b) => {
    if (a.occurredOn !== b.occurredOn) {
      return a.occurredOn < b.occurredOn ? -1 : 1
    }
    return (a.startedAt || "").localeCompare(b.startedAt || "")
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-well text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <th className="px-4 py-2.5 font-semibold">Date</th>
            <th className="px-3 py-2.5 font-semibold">Time Start</th>
            <th className="px-3 py-2.5 font-semibold">Time End</th>
            <th className="px-3 py-2.5 text-right font-semibold">Hrs Worked</th>
            <th className="px-4 py-2.5 font-semibold">Session Highlights</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, index) => {
            const showDate =
              index === 0 || rows[index - 1].occurredOn !== entry.occurredOn
            return (
              <tr
                key={entry.id}
                className="border-b border-line last:border-0"
              >
                <td className="whitespace-nowrap px-4 py-2 text-tk-onyx">
                  {showDate ? formatSheetDate(entry.occurredOn) : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-tk-slate">
                  {entry.startedAt || ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-tk-slate">
                  {entry.endedAt || ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                  {formatSheetHours(entry.hours)}
                </td>
                <td className="px-4 py-2 text-tk-slate">{entry.summary}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
