import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients as clientsTable, punchlists, slinks } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import {
  BLOCK_LABEL,
  EVENT_LABEL,
  agoLabel,
  grantState,
  timeLeftLabel,
  type BlockKind,
  type SlinkEventKind,
} from "@/lib/slink"
import { listBlocks, listEvents, listRecipients, pendingRequests } from "@/lib/slink-data"
import { slinkUrl } from "@/lib/slink-auth"
import { CopyButton } from "@/components/slink/CopyButton"
import {
  addBlockAction,
  archiveSlinkAction,
  decideRequestAction,
  deleteBlockAction,
  inviteAction,
  listVaultChoices,
  moveBlockAction,
  resendAction,
  revokeAction,
  setGrantAction,
  updateSlinkAction,
} from "../actions"

export const dynamic = "force-dynamic"

const GRANTS = [
  { value: "24", label: "24 hours" },
  { value: "72", label: "3 days" },
  { value: "168", label: "7 days" },
  { value: "never", label: "Never expires" },
]

/**
 * One slink: what is in it, who can open it, and what they did.
 *
 * The three panes are stacked rather than tabbed because they are read
 * together — deciding whether to re-share someone means looking at when they
 * last opened it.
 */
export default async function SlinkEditor({ params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const slink = await db.query.slinks.findFirst({ where: eq(slinks.id, params.id) })
  if (!slink) notFound()

  const now = new Date()
  const [blocks, recipients, requests, events, clients, vault, lists] = await Promise.all([
    listBlocks(slink.id),
    listRecipients(slink.id),
    pendingRequests(slink.id),
    listEvents(slink.id, 30),
    db.query.clients.findMany({ columns: { id: true, name: true }, orderBy: [clientsTable.name] }),
    listVaultChoices(),
    slink.clientId
      ? db.query.punchlists.findMany({
          where: eq(punchlists.clientId, slink.clientId),
          columns: { id: true, title: true },
          limit: 50,
        })
      : Promise.resolve([]),
  ])

  const url = slinkUrl(slink.publicId)

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link href={ROUTES.slinks} className="text-[11.5px] text-ink-3 hover:text-tk-teal">
          ← Slinks
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-['Inter_Tight',sans-serif] text-[20px] font-bold tracking-tight text-tk-onyx">
            {slink.title}
          </h1>
          <span
            className={`rounded-full px-2.5 py-0.5 font-['Inter_Tight',sans-serif] text-[11px] font-semibold ${
              slink.status === "active" ? "bg-tk-teal/12 text-tk-teal" : "bg-well text-ink-3"
            }`}
          >
            {slink.status === "active" ? "Active" : "Archived"}
          </span>
          <span className="flex-1" />
          <CopyButton value={url} label="Copy link" />
          <form action={archiveSlinkAction}>
            <input type="hidden" name="slinkId" value={slink.id} />
            <input type="hidden" name="archived" value={slink.status === "active" ? "1" : "0"} />
            <button className="rounded-md border border-line px-2.5 py-1 font-['Inter_Tight',sans-serif] text-[11.5px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
              {slink.status === "active" ? "Archive" : "Restore"}
            </button>
          </form>
        </div>
        <p className="font-mono text-[11.5px] text-ink-3">{url}</p>
        <p className="max-w-[68ch] text-[12.5px] text-ink-3">
          The link alone opens nothing. Everyone who can read this got their own magic link, and letting a grant lapse
          locks the person, never the page.
        </p>
      </header>

      {requests.length > 0 ? (
        <section className="rounded-xl border border-tk-tomato/30 bg-tk-tomato/[0.04] p-4">
          <h2 className="font-['Inter_Tight',sans-serif] text-[13px] font-semibold text-tk-onyx">Waiting on you</h2>
          <ul className="mt-3 grid gap-3">
            {requests.map((r) => (
              <li key={r.id} className="grid gap-2 rounded-lg border border-line bg-tk-white p-3">
                <div className="text-[13px] text-tk-onyx">
                  <b>{r.email}</b>
                  {r.name ? <span className="text-ink-3"> · {r.name}</span> : null}
                </div>
                {r.reason ? <p className="text-[12.5px] italic text-ink-3">“{r.reason}”</p> : null}
                <form action={decideRequestAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="requestId" value={r.id} />
                  <select
                    name="grant"
                    defaultValue="24"
                    className="rounded-md border border-line bg-well px-2 py-1 text-[12px]"
                  >
                    {GRANTS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                  <button
                    name="decision"
                    value="granted"
                    className="rounded-md bg-accent px-3 py-1 font-['Inter_Tight',sans-serif] text-[11.5px] font-semibold text-white"
                  >
                    Grant
                  </button>
                  <button
                    name="decision"
                    value="denied"
                    className="rounded-md border border-line px-3 py-1 font-['Inter_Tight',sans-serif] text-[11.5px] font-semibold text-tk-slate"
                  >
                    Deny
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* ---------------------------------------------------------- content */}
        <section className="grid gap-3">
          <h2 className="font-['Inter_Tight',sans-serif] text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-3">
            Content
          </h2>

          <form action={updateSlinkAction} className="grid gap-3 rounded-xl border border-line bg-tk-white p-4">
            <input type="hidden" name="slinkId" value={slink.id} />
            <Labeled label="Title">
              <input
                name="title"
                defaultValue={slink.title}
                className="w-full rounded-lg border border-line bg-well px-3 py-2 text-[13px]"
              />
            </Labeled>
            <Labeled label="Intro">
              <textarea
                name="intro"
                rows={3}
                defaultValue={slink.intro}
                className="w-full rounded-lg border border-line bg-well px-3 py-2 text-[13px]"
              />
            </Labeled>
            <Labeled label="Client">
              <select
                name="clientId"
                defaultValue={slink.clientId ?? ""}
                className="w-full rounded-lg border border-line bg-well px-3 py-2 text-[13px]"
              >
                <option value="">No client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <button className="justify-self-start rounded-lg bg-accent px-4 py-2 font-['Inter_Tight',sans-serif] text-[12.5px] font-semibold text-white">
              Save
            </button>
          </form>

          {blocks.map((b) => (
            <div key={b.id} className="rounded-xl border border-line bg-tk-white">
              <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className="font-['Inter_Tight',sans-serif] text-[13px] font-semibold text-tk-onyx">
                  {b.title || BLOCK_LABEL[b.kind as BlockKind]}
                </span>
                <span className="rounded bg-tk-teal/10 px-2 py-0.5 font-['Inter_Tight',sans-serif] text-[10px] font-bold uppercase tracking-[0.1em] text-tk-teal">
                  {BLOCK_LABEL[b.kind as BlockKind] ?? b.kind}
                </span>
                <span className="flex-1" />
                {["up", "down"].map((dir) => (
                  <form key={dir} action={moveBlockAction}>
                    <input type="hidden" name="blockId" value={b.id} />
                    <input type="hidden" name="slinkId" value={slink.id} />
                    <input type="hidden" name="dir" value={dir} />
                    <button className="px-1 text-[12px] text-ink-3 hover:text-tk-teal">
                      {dir === "up" ? "↑" : "↓"}
                    </button>
                  </form>
                ))}
                <form action={deleteBlockAction}>
                  <input type="hidden" name="blockId" value={b.id} />
                  <input type="hidden" name="slinkId" value={slink.id} />
                  <button className="px-1 text-[12px] text-ink-3 hover:text-tk-tomato">Remove</button>
                </form>
              </header>
              {b.note ? <p className="px-3 py-2 text-[12.5px] text-ink-3">{b.note}</p> : null}
            </div>
          ))}

          <AddBlock slinkId={slink.id} vault={vault} lists={lists} hasClient={Boolean(slink.clientId)} />
        </section>

        {/* ----------------------------------------------------------- people */}
        <section className="grid gap-3">
          <h2 className="font-['Inter_Tight',sans-serif] text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-3">
            People
          </h2>

          <form action={inviteAction} className="grid gap-2 rounded-xl border border-line bg-tk-white p-4">
            <input type="hidden" name="slinkId" value={slink.id} />
            <input
              name="email"
              type="email"
              required
              placeholder="them@company.com"
              className="rounded-lg border border-line bg-well px-3 py-2 text-[13px]"
            />
            <input
              name="name"
              placeholder="Name (optional)"
              className="rounded-lg border border-line bg-well px-3 py-2 text-[13px]"
            />
            <div className="flex gap-2">
              <select
                name="grant"
                defaultValue="24"
                className="flex-1 rounded-lg border border-line bg-well px-3 py-2 text-[13px]"
              >
                {GRANTS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
              <button className="rounded-lg bg-accent px-4 py-2 font-['Inter_Tight',sans-serif] text-[12.5px] font-semibold text-white">
                Send link
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-line bg-tk-white">
            {recipients.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-ink-3">Nobody yet.</p>
            ) : (
              recipients.map((r) => {
                const state = grantState(r, now)
                return (
                  <div key={r.id} className="grid gap-2 border-b border-line p-3 last:border-b-0">
                    <div>
                      <div className="break-all font-mono text-[12.5px] text-tk-onyx">{r.email}</div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">
                        {r.name ? `${r.name} · ` : ""}
                        {r.lastSeenAt ? `opened ${agoLabel(r.lastSeenAt, now)}` : "never opened"}
                        {r.viewCount ? ` · ${r.viewCount} visits` : ""}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StateChip state={state} r={r} now={now} />
                      <span className="flex-1" />
                      <form action={setGrantAction} className="flex items-center gap-1">
                        <input type="hidden" name="recipientId" value={r.id} />
                        <select
                          name="grant"
                          defaultValue={r.expiresAt ? "24" : "never"}
                          className="rounded-md border border-line bg-well px-2 py-1 text-[11.5px]"
                        >
                          {GRANTS.map((g) => (
                            <option key={g.value} value={g.value}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                        <button className="rounded-md border border-line px-2 py-1 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-ink-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                          Set
                        </button>
                      </form>
                      <form action={resendAction}>
                        <input type="hidden" name="recipientId" value={r.id} />
                        <button className="rounded-md border border-line px-2 py-1 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-ink-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                          {state === "expired" || state === "revoked" ? "Re-share" : "Resend"}
                        </button>
                      </form>
                      {state !== "revoked" ? (
                        <form action={revokeAction}>
                          <input type="hidden" name="recipientId" value={r.id} />
                          <button className="rounded-md border border-line px-2 py-1 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-ink-3 hover:border-tk-tomato hover:text-tk-tomato">
                            Revoke
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <h2 className="mt-2 font-['Inter_Tight',sans-serif] text-[11.5px] font-bold uppercase tracking-[0.14em] text-ink-3">
            Activity
          </h2>
          <div className="rounded-xl border border-line bg-tk-white p-3">
            {events.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-ink-3">Nothing yet.</p>
            ) : (
              events.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[auto_1fr] gap-3 border-b border-line py-2 text-[12.5px] last:border-b-0"
                >
                  <span className="whitespace-nowrap font-mono text-[11px] text-ink-3">
                    {agoLabel(e.at, now)}
                  </span>
                  <span className="text-tk-slate">
                    <b className="text-tk-onyx">{e.recipient?.email ?? "Someone"}</b>{" "}
                    {EVENT_LABEL[e.kind as SlinkEventKind] ?? e.kind}
                    {e.detail && e.kind !== "invited" ? <span className="text-ink-3"> · {e.detail}</span> : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function StateChip({
  state,
  r,
  now,
}: {
  state: ReturnType<typeof grantState>
  r: { expiresAt: Date | null }
  now: Date
}) {
  const tone =
    state === "indefinite"
      ? "bg-tk-teal/12 text-tk-teal"
      : state === "active"
        ? "bg-well text-ink-3"
        : "bg-tk-tomato/10 text-tk-tomato"
  const label =
    state === "indefinite"
      ? "Never expires"
      : state === "active"
        ? timeLeftLabel(r.expiresAt, now).replace("Access expires in ", "")
        : state === "expired"
          ? "Expired"
          : "Revoked"
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-['Inter_Tight',sans-serif] text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-['Inter_Tight',sans-serif] text-[11px] font-bold uppercase tracking-[0.09em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}

/**
 * Adding a block. Tables and fields are pasted rather than built cell by cell,
 * because a zone file or a set of bank details already exists somewhere as
 * text — retyping it into a grid is how a digit goes missing.
 */
function AddBlock({
  slinkId,
  vault,
  lists,
  hasClient,
}: {
  slinkId: string
  vault: { id: string; title: string; username: string }[]
  lists: { id: string; title: string }[]
  hasClient: boolean
}) {
  const input = "w-full rounded-lg border border-line bg-well px-3 py-2 text-[13px]"
  const submit =
    "justify-self-start rounded-lg bg-accent px-3 py-1.5 font-['Inter_Tight',sans-serif] text-[12px] font-semibold text-white"

  return (
    <details className="rounded-xl border border-dashed border-line-strong bg-tk-white/60 p-4">
      <summary className="transition-colors duration-[120ms] hover:text-accent-ink cursor-pointer font-['Inter_Tight',sans-serif] text-[13px] font-semibold text-tk-onyx">
        Add a block
      </summary>

      <div className="mt-4 grid gap-5">
        <form action={addBlockAction} className="grid gap-2">
          <input type="hidden" name="slinkId" value={slinkId} />
          <input type="hidden" name="kind" value="text" />
          <Labeled label="Text">
            <input name="title" placeholder="Heading (optional)" className={input} />
          </Labeled>
          <textarea name="body" rows={3} required placeholder="What they need to know…" className={input} />
          <button className={submit}>Add text</button>
        </form>

        <form action={addBlockAction} className="grid gap-2">
          <input type="hidden" name="slinkId" value={slinkId} />
          <input type="hidden" name="kind" value="table" />
          <Labeled label="Table — paste it, first line is the header">
            <input name="title" placeholder="DNS records" className={input} />
          </Labeled>
          <textarea
            name="tsv"
            rows={4}
            required
            placeholder={"Type\tHost\tValue\tTTL\nA\t@\t76.223.105.230\t300"}
            className={`${input} font-mono text-[12px]`}
          />
          <button className={submit}>Add table</button>
        </form>

        <form action={addBlockAction} className="grid gap-2">
          <input type="hidden" name="slinkId" value={slinkId} />
          <input type="hidden" name="kind" value="fields" />
          <Labeled label="Fields — one “Label: value” per line">
            <input name="title" placeholder="ACH details" className={input} />
          </Labeled>
          <textarea
            name="pairs"
            rows={4}
            required
            placeholder={"Bank: First National\nRouting: 021000021\nAccount: 000123456789"}
            className={`${input} font-mono text-[12px]`}
          />
          <button className={submit}>Add fields</button>
        </form>

        <form action={addBlockAction} className="grid gap-2">
          <input type="hidden" name="slinkId" value={slinkId} />
          <input type="hidden" name="kind" value="credential" />
          <Labeled label="Credential — from the Vault, secret stays there">
            <select name="vaultEntryId" required className={input}>
              <option value="">Pick an entry…</option>
              {vault.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                  {v.username ? ` · ${v.username}` : ""}
                </option>
              ))}
            </select>
          </Labeled>
          <button className={submit}>Add credential</button>
        </form>

        <form action={addBlockAction} className="grid gap-2" encType="multipart/form-data">
          <input type="hidden" name="slinkId" value={slinkId} />
          <input type="hidden" name="kind" value="file" />
          <Labeled label="File">
            <input type="file" name="file" required className={input} />
          </Labeled>
          <button className={submit}>Add file</button>
        </form>

        {hasClient ? (
          <>
            <form action={addBlockAction} className="grid gap-2">
              <input type="hidden" name="slinkId" value={slinkId} />
              <input type="hidden" name="kind" value="punchlist" />
              <Labeled label="Punch list — stays current after sending">
                <select name="sourceId" required className={input}>
                  <option value="">Pick a list…</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              </Labeled>
              <button className={submit}>Add punch list</button>
            </form>

            <form action={addBlockAction} className="grid gap-2">
              <input type="hidden" name="slinkId" value={slinkId} />
              <input type="hidden" name="kind" value="reports" />
              <input type="hidden" name="sourceId" value="" />
              <p className="text-[12.5px] text-ink-3">Filed reports for this client, always up to date.</p>
              <button className={submit}>Add reports</button>
            </form>

            <form action={addBlockAction} className="grid gap-2">
              <input type="hidden" name="slinkId" value={slinkId} />
              <input type="hidden" name="kind" value="dashboard" />
              <p className="text-[12.5px] text-ink-3">
                Traffic, search and site health for this client, read live.
              </p>
              <button className={submit}>Add dashboard</button>
            </form>
          </>
        ) : (
          <p className="text-[12.5px] text-ink-3">
            Pick a client above to add a punch list, reports or the dashboard.
          </p>
        )}
      </div>
    </details>
  )
}
