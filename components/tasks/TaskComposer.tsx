"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"
import { Dropdown, MenuOption } from "@/components/ui/Dropdown"
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { createTask } from "@/lib/task-actions"
import { parseTaskInput, type ParseTarget } from "@/lib/task-parse"
import { CADENCE_LABEL } from "@/lib/work"
import type { Cadence } from "@/db/schema"

export type ComposerScope = {
  clientId?: string | null
  clientName?: string | null
  clientSlug?: string | null
  projectId?: string | null
  projectName?: string | null
  productId?: string | null
  productName?: string | null
  deliverableId?: string | null
  deliverableLabel?: string | null
  refKind?: string | null
  refId?: string | null
}

const PRIORITIES = [
  { value: 1, label: "High" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Low" },
]

const CADENCES: Cadence[] = ["none", "weekly", "monthly", "quarterly"]

/**
 * One input, mounted everywhere. What it parses shows as chips before anything
 * is saved — the old box swallowed `@client` off the end of the line and you
 * found out by looking at the row it made.
 *
 * `scope` is the page's own context: on a project both the project and its
 * client arrive already filled, so "add a task here" needs no picker.
 */
export function TaskComposer({
  targets,
  scope,
  placeholder = "Add a task…",
  autoFocus = false,
  onDone,
  compact = false,
}: {
  targets: ParseTarget[]
  scope?: ComposerScope
  placeholder?: string
  autoFocus?: boolean
  onDone?: () => void
  compact?: boolean
}) {
  const router = useRouter()
  const [text, setText] = useState("")
  const [priority, setPriority] = useState(2)
  const [cadence, setCadence] = useState<Cadence>("none")
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) input.current?.focus()
  }, [autoFocus])

  const parsed = useMemo(() => parseTaskInput(text, targets), [text, targets])

  // The scope only fills gaps — anything typed wins over where you happen to be.
  const target = parsed.target
  const effectiveClientId = target?.clientId ?? scope?.clientId ?? null
  const effectiveProjectId = target?.projectId ?? scope?.projectId ?? null
  const effectiveProductId = target?.productId ?? scope?.productId ?? null
  const effectiveClientName = target?.clientName ?? scope?.clientName ?? null
  const effectiveProjectName = target?.projectName ?? scope?.projectName ?? null
  const effectiveProductName = target?.productName ?? scope?.productName ?? null
  const effectiveClientSlug = target?.clientSlug ?? scope?.clientSlug ?? null
  const fromScope =
    !target && Boolean(scope?.clientId || scope?.projectId || scope?.productId)

  const cadenceValue = parsed.cadence !== "none" ? parsed.cadence : cadence
  const ready = parsed.title.trim().length > 0

  function reset() {
    setText("")
    setPriority(2)
    setCadence("none")
  }

  function submit() {
    if (!ready || busy) return
    setError(null)
    startTransition(async () => {
      const result = await createTask({
        title: parsed.title,
        clientId: effectiveClientId,
        projectId: effectiveProjectId,
        productId: effectiveProductId,
        // A deliverable only applies when nothing else was typed over it.
        deliverableId: target ? null : scope?.deliverableId ?? null,
        dueOn: parsed.dueOn,
        snoozedUntil: parsed.snoozedUntil,
        cadence: cadenceValue,
        priority,
        refKind: scope?.refKind ?? null,
        refId: scope?.refId ?? null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      reset()
      router.refresh()
      onDone?.()
    })
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card shadow-card transition-colors",
        text ? "border-tk-teal/60" : "border-line"
      )}
    >
      <div className="flex items-center gap-2 py-1 pl-3.5 pr-1">
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
            if (e.key === "Escape") {
              if (text) setText("")
              else onDone?.()
            }
          }}
          placeholder={placeholder}
          aria-label="Add a task"
          className="flex-1 bg-transparent py-1.5 text-sm text-tk-onyx placeholder:text-ink-3"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!ready || busy}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-tk-linen disabled:opacity-40"
        >
          <Plus className="size-3.5" />
          {busy ? "Adding…" : "Add"}
        </button>
      </div>

      {text || !compact ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2">
          {effectiveClientName || effectiveProductName ? (
            <Chip
              tone={fromScope ? "scope" : "on"}
              swatch={
                effectiveClientSlug
                  ? clientColor(effectiveClientSlug)
                  : effectiveProductName
                    ? clientColor(
                        effectiveProductName.toLowerCase().replace(/\s+/g, "-")
                      )
                    : undefined
              }
              label={
                effectiveProductName && effectiveClientName
                  ? `${effectiveClientName} · ${effectiveProductName}`
                  : effectiveProductName
                    ? effectiveProductName
                    : effectiveProjectName
                      ? `${effectiveClientName} · ${effectiveProjectName}`
                      : effectiveClientName!
              }
              note={fromScope ? "from this page" : undefined}
            />
          ) : (
            <Chip tone="empty" label="No client — type @" />
          )}

          {parsed.unresolved ? (
            <Chip tone="warn" label={`@${parsed.unresolved} matched nothing`} />
          ) : null}

          {parsed.dueLabel ? <Chip tone="on" label={`Due ${parsed.dueLabel}`} /> : null}
          {parsed.snoozeLabel ? (
            <Chip tone="on" label={`Hidden until ${parsed.snoozeLabel}`} />
          ) : null}

          <Dropdown
            label={PRIORITIES.find((p) => p.value === priority)!.label}
            on={priority === 1}
          >
            {(close) => (
              <>
                {PRIORITIES.map((p) => (
                  <MenuOption
                    key={p.value}
                    checked={priority === p.value}
                    label={p.label}
                    onSelect={() => {
                      setPriority(p.value)
                      close()
                    }}
                  />
                ))}
              </>
            )}
          </Dropdown>

          <Dropdown
            label={CADENCE_LABEL[cadenceValue]}
            on={cadenceValue !== "none"}
          >
            {(close) => (
              <>
                {CADENCES.map((c) => (
                  <MenuOption
                    key={c}
                    checked={cadenceValue === c}
                    label={CADENCE_LABEL[c]}
                    onSelect={() => {
                      setCadence(c)
                      close()
                    }}
                  />
                ))}
              </>
            )}
          </Dropdown>

          <p className="ml-auto hidden font-mono text-[10px] text-ink-3 sm:block">
            @ target · ! when · * repeat · &gt; snooze
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="status"
          className="border-t border-line px-3 py-2 text-xs font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Chip({
  label,
  tone,
  swatch,
  note,
  onRemove,
}: {
  label: string
  tone: "on" | "empty" | "warn" | "scope"
  swatch?: string
  note?: string
  onRemove?: () => void
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        tone === "on" && "border-transparent bg-tk-teal/10 text-tk-teal",
        tone === "scope" && "border-dashed border-tk-teal/40 bg-tk-teal/5 text-tk-teal",
        tone === "empty" && "border-dashed border-line-strong text-ink-3",
        tone === "warn" && "border-transparent bg-warn-soft text-warn"
      )}
    >
      {swatch ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: markColor(swatch) }}
        />
      ) : null}
      {label}
      {note ? <span className="font-normal opacity-70">· {note}</span> : null}
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  )
}
