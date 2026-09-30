/**
 * The chat's search and billing tools against the real database, on rows this
 * script plants and then deletes: a brainstorm note (found, filtered, opened),
 * a private chat thread (never found, never opened), an hours draft for a
 * 2019 month with one planted line (numbered, linked, replayed), and a
 * deliverable draft on DQS (next on the DQS-NNN sequence, replayed).
 * Previews of real months are read-only.
 *
 *   npm run check:chat:billing:db
 */

import { loadLocalEnv } from "../lib/load-env"

loadLocalEnv()

let failures = 0
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`)
  else {
    failures += 1
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

async function main() {
  const { db } = await import("../db")
  const { brainstormNotes, chatMessages, chatThreads, clients, deliverables, invoices, projects, timeEntries, users } = await import("../db/schema")
  const { eq, inArray, like } = await import("drizzle-orm")
  const { toolByName } = await import("../lib/chat/tools")

  const tag = `chkbill${Math.random().toString(36).slice(2, 8)}`
  const admin = await db.query.users.findFirst({ where: eq(users.role, "admin") })
  if (!admin) throw new Error("no admin user")
  const ctx = (key: string) => ({ userId: admin.id, threadId: "check", idempotencyKey: `${tag}-${key}` })
  const tool = (name: string) => {
    const t = toolByName(name)
    if (!t) throw new Error(`tool ${name} missing`)
    return t
  }
  const gdi = await db.query.clients.findFirst({ where: eq(clients.slug, "gdi") })
  const dqs = await db.query.clients.findFirst({ where: eq(clients.slug, "dqs") })
  if (!gdi || !dqs) throw new Error("gdi and dqs clients are needed")
  const dqsProject = await db.query.projects.findFirst({ where: eq(projects.clientId, dqs.id) })
  if (!dqsProject) throw new Error("no DQS project")

  const made = { notes: [] as string[], threads: [] as string[], entries: [] as string[], deliverables: [] as string[], invoices: [] as string[] }

  try {
    /* ---------- search + read ---------- */
    const [note] = await db
      .insert(brainstormNotes)
      .values({ clientId: gdi.id, topic: `${tag} topic`, body: `${tag} the careers sunset redirect idea` })
      .returning({ id: brainstormNotes.id })
    made.notes.push(note.id)

    type Hits = { hits: { kind: string; id: string; client: string | null; snippet: string }[]; counts: Record<string, string> }
    const found = (await tool("search_crm").run({ q: `${tag} sunset` }, ctx("s1"))) as Hits
    const hit = found.hits.find((h) => h.id === note.id)
    check("search finds a planted note by two terms", hit?.kind === "brainstorm" && hit.client === "GDI" && hit.snippet.includes(tag), JSON.stringify(hit))
    const none = (await tool("search_crm").run({ q: `${tag} sunset`, clientSlug: "dqs" }, ctx("s2"))) as Hits
    check("clientSlug filters it out for another client", none.hits.length === 0)
    const miss = (await tool("search_crm").run({ q: `${tag} nowhere-at-all` }, ctx("s3"))) as Hits
    check("every term must match", miss.hits.length === 0)
    const onlyTasks = (await tool("search_crm").run({ q: tag, kinds: "task" }, ctx("s4"))) as Hits
    check("kinds narrows the search", onlyTasks.hits.length === 0)
    const opened = (await tool("read_record").run({ kind: "brainstorm", id: note.id }, ctx("r1"))) as Record<string, unknown>
    check("read_record opens the note", opened.body === `${tag} the careers sunset redirect idea` && opened.client === "GDI")

    const [thread] = await db
      .insert(chatThreads)
      .values({ userId: admin.id, title: `${tag} private`, private: true })
      .returning({ id: chatThreads.id })
    made.threads.push(thread.id)
    const [message] = await db
      .insert(chatMessages)
      .values({ threadId: thread.id, role: "user", body: `${tag} secret coaching note` })
      .returning({ id: chatMessages.id })
    const privateSearch = (await tool("search_crm").run({ q: `${tag} coaching` }, ctx("s5"))) as Hits
    check("a private thread is never searched", privateSearch.hits.length === 0, JSON.stringify(privateSearch.counts))
    let refused = ""
    try {
      await tool("read_record").run({ kind: "chat", id: message.id }, ctx("r2"))
    } catch (e) {
      refused = (e as Error).message
    }
    check("a private thread's message cannot be opened", refused === "No such record.", refused)

    /* ---------- billing: previews on real months (read-only) ---------- */
    const mineralife = await tool("draft_invoice").preview!({ clientSlug: "mineralife", month: "2026-02" }, ctx("p1"))
    check("a month that already has its invoice says so", (mineralife.note ?? "").includes("already covers") && mineralife.fields.some((f) => f.label === "Amount" && f.value !== "$0.00"), mineralife.note)
    const sequence = await tool("draft_invoice").preview!({ clientSlug: "mineralife", month: "2019-02", hours: 30 }, ctx("p2"))
    const seqNumber = sequence.fields.find((f) => f.label === "Number")?.value ?? ""
    check("a sequenced client drafts the next NNN-M", /^\d{3}-M$/.test(seqNumber), seqNumber)

    /* ---------- billing: hours draft ---------- */
    const [entry] = await db
      .insert(timeEntries)
      .values({ clientId: gdi.id, userId: admin.id, occurredOn: "2019-01-15", startedAt: "9:00 AM", endedAt: "10:30 AM", hours: "1.50", summary: `${tag} planted line` })
      .returning({ id: timeEntries.id })
    made.entries.push(entry.id)
    const before = (await tool("list_billing").run({ clientSlug: "gdi" }, ctx("l1"))) as { unbilledMonths: { month: string; unbilledHours: number }[] }
    check("list_billing shows the planted month", before.unbilledMonths.some((m) => m.month === "2019-01" && m.unbilledHours === 1.5))
    const hoursPreview = await tool("draft_invoice").preview!({ clientSlug: "gdi", month: "2019-01" }, ctx("d1"))
    const field = (label: string) => hoursPreview.fields.find((f) => f.label === label)?.value
    check("hours preview: number, hours, lines", field("Number") === "GDI-2019-01" && field("Hours") === "1.5 h" && field("Lines") === "1 timesheet line linked", JSON.stringify(hoursPreview.fields))
    const drafted = (await tool("draft_invoice").run({ clientSlug: "gdi", month: "2019-01" }, ctx("d1"))) as { number: string; status: string; alreadyDrafted: boolean; linkedLines: number }
    const draftRow = await db.query.invoices.findFirst({ where: eq(invoices.number, "GDI-2019-01") })
    if (draftRow) made.invoices.push(draftRow.id)
    const linked = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, entry.id) })
    check("the draft is written as a draft and links the line", drafted.status === "draft" && !drafted.alreadyDrafted && drafted.linkedLines === 1 && linked?.invoiceId === draftRow?.id && draftRow?.status === "draft")
    const again = (await tool("draft_invoice").run({ clientSlug: "gdi", month: "2019-01" }, ctx("d1"))) as { number: string; alreadyDrafted: boolean }
    check("confirming again returns the same draft", again.alreadyDrafted && again.number === "GDI-2019-01")
    const count = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.number, "GDI-2019-01"))
    check("only one invoice exists", count.length === 1)

    /* ---------- billing: deliverable draft ---------- */
    const [deliverable] = await db
      .insert(deliverables)
      .values({ projectId: dqsProject.id, label: tag.toUpperCase(), title: "check fee", status: "done", feeCents: 1234 })
      .returning({ id: deliverables.id })
    made.deliverables.push(deliverable.id)
    const listed = (await tool("list_billing").run({ clientSlug: "dqs" }, ctx("l2"))) as { unbilledDeliverables: { deliverableId: string; fee: string }[] }
    check("list_billing shows the billable deliverable", listed.unbilledDeliverables.some((d) => d.deliverableId === deliverable.id && d.fee === "$12.34"))
    const dPreview = await tool("draft_invoice").preview!({ deliverableId: deliverable.id }, ctx("d2"))
    const dNumber = dPreview.fields.find((f) => f.label === "Number")?.value ?? ""
    check("a deliverable drafts the next DQS-NNN", /^DQS-\d{3}$/.test(dNumber), dNumber)
    const dDraft = (await tool("draft_invoice").run({ deliverableId: deliverable.id }, ctx("d2"))) as { number: string; alreadyDrafted: boolean }
    const dRow = await db.query.invoices.findFirst({ where: eq(invoices.deliverableId, deliverable.id) })
    if (dRow) made.invoices.push(dRow.id)
    check("the deliverable draft carries the fee", dRow?.amountCents === 1234 && dRow.status === "draft" && dDraft.number === dNumber)
    const dAgain = (await tool("draft_invoice").run({ deliverableId: deliverable.id }, ctx("d2"))) as { alreadyDrafted: boolean }
    check("a deliverable is never drafted twice", dAgain.alreadyDrafted)

    let mixed = ""
    try {
      await tool("draft_invoice").preview!({ deliverableId: deliverable.id, month: "2019-01" }, ctx("d3"))
    } catch (e) {
      mixed = (e as Error).message
    }
    check("deliverable and month together are refused", mixed.includes("not both"), mixed)
  } finally {
    if (made.invoices.length) await db.delete(invoices).where(inArray(invoices.id, made.invoices))
    if (made.entries.length) await db.delete(timeEntries).where(inArray(timeEntries.id, made.entries))
    if (made.deliverables.length) await db.delete(deliverables).where(inArray(deliverables.id, made.deliverables))
    if (made.threads.length) await db.delete(chatThreads).where(inArray(chatThreads.id, made.threads))
    if (made.notes.length) await db.delete(brainstormNotes).where(inArray(brainstormNotes.id, made.notes))
    const left = [
      ...(await db.select({ id: brainstormNotes.id }).from(brainstormNotes).where(like(brainstormNotes.body, `${tag}%`))),
      ...(await db.select({ id: timeEntries.id }).from(timeEntries).where(like(timeEntries.summary, `${tag}%`))),
      ...(await db.select({ id: chatMessages.id }).from(chatMessages).where(like(chatMessages.body, `${tag}%`))),
      ...(await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.number, "GDI-2019-01"))),
    ]
    check("cleanup: nothing planted is left", left.length === 0)
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed")
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
