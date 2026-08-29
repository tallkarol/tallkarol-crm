import type {
  Cadence,
  ContractStatus,
  DeliverableStatus,
  FeeStatus,
  InvoiceStatus,
  ProjectStatus,
  ReportStatus,
  RetainerStatus,
  TaskStatus,
} from "@/db/schema"

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  waiting_on_content: "Waiting on content",
  in_progress: "In progress",
  complete: "Complete",
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
  { id: "in_progress", label: "In progress" },
  { id: "waiting_on_content", label: "Waiting" },
  { id: "complete", label: "Complete" },
]
