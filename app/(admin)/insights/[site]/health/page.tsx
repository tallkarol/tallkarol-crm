import { notFound } from "next/navigation"
import { Badge } from "@/components/work/Badge"
import { Card } from "@/components/insights/Card"
import { RefreshInsights } from "@/components/insights/RefreshInsights"
import { SendTestHit } from "@/components/analytics/SendTestHit"
import { readServiceAccount } from "@/lib/google-auth"
import { getInsightsContext } from "@/lib/insights/queries"

export const metadata = { title: "Health · Insights" }
export const dynamic = "force-dynamic"

function Checklist({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="divide-y divide-tk-slate/10">
      {items.map((item, index) => (
        <li key={item.title} className="px-5 py-3">
          <p className="text-sm font-medium text-tk-onyx">
            {index + 1}. {item.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-tk-slate/70">{item.body}</p>
        </li>
      ))}
    </ol>
  )
}

function Setup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-3.5 text-[13px] font-bold text-tk-onyx marker:content-none">
        <span className="mr-2 inline-block text-tk-slate/40 transition-transform group-open:rotate-90">
          ▸
        </span>
        {title}
      </summary>
      <div className="border-t border-tk-slate/10">{children}</div>
    </details>
  )
}

export default async function InsightsHealthPage({
  params,
}: {
  params: { site: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx) notFound()
  const { site, snapshot, refreshedAt } = ctx
  const sa = readServiceAccount()

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-tk-slate/60">
          Statuses are from the last fetch — refresh to re-probe every source.
        </p>
        <RefreshInsights slug={site.slug} refreshedAt={refreshedAt} />
      </div>

      {snapshot ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {snapshot.health.map((h) => (
            <div
              key={h.id}
              className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
                  {h.label}
                </p>
                <Badge tone={h.ok === true ? "teal" : h.ok === false ? "muted" : "neutral"}>
                  {h.ok === true ? "Live" : h.ok === false ? "Needs attention" : "Unknown"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-tk-onyx">{h.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-5 py-6 text-sm text-tk-slate/70 shadow-sm">
          No snapshot yet — fetch once and every applicable source reports in here.
        </p>
      )}

      <Card title="Service account" className="mt-3">
        <div className="px-5 py-3.5 text-sm text-tk-slate/80">
          {sa ? (
            <>
              <p>
                Robot: <code className="text-tk-onyx">{sa.client_email}</code>
              </p>
              <p className="mt-1 text-xs text-tk-slate/60">
                Grant this address GA4 Viewer, Search Console, and Google Ads
                Read-only for every property you add. <code>npm run google:check</code>{" "}
                names anything still missing; <code>npm run site:discover</code> lists
                what it can already read.
              </p>
            </>
          ) : (
            <p>
              No Google service account on this deployment yet —{" "}
              <code className="text-tk-onyx">npm run google:link -- ~/Downloads/key.json</code>{" "}
              wires it locally, then copy the three vars to Railway.
            </p>
          )}
        </div>
      </Card>

      {site.measurementId ? (
        <Card title="Measurement Protocol" note="proves the pipe end-to-end" className="mt-3">
          <div className="px-5 py-4">
            <SendTestHit slug={site.slug} />
          </div>
        </Card>
      ) : null}

      <div className="mt-5 space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
          Setup guides — the full walkthrough lives in crm/ANALYTICS.md
        </p>

        <Setup title="Collector deploy (first-party tracking)">
          <Checklist
            items={[
              {
                title: "Deploy the collector",
                body: "The marketing site must serve /tk-collect.js and POST /api/collect (both 200). Until then GA4 counts nothing on its own.",
              },
              {
                title: "Env on the site's host, not the CRM",
                body: "GA4_MEASUREMENT_ID and GA4_API_SECRET belong on the site's Vercel project (Production + Preview), no NEXT_PUBLIC_ prefix. Redeploy after setting them.",
              },
              {
                title: "Prove the pipe",
                body: "Send test hit above, then watch Realtime for the right property. A test hit that appears while site visits don't means the collector isn't live or the site is missing the secret.",
              },
            ]}
          />
        </Setup>

        <Setup title="Service account grants (GA4 + Search Console + Ads)">
          <Checklist
            items={[
              {
                title: "Enable the APIs",
                body: "In the GCP project: Google Analytics Data API, Google Analytics Admin API, Search Console API, Google Ads API.",
              },
              {
                title: "Grant GA4 Viewer",
                body: "GA4 Admin → Property access management → add the robot email as Viewer.",
              },
              {
                title: "Grant Search Console",
                body: "Search Console → Settings → Users and permissions → add the same email. Domain properties use the sc-domain: form.",
              },
              {
                title: "Grant Google Ads Read-only",
                body: "Ads Admin → Access and security → add the robot email as Read-only. Then a developer token from a manager account's API Center, stored as GOOGLE_ADS_DEVELOPER_TOKEN. Attach the customer id with npm run site:set -- <slug> adsCustomerId <id>.",
              },
              {
                title: "Verify",
                body: "npm run google:check walks every site and names anything still missing, then Refresh here.",
              },
            ]}
          />
        </Setup>

        <Setup title="Vercel Web Analytics (Host tab)">
          <Checklist
            items={[
              {
                title: "Turn on Web Analytics and ship the package",
                body: "Project → Analytics → Enable. The site must render @vercel/analytics (not behind the cookie banner). Mineralife already has this.",
              },
              {
                title: "Token on the CRM",
                body: "A Vercel access token that can read Web Analytics, stored as VERCEL_TOKEN. Team projects also need VERCEL_TEAM_ID. Same vars on Railway when this leaves localhost.",
              },
              {
                title: "Attach the project to the site row",
                body: "npm run site:set -- <slug> vercelProjectId prj_…. The Host tab appears only on sites with that id. Refresh writes the last 30 days into the snapshot so Hobby's window does not erase earlier days.",
              },
            ]}
          />
        </Setup>

        <Setup title="UptimeRobot">
          <Checklist
            items={[
              {
                title: "Read-only API key",
                body: "Dashboard → Integrations & API → Read-Only API Key. Store it as UPTIMEROBOT_API_KEY on the CRM (local and Railway). Never the main key — that one can delete monitors.",
              },
              {
                title: "Create the HTTP monitor",
                body: "One monitor per production origin, 5-minute interval is enough. Copy the numeric monitor id.",
              },
              {
                title: "Attach it to the site row",
                body: "npm run site:discover lists what the key can see. Then npm run site:set -- <slug> uptimeMonitorId <id>. Refresh this tab.",
              },
            ]}
          />
        </Setup>

        <Setup title="GA4 admin (once events flow)">
          <Checklist
            items={[
              {
                title: "Mark generate_lead as a key event",
                body: "Admin → Data display → Events. It appears after the first conversion fires.",
              },
              {
                title: "Register custom dimensions",
                body: "Event-scoped: form_id, form_step, step_name, cta_id, cta_location, project_types, engagement_model.",
              },
              {
                title: "Link Search Console",
                body: "Admin → Product links → Search Console links. The hub reads the API directly; the link fills GA4's own organic reports.",
              },
              {
                title: "Pin the funnel and path explorations",
                body: "Funnel: page_view → cta_click → /contact → form_start → generate_lead. Path: landing page → next page → exit or generate_lead.",
              },
            ]}
          />
        </Setup>
      </div>
    </>
  )
}
