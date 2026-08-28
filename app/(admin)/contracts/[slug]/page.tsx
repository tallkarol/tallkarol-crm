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
      <p className="mt-2 text-sm text-tk-slate/70">
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
          <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-3 shadow-sm">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
              Counterparty
            </dt>
            <dd className="mt-1 text-sm font-medium text-tk-onyx">
              {contract.counterparty}
            </dd>
          </div>
        ) : null}
        {contract.governingLaw ? (
          <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-3 shadow-sm">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
              Governing law
            </dt>
            <dd className="mt-1 text-sm font-medium text-tk-onyx">
              {contract.governingLaw}
            </dd>
          </div>
        ) : null}
        {contract.venue ? (
          <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-3 shadow-sm">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
              Venue
            </dt>
            <dd className="mt-1 text-sm font-medium text-tk-onyx">
              {contract.venue}
            </dd>
          </div>
        ) : null}
        {contract.extraRateCents != null ? (
          <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-3 shadow-sm">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
              Extra work
            </dt>
            <dd className="mt-1 text-sm font-medium text-tk-onyx">
              {formatMoney(contract.extraRateCents)}/hr
            </dd>
          </div>
        ) : null}
      </dl>

      {hasTerms(terms) ? <ContractBody terms={terms} /> : null}

      {!hasTerms(terms) && contract.notes ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-tk-slate/70">
          {contract.notes}
        </p>
      ) : null}
    </>
  )
}
