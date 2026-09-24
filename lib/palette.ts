/**
 * ⌘K's shapes, shared by the palette (a client component) and the route that
 * feeds it. No `db` import here, so the browser bundle can read it.
 */

export type PaletteKind =
  | "action"
  | "page"
  | "client"
  | "project"
  | "retainer"
  | "room"
  | "task"
  | "ticket"
  | "invoice"
  | "chat"
  | "doc"
  | "punchlist"
  | "meeting"
  | "product"
  | "board"

/**
 * What an action row does instead of navigating. `clock-in` is the header
 * clock's own start; `send` starts a chat thread with that message — the
 * same path as typing it on /chat — and opens it.
 */
export type PaletteAction =
  | { type: "clock-in"; clientId: string }
  | { type: "send"; text: string; busy: string }

/** One row the palette can jump to or run. `slug` colours the dot when it is a client's thing. */
export type PaletteEntry = {
  label: string
  kind: PaletteKind
  /** Where it goes. An action row has an `action` instead. */
  href?: string
  action?: PaletteAction
  /** Opens in a new tab — the /doc viewers, as the client dashboards open them. */
  external?: boolean
  /** Right-hand detail: a record's client, or a live count on a page. */
  sub?: string
  slug?: string
  /** Pages only: the dock group it lives in ("Time", "Work"), matched and shown when searching. */
  group?: string
  /** Pages only: parked off the dock — searchable, never listed on the empty palette. */
  parked?: boolean
  /** Matched, never shown: a ticket's number, an invoice's status. */
  keywords?: string
}

/** What `GET /api/palette` answers on first open: the records and actions, and counts keyed by page href. */
export type PalettePayload = {
  records: PaletteEntry[]
  counts: Record<string, string>
}
