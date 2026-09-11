import { CHART } from "@/lib/insights/chart"
import type { HourSlots } from "@/lib/usage/summary"

/**
 * Turns by hour of day over the window (Claude Code + Cursor + CRM chat —
 * all three are turns, so the unit is shared), with Claude Code output
 * tokens as a faint second series. Server-rendered SVG in the MiniBars
 * idiom; scaled against the busiest hour.
 */
export function HourBars({ slots, tz }: { slots: HourSlots; tz: string }) {
  const w = 480
  const h = 96
  const pad = 14
  const slot = (w - pad * 2) / 24
  const bw = Math.max(6, slot - 6)
  const total = slots.turns.reduce((a, b) => a + b, 0)
  const peak = Math.max(...slots.turns)
  const maxTurns = Math.max(peak, 1)
  const maxOut = Math.max(...slots.outputTokens, 1)
  const busiest = slots.turns.indexOf(peak)
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Turns by hour of day">
        <line x1={pad} y1={h - 16} x2={w - pad} y2={h - 16} stroke={CHART.axisLine} />
        {slots.turns.map((v, i) => {
          const x = pad + i * slot + (slot - bw) / 2
          const outH = (slots.outputTokens[i] / maxOut) * (h - 28)
          const turnH = (v / maxTurns) * (h - 28)
          return (
            <g key={i}>
              {outH > 0 ? (
                <rect x={x} y={h - 16 - outH} width={bw} height={outH} rx="2" fill={CHART.prev} opacity="0.55" />
              ) : null}
              {v > 0 ? (
                <rect x={x + bw * 0.25} y={h - 16 - Math.max(2, turnH)} width={bw * 0.5} height={Math.max(2, turnH)} rx="1.5" fill={CHART.teal} />
              ) : (
                <circle cx={x + bw / 2} cy={h - 19} r="1.2" fill={CHART.prev} />
              )}
              {i % 3 === 0 ? (
                <text x={x + bw / 2} y={h - 4} textAnchor="middle" fontSize="9" fill={CHART.axisText} fontFamily="var(--font-jakarta), system-ui">
                  {String(i).padStart(2, "0")}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <p className="mt-1 font-ui text-[10.5px] text-ink-3">
        Teal: turns · grey: Claude Code output tokens · {tz.replace("_", " ")} ·{" "}
        {total > 0 ? `busiest hour ${String(busiest).padStart(2, "0")}:00 with ${peak} ${peak === 1 ? "turn" : "turns"}` : "nothing yet"}
      </p>
    </div>
  )
}
