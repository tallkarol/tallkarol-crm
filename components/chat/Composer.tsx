"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, Lock, Sparkles, Wrench } from "lucide-react"
import { cn } from "@/lib/cn"
import { type LadderPick } from "@/lib/chat/models"
import { DESKS, type PersonaSpec } from "@/lib/chat/personas"
import { COMMAND_DOCS, firstBlank, type SkillDoc } from "@/lib/chat/skills"
import { Dropdown, MenuHead, MenuLabel, MenuOption, MenuRule } from "@/components/ui/Dropdown"
import { deskSpeaker, Mark } from "@/components/chat/Marks"
import { onCompose } from "@/components/chat/compose-bus"
import { LadderPicker } from "@/components/chat/LadderPicker"
import { AttachmentTray, useAttachments } from "@/components/chat/useAttachments"

/** Who a send goes to, as the chip on the left of the box says it. */
export type Addressee = {
  /** The desk's key (`client-manager`), or null for the plain assistant. */
  name: string | null
  label: string
  /** The pinned pack's slug — `mineralife`, `momentum`, `me` — or null. */
  pack: string | null
  private: boolean
  /** The task a solve thread is bound to. */
  task: string | null
}

/**
 * The box, docked to the column and addressed.
 *
 * The chip on the left says who answers — the desk and the pack the thread
 * is pinned to, the task it solves, or the plain assistant — and picking a
 * desk from it types the `@name` for you, the same address the header says
 * switches desks. Enter sends, Shift+Enter breaks a line, a leading `/`
 * opens the palette over the hive mind's commands, ⌘V or a drop attaches a
 * screenshot. Picking a command drops its first form into the box with its
 * blank selected, so "/clock in <client>" is two keystrokes and a name.
 *
 * `launch` is the same box, raised and roomier, for a thread that has not
 * started. The sidebar and the launcher's starters reach the box through
 * the compose bus rather than through props — see compose-bus.ts.
 */
export function Composer({
  onSend,
  busy,
  error,
  autoFocus,
  addressee,
  variant = "docked",
}: {
  /** Resolves true when the message was accepted; the box and the tray clear only then. */
  onSend: (text: string, ladder?: LadderPick, attachmentIds?: string[]) => Promise<boolean> | boolean | void
  busy: boolean
  error: string | null
  autoFocus?: boolean
  addressee: Addressee
  variant?: "docked" | "launch"
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
  const launch = variant === "launch"

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
   * Address the box. A desk that is not the thread's gets `@name` typed in,
   * with the pack blank the desk needs; the thread's own desk, or the plain
   * assistant, just drops any address already typed.
   */
  function address(desk: PersonaSpec | null) {
    const rest = text.replace(/^@[a-z][a-z0-9-]*\s*/i, "")
    if (!desk || desk.name === addressee.name) {
      insert(rest)
      return
    }
    const blank =
      desk.pack === "client" ? "[client] " : desk.pack === "product" ? "[product] " : desk.pack === "me" ? "me " : ""
    insert(`@${desk.name} ${blank}${rest}`)
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
    <div
      className={cn(
        "relative shrink-0",
        launch ? "" : "border-t border-line bg-card px-4 pb-2.5 pt-3 sm:px-6"
      )}
    >
      <div className={cn("relative", launch ? "" : "max-w-[52rem]")}>
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

        <div
          {...images.dropZone}
          className={cn(
            "flex flex-col border transition-colors focus-within:border-line-strong",
            launch ? "rounded-2xl bg-card shadow-card" : "rounded-xl bg-well focus-within:bg-card",
            images.dragging ? "border-accent-ink" : "border-line"
          )}
        >
          <AttachmentTray items={images.items} onRemove={images.remove} />
          <div
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)] items-end gap-1.5 pr-1.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]",
              launch ? "pb-2 pl-2.5 pt-2" : "pb-1.5 pl-2 pt-1.5"
            )}
          >
            <div className="pb-0.5">
              <AddressChip addressee={addressee} onPick={address} />
            </div>
            <textarea
              ref={box}
              rows={1}
              value={text}
              placeholder={
                addressee.task
                  ? "Say what to try next…"
                  : launch
                    ? "What are we doing? Ask, run a /skill, or @ a desk"
                    : "Ask, run, or log… / for skills"
              }
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
              className={cn(
                "block max-h-[220px] min-w-0 flex-1 resize-none bg-transparent px-1.5 leading-[1.5] text-tk-onyx outline-none placeholder:text-ink-3",
                launch ? "min-h-[36px] py-1.5 text-[15px]" : "min-h-[30px] py-1 text-[14px]"
              )}
            />
            <div className="col-span-2 flex items-center justify-end gap-1.5 sm:contents">
              <button
                type="button"
                title="Skills"
                aria-label="Skills"
                onClick={() => insert(text.startsWith("/") ? text : `/${text}`)}
                className="grid size-7 shrink-0 place-items-center rounded-md font-mono text-[13px] font-semibold text-ink-3 hover:bg-card hover:text-accent-ink"
              >
                /
              </button>
              <LadderPicker value={ladder} onChange={setLadder} />
              <button
                type="button"
                onClick={submit}
                disabled={blocked || empty}
                aria-label="Send"
                className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-accent text-on-accent outline-accent-ink transition-transform hover:-translate-y-px disabled:translate-y-0 disabled:opacity-35 motion-reduce:transition-none"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <p className="mt-1.5 hidden items-center gap-x-3 px-1 font-ui text-[11px] font-medium text-ink-3 sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <Kbd>↵</Kbd> send
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>⇧↵</Kbd> newline
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>/</Kbd> skills
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>@</Kbd> desk
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Kbd>⌘V</Kbd> screenshot
          </span>
          <span className="ml-auto">Reads answer now. Writes wait for you.</span>
        </p>
      </div>
    </div>
  )
}

/**
 * Who answers. The thread's desk and pack when it has one; the task when it
 * solves; the assistant otherwise. Opens to the roster — picking a desk
 * addresses the box rather than the thread, because the thread is addressed
 * by what gets sent.
 */
function AddressChip({
  addressee,
  onPick,
}: {
  addressee: Addressee
  onPick: (desk: PersonaSpec | null) => void
}) {
  const label = addressee.task ? (
    <>
      <Mark speaker={{ kind: "solver" }} size="sm" />
      <span className="max-w-[9rem] truncate font-mono font-medium">solve · {addressee.task}</span>
    </>
  ) : addressee.name ? (
    <>
      <Mark speaker={deskSpeaker(addressee.name)} size="sm" />
      <span className="max-w-[11rem] truncate font-mono font-medium">
        {addressee.name}
        {addressee.pack ? ` · ${addressee.pack}` : ""}
      </span>
      {addressee.private ? <Lock className="size-3 text-ink-3" aria-label="Private" /> : null}
    </>
  ) : (
    <>
      <Sparkles className="size-3 text-accent-ink" aria-hidden />
      <span className="font-mono font-medium">assistant</span>
    </>
  )

  return (
    <Dropdown
      variant="chip"
      placement="up"
      align="left"
      title={
        addressee.task
          ? "This thread solves a task. Every send runs on the task ladder."
          : addressee.name
            ? `Addressed to ${addressee.label}. Pick another desk to switch.`
            : "The plain assistant. Pick a desk to address it."
      }
      label={<span className="inline-flex items-center gap-1.5">{label}</span>}
    >
      {(close) => (
        <>
          <MenuHead>Address to</MenuHead>
          <MenuOption
            checked={!addressee.name && !addressee.task}
            label="Assistant"
            count="reads and writes"
            onSelect={() => {
              onPick(null)
              close()
            }}
          />
          <MenuRule />
          <MenuLabel>Desks</MenuLabel>
          {DESKS.map((desk) => (
            <MenuOption
              key={desk.name}
              checked={addressee.name === desk.name}
              label={desk.label}
              count={
                desk.pack === "client"
                  ? "client"
                  : desk.pack === "product"
                    ? "product"
                    : desk.pack === "me"
                      ? "private"
                      : ""
              }
              onSelect={() => {
                onPick(desk)
                close()
              }}
            />
          ))}
        </>
      )}
    </Dropdown>
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
