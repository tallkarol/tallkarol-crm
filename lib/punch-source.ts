/**
 * A punch's `source`, in words. Plain module on purpose: the live clock page
 * is server-rendered and imports this — it cannot import it from ClockPanel,
 * whose "use client" turns every export into a client reference in production
 * ("(0, d.D) is not a function", digest 442732439, Sep 2).
 */
export function sourceLabel(source: string) {
  if (source === "watch") return "Watch"
  if (source === "web") return "Browser"
  if (source === "api") return "API"
  if (source === "meeting") return "Calendar"
  if (source === "agent") return "Agent"
  if (source === "clock") return "Clock"
  return "Manual"
}
