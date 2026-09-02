import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { clearedLabel, type UnreadGroup, type UnreadSummary, type UnreadTone } from "@/lib/unread"

/**
 * "Did something arrive that I haven't seen?" — answered at the top of the
 * dashboard's left column, in two numbers and an age. The tiles stack, one
 * per row, so the card fits the narrow column without squeezing the numbers.
 *
 * The card is built to be read peripherally, which is why it is *silent* when
 * nothing is waiting: at zero it collapses to a single line and drops all
 * colour, so the loud state is unmissable by contrast. A zero tile keeps its
 * place and goes flat rather than disappearing — the geometry never moves, so
 * the eye only ever learns one shape.
 */

const TONE: Record<UnreadTone, string> = {
  clear: "text-tk-slate/40 bg-[#FBFAF6] border-tk-slate/10",
  lead: "text-tk-teal bg-tk-teal/[0.045] border-tk-teal/25",
  warn: "text-[#8A5A05] bg-[#8A5A05]/[0.05] border-[#8A5A05]/25",
  bad: "text-[#A62228] bg-[#A62228]/[0.05] border-[#A62228]/25",
}

function Dot({ clear }: { clear: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-[7px] shrink-0 rounded-full",
        clear ? "ring-[1.5px] ring-inset ring-current" : "bg-current"
      )}
    />
  )
}

/**
 * Two layouts, not one responsive compromise. Narrow screens stack — label,
 * number, one folded state line. From `md` up the number moves *beside* the
 * text instead of above it, which is what keeps the card short: the same four
 * pieces of information in two rows of height rather than four.
 */
function Tile({ label, group }: { label: string; group: UnreadGroup }) {
  const clear = group.tone === "clear"
  return (
    <Link
      href={group.href}
      aria-label={`${label}: ${group.count} unread — ${group.state}. ${group.detail}`}
      className={cn(
        "relative block overflow-hidden rounded-xl border pl-[18px] pr-4 pt-[9px] pb-[10px] md:py-[11px]",
        "transition-colors duration-150 hover:brightness-[0.985] motion-reduce:transition-none",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-teal",
        TONE[group.tone]
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] bg-current",
          clear ? "opacity-30" : "opacity-90"
        )}
      />

      {/* Narrow: stacked. */}
      <span className="block md:hidden">
        <span className="flex items-center gap-[7px] text-[9.5px] font-bold uppercase tracking-[0.11em]">
          <Dot clear={clear} />
          {label}
        </span>
        <span
          className={cn(
            "mt-[3px] block text-[29px] leading-[1.05] tabular-nums tracking-[-0.03em]",
            clear ? "font-normal" : "font-semibold"
          )}
        >
          {group.count}
        </span>
        <span className="block text-[11.5px] font-semibold">{group.shortState}</span>
      </span>

      {/* md and up: number on the left, two lines beside it. Label and state
          share the first line — they read as one phrase anyway ("LEADS · new
          enquiries"), and splitting them cost a third of the card's height. */}
      <span className="hidden items-center gap-3.5 md:flex">
        <span
          className={cn(
            "text-[32px] leading-none tabular-nums tracking-[-0.03em]",
            clear ? "font-normal" : "font-semibold"
          )}
        >
          {group.count}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-[7px]">
            <Dot clear={clear} />
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.11em]">
              {label}
            </span>
            <span aria-hidden className="shrink-0 opacity-40">
              ·
            </span>
            <span className="truncate text-[12.5px] font-semibold">{group.state}</span>
          </span>
          {/* Indented past the dot so it lines up with the label, not the bullet. */}
          <span className="mt-px block truncate pl-[14px] text-[11.5px] font-normal text-tk-slate/60">
            {group.detail}
          </span>
        </span>
      </span>
    </Link>
  )
}

function ClearLine({ summary }: { summary: UnreadSummary }) {
  const cleared = clearedLabel(summary.clearedAt)
  const reply = summary.needsReply
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-tk-slate/60 md:gap-[9px] md:text-[13px]">
      <span
        aria-hidden
        className="grid size-[15px] shrink-0 place-items-center rounded-full bg-tk-teal/10 text-tk-teal md:size-4"
      >
        <Check className="size-2.5" strokeWidth={3} />
      </span>
      <span className="md:hidden">
        Nothing new{reply > 0 ? ` · ${reply} to reply to` : ""}
      </span>
      <span className="hidden md:inline">
        Nothing new{cleared ? ` since you last cleared the inbox, ${cleared}` : ""}.
        {reply > 0
          ? ` ${reply} ${reply === 1 ? "item is" : "items are"} still waiting on a reply from you.`
          : ""}
      </span>
    </span>
  )
}

export function Unread({ summary }: { summary: UnreadSummary }) {
  // Before migration 0027 there is no triage state to read — say nothing
  // rather than claim a confident zero.
  if (!summary.ready) return null

  const quiet = summary.total === 0

  return (
    <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      {/* Desktop keeps the bordered card header the rest of the dashboard uses,
          and hangs the quiet extras off it rather than giving them a row. */}
      <div className="hidden items-center justify-between gap-3 border-b border-tk-slate/10 px-5 py-2.5 md:flex">
        <h2 className="text-sm font-semibold text-tk-onyx">Unread</h2>
        <span className="flex min-w-0 items-center gap-2.5 text-xs">
          {summary.otherCount > 0 ? (
            <span className="truncate text-tk-slate/60">
              also {summary.otherLabel}
            </span>
          ) : null}
          <Link
            href={ROUTES.inbox}
            className="shrink-0 font-semibold text-tk-teal hover:underline"
          >
            Inbox →
          </Link>
        </span>
      </div>

      <div
        className={cn(
          "px-3 pb-[11px] pt-2.5 md:px-5",
          quiet ? "md:py-3" : "md:py-3"
        )}
      >
        {/* Mobile trades the header bar for a borderless eyebrow row — same
            name, same link, ~24px cheaper above the fold. */}
        <div
          className={cn(
            "flex justify-between gap-2.5 md:hidden",
            quiet ? "items-center" : "mb-2 items-baseline"
          )}
        >
          {quiet ? (
            <ClearLine summary={summary} />
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tk-slate/50">
              Unread
            </span>
          )}
          <Link
            href={ROUTES.inbox}
            className="shrink-0 text-[11.5px] font-semibold text-tk-teal hover:underline"
          >
            Inbox →
          </Link>
        </div>

        {quiet ? (
          <div className="hidden md:block">
            <ClearLine summary={summary} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-[9px] md:gap-3">
              <Tile label="Leads" group={summary.leads} />
              <Tile label="Tickets" group={summary.tickets} />
            </div>
            {summary.otherCount > 0 ? (
              <div className="mt-[9px] border-t border-tk-slate/10 pt-2 text-[11px] text-tk-slate/60 md:hidden">
                Also {summary.otherLabel}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
