export type TextPart =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string }

const URL_OR_EMAIL =
  /\b((?:https?:\/\/|www\.)[^\s<>"'`]+)|([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi

const ANCHOR =
  /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi

/** Google Calendar stores Teams links as `Join now<https://…>`. */
const ANGLE_URL = /(?:([^\s<>][^<\n]{0,80})?<(https?:\/\/[^>\s]+)>)/g

function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCharCode(Number(dec))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

export function safeHref(href: string): string | null {
  const trimmed = decodeEntities(href.trim())
  if (!trimmed) return null
  const absolute = trimmed.startsWith("www.") ? `https://${trimmed}` : trimmed
  try {
    const url = new URL(absolute)
    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "mailto:" ||
      url.protocol === "tel:"
    ) {
      return absolute
    }
  } catch {
    return null
  }
  return null
}

function peelTrail(raw: string) {
  let href = raw
  let trail = ""
  while (/[),.;!?]$/.test(href)) {
    const opens = (href.match(/\(/g) ?? []).length
    const closes = (href.match(/\)/g) ?? []).length
    if (href.endsWith(")") && closes <= opens) break
    trail = href.slice(-1) + trail
    href = href.slice(0, -1)
  }
  return { href, trail }
}

function stripMarkup(html: string) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<(?!https?:\/\/)[^>]+>/gi, "")
  )
}

function linkifyPlain(text: string): TextPart[] {
  const parts: TextPart[] = []
  const re = new RegExp(URL_OR_EMAIL.source, "gi")
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push({ type: "text", value: text.slice(last, match.index) })
    }
    const url = match[1]
    const email = match[2]
    if (email) {
      parts.push({ type: "link", href: `mailto:${email}`, label: email })
    } else if (url) {
      const peeled = peelTrail(url)
      const href = safeHref(peeled.href)
      if (href) {
        parts.push({ type: "link", href, label: peeled.href })
        if (peeled.trail) parts.push({ type: "text", value: peeled.trail })
      } else {
        parts.push({ type: "text", value: url })
      }
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) })
  return parts
}

function extractMarkedLinks(
  input: string,
  pattern: RegExp,
  toPart: (match: RegExpExecArray) => TextPart | null
): TextPart[] {
  const parts: TextPart[] = []
  const re = new RegExp(pattern.source, pattern.flags)
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(input))) {
    if (match.index > last) {
      parts.push({ type: "text", value: input.slice(last, match.index) })
    }
    const part = toPart(match)
    if (part) parts.push(part)
    last = match.index + match[0].length
  }
  if (last < input.length) parts.push({ type: "text", value: input.slice(last) })
  return parts
}

function flattenTextThen(
  parts: TextPart[],
  next: (text: string) => TextPart[]
): TextPart[] {
  return parts.flatMap((part) =>
    part.type === "text" ? next(part.value) : [part]
  )
}

/** Turn calendar HTML/plain text into text and safe http(s)/mailto/tel links. */
export function parseRichText(input: string): TextPart[] {
  const normalized = input
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, "\n")

  const fromAnchors = extractMarkedLinks(normalized, ANCHOR, (match) => {
    const rawHref = match[1] ?? match[2] ?? match[3] ?? ""
    const label = stripMarkup(match[4]).trim() || decodeEntities(rawHref)
    const href = safeHref(rawHref)
    return href ? { type: "link", href, label } : { type: "text", value: label }
  })

  const fromAngles = flattenTextThen(fromAnchors, (text) =>
    extractMarkedLinks(text, ANGLE_URL, (match) => {
      const rawHref = match[2]
      const label = (match[1] ?? "").trim() || rawHref
      const href = safeHref(rawHref)
      return href ? { type: "link", href, label } : { type: "text", value: label }
    })
  )

  return flattenTextThen(fromAngles, (text) => linkifyPlain(stripMarkup(text))).filter(
    (part) => part.type === "link" || part.value.length > 0
  )
}

export type CalendarLinkKind = "join" | "help" | "options" | "other"

export type PresentedCalendarCopy = {
  notes: string
  meetingId: string | null
  passcode: string | null
  links: { href: string; label: string; kind: CalendarLinkKind }[]
}

function classifyLink(href: string, label: string): CalendarLinkKind {
  const hay = `${href} ${label}`.toLowerCase()
  if (
    hay.includes("meetup-join") ||
    hay.includes("teams.microsoft.com/meet/") ||
    hay.includes("zoom.us/j/") ||
    hay.includes("meet.google.com/") ||
    /\bjoin\b/.test(label.toLowerCase()) ||
    /\bingressar\b/.test(label.toLowerCase())
  ) {
    return "join"
  }
  if (hay.includes("aka.ms/jointeams") || /\bhelp\b/.test(label.toLowerCase())) {
    return "help"
  }
  if (hay.includes("meetingoptions") || /\boptions\b/.test(label.toLowerCase())) {
    return "options"
  }
  return "other"
}

const KIND_LABEL: Record<CalendarLinkKind, string> = {
  join: "Join meeting",
  help: "Need help?",
  options: "Meeting options",
  other: "",
}

/** Pull join links and IDs out of a calendar description so the modal can lay them out. */
export function presentCalendarCopy(raw: string): PresentedCalendarCopy {
  const links: PresentedCalendarCopy["links"] = []
  let text = ""
  for (const part of parseRichText(raw)) {
    if (part.type === "link") {
      const kind = classifyLink(part.href, part.label)
      if (!links.some((link) => link.href === part.href)) {
        links.push({
          href: part.href,
          label: KIND_LABEL[kind] || part.label,
          kind,
        })
      }
    } else {
      text += part.value
    }
  }

  let meetingId: string | null = null
  let passcode: string | null = null
  text = text.replace(/Meeting ID:\s*([0-9][0-9\s]{4,})/i, (_, id: string) => {
    meetingId = id.replace(/\s+/g, " ").trim()
    return ""
  })
  text = text.replace(/Passcode:\s*(\S+)/i, (_, code: string) => {
    passcode = code
    return ""
  })

  text = text
    .replace(/_{6,}/g, "\n")
    .replace(/Microsoft Teams(?: meeting)?/gi, "")
    .replace(/Reunião do Microsoft Teams/gi, "")
    .replace(/Need help\??/gi, "")
    .replace(/Join the meeting now/gi, "")
    .replace(/For organizers:\s*/gi, "")
    .replace(/Meeting options/gi, "")
    .replace(/\b(?:Join|Ingressar):\s*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return { notes: text, meetingId, passcode, links }
}
