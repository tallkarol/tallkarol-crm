/**
 * Checks for the pure half of the mail reader — domain matching and address
 * parsing. These run without a mailbox, which matters because the CRM address
 * does not exist yet: this is the part that can be wrong silently, by filing
 * a client's mail as unassigned or, worse, under the wrong client.
 * Run with `npm run check:jmap`.
 */

import {
  domainOf,
  localPartOf,
  matchClientByAlias,
  matchClientByDomain,
  resolveClient,
  resolveMailboxId,
} from "../lib/jmap"
import { DEFAULT_TICKET_ALIASES, shouldAutoTicket } from "../lib/inbox-mail"

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a === b) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}\n       got  ${a}\n       want ${b}`)
  }
}

const CLIENTS = [
  { id: "c-zemvelo", domains: ["zemvelo.com"] },
  { id: "c-gdi", domains: ["gdi.com", "@golfdigest.example"] },
  { id: "c-mineralife", domains: ["Mineralifeonline.com"] },
  { id: "c-empty", domains: [] },
]

console.log("\nAddresses")
{
  check("plain address", domainOf("dana@zemvelo.com"), "zemvelo.com")
  check("uppercase is normalised", domainOf("Dana@ZEMVELO.com"), "zemvelo.com")
  check("plus addressing is ignored", domainOf("dana+crm@zemvelo.com"), "zemvelo.com")
  check("an address with no @ has no domain", domainOf("dana"), "")
  check("empty string is safe", domainOf(""), "")
  check("only the last @ counts", domainOf("weird@name@zemvelo.com"), "zemvelo.com")
}

console.log("\nClient matching")
{
  check(
    "exact domain matches",
    matchClientByDomain("dana@zemvelo.com", CLIENTS),
    "c-zemvelo"
  )
  check(
    "case is ignored on both sides",
    matchClientByDomain("Rebecca@MINERALIFEONLINE.com", CLIENTS),
    "c-mineralife"
  )
  check(
    "a leading @ in the stored domain is tolerated",
    matchClientByDomain("someone@golfdigest.example", CLIENTS),
    "c-gdi"
  )
  check(
    "subdomains match their parent",
    matchClientByDomain("noreply@mail.zemvelo.com", CLIENTS),
    "c-zemvelo"
  )
  check(
    "an unknown domain matches nothing",
    matchClientByDomain("someone@gmail.com", CLIENTS),
    null
  )
  check("an empty address matches nothing", matchClientByDomain("", CLIENTS), null)
  check(
    "a client with no domains never matches",
    matchClientByDomain("x@", CLIENTS),
    null
  )
}

console.log("\nThe near-miss cases that would file mail under the wrong client")
{
  check(
    "a suffix that is not a subdomain does NOT match",
    matchClientByDomain("someone@notzemvelo.com", CLIENTS),
    null
  )
  check(
    "a domain that merely contains the name does NOT match",
    matchClientByDomain("someone@zemvelo.com.evil.net", CLIENTS),
    null
  )
  check(
    "a prefix does NOT match",
    matchClientByDomain("someone@zemvelo.co", CLIENTS),
    null
  )
  check(
    "blank stored domains are skipped, not matched",
    matchClientByDomain("someone@anything.com", [{ id: "c-x", domains: ["", "  "] }]),
    null
  )
}

const ROUTING_CLIENTS = [
  { id: "c-mineralife", slug: "mineralife", domains: ["mineralifeonline.com"] },
  { id: "c-artist", slug: "artist-house", domains: [] },
  { id: "c-dqs", slug: "dqs", domains: ["dqs.example"] },
  { id: "c-zemvelo", slug: "zemvelo", domains: ["zemvelo.com"] },
]

/** Karol's real aliases: two are slugs already, the rest need mapping. */
const ALIAS_MAP = { axvor: "dqs" }

console.log("\nAlias local parts")
{
  check("plain alias", localPartOf("mineralife@tallkarol.com"), "mineralife")
  check("case is normalised", localPartOf("Artist-House@TallKarol.com"), "artist-house")
  check("plus addressing is stripped", localPartOf("support+abc@tallkarol.com"), "support")
  check("a bare local part still works", localPartOf("support"), "support")
  check("empty is safe", localPartOf(""), "")
}

console.log("\nRouting by the alias that was written to")
{
  check(
    "a local part equal to a client slug routes with no config",
    matchClientByAlias(["mineralife@tallkarol.com"], ROUTING_CLIENTS, {}),
    "c-mineralife"
  )
  check(
    "a hyphenated slug matches too",
    matchClientByAlias(["artist-house@tallkarol.com"], ROUTING_CLIENTS, {}),
    "c-artist"
  )
  check(
    "an alias that is not a slug needs the map",
    matchClientByAlias(["axvor@tallkarol.com"], ROUTING_CLIENTS, {}),
    null
  )
  check(
    "the map resolves it by slug",
    matchClientByAlias(["axvor@tallkarol.com"], ROUTING_CLIENTS, ALIAS_MAP),
    "c-dqs"
  )
  check(
    "the map also accepts a client id",
    matchClientByAlias(["axvor@tallkarol.com"], ROUTING_CLIENTS, { axvor: "c-dqs" }),
    "c-dqs"
  )
  check(
    "an unmapped alias routes nowhere",
    matchClientByAlias(["great-day@tallkarol.com"], ROUTING_CLIENTS, ALIAS_MAP),
    null
  )
  check(
    "support is deliberately not a client",
    matchClientByAlias(["support@tallkarol.com"], ROUTING_CLIENTS, ALIAS_MAP),
    null
  )
  check(
    "the first matching recipient wins",
    matchClientByAlias(
      ["agent@tallkarol.com", "mineralife@tallkarol.com"],
      ROUTING_CLIENTS,
      ALIAS_MAP
    ),
    "c-mineralife"
  )
}

console.log("\nAlias beats sender — the whole point of routing this way")
{
  check(
    "a client writing from Gmail still routes, via the alias",
    resolveClient(
      { toEmail: "mineralife@tallkarol.com", deliveredTo: "", originalTo: "", fromEmail: "someone@gmail.com" },
      ROUTING_CLIENTS,
      ALIAS_MAP
    ),
    { clientId: "c-mineralife", via: "alias" }
  )
  check(
    "the alias wins when the two disagree",
    resolveClient(
      { toEmail: "mineralife@tallkarol.com", deliveredTo: "", originalTo: "", fromEmail: "dana@zemvelo.com" },
      ROUTING_CLIENTS,
      ALIAS_MAP
    ),
    { clientId: "c-mineralife", via: "alias" }
  )
  check(
    "the sender is the fallback when no alias matches",
    resolveClient(
      { toEmail: "support@tallkarol.com", deliveredTo: "", originalTo: "", fromEmail: "dana@zemvelo.com" },
      ROUTING_CLIENTS,
      ALIAS_MAP
    ),
    { clientId: "c-zemvelo", via: "sender" }
  )
  check(
    "Delivered-To is read when a redirect rewrote To:",
    resolveClient(
      { toEmail: "agent@tallkarol.com", deliveredTo: "artist-house@tallkarol.com", originalTo: "", fromEmail: "nobody@example.com" },
      ROUTING_CLIENTS,
      ALIAS_MAP
    ),
    { clientId: "c-artist", via: "alias" }
  )
  check(
    "nothing matches, nothing is guessed",
    resolveClient(
      { toEmail: "great-day@tallkarol.com", deliveredTo: "", originalTo: "", fromEmail: "stranger@nowhere.com" },
      ROUTING_CLIENTS,
      ALIAS_MAP
    ),
    { clientId: null, via: null }
  )
}

console.log("\nFolder resolution")
{
  const BOXES = [
    { id: "mb1", name: "Inbox", role: "inbox", total: 10 },
    { id: "mb2", name: "CRM", role: null, total: 3 },
  ]
  check("resolves a folder by name", resolveMailboxId(BOXES, "CRM"), "mb2")
  check("name match ignores case", resolveMailboxId(BOXES, "crm"), "mb2")
  check("an id passes straight through", resolveMailboxId(BOXES, "mb1"), "mb1")
  check("an unknown folder resolves to nothing", resolveMailboxId(BOXES, "Nope"), null)
  check("empty resolves to nothing", resolveMailboxId(BOXES, ""), null)
}

console.log("\nAliases that open a ticket on arrival")
{
  check(
    "support opens a ticket",
    shouldAutoTicket(["support@tallkarol.com"], ["support"]),
    true
  )
  check(
    "a client alias does not",
    shouldAutoTicket(["mineralife@tallkarol.com"], ["support"]),
    false
  )
  check(
    "the configured list is normalised too",
    shouldAutoTicket(["support@tallkarol.com"], ["Support@tallkarol.com"]),
    true
  )
  check(
    "plus addressing still opens one",
    shouldAutoTicket(["support+urgent@tallkarol.com"], ["support"]),
    true
  )
  check(
    "any matching recipient is enough",
    shouldAutoTicket(["agent@tallkarol.com", "support@tallkarol.com"], ["support"]),
    true
  )
  check("an empty config never fires", shouldAutoTicket(["support@tallkarol.com"], []), false)
  check("no recipients never fires", shouldAutoTicket([], ["support"]), false)
  check(
    "a near-miss local part does not fire",
    shouldAutoTicket(["supported@tallkarol.com"], ["support"]),
    false
  )
  check(
    "support is the shipped default",
    shouldAutoTicket(["support@tallkarol.com"], DEFAULT_TICKET_ALIASES),
    true
  )
}

console.log("\nKarol's real aliases, end to end")
{
  const REAL = { axvor: "dqs", "great-day": "gdi" }
  const LIVE = [
    { id: "c-gdi", slug: "gdi", domains: ["greatdayimprovements.com"] },
    { id: "c-dqs", slug: "dqs", domains: [] },
    { id: "c-mineralife", slug: "mineralife", domains: [] },
    { id: "c-artist", slug: "artist-house", domains: [] },
  ]
  const route = (alias: string) =>
    matchClientByAlias([`${alias}@tallkarol.com`], LIVE, REAL)

  check("mineralife@ → mineralife (slug)", route("mineralife"), "c-mineralife")
  check("artist-house@ → artist-house (slug)", route("artist-house"), "c-artist")
  check("axvor@ → dqs (mapped)", route("axvor"), "c-dqs")
  check("great-day@ → gdi (mapped, Great Day Improvements)", route("great-day"), "c-gdi")
  check("support@ → no client, by design", route("support"), null)
  check("invoices@ → no client", route("invoices"), null)
  check("hello@ → no client", route("hello"), null)
}

console.log(
  failures === 0 ? "\nAll JMAP checks passed.\n" : `\n${failures} check(s) failed.\n`
)
process.exit(failures === 0 ? 0 : 1)
