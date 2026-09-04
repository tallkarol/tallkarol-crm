import { PageHeader } from "@/components/PageHeader"
import { MoneyInput } from "@/components/ui/MoneyInput"
import { getGoals } from "@/lib/goals"
import { saveGoals } from "./actions"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Settings" }
export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const goals = await getGoals()

  return (
    <>
      <PageHeader title="Settings" />

      <Card className="mt-8 max-w-xl p-5">
        <h2 className="text-sm font-semibold text-tk-onyx">Revenue goals</h2>
        <p className="mt-1 text-sm text-ink-3">
          Targets for invoiced revenue. The dashboard shows progress against
          them — leave one blank to unset it.
        </p>
        <form action={saveGoals} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
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
