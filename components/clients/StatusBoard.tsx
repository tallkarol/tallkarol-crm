import Link from "next/link"
import type { RosterRow } from "@/lib/client-hub"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { CLIENT_STATUS_LABEL, CLIENT_STATUSES } from "@/lib/work"

/**
 * Status as lanes, not alarms. Occupied statuses only, names as a tight list.
 */
export function StatusBoard({ rows }: { rows: RosterRow[] }) {
  const columns = CLIENT_STATUSES.map((status) => ({
    status,
    label: CLIENT_STATUS_LABEL[status],
    clients: rows
      .filter((row) => row.status === status)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((column) => column.status !== "internal" && column.clients.length > 0)

  const lanes = [
    ...columns.filter((column) => column.status !== "active_retainer"),
    ...columns.filter((column) => column.status === "active_retainer"),
  ]

  if (lanes.length === 0) return null

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-px bg-line">
        {lanes.map((column) => (
          <section
            key={column.status}
            className={cn(
              "px-3.5 py-3",
              column.status === "active_retainer"
                ? "bg-good"
                : "bg-card"
            )}
          >
            <p className="flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "text-[10.5px] font-bold uppercase leading-tight tracking-[0.1em]",
                  column.status === "active_retainer"
                    ? "text-tk-linen/80"
                    : "text-ink-3"
                )}
              >
                {column.label}
              </span>
              <span
                className={cn(
                  "font-mono text-[10.5px] tabular-nums",
                  column.status === "active_retainer"
                    ? "text-tk-linen/60"
                    : "text-ink-3"
                )}
              >
                {column.clients.length}
              </span>
            </p>
            <ul className="mt-2 space-y-1">
              {column.clients.map((row) => (
                <li key={row.id}>
                  <Link
                    href={ROUTES.client(row.slug)}
                    className="group flex items-baseline gap-2"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-[7px] h-1 w-1 shrink-0 rounded-full",
                        column.status === "active_retainer" && "bg-well"
                      )}
                      style={
                        column.status === "active_retainer"
                          ? undefined
                          : { background: row.color }
                      }
                    />
                    <span
                      className={cn(
                        "truncate text-[13px] font-semibold",
                        column.status === "active_retainer"
                          ? "text-tk-linen group-hover:underline"
                          : "text-tk-onyx group-hover:text-tk-teal"
                      )}
                    >
                      {row.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
