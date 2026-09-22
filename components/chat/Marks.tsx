import { Sparkles, Terminal, Wrench } from "lucide-react"
import { cn } from "@/lib/cn"
import { monogram } from "@/lib/chat/desk-context"
import { PERSONAS } from "@/lib/chat/personas"

/**
 * Who a row is from, drawn as a mark in the ledger's gutter.
 *
 * Karol on the well, a desk on onyx with its monogram, a skill on the accent
 * tint, the solver and the plain assistant on onyx with an icon. Never a
 * robot glyph: the gutter says who spoke, not what species.
 */
export type Speaker =
  | { kind: "karol" }
  | { kind: "handed"; text: string }
  | { kind: "desk"; text: string }
  | { kind: "skill" }
  | { kind: "solver" }
  | { kind: "assistant" }

/**
 * A user row is Karol unless a desk handed it over (route_to stores the
 * brief under the desk's NAME). A reply carries what the worker labelled it:
 * `/command`, "Solver", a desk's LABEL, or "Assistant".
 */
export function speakerFor(role: "user" | "assistant" | "system" | "tool", agent: string): Speaker {
  const who = agent.trim()
  if (role === "user") {
    if (!who || who === "Karol") return { kind: "karol" }
    return { kind: "handed", text: monogram(who) }
  }
  if (who.startsWith("/")) return { kind: "skill" }
  if (who === "Solver") return { kind: "solver" }
  if (!who || who === "Assistant") return { kind: "assistant" }
  const desk = Object.values(PERSONAS).find((p) => p.label === who || p.name === who)
  return { kind: "desk", text: desk ? monogram(desk.name) : who.slice(0, 2).toUpperCase() }
}

export function deskSpeaker(name: string): Speaker {
  return { kind: "desk", text: monogram(name) }
}

const SIZE = {
  sm: "size-[18px] text-[8px]",
  md: "size-[26px] text-[9.5px]",
  lg: "size-[34px] text-[11px]",
} as const

const ICON = { sm: "size-[9px]", md: "size-3", lg: "size-4" } as const

export function Mark({
  speaker,
  size = "md",
  className,
}: {
  speaker: Speaker
  size?: keyof typeof SIZE
  className?: string
}) {
  const base = cn(
    "relative inline-grid shrink-0 place-items-center rounded-full font-ui font-extrabold tracking-[0.02em]",
    SIZE[size],
    className
  )
  switch (speaker.kind) {
    case "karol":
      return (
        <span className={cn(base, "bg-well text-tk-onyx ring-1 ring-line-strong")} aria-hidden>
          K
        </span>
      )
    case "handed":
      return (
        <span className={cn(base, "bg-card text-ink-2 ring-1 ring-line-strong")} aria-hidden>
          {speaker.text}
        </span>
      )
    case "desk":
      return (
        <span className={cn(base, "bg-rail text-[--rail-active-icon]")} aria-hidden>
          {speaker.text}
        </span>
      )
    case "skill":
      return (
        <span className={cn(base, "bg-accent-soft text-accent-ink")} aria-hidden>
          <Terminal className={ICON[size]} />
        </span>
      )
    case "solver":
      return (
        <span className={cn(base, "bg-rail text-[--rail-active-icon]")} aria-hidden>
          <Wrench className={ICON[size]} />
        </span>
      )
    default:
      return (
        <span className={cn(base, "bg-rail text-[--rail-active-icon]")} aria-hidden>
          <Sparkles className={ICON[size]} />
        </span>
      )
  }
}
