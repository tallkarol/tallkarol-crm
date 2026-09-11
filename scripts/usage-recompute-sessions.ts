/**
 * One-off: bring agent_sessions.tokens_in / tokens_out in line with the
 * deduped per-turn rows in agent_turns. /api/sessions merges token totals
 * with greatest(), which is exactly what kept the inflated (pre-dedupe)
 * numbers in place — so this sets them directly, once, for every session
 * that has turns with known tokens. Sessions with no known tokens are left
 * alone. Prints before/after.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/usage-recompute-sessions.ts [--dry]
 */

import { sql } from "drizzle-orm"
import { loadLocalEnv } from "../lib/load-env"

loadLocalEnv()

async function main() {
  const dry = process.argv.includes("--dry")
  const { db } = await import("../db")
  const totals = await db.execute<{ session_ref: string; tin: string; tout: string; old_in: string; old_out: string }>(sql`
    select t.session_ref,
           sum(coalesce(t.input_tokens, 0) + coalesce(t.cache_write_tokens, 0) + coalesce(t.cache_read_tokens, 0)) as tin,
           sum(coalesce(t.output_tokens, 0)) as tout,
           s.tokens_in as old_in, s.tokens_out as old_out
    from agent_turns t
    join agent_sessions s on s.session_ref = t.session_ref
    where t.output_tokens is not null
    group by t.session_ref, s.tokens_in, s.tokens_out
  `)
  const rows = Array.from(totals as Iterable<{ session_ref: string; tin: string; tout: string; old_in: string; old_out: string }>)
  let before = [0, 0]
  let after = [0, 0]
  let changed = 0
  for (const r of rows) {
    before = [before[0] + Number(r.old_in), before[1] + Number(r.old_out)]
    after = [after[0] + Number(r.tin), after[1] + Number(r.tout)]
    if (Number(r.old_in) !== Number(r.tin) || Number(r.old_out) !== Number(r.tout)) changed += 1
  }
  console.log(`${rows.length} sessions with known turn tokens, ${changed} differ`)
  console.log(`  before  ${before[0].toLocaleString()} in / ${before[1].toLocaleString()} out`)
  console.log(`  after   ${after[0].toLocaleString()} in / ${after[1].toLocaleString()} out`)
  if (dry) {
    console.log("dry run — nothing written")
    process.exit(0)
  }
  await db.execute(sql`
    update agent_sessions s
    set tokens_in = t.tin, tokens_out = t.tout, updated_at = now()
    from (
      select session_ref,
             sum(coalesce(input_tokens, 0) + coalesce(cache_write_tokens, 0) + coalesce(cache_read_tokens, 0)) as tin,
             sum(coalesce(output_tokens, 0)) as tout
      from agent_turns where output_tokens is not null group by session_ref
    ) t
    where t.session_ref = s.session_ref and (s.tokens_in <> t.tin or s.tokens_out <> t.tout)
  `)
  console.log("updated")
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
