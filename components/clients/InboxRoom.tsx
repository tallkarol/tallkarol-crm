import Link from "next/link"
import { ExternalLink, Inbox as InboxIcon } from "lucide-react"
import { Card } from "@/components/ui/Card"
import { InboxTriageBar, type TriageItem } from "@/components/clients/InboxTriageBar"
import { cn } from "@/lib/cn"
import {
  ROOM_LENSES,
  roomKindLabel,
  roomKindTone,
  type RoomData,
  type RoomKind,
  type RoomLens,
  type RoomRow,
} from "@/lib/client-inbox"
import type { ClientShell } from "@/lib/client-rooms"
import { ROUTES } from "@/lib/nav"
import { STATE_LABEL, priorityTone, stateTone } from "@/lib/support"

/**
 * The Inbox room: a lens row, a list of rows, and a reading pane. Signed off
 * 23 Sep 2026 from `hub-mockup-src/parts.js`'s `renderInboxList()` /
 * `renderReading()` — this is that mockup's markup redrawn against real data
 * and the CRM's own token set.
 *
 * A server component throughout, so the list and the reading pane render
 * straight from `searchParams` with no client JS; only the triage bar at the
 * foot of the reading pane needs `useTransition`, and it lives in its own
 * file precisely so this one may keep importing `lib/client-inbox.ts`.
 */
export function InboxRoom({ client, data }: { client: ClientShell; data: RoomData }) {
  const { rows, kinds, counts, selected, detail } = data

  return (
    <div className="flex flex-col gap-3">
      {/* ---- lens + kind rail ---- */}
      <div className="flex flex-wrap items-center gap-1.5">
        <nav className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-card p-1" aria-label="Lens">
          {ROOM_LENSES.map((l) => {
            const on = l.id === data.lens
            return (
              <Link
                key={l.id}
                href={roomHref(client.slug, data, { lens: l.id, item: null })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold",
                  on ? "bg-well text-tk-onyx shadow-card" : "text-ink-3 hover:text-tk-onyx"
                )}
              >
                {l.label}
                <span className="font-mono text-[10px] tabular-nums text-ink-3">{counts[l.id] || ""}</span>
              </Link>
            )
          })}
        </nav>

        {kinds.length > 0 ? (
          <div className="ml-auto flex flex-wrap gap-1">
            {kinds.map((k) => {
              const on = data.kind === k.kind
              return (
                <Link
                  key={k.kind}
                  href={roomHref(client.slug, data, { kind: on ? null : k.kind, item: null })}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.06em]",
                    k.tone,
                    on && "ring-1 ring-inset ring-accent-ink"
                  )}
                >
                  {k.label}
                  <span className="font-mono tabular-nums opacity-70">{k.count}</span>
                </Link>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* ---- list + reading pane ---- */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card elevation="none" className="overflow-hidden">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-14 text-center">
              <InboxIcon className="size-5 text-ink-3" aria-hidden />
              <p className="text-[13px] font-semibold text-tk-onyx">Nothing here</p>
              <p className="text-[12px] text-ink-3">
                {data.lens === "needs" ? "Nothing needs you right now." : "Nothing in this view."}
              </p>
            </div>
          ) : (
            rows.map((row) => <ListRow key={row.key} row={row} client={client} data={data} />)
          )}
        </Card>

        <Card elevation="none" className="flex min-h-[16rem] flex-col overflow-hidden">
          {selected ? (
            <ReadingPane row={selected} detail={detail} client={client} />
          ) : (
            <div className="m-auto px-5 text-center text-[12.5px] text-ink-3">Select something from the list.</div>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ url */

function roomHref(
  slug: string,
  current: { lens: RoomLens; kind: RoomKind | null },
  next: { lens?: RoomLens; kind?: RoomKind | null; item?: string | null }
) {
  const lens = next.lens ?? current.lens
  const kind = "kind" in next ? next.kind : current.kind
  const item = "item" in next ? next.item : null
  const params = new URLSearchParams()
  if (lens !== "needs") params.set("lens", lens)
  if (kind) params.set("kind", kind)
  if (item) params.set("item", item)
  const qs = params.toString()
  const base = ROUTES.clientRoom(slug, "inbox")
  return qs ? `${base}?${qs}` : base
}

/* ------------------------------------------------------------------ row */

function Dot({ row }: { row: RoomRow }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-1.5 size-[7px] shrink-0 rounded-full",
        row.late ? "bg-bad" : row.needsReply ? "bg-warn" : "border border-line-strong bg-transparent"
      )}
    />
  )
}

function ListRow({ row, client, data }: { row: RoomRow; client: ClientShell; data: RoomData }) {
  const on = data.selected?.key === row.key
  return (
    <Link
      href={roomHref(client.slug, data, { item: row.key })}
      className={cn("flex items-start gap-2.5 border-t border-line px-3.5 py-2.5 first:border-t-0", on ? "bg-accent-soft" : "hover:bg-well")}
    >
      <Dot row={row} />
      <span className={cn("mt-px w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-ui text-[9px] font-bold uppercase tracking-[0.06em]", roomKindTone(row.kind))}>
        {roomKindLabel(row.kind)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-tk-onyx">{row.title}</span>
        {row.snippet ? <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">{row.snippet}</span> : null}
        {row.from ? <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-ink-2">{row.from}</span> : null}
      </span>
      <span className={cn("shrink-0 font-mono text-[10.5px] tabular-nums", row.late ? "font-bold text-bad" : "text-ink-3")}>{row.ageLabel}</span>
    </Link>
  )
}

/* -------------------------------------------------------------- reading */

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function Facts({ children }: { children: React.ReactNode }) {
  return <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">{children}</dl>
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate font-semibold text-tk-onyx">{children}</dd>
    </>
  )
}

function ReadingPane({
  row,
  detail,
  client,
}: {
  row: RoomRow
  detail: RoomData["detail"]
  client: ClientShell
}) {
  const triageItem: TriageItem = {
    key: row.key,
    kind: row.kind,
    refId: row.refId,
    title: row.title,
    href: row.href,
    canConfirm: row.canConfirm,
    replyTo: detail?.kind === "mail" ? detail.mail.fromEmail : undefined,
    noteId: detail?.kind === "proposal" ? detail.note.id : undefined,
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
          <span className={cn("rounded-md px-1.5 py-0.5 font-ui text-[9px] font-bold uppercase tracking-[0.06em]", roomKindTone(row.kind))}>
            {roomKindLabel(row.kind)}
          </span>
          {row.from ? <span>{row.from}</span> : null}
          <span>·</span>
          <span>{row.ageLabel} ago</span>
          {row.late ? (
            <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad">Past reply window</span>
          ) : row.needsReply ? (
            <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">Needs you</span>
          ) : null}
          {row.href ? (
            <Link
              href={row.href}
              aria-label="Open in full"
              className="ml-auto grid size-6 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-well hover:text-tk-onyx"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
        <h3 className="mt-1 text-[15px] font-semibold leading-snug tracking-tight text-tk-onyx">{row.title}</h3>
      </div>

      <div className="min-h-0 flex-1 px-4 py-3">
        {!detail ? (
          <p className="text-[12.5px] text-ink-3">{row.snippet}</p>
        ) : detail.kind === "ticket" || detail.kind === "message" ? (
          <>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{detail.ticket.description || "No description."}</p>
            <Facts>
              <Fact label="Number">{detail.ticket.number}</Fact>
              <Fact label="Priority">
                <span className={cn("rounded px-1.5 py-0.5 text-[10.5px] font-semibold capitalize", priorityTone(detail.ticket.priority))}>
                  {detail.ticket.priority}
                </span>
              </Fact>
              <Fact label="Status">
                <span className={cn("rounded px-1.5 py-0.5 text-[10.5px] font-semibold", stateTone(detail.ticket.state))}>
                  {STATE_LABEL[detail.ticket.state]}
                </span>
              </Fact>
              {detail.ticket.platform ? <Fact label="Platform">{detail.ticket.platform}</Fact> : null}
              {detail.ticket.submittedBy ? <Fact label="Submitted by">{detail.ticket.submittedBy}</Fact> : null}
              {detail.ticket.dueOn ? <Fact label="Due">{detail.ticket.dueOn}</Fact> : null}
            </Facts>
            {detail.messages.length > 0 ? (
              <div className="mt-3.5">
                <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-3">Thread</p>
                <div className="mt-1.5 flex flex-col gap-2">
                  {detail.messages.map((m) => (
                    <div key={m.id} className="rounded-xl border border-line bg-well px-2.5 py-2">
                      <p className="text-[10.5px] font-semibold text-ink-2">
                        {m.author || capitalize(m.role)} · {fmtDateTime(m.sentAt)}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-tk-onyx">{m.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : detail.kind === "mail" ? (
          <>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{detail.mail.body || "(no body)"}</p>
            <Facts>
              <Fact label="From">{detail.mail.fromEmail ? `${detail.mail.from} <${detail.mail.fromEmail}>` : detail.mail.from}</Fact>
              {detail.mail.to ? <Fact label="To">{detail.mail.to}</Fact> : null}
              <Fact label="Received">{fmtDateTime(detail.mail.receivedAt)}</Fact>
            </Facts>
          </>
        ) : detail.kind === "approval" ? (
          <>
            <p className="text-[13px] leading-relaxed text-ink-2">{row.title}</p>
            {!detail.approval.canConfirm ? (
              <p className="mt-2 text-[12px] text-ink-3">
                This write says more than its title — open the thread to read the fields before confirming it.
              </p>
            ) : null}
            <Facts>
              <Fact label="Tool">{detail.approval.tool}</Fact>
              <Fact label="Thread">{detail.approval.thread}</Fact>
              <Fact label="Parked">{fmtDateTime(detail.approval.parkedAt)}</Fact>
            </Facts>
          </>
        ) : detail.kind === "proposal" ? (
          <>
            {detail.item.quote ? (
              <p className="whitespace-pre-wrap rounded-xl border border-line bg-well px-2.5 py-2 text-[12px] italic text-ink-2">“{detail.item.quote}”</p>
            ) : null}
            {detail.item.detail ? <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{detail.item.detail}</p> : null}
            <Facts>
              <Fact label="Kind">{capitalize(detail.item.kind)}</Fact>
              {detail.item.owner ? <Fact label="Owner">{detail.item.owner}</Fact> : null}
              {detail.item.dueOn ? <Fact label="Due">{detail.item.dueOn}</Fact> : null}
              <Fact label="From">{detail.note.title || "Meeting note"}</Fact>
            </Facts>
          </>
        ) : (
          <p className="text-[12.5px] text-ink-3">{row.snippet}</p>
        )}
      </div>

      <InboxTriageBar item={triageItem} clientId={client.id} clientSlug={client.slug} />
    </div>
  )
}
