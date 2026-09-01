"use client"

/**
 * Renders a timestamp in the viewer's timezone. The server runs in UTC, so
 * the hydration mismatch is expected and suppressed — the browser's version
 * is the right one.
 */
export function LocalTime({
  iso,
  mode = "daytime",
}: {
  iso: string
  mode?: "daytime" | "time"
}) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const text =
    mode === "daytime"
      ? `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`
      : time
  return (
    <span suppressHydrationWarning className="tabular-nums">
      {text}
    </span>
  )
}
