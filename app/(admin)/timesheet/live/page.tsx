import Link from "next/link"
import { redirect } from "next/navigation"
import { ClockPanel } from "@/components/timesheet/ClockPanel"
import { sourceLabel } from "@/lib/punch-source"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import {
  punchTargets,
  recentPunches,
  runningPunches,
  todayTotals,
} from "@/lib/punches"

export const metadata = { title: "Clock" }
export const dynamic = "force-dynamic"

/**
 * Clock in and out from a browser. Deliberately the same five calls the watch
 * makes, so this screen is also the reference client — and the fallback when
 * the watch is on the charger.
 */
export default async function ClockPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [running, targets, today, recent] = await Promise.all([
    runningPunches(user.id),
    punchTargets(user.id),
    todayTotals(user.id),
    recentPunches(user.id, 12),
  ])

  return (
    <div className="mt-6 flex flex-col gap-6">
      <ClockPanel running={running} targets={targets} today={today} />

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
            Recently closed out
          </h2>
          <Link
            href={ROUTES.timesheetReview}
            className="text-[11px] font-semibold text-tk-teal hover:underline"
          >
            Review queue →
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-tk-slate/60">
            Nothing approved or discarded yet. Punches land in Review first.
          </p>
        ) : (
          <ul className="mt-2 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            {recent.map((punch) => (
              <li
                key={punch.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-tk-slate/10 px-5 py-3 text-sm last:border-0"
              >
                <span className="font-medium text-tk-onyx">
                  {punch.projectName
                    ? `${punch.clientName} · ${punch.projectName}`
                    : punch.clientName}
                </span>
                <span className="text-tk-slate/60">
                  {punch.startClock} – {punch.endClock}
                </span>
                <span className="ml-auto font-mono text-xs tabular-nums text-tk-slate/70">
                  {punch.hours.toFixed(2)} hr
                </span>
                <span
                  className={
                    punch.status === "approved"
                      ? "rounded-full bg-tk-teal/10 px-2 py-0.5 text-[11px] font-semibold text-tk-teal"
                      : "rounded-full bg-tk-slate/10 px-2 py-0.5 text-[11px] font-semibold text-tk-slate/70"
                  }
                >
                  {punch.status === "approved" ? "On the sheet" : "Discarded"}
                </span>
                <span className="text-[11px] text-tk-slate/45">
                  {sourceLabel(punch.source)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-tk-slate/55">
        Punching from a watch or phone app? Issue a device token in{" "}
        <Link
          href={ROUTES.settingsDevices}
          className="font-semibold text-tk-teal hover:underline"
        >
          Settings → Devices
        </Link>
        .
      </p>
    </div>
  )
}
