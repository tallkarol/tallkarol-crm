import type { Inquiry, InquirySource, InquiryStatus } from "@/db/schema"
import { readAttribution, sourceLabel } from "@/lib/attribution"

export const QUALIFICATIONS = ["unreviewed", "fit", "maybe", "pass"] as const
export type Qualification = (typeof QUALIFICATIONS)[number]

export type LeadSend = {
  kind: "email" | "onesheet"
  templateId: string
  templateTitle: string
  at: string
}

export type LeadState = {
  qualification: Qualification
  meetingAt: string | null
  meetingNotes: string
  notes: string
  sends: LeadSend[]
}

export type FormLine = { label: string; value: string }

export type LeadListItem = {
  id: string
  name: string
  email: string
  company: string | null
  source: InquirySource
  projectTypes: string[]
  status: InquiryStatus
  createdAt: string
  lead: LeadState
  attributionLabel: string | null
  formLines: FormLine[]
  firstName: string
  engagement: string | null
}

export const EMPTY_LEAD: LeadState = {
  qualification: "unreviewed",
  meetingAt: null,
  meetingNotes: "",
  notes: "",
  sends: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isQualification(value: unknown): value is Qualification {
  return (
    value === "unreviewed" ||
    value === "fit" ||
    value === "maybe" ||
    value === "pass"
  )
}

export function readLead(payload: unknown): LeadState {
  if (!isRecord(payload) || !isRecord(payload.lead)) return { ...EMPTY_LEAD }
  const raw = payload.lead
  const sends = Array.isArray(raw.sends)
    ? raw.sends.filter(isRecord).map((send): LeadSend => ({
        kind: send.kind === "onesheet" ? "onesheet" : "email",
        templateId: String(send.templateId ?? ""),
        templateTitle: String(send.templateTitle ?? "Template"),
        at: String(send.at ?? ""),
      }))
    : []
  return {
    qualification: isQualification(raw.qualification)
      ? raw.qualification
      : "unreviewed",
    meetingAt: typeof raw.meetingAt === "string" && raw.meetingAt
      ? raw.meetingAt
      : null,
    meetingNotes: typeof raw.meetingNotes === "string" ? raw.meetingNotes : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    sends,
  }
}

export function mergeLeadPayload(
  payload: unknown,
  patch: Partial<LeadState>
): Record<string, unknown> {
  const base = isRecord(payload) ? { ...payload } : {}
  const current = readLead(payload)
  return {
    ...base,
    lead: {
      ...current,
      ...patch,
      sends: patch.sends ?? current.sends,
    },
  }
}

function pushLine(
  lines: FormLine[],
  label: string,
  value: unknown
) {
  if (value == null || value === "") return
  if (Array.isArray(value)) {
    const text = value.map(String).filter(Boolean).join(", ")
    if (text) lines.push({ label, value: text })
    return
  }
  if (typeof value === "object") return
  lines.push({ label, value: String(value) })
}

function flattenGroup(
  lines: FormLine[],
  group: Record<string, unknown> | null,
  labels: Record<string, string>
) {
  if (!group) return
  for (const [key, label] of Object.entries(labels)) {
    pushLine(lines, label, group[key])
  }
}

export function formLinesFromPayload(payload: unknown): FormLine[] {
  const root = isRecord(payload) ? payload : {}
  const config = isRecord(root.config) ? root.config : {}
  const lines: FormLine[] = []

  const engagement = isRecord(config.engagement) ? config.engagement : null
  if (engagement) {
    pushLine(lines, "Engagement", engagement.model)
    if (Array.isArray(engagement.details)) {
      for (const detail of engagement.details) {
        if (!isRecord(detail)) continue
        pushLine(lines, String(detail.label ?? "Note"), detail.value)
      }
    }
  }

  flattenGroup(lines, isRecord(config.website) ? config.website : null, {
    type: "Website type",
    currentSituation: "Current site",
    design: "Design",
    painPoints: "Website pain",
    features: "Features",
  })
  flattenGroup(lines, isRecord(config.app) ? config.app : null, {
    type: "App type",
    purpose: "Purpose",
    users: "Users",
    painPoints: "App pain",
  })
  flattenGroup(lines, isRecord(config.tool) ? config.tool : null, {
    type: "Tool type",
    painPoints: "Tool pain",
  })
  flattenGroup(lines, isRecord(config.design) ? config.design : null, {
    type: "Design type",
    currentState: "Design now",
    painPoints: "Design pain",
  })
  flattenGroup(lines, isRecord(config.integrations) ? config.integrations : null, {
    systems: "Systems",
    painPoints: "Integration pain",
    goal: "Integration goal",
  })
  flattenGroup(lines, isRecord(config.consulting) ? config.consulting : null, {
    type: "Consulting",
    currentSituation: "Situation",
    painPoints: "Consulting pain",
    goals: "Goals",
  })
  flattenGroup(lines, isRecord(config.unknown) ? config.unknown : null, {
    whatsNotWorking: "Not working",
    tryingToAchieve: "Trying to achieve",
    painPoints: "Pain",
  })
  flattenGroup(lines, isRecord(config.additional) ? config.additional : null, {
    timeline: "Timeline",
    budget: "Budget",
    anythingElse: "Anything else",
  })

  return lines
}

export function firstNameFrom(name: string): string {
  const part = name.trim().split(/\s+/)[0]
  return part || name
}

export function engagementFromPayload(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.config)) return null
  const engagement = isRecord(payload.config.engagement)
    ? payload.config.engagement
    : null
  if (engagement?.model) return String(engagement.model)
  return null
}

export function toLeadListItem(row: Inquiry): LeadListItem {
  const attribution = readAttribution(row.payload)
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    source: row.source,
    projectTypes: row.projectTypes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    lead: readLead(row.payload),
    attributionLabel: sourceLabel(attribution),
    formLines: formLinesFromPayload(row.payload),
    firstName: firstNameFrom(row.name),
    engagement: engagementFromPayload(row.payload),
  }
}

export function meetingIsUpcoming(iso: string | null, now = Date.now()): boolean {
  if (!iso) return false
  const at = Date.parse(iso)
  return Number.isFinite(at) && at >= now
}

export type LeadStage =
  | "all"
  | "needs-look"
  | "fit"
  | "meeting"
  | "sent"
  | "closed"

export function leadMatchesStage(lead: LeadListItem, stage: LeadStage): boolean {
  if (stage === "all") return true
  if (stage === "closed") return lead.status === "closed"
  if (stage === "needs-look") {
    return lead.lead.qualification === "unreviewed" && lead.status !== "closed"
  }
  if (stage === "fit") return lead.lead.qualification === "fit"
  if (stage === "meeting") return meetingIsUpcoming(lead.lead.meetingAt)
  if (stage === "sent") return lead.lead.sends.length > 0
  return true
}

export function leadCounts(leads: LeadListItem[]) {
  return {
    total: leads.length,
    needsLook: leads.filter((l) => leadMatchesStage(l, "needs-look")).length,
    fit: leads.filter((l) => leadMatchesStage(l, "fit")).length,
    meeting: leads.filter((l) => leadMatchesStage(l, "meeting")).length,
    sent: leads.filter((l) => leadMatchesStage(l, "sent")).length,
    closed: leads.filter((l) => leadMatchesStage(l, "closed")).length,
  }
}

export const QUALIFICATION_LABEL: Record<Qualification, string> = {
  unreviewed: "Unreviewed",
  fit: "Fit",
  maybe: "Maybe",
  pass: "Pass",
}
