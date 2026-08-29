"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  archiveAction,
  assignClientAction,
  mailToTicketAction,
  makeTaskAction,
  markReadAction,
  snoozeAction,
  unarchiveAction,
} from "@/app/(admin)/inbox/actions"
import { Dropdown, MenuHead, MenuOption } from "@/components/ui/Dropdown"
import { cn } from "@/lib/cn"
import {
  INBOX_KINDS,
  INBOX_LENSES,
  KIND_LABEL,
  KIND_TONE,
  dayBucket,
  matchesLens,
  type InboxData,
  type InboxItem,
  type InboxKind,
  type InboxLens,
} from "@/lib/inbox"
import { ROUTES } from "@/lib/nav"

type Result = { ok: boolean; error?: string }

/* -------------------------------------------------------------------- bits */

function Age({ item }: { item: InboxItem }) {
  const hot = item.needsReply && item.ageDays >= 7
  const label =
    item.ageDays === 0 ? "today" : item.ageDays < 60 ? `${item.ageDays}d` : `${Math.floor(item.ageDays / 30)}mo`
  return (
    <span
      className={cn(
        "mt-0.5 shrink-0 font-mono text-[10px] tabular-nums",
        hot ? "font-semibold text-[#B4322A]" : "text-tk-slate/45"
      )}
    >
      {label}
    </span>
  )
}

function Kind({ kind }: { kind: InboxKind }) {
  return (
    <span
      className={cn(
        "mt-px w-[52px] shrink-0 rounded px-1 py-0.5 text-center font-mono text-[9px] font-semibold uppercase tracking-[0.06em]",
        KIND_TONE[kind]
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  )
}

/* ------------------------------------------------------------------ console */

export function InboxConsole({ data }: { data: InboxData }) {
  const router = useRouter()
  const search = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const lensParam = search.get("lens")
  const lens: InboxLens = INBOX_LENSES.some((l) => l.id === lensParam)
    ? (lensParam as InboxLens)
    : "unread"
  const kindParam = search.get("kind")
  const kind = INBOX_KINDS.includes(kindParam as InboxKind) ? (kindParam as InboxKind) : null
  const clientSlug = search.get("client")
  const selectedKey = search.get("item")

  const visible = useMemo(
    () =>
      data.items.filter((item) => {
        if (!matchesLens(item, lens)) return false
        if (kind && item.kind !== kind) return false
        if (clientSlug && item.clientSlug !== clientSlug) return false
        return true
      }),
    [data.items, lens, kind, clientSlug]
  )

  const selected = visible.find((i) => i.key === selectedKey) ?? visible[0] ?? null

  const railClients = useMemo(() => {
    const present = new Set(data.items.map((i) => i.clientSlug).filter(Boolean))
    return data.clients.filter((c) => present.has(c.slug))
  }, [data.items, data.clients])

  function setQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(search.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value == null) params.delete(key)
      else params.set(key, value)
    }
    const qs = params.toString()
    router.replace(qs ? `${ROUTES.inbox}?${qs}` : ROUTES.inbox, { scroll: false })
  }

  function run(action: () => Promise<Result>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? "That didn't work.")
        return
      }
      router.refresh()
    })
  }

  /* stream, grouped by day */
  const groups = useMemo(() => {
    const out: { day: string; rows: InboxItem[] }[] = []
    for (const item of visible) {
      const day = dayBucket(item.occurredAt)
      const last = out[out.length - 1]
      if (last && last.day === day) last.rows.push(item)
      else out.push({ day, rows: [item] })
    }
    return out
  }, [visible])

  return (
    <>
      {!data.ready ? (
        <p className="mt-3 rounded-xl border border-[#8A5A05]/30 bg-[#8A5A05]/[0.06] px-3 py-2 text-[12px] text-tk-slate">
          Triage state isn&rsquo;t stored yet — run <code className="font-mono">npm run db:migrate</code> to
          apply <code className="font-mono">0027_inbox</code>. Until then everything reads as unread and
          Snooze/Archive won&rsquo;t stick.
        </p>
      ) : null}

      {error ? (
        <p role="status" className="mt-3 text-[12px] font-semibold text-[#B4322A]">
          {error}
        </p>
      ) : null}

      <div
        data-menu-boundary
        className={cn(
          "mt-4 grid gap-2.5 lg:grid-cols-[168px_minmax(0,1fr)_minmax(0,22rem)]",
          pending && "opacity-90"
        )}
      >
        {/* ---- lens rail ---- */}
        <nav className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white p-1.5">
          {INBOX_LENSES.map((item) => {
            const on = item.id === lens
            const count = data.counts[item.id]
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setQuery({ lens: item.id === "unread" ? null : item.id, item: null })}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px]",
                  on ? "bg-tk-teal font-semibold text-tk-linen" : "text-tk-slate hover:bg-tk-linen"
                )}
              >
                {item.label}
                <span className="font-mono text-[10.5px] tabular-nums opacity-70">
                  {count || ""}
                </span>
              </button>
            )
          })}

          <p className="px-2.5 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.1em] text-tk-slate/45">
            By kind
          </p>
          {INBOX_KINDS.map((k) => {
            const on = kind === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setQuery({ kind: on ? null : k, item: null })}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px]",
                  on ? "bg-tk-teal font-semibold text-tk-linen" : "text-tk-slate hover:bg-tk-linen"
                )}
              >
                {KIND_LABEL[k]}
                <span className="font-mono text-[10.5px] tabular-nums opacity-70">
                  {data.counts.byKind[k] || ""}
                </span>
              </button>
            )
          })}

          {railClients.length > 0 ? (
            <>
              <p className="px-2.5 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-[0.1em] text-tk-slate/45">
                By client
              </p>
              {railClients.map((c) => {
                const on = clientSlug === c.slug
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setQuery({ client: on ? null : c.slug, item: null })}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px]",
                      on ? "bg-tk-teal font-semibold text-tk-linen" : "text-tk-slate hover:bg-tk-linen"
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-[7px] shrink-0 rounded-full"
                      style={{ background: c.color }}
                    />
                    <span className="truncate">{c.name}</span>
                  </button>
                )
              })}
            </>
          ) : null}
        </nav>

        {/* ---- stream ---- */}
        <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white">
          {visible.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-tk-slate/65">
              {lens === "unread" ? "Inbox zero." : "Nothing in this view."}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.day}>
                <p className="border-y border-tk-slate/[0.09] bg-[#FAF6EE] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.09em] text-tk-slate/45">
                  {group.day}
                </p>
                {group.rows.map((item) => {
                  const on = selected?.key === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setQuery({ item: item.key })
                        if (item.state === "unread") run(() => markReadAction(item.key))
                      }}
                      className={cn(
                        "flex w-full items-start gap-2.5 border-b border-tk-slate/[0.09] py-2 pr-3 text-left last:border-b-0",
                        on ? "bg-tk-teal/[0.06]" : "hover:bg-tk-linen/50"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "w-[3px] self-stretch",
                          item.state === "unread" ? "bg-tk-teal" : "bg-transparent"
                        )}
                      />
                      <Kind kind={item.kind} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-[12.5px] text-tk-onyx",
                            item.state === "unread" ? "font-bold" : "font-semibold"
                          )}
                        >
                          {item.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-tk-slate/60">
                          {item.snippet || item.actor}
                        </span>
                      </span>
                      {item.state === "snoozed" ? (
                        <span className="mt-0.5 shrink-0 rounded bg-tk-linen px-1.5 font-mono text-[9.5px] text-tk-slate/60">
                          snoozed
                        </span>
                      ) : null}
                      <Age item={item} />
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </section>

        {/* ---- workspace ---- */}
        <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white">
          {selected ? (
            <Workspace
              item={selected}
              clients={data.clients}
              busy={pending}
              lens={lens}
              onRun={run}
            />
          ) : (
            <div className="flex h-full min-h-[18rem] flex-col items-center justify-center px-5 text-center">
              <p className="text-sm font-semibold text-tk-onyx">Nothing selected</p>
              <p className="mt-1 text-[12px] text-tk-slate/65">
                Pick something from the stream and the same four verbs apply, whatever it is.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- workspace */

function Workspace({
  item,
  clients,
  busy,
  lens,
  onRun,
}: {
  item: InboxItem
  clients: { id: string; slug: string; name: string; color: string }[]
  busy: boolean
  lens: InboxLens
  onRun: (action: () => Promise<Result>) => void
}) {
  const [taskTitle, setTaskTitle] = useState("")
  const [composing, setComposing] = useState(false)

  const btn =
    "inline-flex h-[26px] items-center gap-1.5 rounded-full border border-tk-slate/15 bg-white px-2.5 text-[11.5px] font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal disabled:opacity-50"

  return (
    <div className="flex h-full flex-col">
      {/* the one triage bar — the same verbs whatever the item is */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-tk-slate/10 bg-[#FAF6EE] px-3 py-2">
        {item.href ? (
          <Link
            href={item.href}
            className="inline-flex h-[26px] items-center rounded-full bg-tk-teal px-3 text-[11.5px] font-semibold text-tk-linen hover:bg-tk-teal/90"
          >
            Open
          </Link>
        ) : null}
        {item.kind === "mail" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRun(() => mailToTicketAction(item.id))}
            className="inline-flex h-[26px] items-center rounded-full bg-[#8A5A05] px-3 text-[11.5px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            Make ticket
          </button>
        ) : null}

        {item.kind === "mail" || item.kind === "ticket" ? (
          <Dropdown label={item.clientName ?? "Client"} on={Boolean(item.clientName)}>
            {(close) => (
              <>
                <MenuHead>Assign to</MenuHead>
                {clients.map((c) => (
                  <MenuOption
                    key={c.slug}
                    checked={item.clientSlug === c.slug}
                    swatch={c.color}
                    label={c.name}
                    onSelect={() => {
                      close()
                      onRun(() => assignClientAction(item.key, c.id))
                    }}
                  />
                ))}
              </>
            )}
          </Dropdown>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setTaskTitle(item.title)
            setComposing(true)
          }}
          className={btn}
        >
          Make task
        </button>

        <Dropdown label="Snooze">
          {(close) => (
            <>
              <MenuHead>Hide until</MenuHead>
              {[
                { id: "tomorrow", label: "Tomorrow" },
                { id: "week", label: "Next week" },
                { id: "fortnight", label: "Two weeks" },
              ].map((span) => (
                <MenuOption
                  key={span.id}
                  checked={false}
                  label={span.label}
                  onSelect={() => {
                    close()
                    onRun(() => snoozeAction(item.key, span.id))
                  }}
                />
              ))}
            </>
          )}
        </Dropdown>

        {lens === "archive" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRun(() => unarchiveAction(item.key))}
            className={btn}
          >
            Restore
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRun(() => archiveAction(item.key))}
            className={btn}
          >
            Archive
          </button>
        )}
      </div>

      {composing ? (
        <div className="flex items-center gap-1.5 border-b border-tk-slate/10 px-3 py-2">
          <input
            autoFocus
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setComposing(false)
              if (e.key === "Enter") {
                setComposing(false)
                onRun(() => makeTaskAction(item.key, taskTitle, null))
              }
            }}
            aria-label="Task title"
            className="min-w-0 flex-1 rounded-md border border-tk-slate/20 bg-white px-2 py-1 text-[12px] outline-none focus:border-tk-teal"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setComposing(false)
              onRun(() => makeTaskAction(item.key, taskTitle, null))
            }}
            className="rounded-full bg-tk-teal px-2.5 py-1 text-[10.5px] font-semibold text-tk-linen"
          >
            Save
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-tk-slate/55">
          {KIND_LABEL[item.kind]}
          {item.clientName ? ` · ${item.clientName}` : ""}
        </p>
        <h2 className="mt-0.5 text-[15px] font-semibold leading-snug tracking-tight text-tk-onyx">
          {item.title}
        </h2>
        <p className="mt-1 text-[11.5px] text-tk-slate/65">
          {item.actor}
          {" · "}
          {new Date(item.occurredAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.needsReply ? (
            <span className="rounded-full border border-[#8A5A05]/25 bg-[#8A5A05]/10 px-2 py-0.5 text-[11px] font-semibold text-[#8A5A05]">
              Needs a reply
            </span>
          ) : null}
          {item.priority && item.priority !== "normal" ? (
            <span className="rounded-full border border-tk-slate/15 bg-white px-2 py-0.5 text-[11px] font-semibold capitalize text-tk-slate/70">
              {item.priority}
            </span>
          ) : null}
          {item.state !== "unread" ? (
            <span className="rounded-full border border-tk-slate/15 bg-white px-2 py-0.5 text-[11px] font-semibold text-tk-slate/60">
              {item.state}
            </span>
          ) : null}
        </div>

        {item.snippet ? (
          <div className="mt-3">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-tk-slate/55">
              What arrived
            </p>
            <p className="mt-1 whitespace-pre-wrap rounded-xl border border-tk-slate/15 bg-tk-linen px-2.5 py-2 text-[11.5px] leading-relaxed text-tk-slate">
              {item.snippet}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
