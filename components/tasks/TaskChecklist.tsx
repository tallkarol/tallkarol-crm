"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/cn"
import {
  addChecklistItem,
  removeChecklistItem,
  setChecklistItemDone,
} from "@/lib/task-actions"

export type ChecklistItem = { id: string; title: string; done: boolean }

/**
 * The small steps inside one task. Notes make you re-read a paragraph to work
 * out which part is left; a checklist answers it, and the row shows the
 * progress as `2/3`.
 */
export function TaskChecklist({
  taskId,
  items: initial,
}: {
  taskId: string
  items: ChecklistItem[]
}) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => setItems(initial), [initial])

  const done = items.filter((i) => i.done).length

  function toggle(item: ChecklistItem) {
    const next = !item.done
    setItems((rows) =>
      rows.map((row) => (row.id === item.id ? { ...row, done: next } : row))
    )
    startTransition(async () => {
      const result = await setChecklistItemDone(item.id, next)
      if (!result.ok) {
        setError(result.error)
        setItems((rows) =>
          rows.map((row) => (row.id === item.id ? { ...row, done: !next } : row))
        )
        return
      }
      router.refresh()
    })
  }

  function add() {
    const title = draft.trim()
    if (!title) return
    setDraft("")
    setError(null)
    startTransition(async () => {
      const result = await addChecklistItem(taskId, title)
      if (!result.ok) setError(result.error)
      router.refresh()
    })
  }

  function remove(id: string) {
    setItems((rows) => rows.filter((row) => row.id !== id))
    startTransition(async () => {
      await removeChecklistItem(id)
      router.refresh()
    })
  }

  return (
    <div>
      {items.length > 0 ? (
        <p className="mb-1.5 font-mono text-[11px] text-ink-3">
          {done} of {items.length}
        </p>
      ) : null}

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 py-1">
            <button
              type="button"
              onClick={() => toggle(item)}
              aria-pressed={item.done}
              aria-label={`Mark ${item.title} ${item.done ? "not done" : "done"}`}
              className={cn(
                "grid size-[15px] shrink-0 place-items-center rounded border-[1.5px] transition-colors",
                item.done
                  ? "border-tk-teal bg-accent"
                  : "border-line-strong bg-card hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              )}
            >
              <svg width="9" height="7" viewBox="0 0 11 9" fill="none" aria-hidden>
                <path
                  d="M1 4.5L4 7.5L10 1.5"
                  stroke="#F1EADC"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  className={item.done ? "opacity-100" : "opacity-0"}
                />
              </svg>
            </button>
            <span
              className={cn(
                "min-w-0 flex-1 text-[12.5px]",
                item.done ? "text-ink-3 line-through" : "text-tk-slate"
              )}
            >
              {item.title}
            </span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              aria-label={`Remove ${item.title}`}
              className="shrink-0 rounded p-0.5 text-ink-3 opacity-0 transition-opacity hover:text-red-700 group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-1 flex items-center gap-2">
        <span
          aria-hidden
          className="size-[15px] shrink-0 rounded border-[1.5px] border-dashed border-line-strong"
        />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          placeholder="Add an item…"
          aria-label="Add a checklist item"
          className="min-w-0 flex-1 bg-transparent py-1 text-[12.5px] text-tk-onyx placeholder:text-ink-3"
        />
        {draft ? (
          <button
            type="button"
            onClick={add}
            className="shrink-0 rounded p-0.5 text-tk-teal"
            aria-label="Add item"
          >
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1 text-xs font-semibold text-red-700" role="status">
          {error}
        </p>
      ) : null}
    </div>
  )
}
