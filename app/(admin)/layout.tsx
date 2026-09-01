import { redirect } from "next/navigation"
import { AppShell } from "@/components/AppShell"
import { getSessionUser } from "@/lib/auth"
import { adminNav, ROUTES } from "@/lib/nav"
import { flattenProducts, studiosWithProducts } from "@/lib/products"
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
  const [unread, catalog] = await Promise.all([loadUnread(), studiosWithProducts()])

  const badges = {
    [ROUTES.inbox]: {
      count: unread.total,
      tone: worstTone(unread.leads.tone, unread.tickets.tone),
    },
    [ROUTES.leads]: { count: unread.leads.count, tone: unread.leads.tone },
    [ROUTES.support]: { count: unread.tickets.count, tone: unread.tickets.tone },
  }

  return (
    <AppShell
      email={user.email}
      badges={badges}
      nav={adminNav(flattenProducts(catalog))}
    >
      {children}
    </AppShell>
  )
}
