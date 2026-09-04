/**
 * slink's pure rules, checked without a database: the three clocks, what a
 * grant means, and the shapes a block may carry. Run with `npm run check:slink`.
 */

import {
  SLINK_RULES,
  grantAllows,
  grantExpiry,
  grantState,
  isEmail,
  isBlockKind,
  isLiveKind,
  isPublicId,
  isWatermarked,
  makePublicId,
  normalizeEmail,
  readFields,
  readLink,
  readTable,
  safeHref,
  sessionExpiry,
  timeLeftLabel,
  toCsv,
  tokenExpiry,
  tokenUsable,
} from "../lib/slink"

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

const NOW = new Date("2026-09-04T12:00:00.000Z")
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000)
const grant = (expiresAt: Date | null, revokedAt: Date | null = null) => ({ expiresAt, revokedAt })

console.log("grants")
check("no expiry is indefinite", grantState(grant(null), NOW), "indefinite")
check("a future expiry is active", grantState(grant(hoursFromNow(1)), NOW), "active")
check("a past expiry is expired", grantState(grant(hoursFromNow(-1)), NOW), "expired")
check("revoked beats everything", grantState(grant(null, NOW), NOW), "revoked")
check("an indefinite grant opens the page", grantAllows(grant(null), NOW), true)
check("an expired one does not", grantAllows(grant(hoursFromNow(-0.01)), NOW), false)
check("a revoked indefinite one does not", grantAllows(grant(null, NOW), NOW), false)

check("the default grant is 24 h", grantExpiry(24, NOW)?.toISOString(), hoursFromNow(24).toISOString())
check("null hours means never", grantExpiry(null, NOW), null)
check(
  "a nonsense window falls back to the default",
  grantExpiry(-5, NOW)?.toISOString(),
  hoursFromNow(SLINK_RULES.defaultGrantHours).toISOString()
)

console.log("")
console.log("sessions never outlive their grant")
check(
  "an indefinite grant still stops at the 30-day cap",
  sessionExpiry(grant(null), NOW).toISOString(),
  new Date(NOW.getTime() + 30 * 86_400_000).toISOString()
)
check(
  "a 24 h grant caps the session at 24 h, not 30 days",
  sessionExpiry(grant(hoursFromNow(24)), NOW).toISOString(),
  hoursFromNow(24).toISOString()
)
check(
  "a grant longer than the cap is still capped",
  sessionExpiry(grant(hoursFromNow(24 * 90)), NOW).toISOString(),
  new Date(NOW.getTime() + 30 * 86_400_000).toISOString()
)

console.log("")
console.log("tokens")
check("a magic link lasts 15 minutes", tokenExpiry(NOW).toISOString(), new Date(NOW.getTime() + 15 * 60_000).toISOString())
check("a fresh token is usable", tokenUsable({ expiresAt: hoursFromNow(0.1), usedAt: null }, NOW), true)
check("a used token is not", tokenUsable({ expiresAt: hoursFromNow(0.1), usedAt: NOW }, NOW), false)
check("an expired token is not", tokenUsable({ expiresAt: hoursFromNow(-0.1), usedAt: null }, NOW), false)

console.log("")
console.log("identifiers")
{
  const fixed = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i * 7))
  const id = makePublicId(fixed, ["DQS", "DNS cutover"])
  check("a public id carries a readable stem", id.startsWith("dqs-dns-cutover-"), true)
  check("and a random tail", id.length > "dqs-dns-cutover-".length, true)
  check("it is a valid handle", isPublicId(id), true)
  check("punctuation never reaches the url", makePublicId(fixed, ["Bliss & Co: ACH!"]).includes("&"), false)
  check("an empty title still yields an id", isPublicId(makePublicId(fixed, [])), true)
  check("a path traversal is not a handle", isPublicId("../secrets"), false)
}

console.log("")
console.log("email")
check("addresses are lower-cased", normalizeEmail("  Tom.H@DQSGroup.com "), "tom.h@dqsgroup.com")
check("a real address passes", isEmail("tom.h@dqsgroup.com"), true)
check("a bare word does not", isEmail("tom"), false)
check("a missing tld does not", isEmail("tom@dqs"), false)

console.log("")
console.log("blocks")
check("every declared kind is a kind", isBlockKind("credential"), true)
check("an invented kind is not", isBlockKind("iframe"), false)
check("a punch list is live", isLiveKind("punchlist"), true)
check("a table is not", isLiveKind("table"), false)
check("only credentials are watermarked", [isWatermarked("credential"), isWatermarked("table")], [true, false])

check(
  "a table reads back as columns and rows",
  readTable({ columns: ["Type", "Host"], rows: [["A", "@"]] }),
  { columns: ["Type", "Host"], rows: [["A", "@"]] }
)
check("a malformed table is empty, not a crash", readTable({ columns: "nope", rows: 3 }), { columns: [], rows: [] })
check("missing data is empty", readTable(undefined), { columns: [], rows: [] })
check(
  "fields drop the blank ones",
  readFields({ fields: [{ label: "Routing", value: "021000021" }, { label: "", value: "" }] }),
  { fields: [{ label: "Routing", value: "021000021" }] }
)
check("a link falls back to its url for a label", readLink({ url: "https://x.test" }), {
  url: "https://x.test",
  label: "https://x.test",
})

console.log("")
console.log("only http(s) leaves the page")
check("https survives", safeHref("https://dqsgroup.com"), "https://dqsgroup.com")
check("http survives", safeHref("http://dqsgroup.com"), "http://dqsgroup.com")
check("javascript: does not", safeHref("javascript:alert(1)"), "")
check("data: does not", safeHref("data:text/html,<script>"), "")
check("a protocol-relative url does not", safeHref("//evil.test"), "")

console.log("")
console.log("csv")
check(
  "a comma forces quoting",
  toCsv({ columns: ["Type", "Value"], rows: [["TXT", "v=spf1 a,mx ~all"]] }),
  'Type,Value\nTXT,"v=spf1 a,mx ~all"'
)
check(
  "a quote is doubled",
  toCsv({ columns: ["CAA"], rows: [['0 issue "letsencrypt.org"']] }),
  'CAA\n"0 issue ""letsencrypt.org"""'
)

console.log("")
console.log("what the recipient reads on the banner")
check("indefinite says so", timeLeftLabel(null, NOW), "Access does not expire")
check("minutes", timeLeftLabel(new Date(NOW.getTime() + 40 * 60_000), NOW), "Access expires in 40m")
check("hours and minutes", timeLeftLabel(new Date(NOW.getTime() + (21 * 60 + 40) * 60_000), NOW), "Access expires in 21h 40m")
check("whole hours drop the minutes", timeLeftLabel(hoursFromNow(6), NOW), "Access expires in 6h")
check("days", timeLeftLabel(hoursFromNow(72), NOW), "Access expires in 3 days")
check("past tense once it is gone", timeLeftLabel(hoursFromNow(-1), NOW), "Access has expired")

console.log("")
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log("all slink checks passed")
