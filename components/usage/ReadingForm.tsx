"use client"

import { useState, useTransition } from "react"
import { cn } from "@/lib/cn"
import { recordReading } from "@/lib/usage/actions"

type Source = "claude_max" | "cursor_dashboard"

const FIELD =
  "mt-1 w-full rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-[12.5px] tabular-nums text-tk-onyx outline-accent-ink placeholder:text-ink-3"
const LABEL = "block text-[11px] font-medium text-ink-3"

/**
 * The two caps the CRM cannot read for itself get typed here: what /usage
 * shows inside Claude Code, and what cursor.com → Usage shows. Same row
 * shape as a poller would write, so the tiles never change if one is
 * switched on later. Each Claude reading also stores the token pace at
 * that moment — the calibration pair.
 */
export function ReadingForm({ defaultSource = "claude_max" }: { defaultSource?: Source }) {
  const [source, setSource] = useState<Source>(defaultSource)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, startTransition] = useTransition()

  function submit(formData: FormData) {
    setMessage(null)
    startTransition(async () => {
      const result = await recordReading(formData)
      setMessage(result.ok ? { ok: true, text: "Recorded. The tile above uses it now." } : { ok: false, text: result.error })
    })
  }

  return (
    <form action={submit} className="text-sm">
      <input type="hidden" name="source" value={source} />
      <div className="flex gap-0.5 rounded-[10px] border border-line bg-well p-[3px]" role="group" aria-label="Reading source">
        {(
          [
            ["claude_max", "Claude Max — /usage in Claude Code"],
            ["cursor_dashboard", "Cursor — cursor.com › Usage"],
          ] as [Source, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={source === key}
            onClick={() => setSource(key)}
            className={cn(
              "flex-1 rounded-[8px] px-2 py-1.5 font-ui text-[11px] font-semibold",
              source === key ? "bg-card text-tk-onyx shadow-card" : "text-ink-3 hover:text-tk-onyx"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "claude_max" ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={LABEL}>
            5-hour window %
            <input name="five_hour_pct" inputMode="decimal" placeholder="38" className={FIELD} />
          </label>
          <label className={LABEL}>
            resets at
            <input name="resets_5h" placeholder="16:00" className={FIELD} />
          </label>
          <label className={LABEL}>
            7-day window %
            <input name="seven_day_pct" inputMode="decimal" placeholder="61" className={FIELD} />
          </label>
          <label className={LABEL}>
            resets
            <input name="resets_7d" placeholder="Sun 09:00" className={FIELD} />
          </label>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className={LABEL}>
            Other models $ used
            <input name="other_models_usd" inputMode="decimal" placeholder="212.40" className={FIELD} />
          </label>
          <label className={LABEL}>
            of pool $ (as shown)
            <input name="other_models_pool_usd" inputMode="decimal" placeholder="400" className={FIELD} />
          </label>
          <label className={LABEL}>
            Other models %
            <input name="other_models_pct" inputMode="decimal" placeholder="53" className={FIELD} />
          </label>
          <label className={LABEL}>
            plan %
            <input name="plan_pct" inputMode="decimal" placeholder="41" className={FIELD} />
          </label>
          <label className={LABEL}>
            Cursor models %
            <input name="cursor_models_pct" inputMode="decimal" placeholder="" className={FIELD} />
          </label>
          <label className={LABEL}>
            on-demand $
            <input name="on_demand_usd" inputMode="decimal" placeholder="0" className={FIELD} />
          </label>
          <label className={LABEL}>
            cycle ends
            <input name="cycle_end" type="date" className={FIELD} />
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className={LABEL}>
          as of
          <input name="observedAt" type="datetime-local" className={FIELD} />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent outline-accent-ink disabled:opacity-50"
        >
          {busy ? "Recording…" : "Record reading"}
        </button>
        {message ? (
          <p className={cn("text-[12px]", message.ok ? "text-good" : "text-bad")}>{message.text}</p>
        ) : (
          <p className="text-[11px] text-ink-3">
            Blank as-of means now; a time is read in the workspace zone. Every Claude reading also stores the token pace at that moment.
          </p>
        )}
      </div>
    </form>
  )
}
