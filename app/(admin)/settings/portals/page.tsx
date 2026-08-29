import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import { clientColor } from "@/lib/client-colors"
import { formatDay } from "@/lib/work"
import { addPortalGrant, previewPortal, removePortalGrant } from "./actions"

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
      <p className="mt-2 max-w-2xl text-sm text-tk-slate/70">
        Each client gets a branded portal — tickets, invoices, journals, and reports,
        nothing internal. <b className="font-semibold text-tk-slate">Internal for now:</b>{" "}
        adding access never emails anyone; a client can only sign in once you share
        the link and their email holds a grant. Preview shows exactly what they&rsquo;d see.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {clients.map((client) => {
          const members = grants.filter((g) => g.clientId === client.id)
          return (
            <section
              key={client.id}
              className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm"
              style={{ borderLeftWidth: 3, borderLeftColor: clientColor(client.slug) }}
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="size-2 rounded-full" style={{ background: clientColor(client.slug) }} />
                <h2 className="font-['Inter_Tight',sans-serif] text-base font-bold text-tk-onyx">
                  {client.name}
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    members.length
                      ? "bg-tk-teal/10 text-tk-teal"
                      : "bg-tk-slate/10 text-tk-slate/60"
                  }`}
                >
                  {members.length ? `${members.length} with access` : "no access granted"}
                </span>
                <form action={previewPortal.bind(null, client.id)} className="ml-auto">
                  <button className="rounded-full bg-tk-teal px-3.5 py-1.5 text-xs font-semibold text-tk-linen hover:bg-tk-teal/90">
                    Preview portal
                  </button>
                </form>
              </div>

              <ul className="mt-3">
                {members.length === 0 ? (
                  <li className="py-1.5 text-xs text-tk-slate/50">
                    Nobody can sign in to this portal yet.
                  </li>
                ) : (
                  members.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-3 border-b border-tk-slate/[0.07] py-2 text-sm last:border-0"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-tk-onyx">{g.email}</span>
                        <span className="block text-xs text-tk-slate/50">
                          access since {formatDay(g.createdAt.toISOString().slice(0, 10))}
                        </span>
                      </span>
                      <form action={removePortalGrant.bind(null, g.id)}>
                        <button className="rounded-full border border-tk-slate/20 px-2.5 py-1 text-[11px] font-semibold text-tk-slate hover:border-red-700 hover:text-red-700">
                          Remove access
                        </button>
                      </form>
                    </li>
                  ))
                )}
              </ul>

              <form action={addPortalGrant} className="mt-3 flex gap-2 border-t border-tk-slate/[0.07] pt-3">
                <input type="hidden" name="clientId" value={client.id} />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="name@client.com"
                  className="min-w-0 flex-1 rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-1.5 text-sm outline-none focus:border-tk-teal"
                />
                <button className="rounded-full border border-tk-slate/20 px-3.5 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                  Grant access
                </button>
              </form>
            </section>
          )
        })}
      </div>
    </>
  )
}
