import type { PillTone } from "@/components/clients/StatusPill"
import type { PhaseTone } from "@/lib/meeting-note"

/** The note's phase, in the hub's pill vocabulary. Recording borrows the red the CRM already has. */
export function pillTone(tone: PhaseTone): PillTone {
  switch (tone) {
    case "rec":
    case "bad":
      return "crit"
    case "warn":
      return "warn"
    case "good":
      return "good"
    case "teal":
      return "teal"
    default:
      return "muted"
  }
}

/** "EDT" for a moment in a zone, so a time never reads without its zone. */
export function zoneShort(value: string | null, timeZone: string): string {
  if (!value) return ""
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", timeZoneName: "short" }).formatToParts(new Date(value))
    return parts.find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    return timeZone
  }
}
