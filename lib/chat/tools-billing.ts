import { num, str, type ToolPreview, type ToolSpec } from "@/lib/chat/tool-helpers"
import {
  billingOverview,
  planDeliverableDraft,
  planMonthDraft,
  writeDraft,
  type DeliverableDraftPlan,
  type MonthDraftPlan,
} from "@/lib/invoice-drafts"
import { formatMoneyRaw } from "@/lib/work"

/**
 * Billing from the chat: see what is owed and draft invoices. Drafts only —
 * sending, marking sent and marking paid stay on the invoice page. The rules
 * live in lib/invoice-drafts.ts; the card is drawn from the same plan the
 * write executes.
 */

const listBilling: ToolSpec = {
  name: "list_billing",
  description:
    "What can be billed and what is out: client-months with unbilled timesheet hours, project deliverables with a fee and no invoice yet (with their deliverableId), and invoices still in draft or sent (unpaid). Call before draft_invoice.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      clientSlug: { type: "string", description: "Only this client." },
    },
  },
  async run(args) {
    return billingOverview(str(args, "clientSlug"))
  },
}

async function planFrom(args: Record<string, unknown>): Promise<MonthDraftPlan | DeliverableDraftPlan> {
  const deliverableId = str(args, "deliverableId")
  const clientSlug = str(args, "clientSlug")
  const month = str(args, "month")
  if (deliverableId && (month || args.hours != null)) {
    throw new Error("Send either a deliverableId, or a clientSlug and month — not both.")
  }
  if (deliverableId) {
    const planned = await planDeliverableDraft(deliverableId)
    if (!planned.ok) throw new Error(planned.error)
    return planned.data
  }
  if (!clientSlug || !month) throw new Error("Send clientSlug + month (YYYY-MM) for an hours invoice, or a deliverableId from list_billing.")
  const hours = num(args, "hours")
  if (hours != null && (hours <= 0 || hours > 744)) throw new Error("`hours` must be more than 0.")
  const planned = await planMonthDraft({ clientSlug, month, hours })
  if (!planned.ok) throw new Error(planned.error)
  return planned.data
}

const draftInvoice: ToolSpec = {
  name: "draft_invoice",
  description:
    "Draft an invoice — never sends it. Either a client-month of unbilled timesheet hours (clientSlug + month, optional hours override) at the retainer rate, or a project deliverable's fixed fee (deliverableId from list_billing). Numbered on the client's existing sequence. The draft links the month's lines so they stop showing as unbilled. Karol reviews and sends it from the invoice page. Previewed and confirmed first.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      clientSlug: { type: "string", description: "Hours invoice: the client." },
      month: { type: "string", description: "Hours invoice: YYYY-MM." },
      hours: { type: "number", description: "Hours invoice: bill this many hours instead of what is logged (e.g. a flat retainer month)." },
      deliverableId: { type: "string", description: "Deliverable invoice: from list_billing." },
    },
  },
  async preview(args) {
    const plan = await planFrom(args)
    const fields: ToolPreview["fields"] = [
      { label: "Number", value: plan.number },
      { label: "Client", value: plan.clientName },
      { label: "Bill to", value: plan.billTo },
      { label: "Issued", value: plan.issuedOn },
    ]
    if (plan.kind === "hours") {
      fields.push(
        { label: "Hours", value: plan.billHours === plan.loggedHours ? `${plan.billHours} h` : `${plan.billHours} h (${plan.loggedHours} h logged)` },
        { label: "Rate", value: `${formatMoneyRaw(plan.rateCents)}/h` },
        { label: "Lines", value: `${plan.entryIds.length} timesheet line${plan.entryIds.length === 1 ? "" : "s"} linked` }
      )
    } else {
      fields.push({ label: "Project", value: plan.projectName })
    }
    fields.push(
      { label: "Amount", value: formatMoneyRaw(plan.amountCents) },
      { label: "Description", value: plan.description },
      { label: "Status", value: "draft — not sent" }
    )
    return {
      title: "Draft invoice",
      fields,
      note: plan.existing
        ? `${plan.existing.number} (${plan.existing.status}) already covers this — confirming changes nothing.`
        : plan.warnings.join(" ") || undefined,
    }
  },
  async run(args) {
    const result = await writeDraft(await planFrom(args))
    if (!result.ok) throw new Error(result.error)
    return result.data
  },
}

export const BILLING_TOOLS: readonly ToolSpec[] = [listBilling, draftInvoice]
