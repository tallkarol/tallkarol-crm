"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp } from "lucide-react"
import { cn } from "@/lib/cn"
import { type LadderPick } from "@/lib/chat/models"
import { COMMAND_DOCS, firstBlank, type SkillDoc } from "@/lib/chat/skills"
import { Card } from "@/components/ui/Card"
import { onCompose } from "@/components/chat/compose-bus"
import { LadderPicker } from "@/components/chat/LadderPicker"
import { AttachmentTray, useAttachments } from "@/components/chat/useAttachments"

/**
 * The box.
 *
 * Enter sends, Shift+Enter breaks a line, and a leading `/` opens the
 * palette over the hive mind's commands. ⌘V with a screenshot on the
 * clipboard (or a drop) attaches it; a message may be only pictures. Picking one drops that command's
 * first form into the box with its blank selected, so "/clock in <client>"
 * is two keystrokes and a client name.
 *
 * The sidebar and the empty-thread starters reach the box through the
 * compose bus rather than through props — see compose-bus.ts.
 */
export function Composer({
  onSend,
  busy,
  error,
  autoFocus,
}: {
  /** Resolves true when the message was accepted; the box and the tray clear only then. */
  onSend: (text: string, ladder?: LadderPick, attachmentIds?: string[]) => Promise<boolean> | boolean | void
  busy: boolean
  error: string | null
  autoFocus?: boolean
}) {
  const [text, setText] = useState("")
  const [selected, setSelected] = useState(0)
  /** What the box held when Escape closed the palette; typing on reopens it. */
  const [dismissed, setDismissed] = useState<string | null>(null)
  /** Auto until Karol picks. Refresh or a new thread remounts this and resets. */
  const [ladder, setLadder] = useState<LadderPick>("auto")
  const box = useRef<HTMLTextAreaElement>(null)
  const images = useAttachments()
  const blocked = busy || images.uploading || images.failed
  const empty = !text.trim() && images.readyIds.length === 0

  const palette = dismissed === text ? null : paletteFor(text)
  const open = palette !== null

  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  useEffect(() => {
    if (autoFocus) box.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    return onCompose((request) => {
      if (request.send) {
        // A rail form or a starter sends with whatever is in the tray — it
        // used to send without the ids and leave the pictures stranded.
        const ids = images.readyIds
        void Promise.resolve(onSend(request.text, ladder, ids)).then((ok) => {
          if (ok !== false) images.clear()
        })
        return
      }
      insert(request.text)
    })
    // onSend is stable enough: the parent re-creates it only with the thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSend, ladder, images.readyIds])

  function insert(value: string) {
    setText(value)
    setSelected(0)
    requestAnimationFrame(() => {
      const el = box.current
      if (!el) return
      el.focus()
      const blank = firstBlank(value)
      if (blank) el.setSelectionRange(blank.start, blank.end)
      else el.setSelectionRange(value.length, value.length)
    })
  }

  function pick(doc: SkillDoc) {
    const first = doc.forms[0]
    insert(first ? first.text : `${doc.label} `)
  }

  /**
   * Clear only once the CRM has the message. A refused send — a session that
   * expired, a screenshot that was swept — used to cost the text and the
   * tray both; now they stay put under the error, ready to send again.
   */
  function submit() {
    if (empty || blocked) return
    const ids = images.readyIds
    const body = text.trim()
    void Promise.resolve(onSend(body, ladder, ids)).then((ok) => {
      if (ok === false) return
      setText("")
      images.clear()
    })
  }

  return (
    <div className="relative shrink-0 px-4 pb-3 pt-1.5 before:pointer-events-none before:absolute before:inset-x-0 before:-top-7 before:h-7 before:bg-gradient-to-b before:from-transparent before:to-canvas before:content-[''] sm:px-7">
      <div className="relative mx-auto max-w-[47.5rem]">
        {error ? (
          <p className="mb-2 rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">{error}</p>
        ) : null}

        {open ? (
          <div
            role="listbox"
            aria-label="Skills"
            className="absolute inset-x-0 bottom-[calc(100%+8px)] z-20 max-h-80 overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-overlay"
          >
            <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1.5 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
              Skills
              <span className="font-medium normal-case tracking-normal">↑↓ then ↵ or Tab</span>
            </div>
            {palette.length === 0 ? (
              <p className="px-2.5 py-3 text-xs text-ink-3">
                No skill starts with “{text.trim()}”. Send it anyway and the
                assistant will say what it can do.
              </p>
            ) : (
              palette.map((doc, i) => (
                <button
                  key={doc.id}
                  type="button"
                  role="option"
                  aria-selected={i === selected}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => pick(doc)}
                  className={cn(
                    "grid w-full grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                    i === selected && "bg-accent-soft"
                  )}
                >
                  <span className="font-mono text-[12.5px] font-semibold text-accent-ink">
                    {doc.label}
                  </span>
                  <span className="truncate text-xs text-ink-2">{doc.tagline}</span>
                  <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                    {doc.lane}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}

        <Card
          radius="2xl"
          elevation="none"
          {...images.dropZone}
          className={cn(
            "relative shadow-hover transition-colors focus-within:border-line-strong",
            images.dragging && "border-accent-ink"
          )}
        >
          <AttachmentTray items={images.items} onRemove={images.remove} />
          <textarea
            ref={box}
            rows={1}
            value={text}
            placeholder="Ask, run, or log something… type / for skills"
            aria-label="Message"
            onPaste={images.onPaste}
            onChange={(e) => {
              setText(e.target.value)
              setSelected(0)
            }}
            onKeyDown={(e) => {
              if (open && palette.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setSelected((s) => Math.min(s + 1, palette.length - 1))
                  return
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setSelected((s) => Math.max(s - 1, 0))
                  return
                }
                if (e.key === "Tab" || e.key === "Enter") {
                  e.preventDefault()
                  pick(palette[selected] ?? palette[0])
                  return
                }
              }
              if (e.key === "Escape" && open) {
                setDismissed(text)
                return
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            className="block max-h-[220px] min-h-[50px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[14.5px] leading-[1.5] text-tk-onyx outline-none placeholder:text-ink-3"
          />
          <div className="flex items-center gap-0.5 px-2 pb-2 pt-1">
            <button
              type="button"
              title="Skills"
              onClick={() => insert(text.startsWith("/") ? text : `/${text}`)}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-lg pl-[7px] pr-[9px] font-ui text-xs font-semibold text-ink-3 hover:bg-well hover:text-tk-onyx"
            >
              <span className="grid size-4 place-items-center rounded border border-line font-mono text-xs text-accent-ink">
                /
              </span>
              Skills
            </button>
            <LadderPicker value={ladder} onChange={setLadder} />
            <button
              type="button"
              onClick={submit}
              disabled={blocked || empty}
              aria-label="Send"
              className="ml-1.5 grid size-8 place-items-center rounded-[10px] bg-accent text-on-accent outline-accent-ink transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-35 motion-reduce:transition-none"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </Card>

        <p className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 px-1 text-[11px] text-ink-3">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↵</Kbd> send <Kbd>⇧↵</Kbd> newline <Kbd>/</Kbd> skills <Kbd>⌘V</Kbd> screenshot
          </span>
        </p>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-line px-1.5 py-0.5 font-ui text-[10px] font-semibold text-ink-3">
      {children}
    </kbd>
  )
}

/**
 * The palette shows while the box holds a lone `/word` — once a space
 * follows the command the arguments are being typed and it gets out of
 * the way. Null means closed.
 */
function paletteFor(text: string): SkillDoc[] | null {
  if (!text.startsWith("/") || /^\/\S*\s/.test(text)) return null
  const q = text.slice(1).toLowerCase()
  // A name prefix always matches. The tagline only joins in once the query
  // is a word, at word starts — "/le" is lessons and leftoff, not every
  // tagline with "le" somewhere inside it.
  const words = q.length >= 3 ? new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : null
  return COMMAND_DOCS.filter(
    (doc) => doc.name.startsWith(q) || (words !== null && words.test(doc.tagline.toLowerCase()))
  )
}
