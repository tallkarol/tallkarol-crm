import { redirect } from "next/navigation"
import { AppShell } from "@/components/AppShell"
import { getSessionUser } from "@/lib/auth"
import { adminNav, ROUTES } from "@/lib/nav"
import { flattenProducts, studiosWithProducts } from "@/lib/products"
import { COLOR_GLOBAL } from "@/lib/client-colors"
import { hydrateClientColors } from "@/lib/client-colors-store"
import { loadUnread } from "@/lib/unread-data"
import { worstTone } from "@/lib/unread"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  // One read behind every badge and behind the dashboard's Unread card, so a
  // badge can never disagree with the card or the page it points at. The call
  // is request-cached, so the dashboard shares this one rather than repeating it.
  const [unread, catalog, colors] = await Promise.all([
    loadUnread(),
    studiosWithProducts(),
    // Fills the map `clientColor()` reads, for this request's server render.
    hydrateClientColors(),
  ])

  const badges = {
    [ROUTES.inbox]: {
      count: unread.total,
      tone: worstTone(unread.leads.tone, unread.tickets.tone),
    },
    [ROUTES.leads]: { count: unread.leads.count, tone: unread.leads.tone },
    [ROUTES.support]: { count: unread.tickets.count, tone: unread.tickets.tone },
  }

  return (
    <>
      {/*
        The same map for the browser bundle. A script tag rather than a context
        because `clientColor()` is a plain function called in 73 places, a third
        of them in client components — this lands before React hydrates, so the
        first client render already has the right colours and cannot flash.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.${COLOR_GLOBAL}=${JSON.stringify(colors)}`,
        }}
      />
    <AppShell
      email={user.email}
      badges={badges}
      nav={adminNav(flattenProducts(catalog))}
    >
      {children}
    </AppShell>
    </>
  )
}
