import Link from "next/link"
import { desc, eq } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import { inquiries, type InquiryStatus } from "@/db/schema"
import { readAttribution, sourceLabel } from "@/lib/attribution"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Inbox" }

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "closed", label: "Closed" },
]

function isStatus(v: string | undefined): v is InquiryStatus {
  return v === "new" || v === "contacted" || v === "closed"
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  const statusFilter = searchParams.status
  const rows = isStatus(statusFilter)
    ? await db
        .select()
        .from(inquiries)
        .where(eq(inquiries.status, statusFilter))
        .orderBy(desc(inquiries.createdAt))
    : await db.select().from(inquiries).orderBy(desc(inquiries.createdAt))

  return (
    <>
      <PageHeader
        title="Inbox"
        actions={
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const href =
                f.value === "all"
                  ? ROUTES.inquiries
                  : `${ROUTES.inquiries}?status=${f.value}`
              const active =
                (f.value === "all" && !isStatus(statusFilter)) ||
                f.value === statusFilter
              return (
                <Link
                  key={f.value}
                  href={href}
                  className={
                    active
                      ? "rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-tk-linen"
                      : "rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
                  }
                >
                  {f.label}
                </Link>
              )
            })}
          </div>
        }
      />

      <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        {rows.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-ink-3">
            No inquiries yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={ROUTES.inquiry(row.id)}
                  className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-well sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-tk-onyx">
                        {row.name}
                      </span>
                      {row.company && (
                        <span className="text-sm text-ink-3">
                          · {row.company}
                        </span>
                      )}
                      <StatusPill status={row.status} />
                      <SourceChip payload={row.payload} />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink-3">
                      {row.email}
                      {row.projectTypes.length > 0
                        ? ` · ${row.projectTypes.join(", ")}`
                        : ""}
                    </p>
                  </div>
                  <time
                    className="shrink-0 text-xs text-ink-3"
                    dateTime={row.createdAt.toISOString()}
                  >
                    {row.createdAt.toLocaleString()}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function SourceChip({ payload }: { payload: unknown }) {
  const label = sourceLabel(readAttribution(payload))
  if (!label) return null
  return (
    <span className="inline-flex rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold text-tk-slate">
      {label}
    </span>
  )
}

function StatusPill({ status }: { status: InquiryStatus }) {
  return (
    <span className="inline-flex rounded-full bg-tk-teal/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-tk-teal">
      {status}
    </span>
  )
}
