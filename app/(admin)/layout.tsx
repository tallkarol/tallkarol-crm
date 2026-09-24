import { Suspense } from "react"
import { redirect } from "next/navigation"
import { RootHtml, rootMetadata, rootViewport } from "@/lib/root-html"
import "../globals.css"
import { ActivityProbe } from "@/components/activity/ActivityProbe"
import { AppShell } from "@/components/AppShell"
import { probeModules } from "@/lib/activity/modules"
import { activityFlags } from "@/lib/activity/settings"
import { FloatingClock } from "@/components/timesheet/FloatingClock"
import { RunningClockProvider } from "@/components/timesheet/RunningClockProvider"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { COLOR_GLOBAL } from "@/lib/client-colors"
import { groupClients } from "@/lib/client-groups"
import { loadClientRoster } from "@/lib/client-hub"
import { hydrateClientColors } from "@/lib/client-colors-store"
import { HIDE_MONEY_GLOBAL } from "@/lib/money-privacy"
import { readHideMoneyCookie } from "@/lib/money-privacy-server"
import { readThemeCookie } from "@/lib/theme-server"
import { loadUnread } from "@/lib/unread-data"
import { worstTone } from "@/lib/unread"
import { pendingPunchCount, runningPunches } from "@/lib/punches"
import { liveRecording } from "@/lib/meeting-notes"

export const metadata = rootMetadata
export const viewport = rootViewport

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
  // Appearance — see `lib/theme.ts`. Stamped on <html> by the server below,
  // so there is no boot script and no flash: the bytes that leave the server
  // already carry the user's choice. "system" stamps nothing and lets the
  // prefers-color-scheme block in globals.css decide.
  const theme = readThemeCookie()

  // One read behind every badge and behind the dashboard's Unread card, so a
  // badge can never disagree with the card or the page it points at. The call
  // is request-cached, so the dashboard shares this one rather than repeating it.
  const [unread, pendingPunches, colors, running, recording, activity, roster] = await Promise.all([
    loadUnread(),
    // A plain count(*) — same cost class as the unread/leads/tickets reads
    // below, so the Time hub's Review badge costs nothing extra to add.
    pendingPunchCount(user.id),
    // Fills the map `clientColor()` reads, for this request's server render.
    hydrateClientColors(),
    runningPunches(user.id),
    liveRecording(user.id),
    // Activity module switches (cached in-process for a minute). A failed read
    // means no probe on this page, never a failed page.
    activityFlags().catch(() => null),
    // The Clients group's panel is the client list (see `NavGroup.clientList`),
    // read here so the shell has it from the first paint on every page.
    loadClientRoster(),
  ])
  const clientGroups = groupClients(roster.rows)

  const badges = {
    [ROUTES.inbox]: {
      count: unread.total,
      tone: worstTone(unread.leads.tone, unread.tickets.tone),
    },
    [ROUTES.leads]: { count: unread.leads.count, tone: unread.leads.tone },
    [ROUTES.support]: { count: unread.tickets.count, tone: unread.tickets.tone },
    [ROUTES.timesheetReview]: { count: pendingPunches },
  }

  return (
    <RootHtml theme={theme === "system" ? undefined : theme}>
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
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var p=new URLSearchParams(location.search).get('embed');if(p)sessionStorage.setItem('tk-embed',p);var m=p||sessionStorage.getItem('tk-embed');if(m)document.documentElement.dataset.embed=m}catch(e){}",
        }}
      />
    <RunningClockProvider initial={running} initialRecording={recording}>
      <AppShell
        email={user.email}
        badges={badges}
        hideMoney={hideMoney}
        theme={theme}
        clientGroups={clientGroups}
      >
        {children}
      </AppShell>
      {/* Outside the shell so no overflow or transform on an ancestor can trap it. */}
      <FloatingClock />
    </RunningClockProvider>
    {/* How the CRM gets used — renders nothing. See ACTIVITY.md. */}
    {activity ? (
      <Suspense fallback={null}>
        <ActivityProbe modules={probeModules(activity)} />
      </Suspense>
    ) : null}
    </RootHtml>
  )
}
