import type {
  Cadence,
  ContractStatus,
  DeliverableStatus,
  FeeStatus,
  InvoiceStatus,
  ProductStatus,
  ProductStudioKind,
  ProjectStatus,
  ProposalStatus,
  ReportStatus,
  RetainerStatus,
  TaskStatus,
  WorksheetMode,
  WorksheetStatus,
} from "@/db/schema"

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  not_started: "Not started",
  waiting_on_content: "Waiting on content",
  in_progress: "In progress",
  on_hold: "On hold",
  complete: "Complete",
}

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  idea: "Idea",
  building: "Building",
  live: "Live",
  paused: "Paused",
}

export function productStatusClass(status: ProductStatus) {
  if (status === "live") return "bg-emerald-800/10 text-emerald-800"
  if (status === "paused") return "bg-amber-800/10 text-amber-800"
  if (status === "idea") return "bg-tk-slate/10 text-tk-slate/70"
  return "bg-tk-teal/10 text-tk-teal"
}

export const PRODUCT_STUDIO_KIND_LABEL: Record<ProductStudioKind, string> = {
  solo: "Own",
  studio: "Studio",
  team: "Team",
}

export function studioCaption(studio: {
  name: string
  kind: ProductStudioKind
}) {
  if (studio.kind === "solo") return studio.name
  return `${studio.name} · ${PRODUCT_STUDIO_KIND_LABEL[studio.kind].toLowerCase()}`
}

export const FEE_STATUS_LABEL: Record<FeeStatus, string> = {
  agreed: "Fee agreed",
  deposit_paid: "Deposit paid",
  paid: "Paid",
}

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  pending: "Pending",
  done: "Done",
  invoiced: "Invoiced",
  paid: "Paid",
}

export const RETAINER_STATUS_LABEL: Record<RetainerStatus, string> = {
  active: "Ongoing",
  paused: "Paused",
  ended: "Ended",
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  done: "Done",
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  due: "Due",
  filed: "Filed",
}

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
}

export const WORKSHEET_STATUS_LABEL: Record<WorksheetStatus, string> = {
  blank: "Blank",
  filled: "Filled",
  review: "With client",
  signed: "Signed off",
}

export const WORKSHEET_MODE_LABEL: Record<WorksheetMode, string> = {
  client: "Client-filled",
  interview: "From interview",
  portal: "Portal intake",
}

export const CADENCE_LABEL: Record<Cadence, string> = {
  none: "Once",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
}

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
}

export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

export function formatMoney(cents: number, currency = "USD") {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
  })
}

export function formatHours(value: string | number | null | undefined) {
  if (value == null || value === "") return null
  const n = Number(value)
  if (Number.isNaN(n)) return null
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} hr`
}

export function formatDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function hoursTotal(entries: { hours: string }[]) {
  return entries.reduce((sum, row) => sum + Number(row.hours), 0)
}

export const PROJECT_FILTERS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "not_started", label: "Not started" },
  { id: "in_progress", label: "In progress" },
  { id: "waiting_on_content", label: "Waiting" },
  { id: "on_hold", label: "On hold" },
  { id: "complete", label: "Complete" },
]
