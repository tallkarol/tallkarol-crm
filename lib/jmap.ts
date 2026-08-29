/**
 * A very small JMAP client for reading the CRM mailbox out of Fastmail.
 *
 * Why JMAP and not Resend inbound: Resend receives by taking the **MX record
 * for a whole domain**, so pointing tallkarol.com at it would move every
 * address off Fastmail — MX has no per-address split. Reading over JMAP keeps
 * `crm@tallkarol.com` exactly where it is, needs no DNS change at all, and
 * leaves Fastmail as the system of record: the CRM is only a reader, so a lost
 * row here never loses the mail. Resend stays the sending side.
 *
 * The token is read-only (Fastmail → Settings → Privacy & Security → Manage
 * API tokens), so the worst this code can do is read.
 */

const SESSION_URL = process.env.JMAP_SESSION_URL || "https://api.fastmail.com/jmap/session"

export type JmapConfig = { token: string; sessionUrl: string }

export function jmapConfig(): JmapConfig | null {
  const token = process.env.FASTMAIL_JMAP_TOKEN
  if (!token) return null
  return { token, sessionUrl: SESSION_URL }
}

type JmapSession = { apiUrl: string; accountId: string }

async function post(url: string, token: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`JMAP ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`)
  }
  return res.json()
}

export async function jmapSession(config: JmapConfig): Promise<JmapSession> {
  const res = await fetch(config.sessionUrl, {
    headers: { Authorization: `Bearer ${config.token}` },
  })
  if (!res.ok) {
    throw new Error(`JMAP session ${res.status}: check FASTMAIL_JMAP_TOKEN`)
  }
  const session = (await res.json()) as {
    apiUrl: string
    primaryAccounts: Record<string, string>
  }
  const accountId = session.primaryAccounts?.["urn:ietf:params:jmap:mail"]
  if (!accountId) throw new Error("JMAP session has no mail account")
  return { apiUrl: session.apiUrl, accountId }
}

export type JmapEmail = {
  id: string
  messageId: string
  threadId: string
  inReplyTo: string
  fromName: string
  fromEmail: string
  toEmail: string
  /**
   * A redirected alias may carry its original recipient in `Delivered-To` or
   * `X-Original-To` rather than `To:`. Both are captured so routing can prefer
   * whichever actually survived the hop.
   */
  deliveredTo: string
  originalTo: string
  subject: string
  snippet: string
  body: string
  receivedAt: string
}

type RawEmail = {
  id: string
  threadId?: string
  messageId?: string[]
  inReplyTo?: string[]
  subject?: string
  preview?: string
  receivedAt?: string
  from?: { name?: string; email?: string }[]
  to?: { name?: string; email?: string }[]
  bodyValues?: Record<string, { value?: string }>
  textBody?: { partId?: string }[]
  htmlBody?: { partId?: string }[]
  "header:Delivered-To:asText"?: string | null
  "header:X-Original-To:asText"?: string | null
}

/** Strip tags when a message has no text part — enough to read and search. */
function textFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function bodyOf(email: RawEmail) {
  const values = email.bodyValues ?? {}
  const textId = email.textBody?.[0]?.partId
  if (textId && values[textId]?.value) return values[textId].value!.trim()
  const htmlId = email.htmlBody?.[0]?.partId
  if (htmlId && values[htmlId]?.value) return textFromHtml(values[htmlId].value!)
  return ""
}

/**
 * Newest messages in the mailbox, most recent first. `sinceIso` trims the
 * query to what has arrived since the last sync — the whole mailbox is never
 * fetched twice.
 */
export async function fetchRecentMail(
  config: JmapConfig,
  options: { limit?: number; sinceIso?: string | null; mailbox?: string } = {}
): Promise<JmapEmail[]> {
  const { apiUrl, accountId } = await jmapSession(config)
  const limit = Math.min(options.limit ?? 50, 200)

  const filter: Record<string, unknown> = {}
  if (options.sinceIso) filter.after = options.sinceIso
  if (options.mailbox) filter.inMailbox = options.mailbox

  const response = (await post(apiUrl, config.token, {
    using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    methodCalls: [
      [
        "Email/query",
        {
          accountId,
          filter: Object.keys(filter).length ? filter : undefined,
          sort: [{ property: "receivedAt", isAscending: false }],
          limit,
        },
        "q",
      ],
      [
        "Email/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
          properties: [
            "id",
            "threadId",
            "messageId",
            "inReplyTo",
            "subject",
            "preview",
            "receivedAt",
            "from",
            "to",
            "textBody",
            "htmlBody",
            "bodyValues",
            "header:Delivered-To:asText",
            "header:X-Original-To:asText",
          ],
          fetchTextBodyValues: true,
          fetchHTMLBodyValues: true,
          maxBodyValueBytes: 100_000,
        },
        "g",
      ],
    ],
  })) as { methodResponses: [string, { list?: RawEmail[] }, string][] }

  const get = response.methodResponses.find((r) => r[0] === "Email/get")
  const list = get?.[1]?.list ?? []

  return list.map((email): JmapEmail => {
    const from = email.from?.[0]
    return {
      id: email.id,
      // Fall back to the JMAP id so a message without a Message-Id header still
      // dedupes on re-sync.
      messageId: email.messageId?.[0] || `jmap:${email.id}`,
      threadId: email.threadId ?? "",
      inReplyTo: email.inReplyTo?.[0] ?? "",
      fromName: from?.name ?? "",
      fromEmail: from?.email ?? "",
      toEmail: email.to?.[0]?.email ?? "",
      deliveredTo: (email["header:Delivered-To:asText"] ?? "").trim(),
      originalTo: (email["header:X-Original-To:asText"] ?? "").trim(),
      subject: email.subject ?? "",
      snippet: (email.preview ?? "").trim(),
      body: bodyOf(email),
      receivedAt: email.receivedAt ?? new Date().toISOString(),
    }
  })
}

/** The domain half of an address, lowercased. */
export function domainOf(email: string) {
  const at = email.lastIndexOf("@")
  return at === -1 ? "" : email.slice(at + 1).trim().toLowerCase()
}

/**
 * Match a sender to a client by email domain. `clients.domains` already exists
 * for matching meeting invites, so this is reuse rather than new modelling.
 */
export function matchClientByDomain(
  fromEmail: string,
  clients: { id: string; domains: string[] }[]
): string | null {
  const domain = domainOf(fromEmail)
  if (!domain) return null
  for (const client of clients) {
    for (const candidate of client.domains) {
      const clean = candidate.trim().toLowerCase().replace(/^@/, "")
      if (!clean) continue
      if (domain === clean || domain.endsWith(`.${clean}`)) return client.id
    }
  }
  return null
}

/** The name half of an address, lowercased and stripped of plus-addressing. */
export function localPartOf(email: string) {
  const at = email.lastIndexOf("@")
  const raw = (at === -1 ? email : email.slice(0, at)).trim().toLowerCase()
  const plus = raw.indexOf("+")
  return plus === -1 ? raw : raw.slice(0, plus)
}

/**
 * Route mail by the alias it was sent TO, not by who sent it.
 *
 * The alias scheme already encodes the client — `mineralife@tallkarol.com`
 * means Mineralife regardless of whether the sender wrote from a corporate
 * domain or Gmail. That makes it a far better signal than sender matching,
 * which fails exactly when a client emails from a personal address.
 *
 * A local part that equals a client slug routes with no configuration at all;
 * anything else needs an entry in the alias map.
 */
export function matchClientByAlias(
  recipients: string[],
  clients: { id: string; slug: string }[],
  aliasMap: Record<string, string> = {}
): string | null {
  const bySlug = new Map(clients.map((c) => [c.slug.toLowerCase(), c.id]))
  const byId = new Set(clients.map((c) => c.id))

  for (const recipient of recipients) {
    const local = localPartOf(recipient)
    if (!local) continue

    const direct = bySlug.get(local)
    if (direct) return direct

    const mapped = aliasMap[local]
    if (!mapped) continue
    // The map may name a client either way round; both resolve here.
    if (byId.has(mapped)) return mapped
    const viaSlug = bySlug.get(mapped.toLowerCase())
    if (viaSlug) return viaSlug
  }
  return null
}

/**
 * The client a message belongs to. The alias wins over the sender, because the
 * address someone chose to write to is a deliberate signal and the domain they
 * happen to send from is not.
 */
export function resolveClient(
  message: Pick<JmapEmail, "toEmail" | "deliveredTo" | "originalTo" | "fromEmail">,
  clients: { id: string; slug: string; domains: string[] }[],
  aliasMap: Record<string, string> = {}
): { clientId: string | null; via: "alias" | "sender" | null } {
  const recipients = [message.toEmail, message.deliveredTo, message.originalTo].filter(Boolean)
  const byAlias = matchClientByAlias(recipients, clients, aliasMap)
  if (byAlias) return { clientId: byAlias, via: "alias" }

  const bySender = matchClientByDomain(message.fromEmail, clients)
  if (bySender) return { clientId: bySender, via: "sender" }

  return { clientId: null, via: null }
}

export type JmapMailbox = { id: string; name: string; role: string | null; total: number }

/** Every folder in the account — so setup can name a folder instead of an id. */
export async function listMailboxes(config: JmapConfig): Promise<JmapMailbox[]> {
  const { apiUrl, accountId } = await jmapSession(config)
  const response = (await post(apiUrl, config.token, {
    using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
    methodCalls: [["Mailbox/get", { accountId, ids: null }, "m"]],
  })) as {
    methodResponses: [
      string,
      { list?: { id: string; name: string; role?: string | null; totalEmails?: number }[] },
      string,
    ][]
  }
  const list = response.methodResponses.find((r) => r[0] === "Mailbox/get")?.[1]?.list ?? []
  return list.map((box) => ({
    id: box.id,
    name: box.name,
    role: box.role ?? null,
    total: box.totalEmails ?? 0,
  }))
}

/** Resolve a configured folder name (or id) to the id the query filter needs. */
export function resolveMailboxId(boxes: JmapMailbox[], nameOrId: string): string | null {
  if (!nameOrId) return null
  const byId = boxes.find((b) => b.id === nameOrId)
  if (byId) return byId.id
  const wanted = nameOrId.trim().toLowerCase()
  const byName = boxes.find((b) => b.name.toLowerCase() === wanted)
  return byName?.id ?? null
}
