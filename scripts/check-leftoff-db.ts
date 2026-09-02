/**
 * The "where I left off" SQL, run for real and rolled back: applies the
 * migration inside a transaction, plays a hook sequence through
 * `recordNote()` — including the out-of-order Stop the guard must drop — and
 * the manual-note, dismiss, pin and sweep paths, then rolls everything back.
 * Safe on a database that already has the table (the CREATE is skipped) and
 * on one that does not. Run with `npm run check:leftoff:db`.
 */

import { readFileSync } from "fs"
import { join } from "path"
import { sql } from "drizzle-orm"
import { loadLocalEnv } from "../lib/load-env"

loadLocalEnv()

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}\n       got  ${a}\n       want ${e}`)
  }
}

class Rollback extends Error {}

async function main() {
  const { db } = await import("../db")
  const { recordNote, dismissNote, pinNote, loadLeftOff, sweepSessionNotes, queueReply, readReply } =
    await import("../lib/leftoff-data")

  const T0 = new Date("2026-09-02T18:00:00.000Z")
  const at = (s: number) => new Date(T0.getTime() + s * 1000)
  const REF = "check-leftoff-" + Math.random().toString(36).slice(2, 10)

  try {
    await db.transaction(async (tx) => {
      const exists = await tx.execute(
        sql`select 1 from information_schema.tables where table_name = 'session_notes'`
      )
      const apply = async (tag: string) => {
        const file = join(process.cwd(), "drizzle", `${tag}.sql`)
        for (const stmt of readFileSync(file, "utf8").split("--> statement-breakpoint")) {
          if (stmt.trim()) await tx.execute(sql.raw(stmt))
        }
        console.log(`  (${tag} applied inside the transaction)`)
      }
      if (!exists.length) await apply("0048_leftoff")
      const hasReply = await tx.execute(
        sql`select 1 from information_schema.columns where table_name = 'session_notes' and column_name = 'reply'`
      )
      if (!hasReply.length) await apply("0049_leftoff_act")
      if (exists.length && hasReply.length) console.log("  (table and columns already exist)")

      console.log("hook sequence")
      let r = await recordNote(
        { sessionRef: REF, surface: "claude", event: "UserPromptSubmit", at: at(0), cwd: "/tmp/proj", prompt: "do the thing" },
        tx
      )
      check("prompt inserts working", [r.applied, r.state], [true, "working"])

      r = await recordNote(
        { sessionRef: REF, surface: "claude", event: "Stop", at: at(10), reply: "done, your call", title: "Thing doing" },
        tx
      )
      check("stop applies waiting", [r.applied, r.state], [true, "waiting"])

      r = await recordNote({ sessionRef: REF, surface: "claude", event: "Stop", at: at(5), reply: "STALE" }, tx)
      check("older stop is dropped by the guard", r.applied, false)

      r = await recordNote({ sessionRef: REF, surface: "claude", event: "Stop", at: at(10), reply: "DUPE" }, tx)
      check("equal timestamp (retry) is dropped", r.applied, false)

      r = await recordNote({ sessionRef: REF, surface: "claude", event: "touch", at: at(20) }, tx)
      check("touch applies without changing state", [r.applied, r.state], [true, null])

      let row = (await tx.execute(sql`select state, title, last_prompt, last_reply, cwd, project from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("state still waiting after touch", row.state, "waiting")
      check("title kept from the stop", row.title, "Thing doing")
      check("stale reply never landed", row.last_reply, "done, your call")
      check("prompt kept though later events carried none", row.last_prompt, "do the thing")
      check("project derived from cwd", row.project, "proj")

      r = await recordNote(
        { sessionRef: REF, surface: "claude", event: "Notification", at: at(30), meta: { notification_type: "permission_prompt" } },
        tx
      )
      check("permission prompt → blocked", r.state, "blocked")

      r = await recordNote({ sessionRef: REF, surface: "claude", event: "SessionEnd", at: at(40) }, tx)
      row = (await tx.execute(sql`select state, ended_at from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("session end → gone with ended_at", [row.state, row.ended_at != null], ["gone", true])

      console.log("dismiss / resume / pin")
      check("dismiss finds the row", await dismissNote(REF, at(50), tx), true)
      r = await recordNote({ sessionRef: REF, surface: "claude", event: "UserPromptSubmit", at: at(60), prompt: "again" }, tx)
      row = (await tx.execute(sql`select state, ended_at, dismissed_at from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("a new prompt revives: working, ended_at and dismissed_at cleared", [row.state, row.ended_at, row.dismissed_at], ["working", null, null])
      check("pin finds the row", await pinNote(REF, true, at(70), tx), true)

      console.log("manual note")
      const manual = await recordNote({ sessionRef: null, surface: "manual", event: "note", at: at(80), body: "call Joe\nabout D2" }, tx)
      check("manual note gets a manual: ref", manual.sessionRef.startsWith("manual:"), true)
      row = (await tx.execute(sql`select surface, title, body, pinned from session_notes where session_ref = ${manual.sessionRef}`))[0] as Record<string, unknown>
      check("manual note surface/title/body/pinned", [row.surface, row.title, row.body, row.pinned], ["manual", "call Joe", "call Joe\nabout D2", true])

      const onChat = await recordNote({ sessionRef: REF, surface: "claude", event: "note", at: at(0), body: "finish the widget", pinned: true }, tx)
      row = (await tx.execute(sql`select body, pinned, surface, title from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("note on a chat with an OLD timestamp still lands (outside the guard)", [onChat.applied, row.body, row.pinned], [false, "finish the widget", true])
      check("note on a chat keeps its surface and title", [row.surface, row.title], ["claude", "Thing doing"])

      console.log("client + blocked-on")
      const [anyClient] = (await tx.execute(sql`select slug from clients order by created_at limit 1`)) as unknown as { slug: string }[]
      if (anyClient) {
        await recordNote({ sessionRef: REF, surface: "claude", event: "touch", at: at(85), client: anyClient.slug }, tx)
        row = (await tx.execute(sql`select c.slug from session_notes n join clients c on c.id = n.client_id where n.session_ref = ${REF}`))[0] as Record<string, unknown>
        check("client slug from the repo pin resolves to client_id", row?.slug, anyClient.slug)
        await recordNote({ sessionRef: REF, surface: "claude", event: "touch", at: at(86), client: "no-such-client-xyz" }, tx)
        row = (await tx.execute(sql`select c.slug from session_notes n join clients c on c.id = n.client_id where n.session_ref = ${REF}`))[0] as Record<string, unknown>
        check("an unknown slug does not clear the client", row?.slug, anyClient.slug)
      }
      await recordNote({ sessionRef: REF, surface: "claude", event: "Notification", at: at(87), blockedOn: "Bash: npm run db:migrate", meta: { notification_type: "permission_prompt" } }, tx)
      row = (await tx.execute(sql`select state, blocked_on from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("blocked note carries what it wants", [row.state, row.blocked_on], ["blocked", "Bash: npm run db:migrate"])
      await recordNote({ sessionRef: REF, surface: "claude", event: "UserPromptSubmit", at: at(88), prompt: "ok go" }, tx)
      row = (await tx.execute(sql`select state, blocked_on from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("the next prompt clears blocked_on", [row.state, row.blocked_on], ["working", ""])

      console.log("reply queue")
      check("queue a reply", await queueReply(REF, "yes, go ahead", at(89), tx), true)
      check("peek does not consume", await readReply(REF, false, tx), "yes, go ahead")
      check("take returns it", await readReply(REF, true, tx), "yes, go ahead")
      check("second take is empty", await readReply(REF, true, tx), "")
      row = (await tx.execute(sql`select reply, reply_at from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("queue cleared after take", [row.reply, row.reply_at], ["", null])

      console.log("snapshot")
      // The browser row is a singleton the real hook may have written moments
      // ago, so the test snapshot must be newer than anything real.
      const snapAt = new Date(Date.now() + 60_000)
      const snap = await recordNote(
        { sessionRef: null, surface: "browser", event: "snapshot", at: snapAt, title: "2 tabs", meta: { windows: [{ title: "Railway", tabs: [{ title: "R", url: "https://railway.app", active: true }] }] } },
        tx
      )
      check("snapshot lands on the browser row", snap.sessionRef, "browser:chrome")

      console.log("payload")
      const payload = await loadLeftOff(new Date(Date.now() + 120_000), tx)
      const mine = payload.notes.filter((n) => n.sessionRef === REF || n.sessionRef === manual.sessionRef)
      check("both rows visible", mine.length, 2)
      check("chat row shows its body over the reply, pinned", [mine.find((n) => n.sessionRef === REF)?.body, mine.find((n) => n.sessionRef === REF)?.pinned], ["finish the widget", true])
      check("browser snapshot in payload", payload.browser?.windows[0]?.title, "Railway")

      console.log("sweep")
      // Two days silent: presumed gone, but far too young to purge.
      await tx.execute(sql`update session_notes set event_at = ${at(-2 * 86400).toISOString()}::timestamptz, pinned = false, body = '' where session_ref = ${REF}`)
      const swept = await sweepSessionNotes(at(100), tx)
      check("a silent chat is presumed gone", swept.presumedGone >= 1, true)
      row = (await tx.execute(sql`select state, ended_at from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("…and reads as gone, ended when last heard from", [row.state, row.ended_at != null], ["gone", true])
      // Thirty days gone: purged. A pinned twin survives.
      await tx.execute(sql`update session_notes set ended_at = ${at(-30 * 86400).toISOString()}::timestamptz where session_ref = ${REF}`)
      await tx.execute(sql`insert into session_notes (session_ref, surface, state, pinned, event_at, ended_at) values (${REF + "-pinned"}, 'claude', 'gone', true, ${at(-30 * 86400).toISOString()}::timestamptz, ${at(-30 * 86400).toISOString()}::timestamptz)`)
      const swept2 = await sweepSessionNotes(at(100), tx)
      check("…then purged after two weeks", swept2.purged >= 1, true)
      const pinnedLeft = await tx.execute(sql`select 1 from session_notes where session_ref = ${REF + "-pinned"}`)
      check("pinned twin survives the purge", pinnedLeft.length, 1)
      const left = await tx.execute(sql`select 1 from session_notes where session_ref = ${REF}`)
      check("row is gone", left.length, 0)

      throw new Rollback("rollback")
    })
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
  }
  console.log("\nRolled back. Nothing was changed.")
  if (failures) {
    console.log(`${failures} check(s) failed`)
    process.exit(1)
  }
  console.log("all leftoff db checks passed")
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
