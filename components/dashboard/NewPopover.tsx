"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Calendar,
  LifeBuoy,
  NotebookText,
  Plus,
  Receipt,
  SquareCheck,
  Target,
} from "lucide-react"
import { FieldLabel, INPUT_CLASS, ToolButton } from "@/components/dashboard/ToolButton"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { createTask } from "@/lib/task-actions"

export type NewClient = { id: string; name: string }

const KINDS = [
  { id: "task", label: "Task", Icon: SquareCheck },
  { id: "ticket", label: "Ticket", Icon: LifeBuoy, href: ROUTES.support },
  { id: "note", label: "Note", Icon: NotebookText, href: ROUTES.notebooks },
  { id: "lead", label: "Lead", Icon: Target, href: ROUTES.leads },
  { id: "invoice", label: "Invoice", Icon: Receipt, href: ROUTES.invoices },
  { id: "meeting", label: "Meeting", Icon: Calendar, href: ROUTES.calendar },
] as const

type Kind = (typeof KINDS)[number]["id"]

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * "New" in the homepage toolbar. A task is the thing you make ten times a
 * day, so it gets a quick form here; the other kinds have their own pages
 * and this hands you to them.
 */
export function NewPopover({ clients }: { clients: NewClient[] }) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>("task")
  const [title, setTitle] = useState("")
  const [clientId, setClientId] = useState("")
  const [dueOn, setDueOn] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function submit(close: () => void) {
    setError(null)
    start(async () => {
      const result = await createTask({
        title,
        clientId: clientId || null,
        dueOn: dueOn || null,
        source: "dashboard",
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setTitle("")
      setDueOn("")
      close()
      router.refresh()
    })
  }

  const current = KINDS.find((k) => k.id === kind)!

  return (
    <ToolButton label="New" icon={<Plus />} primary width={380}>
      {(close) => (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 font-ui">
            <Plus className="size-4 text-tk-teal" aria-hidden />
            <b className="text-[13.5px]">New</b>
          </div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="What to create">
            {KINDS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={kind === id}
                onClick={() => setKind(id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 font-ui text-xs font-semibold transition-colors",
                  kind === id
                    ? "bg-accent/10 text-tk-teal"
                    : "text-tk-slate hover:bg-tk-linen hover:text-tk-onyx"
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {kind === "task" ? (
            <>
              <label className="grid gap-1.5">
                <FieldLabel>Task</FieldLabel>
                <input
                  data-autofocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && title.trim()) submit(close)
                  }}
                  placeholder="What needs doing?"
                  className={INPUT_CLASS}
                />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="grid gap-1.5">
                  <FieldLabel>Client</FieldLabel>
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">House</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <FieldLabel>Due</FieldLabel>
                  <input
                    type="date"
                    value={dueOn}
                    min={todayIso()}
                    onChange={(e) => setDueOn(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </div>
              {error ? (
                <p role="alert" className="text-xs font-semibold text-bad">
                  {error}
                </p>
              ) : null}
              <div className="flex items-center gap-1.5">
                <span className="text-[11.5px] text-tk-slate/70">
                  {dueOn ? "Lands in Needs attention" : "No date — lands under Tasks"}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={close}
                  className="h-8 rounded-lg px-3 font-ui text-xs font-semibold text-tk-slate hover:bg-tk-linen hover:text-tk-onyx"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || !title.trim()}
                  onClick={() => submit(close)}
                  className="h-8 whitespace-nowrap rounded-lg bg-tk-teal px-3 font-ui text-xs font-semibold text-tk-linen hover:brightness-95 disabled:opacity-60"
                >
                  Add task
                </button>
              </div>
            </>
          ) : (
            <div className="grid gap-2.5">
              <p className="text-[12.5px] text-tk-slate/70">
                {current.label}s are made on their own page, with everything they need.
              </p>
              <Link
                href={"href" in current ? current.href : ROUTES.home}
                onClick={close}
                className="inline-flex h-8 items-center justify-center gap-1.5 self-start rounded-lg bg-tk-teal px-3 font-ui text-xs font-semibold text-tk-linen hover:brightness-95"
              >
                <current.Icon className="size-3.5" aria-hidden />
                New {current.label.toLowerCase()} →
              </Link>
            </div>
          )}
        </div>
      )}
    </ToolButton>
  )
}
