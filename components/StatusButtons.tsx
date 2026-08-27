"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import type { InquiryStatus } from "@/db/schema"

const OPTIONS: { value: InquiryStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
]

export function StatusButtons({
  inquiryId,
  current,
}: {
  inquiryId: string
  current: InquiryStatus
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<InquiryStatus | null>(null)

  async function setStatus(status: InquiryStatus) {
    if (status === current) return
    setBusy(status)
    try {
      const res = await fetch(`/api/inquiries/${inquiryId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error("failed")
      router.refresh()
    } catch {
      alert("Could not update status")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => {
        const active = opt.value === current
        return (
          <button
            key={opt.value}
            type="button"
            disabled={busy !== null}
            onClick={() => setStatus(opt.value)}
            className={
              active
                ? "rounded-full bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen"
                : "rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal disabled:opacity-50"
            }
          >
            {busy === opt.value ? "…" : opt.label}
          </button>
        )
      })}
    </div>
  )
}
