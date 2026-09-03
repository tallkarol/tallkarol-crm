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
  const { listSessionHistory, searchSessions, messagesForSession } = await import("../lib/leftoff-history")

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
      const hasMessages = await tx.execute(
        sql`select 1 from information_schema.tables where table_name = 'session_messages'`
      )
      if (!hasMessages.length) await apply("0050_session_messages")
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

      console.log("agents + handoff")
      r = await recordNote({ sessionRef: REF, surface: "claude", event: "SubagentStart", at: at(90), agent: { id: "a1", type: "Explore", op: "start" } }, tx)
      check("first subagent start applies the touch", [r.applied, r.state], [true, null])
      r = await recordNote({ sessionRef: REF, surface: "claude", event: "SubagentStart", at: at(90), agent: { id: "a2", type: "qa", op: "start", description: "verify the build" } }, tx)
      check("same-millisecond second start: touch dropped…", r.applied, false)
      row = (await tx.execute(sql`select meta->'agents' as agents from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("…but both agents are in the set", Object.keys((row.agents as Record<string, unknown>) ?? {}).sort(), ["a1", "a2"])
      r = await recordNote({ sessionRef: REF, surface: "claude", event: "SubagentStop", at: at(89), agent: { id: "a1", type: "Explore", op: "stop" } }, tx)
      row = (await tx.execute(sql`select meta->'agents' as agents, event_at from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("an older stop still removes its agent", [r.applied, Object.keys((row.agents as Record<string, unknown>) ?? {})], [false, ["a2"]])
      check("…without moving event_at", new Date(row.event_at as string).toISOString(), at(90).toISOString())
      let view = (await loadLeftOff(at(95), tx)).notes.find((n) => n.sessionRef === REF)
      check("view counts the live agent", view?.agents, { running: 1, types: ["qa"], since: at(90).toISOString() })

      const handoff = { done: "shipped the endpoint", blocked: "your pick of the SLA tier", next: "wire the Mac panel" }
      await recordNote({ sessionRef: REF, surface: "claude", event: "Stop", at: at(100), reply: "prose", meta: { handoff } }, tx)
      view = (await loadLeftOff(at(101), tx)).notes.find((n) => n.sessionRef === REF)
      check("stop stores the handoff", view?.handoff, handoff)
      r = await recordNote({ sessionRef: REF, surface: "claude", event: "SubagentStop", at: at(105), agent: { id: "a2", type: "qa", op: "stop" } }, tx)
      const collided = await recordNote({ sessionRef: REF, surface: "claude", event: "Stop", at: at(105), reply: "same millisecond as the subagent stop", meta: { handoff: { done: "d2", blocked: "", next: "n2" } } }, tx)
      view = (await loadLeftOff(at(106), tx)).notes.find((n) => n.sessionRef === REF)
      check("a Stop the guard drops still lands its handoff", [collided.applied, view?.handoff?.next], [false, "n2"])
      await recordNote({ sessionRef: REF, surface: "claude", event: "Stop", at: at(50), reply: "stale", meta: { handoff: { done: "OLD", blocked: "", next: "OLD" } } }, tx)
      view = (await loadLeftOff(at(107), tx)).notes.find((n) => n.sessionRef === REF)
      check("…but a genuinely older Stop does not", view?.handoff?.next, "n2")

      await recordNote({ sessionRef: REF, surface: "claude", event: "SessionEnd", at: at(110), agent: { id: "", type: "", op: "clear" } }, tx)
      row = (await tx.execute(sql`select state, meta ? 'agents' as has_agents, meta ? 'handoff' as has_handoff from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("session end clears the agent set, keeps the handoff", [row.state, row.has_agents, row.has_handoff], ["gone", false, true])
      await recordNote({ sessionRef: REF, surface: "claude", event: "UserPromptSubmit", at: at(120), prompt: "next thing" }, tx)
      row = (await tx.execute(sql`select state, meta ? 'handoff' as has_handoff from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("a new prompt drops the stale handoff", [row.state, row.has_handoff], ["working", false])

      console.log("agent lane")
      const LANE = "agent:purser:" + REF
      await recordNote(
        { sessionRef: LANE, surface: "claude", event: "Stop", at: at(130), title: "LEDGER REPORT — mineralife — Aug", reply: "3 flags", client: anyClient?.slug, meta: { handoff, agent: { type: "purser", parent: REF } } },
        tx
      )
      row = (await tx.execute(sql`select surface, state from session_notes where session_ref = ${LANE}`))[0] as Record<string, unknown>
      check("an agent: ref is an agent lane whatever surface was sent", [row.surface, row.state], ["agent", "waiting"])
      view = (await loadLeftOff(at(130 + 4 * 3600), tx)).notes.find((n) => n.sessionRef === LANE)
      check("a lane still waits four hours later", [view?.state, view?.handoff?.blocked], ["waiting", handoff.blocked])
      await recordNote({ sessionRef: LANE, surface: "agent", event: "SessionEnd", at: at(140) }, tx)
      row = (await tx.execute(sql`select state, ended_at from session_notes where session_ref = ${LANE}`))[0] as Record<string, unknown>
      check("a closed lane is gone with ended_at", [row.state, row.ended_at != null], ["gone", true])

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

      console.log("messages")
      let msgs = (await tx.execute(
        sql`select role, text, origin from session_messages where session_ref = ${REF} order by at`
      )) as unknown as { role: string; text: string; origin: string }[]
      check("the prompt and every reply were kept", msgs.length >= 3, true)
      check("the first is what was asked", [msgs[0].role, msgs[0].text], ["user", "do the thing"])
      check("hook rows are marked as such", msgs[0].origin, "hook")
      check(
        "the reply the guard dropped was still stored",
        msgs.some((m) => m.role === "assistant" && m.text === "same millisecond as the subagent stop"),
        true
      )
      check(
        "a retried Stop is not a second message",
        msgs.filter((m) => m.text === "done, your call").length,
        1
      )
      // The board keeps the newest thing said; history keeps everything said.
      // A Stop that arrives out of order is a turn that really happened, just
      // late — dropping it would put a hole in the record.
      check(
        "a reply the board rejected as stale is still history",
        msgs.some((m) => m.text === "STALE"),
        true
      )
      const manualMsgs = await tx.execute(
        sql`select 1 from session_messages where session_ref = ${manual.sessionRef}`
      )
      check("a post-it is not a conversation", manualMsgs.length, 0)

      const convo = await messagesForSession(REF, { head: 1, tail: 2 }, tx)
      check("the peek reads the start and the end", [convo.head.length, convo.tail.length], [1, 2])
      check("…and knows how many there are", convo.total, msgs.length)

      console.log("a session that ends is remembered")
      let sess = (await tx.execute(
        sql`select surface, name, ended_at, summary from agent_sessions where session_ref = ${REF}`
      )) as unknown as Record<string, unknown>[]
      check("SessionEnd left an agent_sessions row", sess.length, 1)
      check("…named from the note, with no invented summary", [sess[0].name, sess[0].summary], ["Thing doing", ""])

      // A summary already written must never be clobbered by the stub.
      await tx.execute(sql`update agent_sessions set summary = 'real summary' where session_ref = ${REF}`)
      await recordNote({ sessionRef: REF, surface: "claude", event: "SessionEnd", at: at(200) }, tx)
      sess = (await tx.execute(
        sql`select summary from agent_sessions where session_ref = ${REF}`
      )) as unknown as Record<string, unknown>[]
      check("a later stub leaves a written summary alone", sess[0].summary, "real summary")

      console.log("backfill ownership")
      const OLD = REF + "-old"
      await tx.execute(sql`
        insert into session_messages (session_ref, surface, role, at, text, origin)
        values (${OLD}, 'cursor', 'user', ${at(-9999).toISOString()}::timestamptz, 'an ancient question', 'backfill')`)
      const owned = (await tx.execute(sql`
        select count(*)::int as n from session_messages where session_ref = ${REF} and origin = 'hook'`)) as unknown as { n: number }[]
      check("the hooks own this session, so a backfill must skip it", Number(owned[0].n) > 0, true)
      await tx.execute(sql`
        insert into session_messages (session_ref, surface, role, at, text, origin)
        values (${REF}, 'claude', 'user', ${at(0).toISOString()}::timestamptz, 'do the thing', 'backfill')
        on conflict (session_ref, role, at) do nothing`)
      msgs = (await tx.execute(
        sql`select role from session_messages where session_ref = ${REF} and at = ${at(0).toISOString()}::timestamptz`
      )) as unknown as { role: string; text: string; origin: string }[]
      check("the same turn cannot be stored twice", msgs.length, 1)

      console.log("search")
      const hits = await searchSessions("ancient question", {}, at(100), tx)
      check("a message is findable by its words", hits.some((h) => h.sessionRef === OLD), true)
      const hit = hits.find((h) => h.sessionRef === OLD)
      check("…and says where it matched", hit?.hits[0]?.snippet.some((p) => p.hit), true)
      const byTitle = await searchSessions("Thing doing", {}, at(100), tx)
      check("a title is findable too", byTitle.some((h) => h.sessionRef === REF), true)
      check("a stop-word-only query does not explode", (await searchSessions("how do i", {}, at(100), tx)).length >= 0, true)

      console.log("history")
      const history = await listSessionHistory({ from: at(-20000) }, at(100), tx)
      check("the chat is in history", history.some((h) => h.sessionRef === REF), true)
      check("so is a session that only ever had messages", history.some((h) => h.sessionRef === OLD), true)
      check("post-its stay out of history", history.some((h) => h.sessionRef === manual.sessionRef), false)
      const mine2 = history.find((h) => h.sessionRef === REF)
      check("history counts the conversation", (mine2?.messageCount ?? 0) > 0, true)

      console.log("sweep keeps everything")
      // Two days silent: presumed gone, and it gets its history row.
      await tx.execute(sql`update session_notes set event_at = ${at(-2 * 86400).toISOString()}::timestamptz, state = 'waiting', pinned = false, body = '' where session_ref = ${REF}`)
      const swept = await sweepSessionNotes(at(100), tx)
      check("a silent chat is presumed gone", swept.presumedGone >= 1, true)
      row = (await tx.execute(sql`select state, ended_at from session_notes where session_ref = ${REF}`))[0] as Record<string, unknown>
      check("…and reads as gone, ended when last heard from", [row.state, row.ended_at != null], ["gone", true])
      // A month later it is still there: history is not swept.
      await tx.execute(sql`update session_notes set ended_at = ${at(-30 * 86400).toISOString()}::timestamptz, dismissed_at = ${at(-30 * 86400).toISOString()}::timestamptz where session_ref = ${REF}`)
      const swept2 = await sweepSessionNotes(at(100), tx)
      check("nothing is deleted any more", swept2.purged, 0)
      const left = await tx.execute(sql`select 1 from session_notes where session_ref = ${REF}`)
      check("a month-old dismissed note is still on file", left.length, 1)
      const stillSaid = await tx.execute(sql`select 1 from session_messages where session_ref = ${REF}`)
      check("and so is what was said", stillSaid.length > 0, true)

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
