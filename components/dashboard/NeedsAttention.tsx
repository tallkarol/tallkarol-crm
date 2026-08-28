import Link from "next/link"
import { cn } from "@/lib/cn"

export type AttentionTone = "bad" | "warn" | "ok" | "neutral"

export type AttentionItem = {
  id: string
  href: string
  color: string
  title: string
  meta?: string
  detail?: string
  amount?: string
  tone: AttentionTone
}

export type AttentionGroup = {
  id: string
  label: string
  total?: string
  items: AttentionItem[]
}

const TONE: Record<AttentionTone, string> = {
  bad: "text-[#A62228]",
  warn: "text-amber-800",
  ok: "text-tk-teal",
  neutral: "text-tk-slate/55",
}

export function NeedsAttention({ groups }: { groups: AttentionGroup[] }) {
  const visible = groups.filter((group) => group.items.length > 0)
  const count = visible.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Needs attention</h2>
        {count > 0 ? (
          <span className="rounded-full bg-tk-linen px-2 py-0.5 text-[11px] font-semibold tabular-nums text-tk-slate/70">
            {count}
          </span>
        ) : null}
      </div>

      {count === 0 ? (
        <p className="border-t border-tk-slate/10 px-5 py-8 text-sm text-tk-slate/70">
          All clear — nothing waiting on you.
        </p>
      ) : (
        <div className="border-t border-tk-slate/10">
          {visible.map((group) => (
            <div key={group.id}>
              <div className="flex items-baseline justify-between gap-3 bg-tk-linen/55 px-5 py-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/50">
                  {group.label}
                  <span className="ml-1.5 tabular-nums text-tk-slate/35">
                    {group.items.length}
                  </span>
                </p>
                {group.total ? (
                  <p className="text-xs font-semibold tabular-nums text-tk-onyx">
                    {group.total}
                  </p>
                ) : null}
              </div>
              <ul className="divide-y divide-tk-slate/10">
                {group.items.map((item) => {
                  const meta = item.meta && item.meta !== item.title ? item.meta : undefined
                  const line = [meta, item.detail].filter(Boolean).join(" · ")
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        scroll={false}
                        className="flex items-stretch gap-3 px-5 py-3 transition-colors hover:bg-tk-linen/50"
                      >
                        <span
                          className="w-0.5 shrink-0 self-stretch rounded-full"
                          style={{ background: item.color }}
                          aria-hidden
                        />
                        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5">
                          <span className="min-w-0 truncate text-sm font-medium text-tk-onyx">
                            {item.title}
                          </span>
                          {item.amount ? (
                            <span className="text-sm font-semibold tabular-nums text-tk-onyx">
                              {item.amount}
                            </span>
                          ) : null}
                          {line ? (
                            <span
                              className={cn(
                                "col-span-2 min-w-0 truncate text-xs",
                                TONE[item.tone]
                              )}
                            >
                              {line}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
