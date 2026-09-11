import { PageHeader } from "@/components/PageHeader"
import { MoneyInput } from "@/components/ui/MoneyInput"
import { dockSettings } from "@/lib/chat/dock-settings"
import { getGoals } from "@/lib/goals"
import { saveDock, saveGoals } from "./actions"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Settings" }
export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const [goals, dock] = await Promise.all([getGoals(), dockSettings()])

  return (
    <>
      <PageHeader title="Settings" />

      <Card className="mt-8 max-w-xl p-5">
        <h2 className="text-sm font-semibold text-tk-onyx">Desk dock</h2>
        <p className="mt-1 text-sm text-ink-3">
          What happens when you open a desk from the dock on the right. Either
          way the desk shows what it remembers from last time.
        </p>
        <form action={saveDock} className="mt-4 flex flex-col gap-2 text-sm">
          <label className="flex items-start gap-2.5">
            <input type="radio" name="open" value="continue" defaultChecked={dock.open === "continue"} className="mt-1 accent-[--accent-ink]" />
            <span>
              <span className="font-medium text-tk-onyx">Continue its latest thread</span>
              <span className="block text-xs text-ink-3">The desk picks up where you left off on that client, product or on you. New thread is one click away in the panel.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5">
            <input type="radio" name="open" value="new" defaultChecked={dock.open === "new"} className="mt-1 accent-[--accent-ink]" />
            <span>
              <span className="font-medium text-tk-onyx">Start a new thread every time</span>
              <span className="block text-xs text-ink-3">A clean thread per open; the last digest still shows above it.</span>
            </span>
          </label>
          <div>
            <button type="submit" className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90">
              Save
            </button>
          </div>
        </form>
      </Card>

      <Card className="mt-8 max-w-xl p-5">
        <h2 className="text-sm font-semibold text-tk-onyx">Revenue goals</h2>
        <p className="mt-1 text-sm text-ink-3">
          Targets for invoiced revenue. The dashboard shows progress against
          them — leave one blank to unset it.
        </p>
        <form action={saveGoals} className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block text-sm">
            <span className="text-xs font-medium text-ink-3">Monthly goal ($)</span>
            <MoneyInput
              name="monthly"
              inputMode="decimal"
              placeholder="6,000"
              defaultValue={goals.monthlyCents != null ? (goals.monthlyCents / 100).toLocaleString("en-US") : ""}
              className="mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm focus:border-tk-teal"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-ink-3">Annual goal ($)</span>
            <MoneyInput
              name="annual"
              inputMode="decimal"
              placeholder="72,000"
              defaultValue={goals.annualCents != null ? (goals.annualCents / 100).toLocaleString("en-US") : ""}
              className="mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm focus:border-tk-teal"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
            >
              Save
            </button>
          </div>
        </form>
      </Card>
    </>
  )
}
