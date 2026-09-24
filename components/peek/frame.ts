/**
 * What the server-rendered PeekShell and the instant frame (PeekPending) have
 * in common, so the frame that opens on click is the card's own frame and the
 * swap to the real card is invisible. Plain module — imported from both a
 * server and a client component.
 */
export const PEEK_FRAME = {
  backdrop: "absolute inset-0 bg-scrim backdrop-blur-[2px] motion-safe:animate-[tk-fade-in_.18s_ease-out]",
  panel:
    "absolute inset-y-0 right-0 flex w-full max-w-[30rem] flex-col bg-card shadow-overlay motion-safe:animate-[tk-peek-in_.22s_ease-out] sm:my-3 sm:mr-3 sm:rounded-2xl sm:border sm:border-line",
  header: "flex items-center justify-between gap-3 border-b border-line px-6 py-3.5",
  eyebrow: "text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3",
  close:
    "flex size-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx",
} as const

/** `task:abc` → { type: "task", id: "abc" }. */
export function parsePeek(peek: string) {
  const idx = peek.indexOf(":")
  return {
    type: idx === -1 ? peek : peek.slice(0, idx),
    id: idx === -1 ? "" : decodeURIComponent(peek.slice(idx + 1)),
  }
}

/** The card's eyebrow, by type — PeekRouter's cases and the instant frame both read it. */
export function peekEyebrow(type: string, id: string): string {
  switch (type) {
    case "invoice":
      return `Invoice · ${id}`
    case "task":
      return "Task"
    case "deliverable":
      return "Deliverable"
    case "app":
      return "App health"
    case "site":
      return "Site uptime"
    case "project":
      return "Project"
    case "punchlist":
      return "Punch list"
    case "run":
      return "Test run"
    case "session":
      return "Agent session"
    default:
      return "Not found"
  }
}
