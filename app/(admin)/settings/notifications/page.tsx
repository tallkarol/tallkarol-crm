import { PageHeader } from "@/components/PageHeader"
import { KindToggles } from "@/components/settings/KindToggles"
import { PushToggle } from "@/components/settings/PushToggle"
import {
  NOTIFICATION_KINDS,
  getNotificationPrefs,
  kindEnabled,
  liveSubscriptionCount,
} from "@/lib/notify"
import { saveQuietHours } from "./actions"

export const metadata = { title: "Notifications" }
export const dynamic = "force-dynamic"

/**
 * What the CRM is allowed to tell you, and where. The kinds are the same
 * catalog the Mac app runs locally, so switching one off here switches it
 * off everywhere the next time each device checks.
 */
export default async function NotificationSettingsPage() {
  const [prefs, devices] = await Promise.all([getNotificationPrefs(), liveSubscriptionCount()])

  return (
    <>
      <PageHeader title="Notifications" />

      <section className="mt-8 max-w-2xl rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">This device</h2>
        <p className="mt-1 text-sm text-tk-slate/70">
          Push notifications reach any browser you enable them in — Chrome on
          Android, or the CRM added to an iPhone or iPad Home Screen.{" "}
          {devices === 0
            ? "No devices are receiving push yet."
            : `${devices} device${devices === 1 ? " is" : "s are"} receiving push.`}
        </p>
        <div className="mt-4">
          <PushToggle />
        </div>
      </section>

      <section className="mt-6 max-w-2xl rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">What gets sent</h2>
        <p className="mt-1 text-sm text-tk-slate/70">
          Each alert is sent once per thing. A flag that stays raised for a week
          is mentioned on the first day and not again.
        </p>
        <div className="mt-4">
          <KindToggles
            kinds={NOTIFICATION_KINDS.map((k) => ({
              kind: k.kind,
              title: k.title,
              summary: k.summary,
              on: kindEnabled(prefs, k.kind),
              ignoresQuietHours: k.ignoresQuietHours,
            }))}
          />
        </div>
      </section>

      <section className="mt-6 max-w-2xl rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">Quiet hours</h2>
        <p className="mt-1 text-sm text-tk-slate/70">
          Nothing is sent between these hours, workspace time — except a
          monitor raising a ticket, which is the one thing worth waking you for.
        </p>
        <form action={saveQuietHours} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-xs font-medium text-tk-slate/70">From (hour)</span>
            <input
              name="from"
              type="number"
              min={0}
              max={23}
              defaultValue={prefs.quietFrom}
              className="mt-1 w-24 rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-tk-slate/70">To (hour)</span>
            <input
              name="to"
              type="number"
              min={0}
              max={23}
              defaultValue={prefs.quietTo}
              className="mt-1 w-24 rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
          >
            Save
          </button>
        </form>
      </section>
    </>
  )
}
