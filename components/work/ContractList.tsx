import Link from "next/link"
import { Badge } from "@/components/work/Badge"
import type { Contract, ContractStatus } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import {
  CONTRACT_STATUS_LABEL,
  formatDay,
  formatMoney,
} from "@/lib/work"

export function contractTone(status: ContractStatus) {
  if (status === "signed") return "teal" as const
  if (status === "sent") return "neutral" as const
  return "muted" as const
}

export function ContractList({
  contracts,
}: {
  contracts: (Contract & { clientName?: string })[]
}) {
  return (
    <ul className="divide-y divide-tk-slate/10">
      {contracts.map((contract) => (
        <li key={contract.id}>
          <Link
            href={ROUTES.contract(contract.slug)}
            className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-tk-linen/60"
          >
            <div className="min-w-0">
              <p className="font-medium text-tk-onyx">{contract.title}</p>
              <p className="mt-0.5 text-sm text-tk-slate/70">
                {[
                  contract.clientName,
                  contract.effectiveOn
                    ? formatDay(contract.effectiveOn)
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {contract.feeCents != null ? (
                <span className="text-sm font-semibold tabular-nums text-tk-onyx">
                  {formatMoney(contract.feeCents)}
                </span>
              ) : null}
              <Badge tone={contractTone(contract.status)}>
                {CONTRACT_STATUS_LABEL[contract.status]}
              </Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
