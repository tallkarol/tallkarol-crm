import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { Shell } from "@/components/Shell"
import { StatusButtons } from "@/components/StatusButtons"

export default async function InquiryDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [row] = await db
    .select()
    .from(inquiries)
    .where(eq(inquiries.id, params.id))
    .limit(1)

  if (!row) notFound()

  const mailto = `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent(
    `Re: your Tall Karol inquiry`
  )}`

  const payloadText = JSON.stringify(row.payload, null, 2)

  return (
    <Shell email={user.email}>
      <Link
        href="/"
        className="text-sm font-semibold text-tk-teal hover:underline"
      >
        ← Inquiries
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tk-onyx">
            {row.name}
          </h1>
          <p className="mt-1 text-sm text-tk-slate/70">
            {row.email}
            {row.company ? ` · ${row.company}` : ""}
          </p>
          <p className="mt-1 text-xs text-tk-slate/70">
            {row.source} · {row.createdAt.toLocaleString()}
          </p>
        </div>
        <a
          href={mailto}
          className="rounded-full bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
        >
          Reply by email
        </a>
      </div>

      <section className="mt-8 rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">Status</h2>
        <div className="mt-3">
          <StatusButtons inquiryId={row.id} current={row.status} />
        </div>
      </section>

      {row.projectTypes.length > 0 && (
        <section className="mt-4 rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-tk-onyx">Project types</h2>
          <p className="mt-2 text-sm text-tk-slate/80">
            {row.projectTypes.join(", ")}
          </p>
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">Full payload</h2>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-tk-linen p-4 font-mono text-xs leading-relaxed text-tk-slate">
          {payloadText}
        </pre>
      </section>
    </Shell>
  )
}
