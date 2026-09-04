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
        className="mt-8 block rounded-2xl border border-line bg-card px-5 py-4 shadow-card hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <p className="text-sm font-semibold text-tk-onyx">Calendar</p>
        <p className="mt-1 text-sm text-ink-3">
          Cal.com bookings and Google calendars, merged into one view.
        </p>
      </Link>

      <Link
        href={ROUTES.settingsDevices}
        className="mt-4 block rounded-2xl border border-line bg-card px-5 py-4 shadow-card hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <p className="text-sm font-semibold text-tk-onyx">Devices</p>
        <p className="mt-1 text-sm text-ink-3">
          Bearer tokens for clocking in from a watch, a phone, or a shortcut —
          one per device, revocable on its own.
        </p>
      </Link>

      <Link
        href={ROUTES.insights}
        className="mt-4 block rounded-2xl border border-line bg-card px-5 py-4 shadow-card hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      >
        <p className="text-sm font-semibold text-tk-onyx">Insights hub</p>
        <p className="mt-1 text-sm text-ink-3">
          GA4 and Search Console per client — trends, deltas, and snapshot
          reports. Source health lives on each property&rsquo;s Health tab.
        </p>
      </Link>
    </>
  )
}
