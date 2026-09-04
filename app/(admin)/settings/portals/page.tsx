import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import { clientColor, markColor } from "@/lib/client-colors"
import { formatDay } from "@/lib/work"
import { addPortalGrant, previewPortal, removePortalGrant } from "./actions"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Client Portals" }
export const dynamic = "force-dynamic"

export default async function ClientPortalsPage() {
  const [clients, grants] = await Promise.all([
    db.query.clients.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
    db.query.portalGrants.findMany({ orderBy: (g, { asc }) => [asc(g.createdAt)] }),
  ])

  return (
    <>
      <PageHeader title="Client Portals" />
      <p className="mt-2 max-w-2xl text-sm text-ink-3">
        Each client gets a branded portal — tickets, invoices, journals, and reports,
        nothing internal. <b className="font-semibold text-tk-slate">Internal for now:</b>{" "}
        adding access never emails anyone; a client can only sign in once you share
        the link and their email holds a grant. Preview shows exactly what they&rsquo;d see.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {clients.map((client) => {
          const members = grants.filter((g) => g.clientId === client.id)
          return (
            <Card className="p-5" key={client.id} style={{ borderLeftWidth: 3, borderLeftColor: markColor(clientColor(client.slug)) }}>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="tk-client-mark size-2 rounded-full" style={{ "--c": clientColor(client.slug) } as React.CSSProperties} />
                <h2 className="font-['Inter_Tight',sans-serif] text-base font-bold text-tk-onyx">
                  {client.name}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    members.length
                      ? "bg-tk-teal/10 text-tk-teal"
                      : "bg-well text-ink-3"
                  }`}
                >
                  {members.length ? `${members.length} with access` : "no access granted"}
                </span>
                <form action={previewPortal.bind(null, client.id)} className="ml-auto">
                  <button className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-tk-linen hover:bg-tk-teal/90">
                    Preview portal
                  </button>
                </form>
              </div>

              <ul className="mt-3">
                {members.length === 0 ? (
                  <li className="py-1.5 text-xs text-ink-3">
                    Nobody can sign in to this portal yet.
                  </li>
                ) : (
                  members.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-3 border-b border-line py-2 text-sm last:border-0"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-tk-onyx">{g.email}</span>
                        <span className="block text-xs text-ink-3">
                          access since {formatDay(g.createdAt.toISOString().slice(0, 10))}
                        </span>
                      </span>
                      <form action={removePortalGrant.bind(null, g.id)}>
                        <button className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-tk-slate hover:border-red-700 hover:text-red-700">
                          Remove access
                        </button>
                      </form>
                    </li>
                  ))
                )}
              </ul>

              <form action={addPortalGrant} className="mt-3 flex gap-2 border-t border-line pt-3">
                <input type="hidden" name="clientId" value={client.id} />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="name@client.com"
                  className="min-w-0 flex-1 rounded-lg border border-line bg-well px-3 py-1.5 text-sm focus:border-tk-teal"
                />
                <button className="rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                  Grant access
                </button>
              </form>
            </Card>
          )
        })}
      </div>
    </>
  )
}
