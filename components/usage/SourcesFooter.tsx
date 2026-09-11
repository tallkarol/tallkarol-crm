import type { UsageSnapshot } from "@/db/schema"
import { cn } from "@/lib/cn"
import { ageLabel, ageMs, type SnapshotSource } from "@/lib/usage/snapshots"
import type { SourceHealth } from "@/lib/usage/summary"

const HOUR = 3_600_000

type Line = { name: string; detail: string; state: "ok" | "warn" | "info" }

/**
 * One line per source: rows in the window and how fresh the newest thing
 * from it is. A source that stops shows as stale here — the page never
 * turns a silent collector into a zero.
 */
export function SourcesFooter({
  health,
  snapshots,
  now,
}: {
  health: SourceHealth | null
  snapshots: Partial<Record<SnapshotSource, UsageSnapshot>>
  now: Date
}) {
  const lines: Line[] = []
  const since = (d: Date | null) => (d ? ageLabel(ageMs(d, now)) : "never")
  if (health) {
    lines.push({
      name: "Claude Code hooks",
      detail: `last turn ${since(health.lastClaudeTurn)} · ${health.claudeRowsNoTokens} rows in the window without tokens (transcript gone)`,
      state: "info",
    })
    lines.push({
      name: "Cursor hooks",
      detail: `last turn ${since(health.lastCursorTurn)} · ${health.cursorRowsNoTokens} rows in the window without tokens (no source)`,
      state: "info",
    })
    const pushAge = health.lastPush ? ageMs(health.lastPush, now) : Infinity
    lines.push({
      name: "Push from the Mac",
      detail: health.lastPush
        ? `last ${since(health.lastPush)} · ${health.turnsInWindow} turns in the window · expected within 12 h`
        : "nothing pushed yet — push-turns.py on the Mac",
      state: pushAge > 24 * HOUR ? "warn" : "ok",
    })
    lines.push({
      name: "CRM chat",
      detail: `last turn ${since(health.lastChatTurn)} · ${health.chatTurnsInWindow} turns in the window`,
      state: "info",
    })
  } else {
    lines.push({ name: "Turns", detail: "could not be read", state: "warn" })
  }
  const railway = snapshots.railway
  lines.push({
    name: "Railway",
    detail: railway ? `read ${since(railway.observedAt)} · expected twice daily` : "no snapshot yet — railway-usage.sh on the Mac",
    state: railway && ageMs(railway.observedAt, now) <= 36 * HOUR ? "ok" : "warn",
  })
  const claude = snapshots.claude_max
  lines.push({
    name: "Claude Max reading",
    detail: claude ? `typed ${since(claude.observedAt)} (${claude.basis})` : "none yet — the form above",
    state: "info",
  })
  const cursor = snapshots.cursor_dashboard
  lines.push({
    name: "Cursor dashboard reading",
    detail: cursor ? `typed ${since(cursor.observedAt)} (${cursor.basis})` : "none yet — the form above",
    state: "info",
  })

  return (
    <footer className="rounded-[14px] border border-line bg-well px-4 py-3">
      <h3 className="font-ui text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Sources</h3>
      <ul className="mt-1.5 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {lines.map((l) => (
          <li key={l.name} className="flex items-baseline gap-2 text-[11.5px] leading-[1.45]">
            <span
              aria-hidden
              className={cn(
                "mt-[1px] size-1.5 shrink-0 rounded-full",
                l.state === "ok" ? "bg-good" : l.state === "warn" ? "bg-warn" : "bg-line-strong"
              )}
            />
            <span>
              <b className="font-semibold text-tk-onyx">{l.name}</b> <span className="text-ink-3">{l.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </footer>
  )
}
