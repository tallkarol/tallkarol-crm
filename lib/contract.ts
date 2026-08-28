export type ContractParty = {
  role: string
  name: string
}

export type ContractMilestone = {
  label: string
  trigger: string
  amountCents: number
}

export type ContractBlock = {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
  note?: string
  blocks?: ContractBlock[]
}

export type ContractTable = {
  title?: string
  columns: string[]
  rows: string[][]
}

export type ContractAllocation = {
  label: string
  amountCents?: number
  bullets: string[]
  note?: string
}

export type ContractSchedule = {
  title: string
  subtitle?: string
  paragraphs?: string[]
  allocations?: ContractAllocation[]
  tables?: ContractTable[]
  lists?: { title: string; items: string[] }[]
  note?: string
}

export type ContractCost = {
  label: string
  amount: string
}

export type ContractTerms = {
  subtitle?: string
  source?: string
  preamble?: string[]
  parties?: ContractParty[]
  paymentDue?: string
  extraRateNote?: string
  milestones?: ContractMilestone[]
  sections?: ContractBlock[]
  schedules?: ContractSchedule[]
  operatingCostsNote?: string
  operatingCosts?: ContractCost[]
  operatingCostsTotal?: string
  signatures?: ContractParty[]
}

export function readTerms(value: unknown): ContractTerms {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as ContractTerms
}

export function hasTerms(terms: ContractTerms) {
  return Boolean(
    terms.preamble?.length ||
      terms.parties?.length ||
      terms.milestones?.length ||
      terms.sections?.length ||
      terms.schedules?.length ||
      terms.operatingCosts?.length
  )
}
