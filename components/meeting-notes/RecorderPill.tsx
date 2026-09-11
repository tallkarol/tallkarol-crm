import type { WorkerStatus } from "@/lib/chat/worker-status"
import { cn } from "@/lib/cn"

/** The meeting worker's heartbeat, as the chat page shows its own. */
export function RecorderPill({ status, compact = false }: { status: WorkerStatus; compact?: boolean }) {
  const seen = status.secondsAgo
  const when =
    status.online
      ? "online"
      : seen == null
        ? "never seen"
        : seen < 3600
          ? `last seen ${Math.max(1, Math.round(seen / 60))} min ago`
          : seen < 86_400
            ? `last seen ${Math.round(seen / 3600)} h ago`
            : `last seen ${Math.round(seen / 86_400)} d ago`
  return (
    <span
      className="inline-flex h-7 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-card pl-2 pr-2.5 text-[11px] font-semibold text-tk-slate"
      title={status.name ? `Recorder ${status.name}` : "No recorder has ever checked in"}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", status.online ? "bg-good ring-[3px] ring-good-soft" : "bg-warn ring-[3px] ring-warn-soft")}
      />
      {compact ? null : "Recorder"}
      <span className="font-mono text-[10.5px] font-medium text-ink-3">
        {status.name || "—"}
        {" · "}
        {when}
      </span>
    </span>
  )
}
