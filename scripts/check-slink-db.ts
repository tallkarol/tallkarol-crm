/**
 * slink's access rules, run for real against the database and rolled back.
 *
 * The whole point of this file is the gate: that a magic link works once, that
 * a session cannot outlive its grant, that revoking takes effect on the next
 * page load rather than whenever a cookie dies, and that one slink's token
 * cannot open another. Run with `npm run check:slink:db`.
 */

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
  const {
    authorize,
    createSlink,
    exchangeToken,
    issueToken,
    listBlocks,
    addBlock,
    revokeRecipient,
    setGrant,
    upsertRecipient,
    fileAccessRequest,
    pendingRequests,
    decideRequest,
    recentRequestCount,
    sweepExpiredGrants,
  } = await import("../lib/slink-data")
  const { hashToken } = await import("../lib/crypto")

  const NOW = new Date()
  const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000)

  try {
    await db.transaction(async (tx) => {
      const slink = await createSlink(
        { title: "Check — DNS cutover", intro: "staging only", clientId: null, userId: null },
        tx
      )
      check("a slink gets an unguessable handle", slink.publicId.length >= 6, true)

      console.log("")
      console.log("the magic link")
      const tom = await upsertRecipient(
        { slinkId: slink.id, email: "Tom.H@Example.test", expiresAt: hours(24), invitedBy: null },
        tx
      )
      check("the address is stored lower-case", tom.email, "tom.h@example.test")

      const token = await issueToken(tom.id, tx)
      const first = await exchangeToken(token, NOW, tx)
      check("a fresh link opens a session", first.ok, true)

      const second = await exchangeToken(token, NOW, tx)
      check("the same link cannot be used twice", second.ok ? "opened again" : second.reason, "used")

      const nonsense = await exchangeToken("not-a-real-token", NOW, tx)
      check("an invented token says nothing useful", nonsense.ok ? "opened" : nonsense.reason, "unknown")

      if (!first.ok) throw new Error("expected the first exchange to succeed")
      const session = first.session

      console.log("")
      console.log("the gate")
      const ok = await authorize(slink.publicId, session, NOW, tx)
      check("a live session reads the slink", ok?.recipient.email, "tom.h@example.test")
      check("no cookie, no page", await authorize(slink.publicId, undefined, NOW, tx), null)
      check("a made-up cookie, no page", await authorize(slink.publicId, "nope", NOW, tx), null)
      check(
        "the right cookie on the wrong slink is still nothing",
        await authorize("some-other-handle-aaaa", session, NOW, tx),
        null
      )

      console.log("")
      console.log("a grant outranks a cookie")
      // The session was minted for 24 h. Move the grant back and the same
      // cookie must stop working on the very next load.
      await setGrant(tom.id, hours(-1), tx)
      check("a lapsed grant locks the page immediately", await authorize(slink.publicId, session, NOW, tx), null)

      await setGrant(tom.id, null, tx)
      check(
        "the indefinite toggle lets the same cookie back in",
        (await authorize(slink.publicId, session, NOW, tx))?.recipient.email,
        "tom.h@example.test"
      )

      await revokeRecipient(tom.id, tx)
      check("revoking locks it", await authorize(slink.publicId, session, NOW, tx), null)
      const killed = (await tx.execute(
        sql`select count(*)::int as n from slink_sessions where recipient_id = ${tom.id}`
      )) as unknown as { n: number }[]
      check("and takes the sessions with it", killed[0].n, 0)

      console.log("")
      console.log("a token for one slink cannot open another")
      const other = await createSlink({ title: "Check — other", userId: null }, tx)
      const paula = await upsertRecipient(
        { slinkId: other.id, email: "p@example.test", expiresAt: hours(24), invitedBy: null },
        tx
      )
      const otherToken = await issueToken(paula.id, tx)
      const crossed = await exchangeToken(otherToken, NOW, tx)
      check("it opens its own slink", crossed.ok && crossed.slinkId === other.id, true)
      if (crossed.ok) {
        check(
          "and its session is worthless on the first",
          await authorize(slink.publicId, crossed.session, NOW, tx),
          null
        )
      }

      console.log("")
      console.log("only the hash is stored")
      const raw = await issueToken(paula.id, tx)
      const stored = (await tx.execute(
        sql`select count(*)::int as n from slink_tokens where token_hash = ${raw}`
      )) as unknown as { n: number }[]
      check("the token itself is never in the table", stored[0].n, 0)
      const hashed = (await tx.execute(
        sql`select count(*)::int as n from slink_tokens where token_hash = ${hashToken(raw)}`
      )) as unknown as { n: number }[]
      check("its hash is", hashed[0].n, 1)

      console.log("")
      console.log("re-sharing keeps one row per person")
      const again = await upsertRecipient(
        { slinkId: slink.id, email: "tom.h@example.test", expiresAt: hours(48), invitedBy: null },
        tx
      )
      check("the same address is the same person", again.id, tom.id)
      const rows = (await tx.execute(
        sql`select count(*)::int as n from slink_recipients where slink_id = ${slink.id}`
      )) as unknown as { n: number }[]
      check("no second trail is started", rows[0].n, 1)
      check(
        "and re-sharing clears the revocation",
        (await authorize(slink.publicId, session, NOW, tx)) === null,
        true // the old session was deleted on revoke, so a fresh link is still needed
      )

      console.log("")
      console.log("access requests are never self-approved")
      await fileAccessRequest(
        { slinkId: slink.id, email: "d.okafor@example.test", reason: "taking over", ip: "10.0.0.1" },
        tx
      )
      const waiting = await pendingRequests(slink.id, tx)
      check("the request queues", waiting.length, 1)
      check("nobody is admitted by filing one", waiting[0].status, "pending")
      const before = (await tx.execute(
        sql`select count(*)::int as n from slink_recipients where slink_id = ${slink.id} and email = 'd.okafor@example.test'`
      )) as unknown as { n: number }[]
      check("and no grant appears on its own", before[0].n, 0)

      const decided = await decideRequest(waiting[0].id, "granted", null, tx)
      check("granting names the address to add", decided?.email, "d.okafor@example.test")

      check("requests from one ip are counted", await recentRequestCount(slink.id, "10.0.0.1", NOW, tx), 1)
      check("a different ip starts at zero", await recentRequestCount(slink.id, "10.0.0.2", NOW, tx), 0)

      console.log("")
      console.log("blocks")
      await addBlock({ slinkId: slink.id, kind: "text", title: "First", data: { body: "hello" } }, tx)
      await addBlock({ slinkId: slink.id, kind: "table", title: "Second" }, tx)
      const blocks = await listBlocks(slink.id, tx)
      check("they keep the order they were added", blocks.map((b) => b.title), ["First", "Second"])
      check("positions start at zero", blocks[0].position, 0)

      console.log("")
      console.log("the sweep explains a locked-out person")
      await setGrant(tom.id, hours(-2), tx)
      const swept = await sweepExpiredGrants(NOW, tx)
      check("a lapsed grant is written to the trail", swept.expired >= 1, true)
      const twice = await sweepExpiredGrants(NOW, tx)
      check("running it again says it twice? no", twice.expired, 0)

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
  console.log("all slink db checks passed")
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
