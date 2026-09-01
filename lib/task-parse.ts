import type { Cadence } from "@/db/schema"

/**
 * The quick-add grammar. Pure — the composer runs it on every keystroke in the
 * browser, so nothing here may touch the database.
 *
 *   @gdi              client, or a project (which fills in its own client)
 *   !fri  !3d  !eom   due date
 *   *monthly          repeats
 *   >mon              snooze — hide until, without faking a deadline
 *
 * The old parser matched a single word at the very end of the line and
 * swallowed it silently. This one matches the longest phrase anywhere, hands
 * back what it did not use, and reports every token so the composer can show
 * chips before anything is saved.
 */

export type ParseTarget = {
  clientId: string | null
  clientName: string | null
  clientSlug: string | null
  projectId: string | null
  projectName: string | null
  productId?: string | null
  productName?: string | null
}

export type ParsedTask = {
  title: string
  target: ParseTarget | null
  /** Text after @ that matched nothing — shown as unresolved, never dropped. */
  unresolved: string | null
  dueOn: string | null
  dueLabel: string | null
  snoozedUntil: string | null
  snoozeLabel: string | null
  cadence: Cadence
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

const CADENCES: Record<string, Cadence> = {
  once: "none",
  daily: "none",
  weekly: "weekly",
  week: "weekly",
  w: "weekly",
  monthly: "monthly",
  month: "monthly",
  m: "monthly",
  quarterly: "quarterly",
  quarter: "quarterly",
  q: "quarterly",
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function addDays(from: Date, days: number) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + days)
  return d
}

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/** "fri", "3d", "eom", "31aug", "2026-09-04" → an ISO day, plus how to say it. */
export function parseWhen(
  raw: string,
  now = new Date()
): { on: string; label: string } | null {
  const value = raw.trim().toLowerCase()
  if (!value) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const say = (d: Date) => {
    const days = Math.round((d.getTime() - today.getTime()) / 86_400_000)
    if (days === 0) return "today"
    if (days === 1) return "tomorrow"
    if (days > 1 && days < 7) {
      return d.toLocaleDateString("en-US", { weekday: "long" })
    }
    return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })
  }
  const hit = (d: Date) => ({ on: iso(d), label: say(d) })

  if (value === "today" || value === "tod" || value === "now") return hit(today)
  if (value === "tomorrow" || value === "tom" || value === "tmr") {
    return hit(addDays(today, 1))
  }
  if (value === "eow") {
    // Friday of this week, or next Friday if the week is already spent.
    const delta = (5 - today.getDay() + 7) % 7
    return hit(addDays(today, delta === 0 ? 0 : delta))
  }
  if (value === "eom") {
    return hit(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  }

  if (WEEKDAYS[value] !== undefined) {
    const target = WEEKDAYS[value]
    const delta = (target - today.getDay() + 7) % 7
    return hit(addDays(today, delta))
  }

  const rel = value.match(/^(\d{1,3})\s*(d|w|m)$/)
  if (rel) {
    const n = Number(rel[1])
    if (rel[2] === "d") return hit(addDays(today, n))
    if (rel[2] === "w") return hit(addDays(today, n * 7))
    return hit(new Date(today.getFullYear(), today.getMonth() + n, today.getDate()))
  }

  const isoDay = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDay) {
    const d = new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3]))
    return Number.isNaN(d.getTime()) ? null : hit(d)
  }

  // 31aug / aug31 / 31-aug
  const dayMonth = value.match(/^(\d{1,2})[-\s]?([a-z]{3,})$/)
  const monthDay = value.match(/^([a-z]{3,})[-\s]?(\d{1,2})$/)
  const pair = dayMonth
    ? { day: Number(dayMonth[1]), mon: MONTHS[dayMonth[2].slice(0, 3)] }
    : monthDay
      ? { day: Number(monthDay[2]), mon: MONTHS[monthDay[1].slice(0, 3)] }
      : null
  if (pair && pair.mon && pair.day >= 1 && pair.day <= 31) {
    let year = today.getFullYear()
    let d = new Date(year, pair.mon - 1, pair.day)
    // A bare month/day that already passed means next year.
    if (d < today) d = new Date(++year, pair.mon - 1, pair.day)
    if (d.getMonth() !== pair.mon - 1) return null
    return hit(d)
  }

  const slash = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (slash) {
    const year = slash[3]
      ? Number(slash[3]) < 100
        ? 2000 + Number(slash[3])
        : Number(slash[3])
      : today.getFullYear()
    const d = new Date(year, Number(slash[1]) - 1, Number(slash[2]))
    if (d.getMonth() !== Number(slash[1]) - 1) return null
    return hit(d)
  }

  return null
}

/** Every phrase that should resolve to a given target, longest first. */
function phrasesFor(target: ParseTarget): string[] {
  const client = target.clientName ? normalise(target.clientName) : ""
  const slug = target.clientSlug ? normalise(target.clientSlug) : ""
  if (target.productName) {
    const product = normalise(target.productName)
    return [`${client} ${product}`, `${slug} ${product}`, product].filter(Boolean)
  }
  if (!target.projectName) return [client, slug].filter(Boolean)
  const project = normalise(target.projectName)
  // Deliberately no bare client phrase here: `@caps fieldhouse` must land on
  // the client, and only `@caps fieldhouse website` on the project.
  return [`${client} ${project}`, `${slug} ${project}`, project].filter(Boolean)
}

/**
 * Longest-match target resolution. A phrase naming both client and project wins
 * over the client alone, so `@caps fieldhouse website` lands on the project.
 */
function matchTarget(words: string[], targets: ParseTarget[]) {
  const index = new Map<string, ParseTarget>()
  for (const target of targets) {
    for (const phrase of phrasesFor(target)) {
      // A project phrase beats a bare client phrase for the same words.
      const existing = index.get(phrase)
      const existingSpecific = Boolean(existing?.projectId || existing?.productId)
      const incomingSpecific = Boolean(target.projectId || target.productId)
      if (!existing || (!existingSpecific && incomingSpecific)) {
        index.set(phrase, target)
      }
    }
  }

  for (let take = Math.min(words.length, 6); take >= 1; take -= 1) {
    const phrase = normalise(words.slice(0, take).join(" "))
    const found = index.get(phrase)
    if (found) return { target: found, consumed: take }
  }
  return null
}

export function parseTaskInput(
  input: string,
  targets: ParseTarget[],
  now = new Date()
): ParsedTask {
  const out: ParsedTask = {
    title: "",
    target: null,
    unresolved: null,
    dueOn: null,
    dueLabel: null,
    snoozedUntil: null,
    snoozeLabel: null,
    cadence: "none",
  }

  const words = input.split(/\s+/).filter(Boolean)
  const kept: string[] = []

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]
    const sigil = word[0]
    const rest = word.slice(1)

    if (sigil === "@" && !out.target) {
      const tail = [rest, ...words.slice(i + 1)].filter(Boolean)
      const hit = matchTarget(tail, targets)
      if (hit) {
        out.target = hit.target
        // consumed counts words in `tail`; the first of them is this word's rest
        // `consumed` counts words in `tail`; when the sigil carried its own
        // first word, one of those was this word.
        i += hit.consumed - (rest ? 1 : 0)
        continue
      }
      if (rest) {
        // Reported *and* left in the title — ignoring the warning must not
        // quietly delete a word you meant to keep.
        out.unresolved = rest
        kept.push(word)
        continue
      }
      continue
    }

    if (sigil === "!" && rest && !out.dueOn) {
      const when = parseWhen(rest, now)
      if (when) {
        out.dueOn = when.on
        out.dueLabel = when.label
        continue
      }
      kept.push(word)
      continue
    }

    if (sigil === ">" && rest && !out.snoozedUntil) {
      const when = parseWhen(rest, now)
      if (when) {
        out.snoozedUntil = when.on
        out.snoozeLabel = when.label
        continue
      }
      kept.push(word)
      continue
    }

    if (sigil === "*" && rest && out.cadence === "none") {
      const cadence = CADENCES[rest.toLowerCase()]
      if (cadence) {
        out.cadence = cadence
        continue
      }
      kept.push(word)
      continue
    }

    kept.push(word)
  }

  out.title = kept.join(" ").replace(/\s+/g, " ").trim()
  return out
}

export const CADENCE_WORDS = ["weekly", "monthly", "quarterly"] as const
