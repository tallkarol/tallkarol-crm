export const EXPENSE_CATEGORIES = [
  "software",
  "hosting",
  "hardware",
  "contractors",
  "travel",
  "meals",
  "fees",
  "education",
  "other",
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
