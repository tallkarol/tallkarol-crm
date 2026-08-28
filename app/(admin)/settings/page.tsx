import { PageHeader } from "@/components/PageHeader"
import { getGoals } from "@/lib/goals"
import { saveGoals } from "./actions"

export const metadata = { title: "Settings" }
export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const goals = await getGoals()

  return (
    <>
      <PageHeader title="Settings" />

      <section className="mt-8 max-w-xl rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">Revenue goals</h2>
        <p className="mt-1 text-sm text-tk-slate/70">
          Targets for invoiced revenue. The dashboard shows progress against
          them — leave one blank to unset it.
        </p>
        <form action={saveGoals} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block text-sm">
            <span className="text-xs font-medium text-tk-slate/70">Monthly goal ($)</span>
            <input
              name="monthly"
              inputMode="decimal"
              placeholder="6,000"
              defaultValue={goals.monthlyCents != null ? (goals.monthlyCents / 100).toLocaleString("en-US") : ""}
              className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-tk-slate/70">Annual goal ($)</span>
            <input
              name="annual"
              inputMode="decimal"
              placeholder="72,000"
              defaultValue={goals.annualCents != null ? (goals.annualCents / 100).toLocaleString("en-US") : ""}
              className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
            >
              Save
            </button>
          </div>
        </form>
      </section>
    </>
  )
}
