"use client"

import { Fragment, useState, type ReactNode } from "react"
import { CornerDownLeft, Diamond, Eye, Play, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/cn"
import { SKILL_DOCS, SKILL_LANES, type SkillDoc } from "@/lib/chat/skills"
import { requestCompose } from "@/components/chat/compose-bus"
import { useChatFrame } from "@/components/chat/ChatFrame"

/**
 * The hive mind, as a list you can act from.
 *
 * Grouped by lane in the order a request moves through them. A row opens to
 * what the thing is (from the scan) and what to type (from lib/chat/skills):
 * a form with a blank drops into the composer with the blank selected, a form
 * with no blank sends as it is. So the documentation IS the launcher.
 */
export function SkillsDocs({ query }: { query: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const { setOpen: setDrawer } = useChatFrame()

  const q = query.trim().toLowerCase()
  const matches = (doc: SkillDoc) =>
    !q ||
    `${doc.label} ${doc.tagline} ${doc.blurb} ${doc.hint}`.toLowerCase().includes(q)

  function use(text: string, run: boolean) {
    requestCompose({ text, send: run })
    setDrawer(false)
  }

  const lanes = SKILL_LANES.map((lane) => ({
    ...lane,
    docs: SKILL_DOCS.filter((d) => d.laneId === lane.id && matches(d)),
  })).filter((lane) => lane.docs.length > 0)

  return (
    <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2.5">
      {lanes.length === 0 ? (
        <p className="px-2 pt-3 text-[12px] text-ink-3">
          Nothing matches. Try a verb: log, audit, invoice, review.
        </p>
      ) : null}

      {lanes.map((lane) => (
        <Fragment key={lane.id}>
          <div
            className="flex items-center gap-2 px-2 pb-1 pt-3 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3"
            title={lane.blurb}
          >
            {lane.label}
            <span className="ml-auto font-semibold tracking-normal opacity-80">
              {lane.docs.length}
            </span>
          </div>

          {lane.docs.map((doc) => {
            const open = openId === doc.id
            return (
              <div
                key={doc.id}
                className={cn("mb-px rounded-[10px]", open && "bg-well ring-1 ring-line")}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : doc.id)}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] px-[9px] py-[7px] text-left",
                    !open && "hover:bg-well"
                  )}
                >
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-[12.5px] font-semibold tracking-[-0.01em]",
                        doc.kind === "command" && "font-mono text-accent-ink",
                        doc.kind === "skill" && "font-ui text-tk-onyx",
                        doc.kind === "agent" && "font-mono text-ink-2"
                      )}
                    >
                      {doc.kind === "skill" ? (
                        <Diamond className="size-3 text-ink-3" aria-hidden />
                      ) : null}
                      {doc.label}
                    </span>
                    <span className="block text-[11.5px] leading-[1.35] text-ink-3">
                      {doc.tagline}
                    </span>
                  </span>
                  {doc.kind !== "command" ? (
                    <span className="rounded-[5px] border border-line px-[5px] py-[2px] font-ui text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                      {doc.kind}
                    </span>
                  ) : null}
                </button>

                {open ? (
                  <div className="px-[9px] pb-2.5 pt-0.5">
                    {doc.blurb && doc.blurb !== doc.tagline ? (
                      <p className="mb-2 text-xs leading-[1.5] text-ink-2">{doc.blurb}</p>
                    ) : null}

                    {doc.hint ? (
                      <p className="mb-2 font-mono text-[10.5px] leading-[1.5] text-ink-3 [overflow-wrap:anywhere]">
                        {doc.hint}
                      </p>
                    ) : null}

                    {doc.forms.length ? (
                      <div className="flex flex-col gap-1">
                        {doc.forms.map((form) => (
                          <button
                            key={form.text}
                            type="button"
                            onClick={() => use(form.text, !!form.run)}
                            className="flex w-full items-center gap-2 rounded-lg border border-line bg-card px-2 py-[5px] text-left font-mono text-[11.5px] tracking-[-0.01em] text-tk-onyx hover:border-line-strong"
                          >
                            <span className="min-w-0 [overflow-wrap:anywhere]">
                              <FormText text={form.text} />
                            </span>
                            <span
                              className={cn(
                                "ml-auto inline-flex shrink-0 items-center gap-1 font-ui text-[9.5px] font-bold uppercase tracking-[0.06em]",
                                form.run ? "text-accent-ink" : "text-ink-3"
                              )}
                            >
                              {form.run ? (
                                <>
                                  Run <Play className="size-2.5" aria-hidden />
                                </>
                              ) : (
                                <>
                                  Insert <CornerDownLeft className="size-2.5" aria-hidden />
                                </>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {doc.gate ? (
                      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-[1.4] text-ink-3">
                        {doc.gate.kind === "read" ? (
                          <Eye className="mt-0.5 size-3 shrink-0 text-good" aria-hidden />
                        ) : (
                          <ShieldCheck className="mt-0.5 size-3 shrink-0 text-warn" aria-hidden />
                        )}
                        <span>{doc.gate.note}</span>
                      </p>
                    ) : null}

                    {doc.uses.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {doc.uses.map((u) => (
                          <span
                            key={u}
                            className="rounded-[5px] border border-line bg-card px-1.5 py-px font-mono text-[10.5px] text-ink-3"
                          >
                            {u}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}

/** `<blank>` and `[blank]` in a form read as the thing to fill in. */
export function FormText({ text }: { text: string }) {
  const parts = text.split(/(<[^>]+>|\[[^\]]+\])/g)
  const out: ReactNode[] = []
  parts.forEach((part, i) => {
    if (!part) return
    const blank = /^<[^>]+>$|^\[[^\]]+\]$/.test(part)
    out.push(
      blank ? (
        <span key={i} className="text-accent-ink">
          {part}
        </span>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    )
  })
  return <>{out}</>
}
