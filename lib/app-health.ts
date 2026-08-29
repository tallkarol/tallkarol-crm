/**
 * App health — the per-product rollup on /uptime.
 *
 * An "app" is a whole product: its server, its frontend, the scheduled run that
 * feeds it, and the mailbox it sends from. Sites and Jobs each answer one
 * question; this answers "is Artist House fine right now" in one glance.
 *
 * NOTHING HERE IS WIRED. Every number below is illustrative placeholder data so
 * the layout can be judged before the probes exist. `WIRED = false` gates the
 * preview banner — flip it when the surfaces below read real sources:
 *
 *   server    → UptimeRobot monitor on the Railway origin
 *   frontend  → UptimeRobot monitor on the Vercel origin
 *   run       → monitorRuns, the rows /api/events/run already writes
 *   email     → Resend, sends + bounces for the sending domain
 */

export const WIRED = false

export type HealthState = "up" | "degraded" | "down" | "idle" | "unknown"

export type SurfaceKind = "server" | "frontend" | "run" | "email"

export type BarTone = "ok" | "warn" | "bad" | "idle"

export type HealthBar = { v: number; tone: BarTone }

export type HealthFact = { label: string; value: string }

export type AppSurface = {
  kind: SurfaceKind
  /** "Server" — what it is. */
  label: string
  /** "Railway" — where it lives. */
  provider: string
  state: HealthState
  /** One word in the tile: "Up", "Succeeded", "Sending". */
  headline: string
  /** The number under it: "99.98% · 30d". */
  detail: string
  /** Thirty samples, newest last. */
  bars: HealthBar[]
  /** What the strip is showing, for the tile's tooltip and the card. */
  barsLabel: string
  /** The peek's fact grid. */
  facts: HealthFact[]
  /** One line of prose in the peek — what this surface actually watches. */
  note: string
}

export type AppHealth = {
  slug: string
  name: string
  /** Matches a CRM client slug, for the accent stripe. */
  clientSlug: string
  /** What the card's status line says when everything is fine. */
  stack: string
  checkedLabel: string
  surfaces: AppSurface[]
}

export const SURFACE_ORDER: SurfaceKind[] = ["server", "frontend", "run", "email"]

/** Deterministic 0..1 noise — placeholder strips must not reshuffle per render. */
function noise(seed: string, i: number) {
  let h = 2166136261
  for (const ch of `${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

/** A calm strip with the odd spike — what a healthy month of latency looks like. */
function latencyBars(seed: string, spikes: number[] = []): HealthBar[] {
  return Array.from({ length: 30 }, (_, i) => {
    if (spikes.includes(i)) return { v: 0.78 + noise(seed, i) * 0.22, tone: "warn" as const }
    return { v: 0.18 + noise(seed, i) * 0.3, tone: "ok" as const }
  })
}

function runBars(seed: string, marks: Record<number, BarTone> = {}): HealthBar[] {
  return Array.from({ length: 30 }, (_, i) => {
    const tone = marks[i] ?? "ok"
    if (tone === "idle") return { v: 0.22, tone }
    return { v: 0.62 + noise(seed, i) * 0.38, tone }
  })
}

export const APP_HEALTH: AppHealth[] = [
  {
    slug: "artist-house",
    name: "Artist House",
    clientSlug: "artist-house",
    stack: "Railway · Vercel · Resend",
    checkedLabel: "sample data",
    surfaces: [
      {
        kind: "server",
        label: "Server",
        provider: "Railway",
        state: "up",
        headline: "Up",
        detail: "99.98% · 30d",
        bars: latencyBars("ah-server", [11, 12]),
        barsLabel: "response time, last 30 checks",
        facts: [
          { label: "Origin", value: "api.artisthouse.app" },
          { label: "Probe", value: "GET /health · every 5 min" },
          { label: "Uptime", value: "100% 24h · 99.99% 7d · 99.98% 30d" },
          { label: "Response", value: "212 ms avg · 486 ms p95" },
          { label: "Last incident", value: "Aug 12 · 4 min · deploy restart" },
        ],
        note: "The Express API and its Postgres. A down here means the ingest has nowhere to write and the frontend has nothing to read.",
      },
      {
        kind: "frontend",
        label: "Frontend",
        provider: "Vercel",
        state: "up",
        headline: "Up",
        detail: "100% · 30d",
        bars: latencyBars("ah-front"),
        barsLabel: "response time, last 30 checks",
        facts: [
          { label: "Origin", value: "artisthouse.app" },
          { label: "Probe", value: "GET / · every 5 min" },
          { label: "Uptime", value: "100% 24h · 100% 7d · 100% 30d" },
          { label: "Response", value: "94 ms avg · 180 ms p95" },
          { label: "Last deploy", value: "Aug 27 · main@4f1c8e2" },
        ],
        note: "The Next.js app on Vercel. Edge-cached, so this stays up through a server outage — which is exactly why it gets its own row.",
      },
      {
        kind: "run",
        label: "Latest run",
        provider: "Daily ingest",
        state: "up",
        headline: "Succeeded",
        detail: "4h ago · 6m 12s",
        bars: runBars("ah-run", { 8: "warn", 19: "bad", 20: "idle" }),
        barsLabel: "last 30 runs",
        facts: [
          { label: "Monitor", value: "artist-house-daily-ingest" },
          { label: "Window", value: "11:30 UTC daily · 180 min grace" },
          { label: "Last run", value: "Aug 29 11:31 UTC · succeeded" },
          { label: "Jobs", value: "1,204 of 1,204 · 0 failed" },
          { label: "Streak", value: "9 clean runs · 1 partial in 30" },
        ],
        note: "The Soundcharts pull. It already posts to /api/events/run — this tile is the same data the Jobs table below holds, surfaced where the rest of the product's health is.",
      },
      {
        kind: "email",
        label: "Email",
        provider: "Resend",
        state: "up",
        headline: "Sending",
        detail: "142 sent · 24h",
        bars: latencyBars("ah-mail", [3]),
        barsLabel: "sends per day, last 30 days",
        facts: [
          { label: "Domain", value: "mail.artisthouse.app · verified" },
          { label: "Sent", value: "142 in 24h · 3,180 in 30d" },
          { label: "Delivered", value: "99.4%" },
          { label: "Bounced", value: "6 hard · 3 soft (30d)" },
          { label: "Complaints", value: "0" },
        ],
        note: "Weekly artist reports and auth mail. A quiet failure here looks like nothing at all, so the tile watches send volume as well as delivery.",
      },
    ],
  },
  {
    slug: "bliss-cb",
    name: "Bliss CB",
    clientSlug: "bliss-cb",
    stack: "Railway · Vercel · Resend",
    checkedLabel: "sample data",
    surfaces: [
      {
        kind: "server",
        label: "Server",
        provider: "Railway",
        state: "degraded",
        headline: "Slow",
        detail: "99.71% · 30d",
        bars: latencyBars("bl-server", [22, 25, 26, 27, 28, 29]),
        barsLabel: "response time, last 30 checks",
        facts: [
          { label: "Origin", value: "api.blisscb.com" },
          { label: "Probe", value: "GET /health · every 5 min" },
          { label: "Uptime", value: "99.4% 24h · 99.6% 7d · 99.71% 30d" },
          { label: "Response", value: "1,340 ms avg · 3.2 s p95" },
          { label: "Last incident", value: "open · slow since 09:10 UTC" },
        ],
        note: "Shown degraded on purpose — this is what the card looks like when one surface is unhappy and the rest are fine.",
      },
      {
        kind: "frontend",
        label: "Frontend",
        provider: "Vercel",
        state: "up",
        headline: "Up",
        detail: "100% · 30d",
        bars: latencyBars("bl-front"),
        barsLabel: "response time, last 30 checks",
        facts: [
          { label: "Origin", value: "blisscb.com" },
          { label: "Probe", value: "GET / · every 5 min" },
          { label: "Uptime", value: "100% 24h · 100% 7d · 100% 30d" },
          { label: "Response", value: "88 ms avg · 164 ms p95" },
          { label: "Last deploy", value: "Aug 21 · main@9ab3d10" },
        ],
        note: "Static pages keep serving while the API is slow — the split is the point.",
      },
      {
        kind: "run",
        label: "Latest run",
        provider: "Nightly sync",
        state: "up",
        headline: "Succeeded",
        detail: "11h ago · 1m 48s",
        bars: runBars("bl-run", { 14: "warn" }),
        barsLabel: "last 30 runs",
        facts: [
          { label: "Monitor", value: "bliss-cb-nightly-sync" },
          { label: "Window", value: "05:00 UTC daily · 120 min grace" },
          { label: "Last run", value: "Aug 29 05:01 UTC · succeeded" },
          { label: "Jobs", value: "318 of 318 · 0 failed" },
          { label: "Streak", value: "15 clean runs" },
        ],
        note: "Placeholder monitor. Wire the app first, then the monitor, and this reads the same rows as the Jobs table.",
      },
      {
        kind: "email",
        label: "Email",
        provider: "Resend",
        state: "idle",
        headline: "Quiet",
        detail: "0 sent · 24h",
        bars: latencyBars("bl-mail"),
        barsLabel: "sends per day, last 30 days",
        facts: [
          { label: "Domain", value: "mail.blisscb.com · verified" },
          { label: "Sent", value: "0 in 24h · 96 in 30d" },
          { label: "Delivered", value: "100%" },
          { label: "Bounced", value: "0" },
          { label: "Complaints", value: "0" },
        ],
        note: "Low-volume transactional only. Quiet is normal here, which is why it reads idle rather than down.",
      },
    ],
  },
]

export function findAppHealth(slug: string) {
  return APP_HEALTH.find((app) => app.slug === slug) ?? null
}

/** The card's one-line verdict, worst surface wins. */
export function rollup(app: AppHealth): { state: HealthState; label: string } {
  const bad = app.surfaces.filter((s) => s.state === "down")
  if (bad.length) return { state: "down", label: `${bad.length} down` }
  const warn = app.surfaces.filter((s) => s.state === "degraded")
  if (warn.length) return { state: "degraded", label: `${warn[0].label.toLowerCase()} degraded` }
  return { state: "up", label: "all clear" }
}

export const STATE_DOT: Record<HealthState, string> = {
  up: "#2E7D57",
  degraded: "#A97A22",
  down: "#B4322A",
  idle: "rgba(31,44,43,.28)",
  unknown: "rgba(31,44,43,.28)",
}

export const BAR_TONE: Record<BarTone, string> = {
  ok: "bg-[#2E7D57]",
  warn: "bg-[#A97A22]",
  bad: "bg-[#B4322A]",
  idle: "bg-tk-slate/20",
}
