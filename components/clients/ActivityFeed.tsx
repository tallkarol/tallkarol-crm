import type { ActivityItem } from "@/lib/client-hub"
import { cn } from "@/lib/cn"
import { ageLabel } from "@/lib/support"

/** The last things that happened on this client, newest first. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-3">Nothing yet.</p>
  }
  return (
    <ul className="relative m-0 list-none p-0 before:absolute before:bottom-2 before:left-[4px] before:top-2 before:w-px before:bg-line">
      {items.map((item) => (
        <li key={item.key} className="relative pb-3 pl-5 last:pb-0">
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-0 top-1.5 h-[9px] w-[9px] rounded-full border-2 bg-card",
              item.quiet ? "border-line-strong" : "border-tk-teal"
            )}
          />
          <p className="text-[12.5px] leading-snug text-ink-3">
            <span className="font-semibold text-tk-onyx">{item.title}</span>
            {item.sub ? <> — {item.sub}</> : null}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-3">{ageLabel(item.at)} ago</p>
        </li>
      ))}
    </ul>
  )
}
