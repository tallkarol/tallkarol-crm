import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/work/Badge"
import { ContractBody } from "@/components/work/ContractBody"
import { contractTone } from "@/components/work/ContractList"
import { db } from "@/db"
import { contracts } from "@/db/schema"
import { hasTerms, readTerms } from "@/lib/contract"
import { ROUTES } from "@/lib/nav"
import { Card } from "@/components/ui/Card"
import {
  CONTRACT_STATUS_LABEL,
  formatDay,
  formatMoney,
} from "@/lib/work"

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}) {
  return { title: params.slug }
}

export default async function ContractDetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const contract = await db.query.contracts.findFirst({
    where: eq(contracts.slug, params.slug),
    with: {
      client: true,
      retainer: true,
      project: true,
    },
  })

  if (!contract) notFound()

  const terms = readTerms(contract.terms)

  return (
    <>
      <Link
        href={ROUTES.contracts}
        className="text-sm font-semibold text-tk-teal hover:underline"
      >
        ← Contracts
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeader title={contract.title} />
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={contractTone(contract.status)}>
            {CONTRACT_STATUS_LABEL[contract.status]}
          </Badge>
          {contract.feeCents != null ? (
            <Badge>{formatMoney(contract.feeCents)}</Badge>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-3">
        <Link
          href={ROUTES.client(contract.client.slug)}
          className="font-semibold text-tk-teal hover:underline"
        >
          {contract.client.name}
        </Link>
        {contract.project ? (
          <>
            {" · "}
            <Link
              href={ROUTES.project(contract.project.slug)}
              className="font-semibold text-tk-teal hover:underline"
            >
              {contract.project.name}
            </Link>
          </>
        ) : null}
        {contract.retainer ? (
          <>
            {" · "}
            <Link
              href={ROUTES.retainer(contract.retainer.slug)}
              className="font-semibold text-tk-teal hover:underline"
            >
              {contract.retainer.name}
            </Link>
          </>
        ) : null}
        {contract.effectiveOn ? ` · ${formatDay(contract.effectiveOn)}` : ""}
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        {contract.counterparty ? (
          <Card className="px-5 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Counterparty
            </dt>
            <dd className="mt-1 text-sm font-medium text-tk-onyx">
              {contract.counterparty}
            </dd>
          </Card>
        ) : null}
        {contract.governingLaw ? (
          <Card className="px-5 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Governing law
            </dt>
            <dd className="mt-1 text-sm font-medium text-tk-onyx">
              {contract.governingLaw}
            </dd>
          </Card>
        ) : null}
        {contract.venue ? (
          <Card className="px-5 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Venue
            </dt>
            <dd className="mt-1 text-sm font-medium text-tk-onyx">
              {contract.venue}
            </dd>
          </Card>
        ) : null}
        {contract.extraRateCents != null ? (
          <Card className="px-5 py-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Extra work
            </dt>
            <dd className="mt-1 text-sm font-medium text-tk-onyx">
              {formatMoney(contract.extraRateCents)}/hr
            </dd>
          </Card>
        ) : null}
      </dl>

      {hasTerms(terms) ? <ContractBody terms={terms} /> : null}

      {!hasTerms(terms) && contract.notes ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-ink-3">
          {contract.notes}
        </p>
      ) : null}
    </>
  )
}
