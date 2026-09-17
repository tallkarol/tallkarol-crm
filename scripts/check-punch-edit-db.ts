/**
 * The chat's punch tools against the real database, on punches this script
 * plants yesterday and then deletes (with any timesheet line it made):
 * edit in review, split with a drop and a replay, approve, edit an approved
 * punch (the line follows), the billed-month guard, split an approved punch,
 * drop it (the line goes), reopen it. No running punch is ever planted — it
 * would show on Karol's floating clock.
 *
 *   npm run check:punch:db
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
  const { clients, invoices, timeEntries, timePunches, users } = await import("../db/schema")
  const { and, eq, inArray, ne, sql } = await import("drizzle-orm")
  const { toolByName } = await import("../lib/chat/tools")
  const { occurredOnIn, parsePunchTime } = await import("../lib/punch")
  const { workspaceTimezone } = await import("../lib/timezone")

  const tag = `chk-punch-${Math.random().toString(36).slice(2, 8)}`
  const admin = await db.query.users.findFirst({ where: eq(users.role, "admin") })
  if (!admin) throw new Error("no admin user")
  const tz = await workspaceTimezone()
  const yesterday = occurredOnIn(new Date(Date.now() - 86_400_000), tz)
  const month = yesterday.slice(0, 7)

  // A client whose month is not locked by an invoice, so approving is an ordinary write.
  const locked = await db
    .select({ clientId: invoices.clientId })
    .from(invoices)
    .where(and(sql`to_char(${invoices.issuedOn}, 'YYYY-MM') = ${month}`, ne(invoices.status, "draft")))
  const client = await db.query.clients.findFirst({
    where: locked.length ? sql`${clients.id} not in (${sql.join(locked.map((l) => sql`${l.clientId}`), sql`, `)})` : undefined,
  })
  if (!client) throw new Error("no client with an unbilled month")
  // An invoice that locks some other client-month, for the guard.
  const lockingInvoice = await db.query.invoices.findFirst({ where: ne(invoices.status, "draft"), with: { client: true } })

  const ctx = (key: string) => ({ userId: admin.id, threadId: "check", idempotencyKey: `${tag}-${key}` })
  const tool = (name: string) => {
    const t = toolByName(name)
    if (!t) throw new Error(`tool ${name} missing`)
    return t
  }
  const local = (clock: string) => {
    const r = parsePunchTime(clock, yesterday, tz)
    if ("error" in r) throw new Error(r.error)
    return r.at
  }

  const [planted] = await db
    .insert(timePunches)
    .values({
      userId: admin.id,
      clientId: client.id,
      startedAt: local("9:00 AM"),
      endedAt: local("5:00 PM"),
      status: "stopped",
      note: `${tag} planted`,
      source: "web",
    })
    .returning({ id: timePunches.id })
  const id = planted.id
  const madeIds = [id]

  try {
    /* ---------- list ---------- */
    const listed = (await tool("list_punches").run({ status: "review", day: yesterday, clientSlug: client.slug }, ctx("list"))) as {
      punches: { punchId: string; clockIn: string; clockOut: string; status: string }[]
    }
    const row = listed.punches.find((p) => p.punchId === id)
    check("list_punches finds the planted punch in review", row?.status === "in review" && row.clockIn === "9:00 AM" && row.clockOut === "5:00 PM", JSON.stringify(row))

    /* ---------- edit in review ---------- */
    const preview = await tool("edit_punch").preview!({ punchId: id, clockOut: "11:48 AM", summary: `${tag} careers edits` }, ctx("e1"))
    const clock = preview.fields.find((f) => f.label === "Clock")?.value
    check("edit preview shows the clock change", clock === "9:00 AM – 5:00 PM → 9:00 AM – 11:48 AM", clock)
    await tool("edit_punch").run({ punchId: id, clockOut: "11:48 AM", summary: `${tag} careers edits` }, ctx("e1"))
    let p = await db.query.timePunches.findFirst({ where: eq(timePunches.id, id) })
    check("edit wrote the clock-out and summary", p?.endedAt?.toISOString() === local("11:48 AM").toISOString() && p?.note === `${tag} careers edits` && p?.status === "stopped")

    let refused = ""
    try {
      await tool("edit_punch").preview!({ punchId: id, hours: 2 }, ctx("e2"))
    } catch (e) {
      refused = (e as Error).message
    }
    check("hours are refused on a punch not yet approved", refused.includes("already on the timesheet"), refused)

    /* ---------- split with drop, then replay ---------- */
    const splitArgs = { punchId: id, at: "10:30 AM", drop: "after", secondSummary: `${tag} afternoon` }
    const splitPreview = await tool("split_punch").preview!(splitArgs, ctx("s1"))
    check("split preview names both pieces", splitPreview.fields.some((f) => f.label === "Second piece" && f.value.includes("dropped")), JSON.stringify(splitPreview.fields))
    const split = (await tool("split_punch").run(splitArgs, ctx("s1"))) as { second: { punchId: string }; replayed: boolean }
    madeIds.push(split.second.punchId)
    const again = (await tool("split_punch").run(splitArgs, ctx("s1"))) as { second: { punchId: string }; replayed: boolean }
    check("a confirmed split replays instead of cutting twice", again.replayed && again.second.punchId === split.second.punchId)
    const second = await db.query.timePunches.findFirst({ where: eq(timePunches.id, split.second.punchId) })
    p = await db.query.timePunches.findFirst({ where: eq(timePunches.id, id) })
    check("first piece ends at the cut", p?.endedAt?.toISOString() === local("10:30 AM").toISOString())
    check("second piece is dropped, with its own summary", second?.status === "discarded" && second.note === `${tag} afternoon` && second.startedAt.toISOString() === local("10:30 AM").toISOString())

    /* ---------- approve ---------- */
    const approved = (await tool("approve_punch").run({ punchId: id, summary: `${tag} approved` }, ctx("a1"))) as { timeEntryId: string }
    let entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, approved.timeEntryId) })
    check("approve writes a 1.5 h line", entry?.hours === "1.50" && entry.summary === `${tag} approved`, entry?.hours)
    const replayApprove = (await tool("approve_punch").run({ punchId: id }, ctx("a1"))) as { replayed: boolean }
    check("approving twice is a no-op", replayApprove.replayed)

    /* ---------- edit an approved punch: the line follows ---------- */
    await tool("edit_punch").run({ punchId: id, clockIn: "9:15 AM", summary: `${tag} moved` }, ctx("e3"))
    entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, approved.timeEntryId) })
    p = await db.query.timePunches.findFirst({ where: eq(timePunches.id, id) })
    check("approved edit re-bills the span", entry?.hours === "1.25" && entry.startedAt === "9:15 AM" && entry.summary === `${tag} moved`, `${entry?.hours} ${entry?.startedAt}`)
    check("the punch stays approved", p?.status === "approved" && p.timeEntryId === approved.timeEntryId)

    await tool("edit_punch").run({ punchId: id, hours: 2 }, ctx("e4"))
    entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, approved.timeEntryId) })
    check("explicit hours override the span", entry?.hours === "2.00")

    const keepPreview = await tool("edit_punch").preview!({ punchId: id, summary: `${tag} words only` }, ctx("e5"))
    check("a summary-only edit keeps the hand-set hours", (keepPreview.fields.find((f) => f.label === "Billed hours")?.value ?? "") === "2.00 h", JSON.stringify(keepPreview.fields))

    /* ---------- billed-month guard ---------- */
    if (lockingInvoice?.client) {
      const lockedDay = lockingInvoice.issuedOn
      let guard = ""
      try {
        await tool("edit_punch").preview!({ punchId: id, clientSlug: lockingInvoice.client.slug, day: lockedDay }, ctx("g1"))
      } catch (e) {
        guard = (e as Error).message
      }
      check("moving a line into a billed month is refused without force", guard.includes(lockingInvoice.number) && guard.includes("force: true"), guard)
      const forced = await tool("edit_punch").preview!({ punchId: id, clientSlug: lockingInvoice.client.slug, day: lockedDay, force: true }, ctx("g1"))
      check("with force the preview warns instead", (forced.note ?? "").includes(lockingInvoice.number), forced.note)
    } else {
      check("no non-draft invoice to test the guard against — skipped", true)
    }

    /* ---------- split an approved punch ---------- */
    const split2 = (await tool("split_punch").run({ punchId: id, at: "9:45 AM" }, ctx("s2"))) as { second: { punchId: string; status: string } }
    madeIds.push(split2.second.punchId)
    entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, approved.timeEntryId) })
    check("approved split re-bills the first piece", entry?.hours === "0.50" && entry.endedAt === "9:45 AM", `${entry?.hours} ${entry?.endedAt}`)
    check("the rest goes to Review", split2.second.status === "in review")

    /* ---------- drop the approved punch: the line goes ---------- */
    const dropPreview = await tool("drop_punch").preview!({ punchId: id }, ctx("d1"))
    check("drop preview says the line is removed", dropPreview.fields.some((f) => f.label === "Timesheet line" && f.value.includes("removed")))
    await tool("drop_punch").run({ punchId: id }, ctx("d1"))
    entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, approved.timeEntryId) })
    p = await db.query.timePunches.findFirst({ where: eq(timePunches.id, id) })
    check("dropping an approved punch deletes its line and keeps the punch", !entry && p?.status === "discarded" && p.timeEntryId === null)

    /* ---------- reopen ---------- */
    await tool("edit_punch").run({ punchId: id, reopen: true }, ctx("r1"))
    p = await db.query.timePunches.findFirst({ where: eq(timePunches.id, id) })
    check("reopen sends a discarded punch back to Review", p?.status === "stopped")

    let future = ""
    try {
      await tool("edit_punch").preview!({ punchId: id, clockOut: "11:00 PM", day: occurredOnIn(new Date(Date.now() + 2 * 86_400_000), tz) }, ctx("f1"))
    } catch (e) {
      future = (e as Error).message
    }
    check("a future time is refused", future.includes("future"), future)
  } finally {
    const rows = await db.query.timePunches.findMany({ where: inArray(timePunches.id, madeIds) })
    const entryIds = rows.map((r) => r.timeEntryId).filter((x): x is string => Boolean(x))
    const tagged = await db.select({ id: timeEntries.id }).from(timeEntries).where(sql`${timeEntries.summary} like ${`${tag}%`}`)
    const allEntries = Array.from(new Set(entryIds.concat(tagged.map((t) => t.id))))
    await db.delete(timePunches).where(inArray(timePunches.id, madeIds))
    if (allEntries.length) await db.delete(timeEntries).where(inArray(timeEntries.id, allEntries))
    const left = await db.select({ n: sql<number>`count(*)::int` }).from(timePunches).where(sql`${timePunches.note} like ${`${tag}%`}`)
    check("cleanup: nothing planted is left", Number(left[0]?.n ?? 0) === 0)
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed")
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
