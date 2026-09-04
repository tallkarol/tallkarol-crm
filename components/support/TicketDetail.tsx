import Link from "next/link"
import { CopyAction, CopyHotkey, CopyButton } from "@/components/support/CopyButton"
import { PayloadBlock } from "@/components/support/PayloadBlock"
import {
  NoteComposer,
  PlatformField,
  PriorityPicker,
  StatePicker,
} from "@/components/support/TicketControls"
import type { SupportTicket, TicketMessage, TicketPayload } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { highlightPayload } from "@/lib/payload-highlight"
import { ROUTES } from "@/lib/nav"
import {
  STATE_LABEL,
  ageLabel,
  formatStamp,
  isLate,
  priorityTone,
  stateTone,
  ticketEnv,
  ticketMarkdown,
  ticketNumber,
  ticketOpenedAt,
  ticketPriority,
  ticketSlug,
  ticketState,
} from "@/lib/support"
import { formatDay } from "@/lib/work"

export type DetailTab = "thread" | "payload" | "env" | "related"

type TicketWithClient = SupportTicket & {
  client: { slug: string; name: string } | null
}

/** Bytes stay on the server — the page only ever links to an attachment. */
type TicketAttachmentMeta = {
  id: string
  name: string
  mime: string
  bytes: number
  createdAt: Date
}

type TriggeringRun = {
  id: string
  status: string
  startedAt: Date
  phase: string
  jobsTotal: number
  jobsFailed: number
  monitor: { slug: string; name: string; scheduleNote: string } | null
}

export function TicketDetail({
  ticket,
  messages,
  payloads,
  attachments,
  triggeredBy,
  related,
  tab,
  query,
  knownPlatforms,
  appUrl,
}: {
  ticket: TicketWithClient
  messages: TicketMessage[]
  payloads: TicketPayload[]
  attachments: TicketAttachmentMeta[]
  triggeredBy: TriggeringRun[]
  related: TicketWithClient[]
  tab: DetailTab
  query: string
  knownPlatforms: string[]
  appUrl: string
}) {
  const state = ticketState(ticket)
  const priority = ticketPriority(ticket.priority)
  const color = ticket.client ? clientColor(ticket.client.slug) : "rgba(15,22,21,.25)"
  const slug = ticketSlug(ticket)
  const late = isLate(ticket)
  const env = ticketEnv(ticket)
  const closeHref = query ? `${ROUTES.support}?${query}` : ROUTES.support
  const markdown = ticketMarkdown({
    ticket,
    clientName: ticket.client?.name ?? null,
    messages,
    payloads,
  })

  function tabHref(next: DetailTab) {
    const p = new URLSearchParams(query)
    if (next === "thread") p.delete("tab")
    else p.set("tab", next)
    const qs = p.toString()
    return `/support/${slug}${qs ? `?${qs}` : ""}`
  }

  return (
    <>
      {payloads.length ? (
        <CopyHotkey
          text={payloads[0].body}
          note={`${ticketNumber(ticket)} — ${payloads[0].label || "payload"} copied`}
        />
      ) : null}

      <div className="shrink-0 border-b border-line px-5 pt-4">
        <div className="flex items-center gap-2 text-[11.5px] text-ink-3">
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
          {ticket.client ? (
            <Link
              href={ROUTES.client(ticket.client.slug)}
              className="font-semibold text-tk-slate hover:text-tk-teal"
            >
              {ticket.client.name}
            </Link>
          ) : (
            <span className="font-semibold text-tk-slate">Unassigned</span>
          )}
          {ticket.platform ? (
            <>
              <span className="text-ink-3">·</span>
              <span>{ticket.platform}</span>
            </>
          ) : null}
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close ticket"
            className="ml-auto flex size-6 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx"
          >
            ✕
          </Link>
        </div>

        <h2 className="mt-2 text-[19px] font-semibold leading-snug tracking-tight text-tk-onyx">
          {ticket.title || "Untitled ticket"}
        </h2>
        <p className="mt-1 font-mono text-[11.5px] text-ink-3">
          {ticketNumber(ticket)} · via {ticket.source} ·{" "}
          <span className={cn(late && "font-semibold text-bad")}>
            {ageLabel(ticketOpenedAt(ticket))} old
          </span>
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {ticket.kind !== "incident" ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
                ticket.kind === "request"
                  ? "bg-tk-teal/10 text-tk-teal"
                  : "bg-well text-ink-3"
              )}
            >
              {ticket.kind}
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
              priorityTone(priority)
            )}
          >
            {priority}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
              stateTone(state)
            )}
          >
            {STATE_LABEL[state]}
          </span>
          {ticket.tags.map((tag) => (
            <span
              key={tag}
              className="rounded bg-well px-1.5 py-0.5 font-mono text-[10px] text-ink-3"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-start gap-2">
          <StatePicker id={ticket.id} current={state} />
          <PriorityPicker id={ticket.id} current={priority} />
        </div>

        <div className="mt-3 flex gap-0.5" role="tablist">
          <Tab href={tabHref("thread")} active={tab === "thread"} label="Thread" count={messages.length} />
          <Tab href={tabHref("payload")} active={tab === "payload"} label="Payload" count={payloads.length} />
          <Tab href={tabHref("env")} active={tab === "env"} label="Environment" count={Object.keys(env).length} />
          <Tab href={tabHref("related")} active={tab === "related"} label="Related" count={related.length} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "thread" ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Requested by">
                {ticket.submittedBy || ticket.customerContact || "—"}
                {ticket.contactEmail ? (
                  <a
                    href={`mailto:${ticket.contactEmail}`}
                    className="mt-0.5 block truncate font-semibold text-tk-teal hover:underline"
                  >
                    {ticket.contactEmail}
                  </a>
                ) : null}
              </Fact>
              <Fact label="Opened">{formatStamp(ticketOpenedAt(ticket))}</Fact>
              <Fact label="Platform">
                <PlatformField id={ticket.id} current={ticket.platform} known={knownPlatforms} />
              </Fact>
              <Fact label="Due">
                {ticket.dueOn ? (
                  <span className={cn(late && "font-semibold text-bad")}>
                    {formatDay(ticket.dueOn)}
                  </span>
                ) : (
                  "—"
                )}
              </Fact>
              <Fact label="First reply">
                {ticket.firstResponseAt ? (
                  formatStamp(ticket.firstResponseAt)
                ) : (
                  <span className={cn(late && "font-semibold text-bad")}>none yet</span>
                )}
              </Fact>
              <Fact label="Source">{ticket.source}</Fact>
            </dl>

            {triggeredBy.length ? (
              <div className="mt-4 rounded-xl border border-line bg-well p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                  Raised by
                </p>
                {triggeredBy.map((run) => (
                  <p key={run.id} className="mt-1 text-[12.5px] text-tk-slate">
                    <Link
                      href={ROUTES.uptime}
                      className="font-semibold text-tk-teal hover:underline"
                    >
                      {run.monitor?.name ?? "Monitor"}
                    </Link>{" "}
                    · {run.status}
                    {run.phase ? ` in ${run.phase}` : ""} ·{" "}
                    <span className="font-mono text-[11px] text-ink-3">
                      {formatStamp(run.startedAt)}
                    </span>
                    {run.jobsTotal ? (
                      <span className="font-mono text-[11px] text-ink-3">
                        {" "}
                        · {run.jobsFailed}/{run.jobsTotal} jobs failed
                      </span>
                    ) : null}
                  </p>
                ))}
              </div>
            ) : null}

            {ticket.description ? (
              <p className="mt-4 whitespace-pre-wrap text-[13.5px] leading-relaxed text-tk-slate">
                {ticket.description}
              </p>
            ) : null}

            {ticket.resolution ? (
              <div className="mt-4 rounded-xl border border-transparent bg-good-soft p-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-good">
                  Resolution
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-tk-slate">
                  {ticket.resolution}
                </p>
              </div>
            ) : null}

            <div className="mt-4">
              {messages.map((m) => (
                <Message key={m.id} message={m} accent={color} />
              ))}
            </div>

            <NoteComposer id={ticket.id} />
          </>
        ) : null}

        {tab === "payload" ? (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {payloads.length ? (
                <CopyAction
                  label="Copy all payloads"
                  text={payloads
                    .map((p) => `/* ${p.label || "payload"} */\n${p.body}`)
                    .join("\n\n")}
                />
              ) : null}
              <CopyAction label="Copy ticket as Markdown" text={markdown} />
              <CopyAction label="Copy link" text={`${appUrl}/support/${slug}`} />
            </div>
            {attachments.length ? (
              <div className="mb-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
                  Attachments
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {attachments.map((file) => (
                    <a
                      key={file.id}
                      href={`/support/attachments/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
                    >
                      <span aria-hidden>{file.mime.startsWith("image/") ? "▣" : "▤"}</span>
                      <span className="max-w-[14rem] truncate font-medium">{file.name}</span>
                      <span className="font-mono text-[10.5px] text-ink-3">
                        {Math.max(1, Math.round(file.bytes / 1024))}KB
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ) : null}

            {payloads.length ? (
              <div className="space-y-2.5">
                {payloads.map((p) => (
                  <PayloadBlock
                    key={p.id}
                    label={p.label || "Payload"}
                    lang={p.lang}
                    lines={p.lines || p.body.split("\n").length}
                    body={p.body}
                    html={highlightPayload(p.body, p.lang)}
                  />
                ))}
              </div>
            ) : attachments.length ? null : (
              <p className="py-8 text-center text-sm text-ink-3">
                No payloads on this ticket. Anything posted to{" "}
                <code className="rounded bg-well px-1 py-0.5 text-[11px]">
                  /api/support/ingest
                </code>{" "}
                lands here.
              </p>
            )}
          </>
        ) : null}

        {tab === "env" ? (
          <>
            <div className="mb-3">
              <CopyAction
                label="Copy as table"
                text={[
                  "| Field | Value |",
                  "| --- | --- |",
                  ...Object.entries(env).map(([k, v]) => `| ${k} | ${v} |`),
                ].join("\n")}
              />
            </div>
            {Object.keys(env).length ? (
              <table className="w-full border-collapse text-[12.5px]">
                <tbody>
                  {Object.entries(env).map(([k, v]) => (
                    <tr key={k} className="border-b border-line">
                      <td className="w-2/5 py-1.5 pr-3 align-top font-mono text-[11px] text-ink-3">
                        {k}
                      </td>
                      <td className="break-words py-1.5 align-top font-mono text-[11.5px] text-tk-onyx">
                        {v}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-8 text-center text-sm text-ink-3">
                Nothing recorded. Apps posting to the ingest endpoint can send an{" "}
                <code className="rounded bg-well px-1 py-0.5 text-[11px]">env</code> object.
              </p>
            )}
          </>
        ) : null}

        {tab === "related" ? (
          related.length ? (
            <div>
              {related.map((r) => {
                const rState = ticketState(r)
                return (
                  <Link
                    key={r.id}
                    href={query ? `/support/${ticketSlug(r)}?${query}` : `/support/${ticketSlug(r)}`}
                    scroll={false}
                    className="flex items-center gap-2.5 border-b border-line py-2.5 hover:bg-well"
                  >
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-3">
                      {ticketNumber(r)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-tk-onyx">
                      {r.title || "Untitled"}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-3">
                      {STATE_LABEL[rState]} · {ageLabel(ticketOpenedAt(r))}
                    </span>
                  </Link>
                )
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-ink-3">
              Nothing else open for this client.
            </p>
          )
        ) : null}
      </div>
    </>
  )
}

function Tab({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number
}) {
  return (
    <Link
      href={href}
      scroll={false}
      role="tab"
      aria-selected={active}
      className={cn(
        "border-b-2 px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
        active
          ? "border-tk-teal text-tk-onyx"
          : "border-transparent text-ink-3 hover:text-tk-onyx"
      )}
    >
      {label}
      <span className="ml-1 font-mono text-[10px] text-ink-3">{count}</span>
    </Link>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-tk-onyx">{children}</dd>
    </div>
  )
}

function Message({ message, accent }: { message: TicketMessage; accent: string }) {
  const mine = message.role === "me"
  const bot = message.role === "bot" || message.role === "system"
  const color = mine ? "#006965" : bot ? "#54687A" : accent
  const who = message.author || (mine ? "Me" : bot ? "Monitor" : "Client")
  const initials =
    who
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"

  return (
    <div
      className={cn(
        "border-t border-line py-3 first:border-t-0",
        mine && "-mx-5 bg-tk-teal/[0.04] px-5"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ background: color }}
          aria-hidden
        >
          {initials}
        </span>
        <b className="text-[12.5px] font-semibold text-tk-onyx">{who}</b>
        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-3">
          {formatStamp(message.sentAt)}
        </span>
        <CopyButton text={message.body} label="copy" />
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-tk-slate">
        {message.body}
      </p>
    </div>
  )
}
