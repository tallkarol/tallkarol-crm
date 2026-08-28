import Link from "next/link"
import { asc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Badge } from "@/components/work/Badge"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { plural } from "@/lib/work"

export const metadata = { title: "Clients" }

export default async function ClientsPage() {
  const rows = await db.query.clients.findMany({
    orderBy: [asc(clients.name)],
    with: {
      retainers: true,
      projects: true,
    },
  })

  return (
    <>
      <PageHeader title="Clients" />

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-tk-slate/70">No clients yet.</p>
      ) : (
        <ul className="mt-8 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
          {rows.map((client) => {
            const hours = client.retainers.reduce(
              (sum, r) => sum + r.hoursPerMonth,
              0
            )
            return (
              <li key={client.id} className="border-b border-tk-slate/10 last:border-0">
                <Link
                  href={ROUTES.client(client.slug)}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-tk-linen/60"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-tk-onyx">{client.name}</p>
                    <p className="mt-0.5 text-sm text-tk-slate/70">
                      {[
                        client.retainers.length
                          ? plural(client.retainers.length, "retainer")
                          : null,
                        client.projects.length
                          ? plural(client.projects.length, "project")
                          : null,
                        hours ? `${hours} hr / mo` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {client.retainers.some((r) => r.status === "active") ? (
                      <Badge tone="teal">Retainer</Badge>
                    ) : null}
                    {client.projects.some((p) => p.status !== "complete") ? (
                      <Badge tone="neutral">Active project</Badge>
                    ) : client.projects.length > 0 ? (
                      <Badge tone="muted">Projects done</Badge>
                    ) : null}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
