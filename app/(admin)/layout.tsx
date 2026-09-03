import { redirect } from "next/navigation"
import { AppShell } from "@/components/AppShell"
import { FloatingClock } from "@/components/timesheet/FloatingClock"
import { getSessionUser } from "@/lib/auth"
import { adminNav, ROUTES } from "@/lib/nav"
import { flattenProducts, studiosWithProducts } from "@/lib/products"
import { COLOR_GLOBAL } from "@/lib/client-colors"
import { hydrateClientColors } from "@/lib/client-colors-store"
import { HIDE_MONEY_GLOBAL } from "@/lib/money-privacy"
import { readHideMoneyCookie } from "@/lib/money-privacy-server"
import { themeBootScript } from "@/lib/theme"
import { readThemeCookie } from "@/lib/theme-server"
import { loadUnread } from "@/lib/unread-data"
import { worstTone } from "@/lib/unread"
import { runningPunches } from "@/lib/punches"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  // Demo mode — see `lib/money-privacy.ts`. Read here for the script tag and
  // the shell's switch; server components read the same cookie themselves.
  const hideMoney = readHideMoneyCookie()
  // Appearance — see `lib/theme.ts`. The root layout stamps light; this
  // overrides it with the user's choice before first paint.
  const theme = readThemeCookie()

  // One read behind every badge and behind the dashboard's Unread card, so a
  // badge can never disagree with the card or the page it points at. The call
  // is request-cached, so the dashboard shares this one rather than repeating it.
  const [unread, catalog, colors, running] = await Promise.all([
    loadUnread(),
    studiosWithProducts(),
    // Fills the map `clientColor()` reads, for this request's server render.
    hydrateClientColors(),
    runningPunches(user.id),
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
      {/*
        Demo mode for the browser bundle, same reasoning: `hideMoney()` is a
        plain function inside the money formatters, and this lands before
        hydration so the first client render matches the masked server HTML.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.${HIDE_MONEY_GLOBAL}=${hideMoney}${
            hideMoney ? ";document.documentElement.dataset.hideMoney='1'" : ""
          }`,
        }}
      />
      {/*
        Embedded chrome. The Mac app's Settings window opens CRM settings
        pages with `?embed=settings`; that turns off the sidebar, top bar and
        floating clock (see `[data-chrome]` in globals.css) so the page reads
        as a settings pane, not the whole CRM inside a settings window. The
        flag is remembered per browsing context, so client-side navigation
        inside that web view keeps it without carrying the query string.
      */}
      <script dangerouslySetInnerHTML={{ __html: themeBootScript(theme) }} />
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var p=new URLSearchParams(location.search).get('embed');if(p)sessionStorage.setItem('tk-embed',p);var m=p||sessionStorage.getItem('tk-embed');if(m)document.documentElement.dataset.embed=m}catch(e){}",
        }}
      />
    <AppShell
      email={user.email}
      badges={badges}
      nav={adminNav(flattenProducts(catalog))}
      hideMoney={hideMoney}
      theme={theme}
    >
      {children}
    </AppShell>
    {/* Outside the shell so no overflow or transform on an ancestor can trap it. */}
    <FloatingClock initial={running} />
    </>
  )
}
