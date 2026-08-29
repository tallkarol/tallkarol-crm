import type { TicketPriority, TicketState } from "@/lib/support"

/**
 * The lightweight shape the queue runs on. Payload bodies and thread text stay
 * on the server — everything here is what a row needs to render, sort, and be
 * searched, plus a pre-built `search` blob so filtering never touches the db.
 */
export type QueueRow = {
  id: string
  slug: string
  number: string
  title: string
  clientSlug: string
  clientName: string
  color: string
  platform: string
  source: string
  state: TicketState
  stateLabel: string
  priority: TicketPriority
  tags: string[]
  age: string
  /** Epoch ms — the age sorts and the today/this week/older bands run off it. */
  openedAt: number
  dueAt: number | null
  late: boolean
  dueSoon: boolean
  dueLabel: string
  payloadCount: number
  messageCount: number
  submittedBy: string
  search: string
}
