import Link from "next/link"
import type { ReactNode } from "react"
import { TicketQueue, type QueueInitial } from "@/components/support/TicketQueue"
import type { QueueRow } from "@/components/support/types"
import { ROUTES } from "@/lib/nav"

/**
 * List left, ticket right. Below xl the detail becomes a slide-over so the
 * queue keeps the full width — same trick the peek cards use.
 */
export function SupportConsole({
  rows,
  initial,
  selected,
  query,
  detail,
}: {
  rows: QueueRow[]
  initial: QueueInitial
  selected: string | null
  query: string
  detail: ReactNode
}) {
  const closeHref = query ? `${ROUTES.support}?${query}` : ROUTES.support

  return (
    <div className="mt-5 flex h-[calc(100dvh-11.5rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm md:h-[calc(100dvh-9rem)]">
      <TicketQueue rows={rows} selected={selected} initial={initial} />

      {detail ? (
        <>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close ticket"
            className="fixed inset-0 z-[60] bg-tk-onyx/30 backdrop-blur-[2px] xl:hidden"
          />
          <aside className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[32rem] flex-col bg-white shadow-2xl motion-safe:animate-[tk-peek-in_.2s_ease-out] xl:static xl:z-auto xl:w-[27.5rem] xl:max-w-none xl:shrink-0 xl:animate-none xl:border-l xl:border-tk-slate/10 xl:shadow-none">
            {detail}
          </aside>
        </>
      ) : (
        <aside className="hidden w-[27.5rem] shrink-0 flex-col items-center justify-center border-l border-tk-slate/10 px-8 text-center xl:flex">
          <h2 className="text-sm font-semibold text-tk-slate/70">Pick a ticket</h2>
          <p className="mt-1.5 max-w-[26ch] text-[13px] text-tk-slate/50">
            It opens at <code className="rounded bg-tk-linen px-1 py-0.5 text-[11px]">/support/&lt;number&gt;</code>{" "}
            — a real URL you can send yourself.
          </p>
          <dl className="mt-5 grid gap-1.5 text-left">
            <Shortcut keys={["/"]}>jump to search</Shortcut>
            <Shortcut keys={["J", "K"]}>move down / up the queue</Shortcut>
            <Shortcut keys={["↵"]}>open the highlighted ticket</Shortcut>
            <Shortcut keys={["C"]}>copy the first payload</Shortcut>
            <Shortcut keys={["Esc"]}>back to the list</Shortcut>
          </dl>
        </aside>
      )}
    </div>
  )
}

function Shortcut({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-tk-slate/60">
      <dt className="flex gap-1">
        {keys.map((k) => (
          <kbd
            key={k}
            className="min-w-5 rounded border border-tk-slate/20 bg-tk-linen px-1.5 text-center font-mono text-[10.5px] text-tk-slate"
          >
            {k}
          </kbd>
        ))}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}
