import Link from "next/link"
import { fmtInt } from "@/lib/insights/derive"
import type { CrmSlice } from "@/lib/insights/types"

function Step({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-tk-slate/12 bg-tk-linen/40 px-3 py-2">
      <p className="text-base font-bold leading-tight tabular-nums text-tk-onyx">
        {fmtInt(value)}
      </p>
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-tk-slate/60">
        {label}
      </p>
    </div>
  )
}

/**
 * The join GA4 can't make: sessions → key events → the actual inquiries and
 * qualified leads in this CRM. House property only — client leads don't land
 * here.
 */
export function LoopStrip({
  sessions,
  keyEvents,
  crm,
}: {
  sessions: number
  keyEvents: number
  crm: CrmSlice
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3.5">
        <Step value={sessions} label="Sessions" />
        <span className="text-sm text-tk-slate/40" aria-hidden>→</span>
        <Step value={keyEvents} label="Key events" />
        <span className="text-sm text-tk-slate/40" aria-hidden>→</span>
        <Step value={crm.inquiries} label="Inquiries" />
        <span className="text-sm text-tk-slate/40" aria-hidden>→</span>
        <Step value={crm.fit} label="Marked fit" />
      </div>
      <p className="px-5 pb-3.5 text-[11px] text-tk-slate/60">
        {crm.topSource ? (
          <>
            Top converting source:{" "}
            <span className="font-semibold text-tk-onyx">{crm.topSource}</span> — from
            intake attribution.{" "}
          </>
        ) : (
          "No attributed inquiries in this window. "
        )}
        <Link href="/leads" className="font-semibold text-tk-teal hover:underline">
          Open leads
        </Link>
      </p>
    </div>
  )
}
