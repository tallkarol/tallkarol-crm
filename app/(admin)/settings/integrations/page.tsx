import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Integrations" }

export default function SettingsIntegrationsPage() {
  return (
    <>
      <PageHeader title="Integrations" />

      <Link
        href={ROUTES.settingsCalendar}
        className="mt-8 block rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm transition-colors hover:border-tk-teal/40"
      >
        <p className="text-sm font-semibold text-tk-onyx">Calendar</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          Cal.com bookings and Google calendars, merged into one view.
        </p>
      </Link>

      <Link
        href={ROUTES.insights}
        className="mt-4 block rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm transition-colors hover:border-tk-teal/40"
      >
        <p className="text-sm font-semibold text-tk-onyx">Insights hub</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          GA4 and Search Console per client — trends, deltas, and snapshot
          reports. Source health lives on each property&rsquo;s Health tab.
        </p>
      </Link>
    </>
  )
}
