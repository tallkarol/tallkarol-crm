"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Check, ChevronDown, ExternalLink, Pencil, Undo2, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatClock, type ItemKind } from "@/lib/meeting-note"
import { dismissItemAction, fileItemsAction, restoreItemAction, updateItemAction } from "@/lib/meeting-note-actions"
import type { ItemView, NoteDetail } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"
import { useRouter } from "next/navigation"

const KIND_LABEL: Record<ItemKind, string> = { task: "Task", event: "Event", decision: "Decision", question: "Question", note: "Note" }

function dueLabel(dueOn: string | null): { text: string; soon: boolean } {
  if (!dueOn) return { text: "No date", soon: false }
  const day = new Date(`${dueOn}T12:00:00Z`)
  const today = new Date()
  const diff = Math.round((day.getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12)) / 86_400_000)
  const label = day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
  const rel = diff === 0 ? "today" : diff === 1 ? "tomorrow" : diff > 1 ? `in ${diff} days` : `${-diff} days ago`
  return { text: `Due ${label} · ${rel}`, soon: diff <= 2 }
}

function whenLabel(startsAt: string, endsAt: string): string {
  if (!startsAt) return "No time yet"
  if (startsAt.length === 10) return new Date(`${startsAt}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
  const [day, time] = startsAt.split("T")
  const d = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
  const [h, m] = time.split(":").map(Number)
  const clock = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
  let span = ""
  if (endsAt && endsAt.length === 16) {
    const [eh, em] = endsAt.slice(11).split(":").map(Number)
    span = ` · ${(eh - h) * 60 + (em - m)} min`
  }
  return `${d} · ${clock}${span}`
}

/**
 * Proposals until filed. Each proposed row has a checkbox; "File selected"
 * writes the checked ones (tasks to the board, events to the Remote
 * calendar). Dismissed rows stay, struck, with Restore. Titles, owners and
 * dates edit inline before filing; after filing, edit the task or the event.
 */
export function ItemsTable({ note }: { note: NoteDetail }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(note.itemRows.filter((i) => i.state === "proposed" && (i.kind === "task" || i.kind === "event")).map((i) => i.id))
  )
  const [open, setOpen] = useState<string | null>(null)
  const proposed = useMemo(() => note.itemRows.filter((i) => i.state === "proposed"), [note.itemRows])
  const filable = proposed.filter((i) => (i.kind === "task" || i.kind === "event") && selected.has(i.id))

  function refresh() {
    router.refresh()
  }

  function file(ids: string[]) {
    setError(null)
    start(async () => {
      const result = await fileItemsAction(note.id, ids)
      if (!result.ok) setError(result.error)
      else if (result.data.failed.length) setError(result.data.failed.map((f) => f.error).join(" · "))
      refresh()
    })
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!note.itemRows.length) {
    return (
      <section className="rounded-2xl border border-line bg-card shadow-card">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h3 className="text-[12.5px] font-bold text-tk-onyx">Action items</h3>
        </header>
        <p className="px-4 py-6 text-sm text-ink-3">
          {note.analysisStatus === "done" ? "The notes proposed nothing to do." : "Items appear once the notes are written."}
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card" aria-label="Action items">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h3 className="text-[12.5px] font-bold text-tk-onyx">Action items</h3>
        <span className="text-[11.5px] text-ink-3">Proposals. Nothing lands on the board or the calendar until you file it.</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => file(filable.map((i) => i.id))}
          disabled={busy || filable.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-tk-linen disabled:opacity-50"
        >
          <Check className="size-3.5" aria-hidden />
          {busy ? "Filing…" : `File selected (${filable.length})`}
        </button>
      </header>
      {error ? (
        <p role="status" className="border-b border-line bg-well px-4 py-2 text-xs text-tk-slate">
          {error}
        </p>
      ) : null}
      <ul>
        {note.itemRows.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            checked={selected.has(item.id)}
            open={open === item.id}
            busy={busy}
            onToggle={() => toggle(item.id)}
            onOpen={() => setOpen((v) => (v === item.id ? null : item.id))}
            onFile={() => file([item.id])}
            onDismiss={() =>
              start(async () => {
                const r = await dismissItemAction(item.id)
                if (!r.ok) setError(r.error)
                refresh()
              })
            }
            onRestore={() =>
              start(async () => {
                const r = await restoreItemAction(item.id)
                if (!r.ok) setError(r.error)
                refresh()
              })
            }
            onPatch={(patch) =>
              start(async () => {
                const r = await updateItemAction(item.id, patch)
                if (!r.ok) setError(r.error)
                refresh()
              })
            }
          />
        ))}
      </ul>
    </section>
  )
}

function ItemRow({
  item,
  checked,
  open,
  busy,
  onToggle,
  onOpen,
  onFile,
  onDismiss,
  onRestore,
  onPatch,
}: {
  item: ItemView
  checked: boolean
  open: boolean
  busy: boolean
  onToggle: () => void
  onOpen: () => void
  onFile: () => void
  onDismiss: () => void
  onRestore: () => void
  onPatch: (patch: { title?: string; owner?: string; dueOn?: string | null; startsAt?: string; endsAt?: string }) => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [editingWhen, setEditingWhen] = useState(false)
  const proposed = item.state === "proposed"
  const filable = item.kind === "task" || item.kind === "event"
  const dismissed = item.state === "dismissed"
  const accepted = item.state === "accepted"
  const due = dueLabel(item.dueOn)

  return (
    <li className={cn("border-b border-line last:border-0", open && "bg-well", dismissed && "opacity-55")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid sm:grid-cols-[28px_66px_minmax(0,1fr)_120px_170px_76px] sm:gap-2.5 sm:px-4">
        <span className="flex w-7 justify-center">
          {proposed && filable ? (
            <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${item.title}`} className="size-4" style={{ accentColor: "rgb(var(--accent-mark-rgb))" }} />
          ) : accepted ? (
            <Check className="size-4 text-good" aria-label="Filed" />
          ) : (
            <span className="size-4" />
          )}
        </span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide",
            item.kind === "task" && "border-tk-teal/40 text-tk-teal",
            item.kind === "event" && "border-amber-700/40 text-warn",
            item.kind !== "task" && item.kind !== "event" && "border-line text-ink-3"
          )}
        >
          {KIND_LABEL[item.kind]}
        </span>
        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
          {editingTitle && proposed ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setEditingTitle(false)
                if (title.trim() && title.trim() !== item.title) onPatch({ title })
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                if (e.key === "Escape") {
                  setTitle(item.title)
                  setEditingTitle(false)
                }
              }}
              aria-label="Item title"
              className="w-full rounded-lg border border-line bg-card px-2 py-1 text-[13px] text-tk-onyx focus:border-tk-teal"
            />
          ) : (
            <button
              type="button"
              onClick={() => proposed && setEditingTitle(true)}
              className={cn("group inline-flex max-w-full items-center gap-1.5 text-left text-[13px] font-medium text-tk-onyx", dismissed && "line-through", !proposed && "cursor-default")}
            >
              <span className="min-w-0 break-words">{item.title}</span>
              {proposed ? <Pencil className="size-3 shrink-0 text-ink-3 opacity-0 group-hover:opacity-100" aria-hidden /> : null}
            </button>
          )}
          {accepted && item.taskId ? (
            <Link href={ROUTES.task(item.taskId)} className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-tk-teal hover:underline">
              Task <ExternalLink className="size-3" aria-hidden />
            </Link>
          ) : null}
          {accepted && item.calendarUrl ? (
            <a href={item.calendarUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-tk-teal hover:underline">
              Calendar <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-tk-slate">
          <span className={cn("grid size-[18px] place-items-center rounded-full border border-line bg-well text-[9px] font-bold text-tk-slate", item.owner === "Karol" && "border-transparent bg-rail text-[var(--rail-active-icon)]")}>
            {(item.owner || "?").slice(0, 1).toUpperCase()}
          </span>
          {proposed ? (
            <input
              defaultValue={item.owner}
              onBlur={(e) => {
                if (e.target.value.trim() !== item.owner) onPatch({ owner: e.target.value })
              }}
              aria-label="Owner"
              placeholder="Owner"
              className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-[11.5px] font-semibold text-tk-slate hover:border-line focus:border-tk-teal focus:bg-card"
            />
          ) : (
            <span>{item.owner || "—"}</span>
          )}
        </span>
        <span className="text-[11.5px] text-tk-slate">
          {editingWhen && proposed ? (
            item.kind === "event" ? (
              <span className="flex flex-col gap-1">
                <input
                  type="datetime-local"
                  defaultValue={item.startsAt.length === 16 ? item.startsAt : ""}
                  onBlur={(e) => {
                    setEditingWhen(false)
                    if (e.target.value !== item.startsAt) onPatch({ startsAt: e.target.value, endsAt: "" })
                  }}
                  aria-label="Starts at"
                  className="rounded border border-line bg-card px-1.5 py-0.5 text-[11.5px] text-tk-onyx"
                />
              </span>
            ) : (
              <input
                type="date"
                defaultValue={item.dueOn ?? ""}
                autoFocus
                onBlur={(e) => {
                  setEditingWhen(false)
                  if ((e.target.value || null) !== item.dueOn) onPatch({ dueOn: e.target.value || null })
                }}
                aria-label="Due on"
                className="rounded border border-line bg-card px-1.5 py-0.5 text-[11.5px] text-tk-onyx"
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => proposed && filable && setEditingWhen(true)}
              className={cn("text-left", !(proposed && filable) && "cursor-default", item.kind === "task" && due.soon && item.dueOn && "text-warn", !item.dueOn && item.kind === "task" && "text-ink-3", item.kind === "event" && !item.startsAt && "text-ink-3")}
            >
              {item.kind === "event" ? whenLabel(item.startsAt, item.endsAt) : item.kind === "task" ? due.text : "—"}
              {dismissed ? <span className="block text-[10.5px] text-ink-3">Dismissed</span> : null}
              {item.error ? <span className="block text-[10.5px] text-bad">{item.error}</span> : null}
            </button>
          )}
        </span>
        <span className="ml-auto flex items-center justify-end gap-0.5">
          {item.quote ? (
            <button type="button" onClick={onOpen} aria-label={open ? "Hide quote" : "Show quote"} className="rounded-lg p-1.5 text-ink-3 hover:bg-card hover:text-tk-onyx">
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
          ) : null}
          {proposed && filable ? (
            <button type="button" onClick={onFile} disabled={busy} aria-label="File this one" title="File this one" className="rounded-lg p-1.5 text-ink-3 hover:bg-card hover:text-tk-teal disabled:opacity-50">
              <Check className="size-3.5" aria-hidden />
            </button>
          ) : null}
          {proposed ? (
            <button type="button" onClick={onDismiss} disabled={busy} aria-label="Dismiss" title="Dismiss" className="rounded-lg p-1.5 text-ink-3 hover:bg-card hover:text-tk-onyx disabled:opacity-50">
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
          {dismissed ? (
            <button type="button" onClick={onRestore} disabled={busy} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-3 hover:bg-card hover:text-tk-onyx">
              <Undo2 className="size-3" aria-hidden /> Restore
            </button>
          ) : null}
        </span>
      </div>
      {open && item.quote ? (
        <div className="mx-4 mb-3 flex items-start gap-3 rounded-r-lg border-l-2 border-accent-mark bg-card px-3 py-2 text-[12.5px] leading-relaxed text-tk-slate">
          {item.segmentIndex != null && item.segmentIndex >= 0 ? (
            <a href={`#s-${item.segmentIndex}`} className="mt-0.5 shrink-0 rounded bg-accent-soft px-1.5 font-mono text-[10.5px] font-medium tabular-nums text-tk-teal hover:underline">
              {formatClock(item.segmentStart)}
            </a>
          ) : null}
          <span>
            <span className="mr-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-3">{item.owner || "quote"}</span>
            <span className="text-tk-onyx">“{item.quote}”</span>
            {item.detail ? <span className="mt-1 block text-ink-3">{item.detail}</span> : null}
          </span>
        </div>
      ) : null}
    </li>
  )
}
