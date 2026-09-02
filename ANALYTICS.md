# Analytics setup — Tall Karol

First-party collector on tallkarol.com → GA4 Measurement Protocol. No gtag, no GTM.js, CSP stays `'self'`.

| | |
|---|---|
| Property | `498136327` |
| Web stream | `11533621544` |
| Measurement ID | `G-JSHG8GYFXE` |
| Site | `https://www.tallkarol.com` |
| CRM | Insights hub — `/insights`, per-site tabs |

## Collector status

As of 28 Aug 2026 the collector is **live**: `tk-collect.js` and `POST /api/collect`
both respond on tallkarol.com, and the Measurement Protocol secret is accepted.
GA4 is counting real visitors.

Search Console is a **Domain** property, so `GSC_SITE_URL` must be
`sc-domain:tallkarol.com` — the URL-prefix form (`https://www.tallkarol.com/`)
returns 403 because no such property is granted.

After deploy:

1. Vercel (tallkarol.com) has `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` (no `NEXT_PUBLIC_`). Redeploy after setting them.
2. Open [Realtime for 498136327](https://analytics.google.com/analytics/web/#/p498136327/reports/realtime).
3. Visit the site. Wait ~30 seconds.
4. CRM → Insights hub → Health → **Send test hit** proves the property receives Measurement Protocol events even before the collector is live.

DebugView only shows events with `debug_mode=1` (local, or `/api/collect?debug=1`). Production Realtime uses events without that flag.

Do not mark your own IP as Internal if you want to see yourself.

## GA4 Admin (once events flow)

1. **Key event:** Admin → Data display → Events → mark `generate_lead`.
2. **Custom dimensions** (event-scoped): `form_id`, `form_step`, `step_name`, `cta_id`, `cta_location`, `project_types`, `engagement_model`.
3. **Search Console link:** Admin → Product links → Search Console links → the `www.tallkarol.com` property.
4. **Funnel exploration:** `page_view` → `cta_click` → `page_view` `/contact` → `form_start` → `form_step` → `generate_lead`. Pin it.
5. **Path exploration:** landing page → next page → exit or `generate_lead`. Pin it.

## Search Console + CRM reports

1. GCP project: enable Analytics Data API, Analytics Admin API, Search Console API.
2. Create a service account. Download JSON. Keep it off git.
3. GA4 Admin → Property access management → add the SA email as **Viewer**.
4. Search Console → Users and permissions → add the same email.
5. Railway CRM env:

```
GA4_PROPERTY_ID=498136327
GA4_MEASUREMENT_ID=G-JSHG8GYFXE
GA4_API_SECRET=…          # same secret as Vercel; used for test hits
GSC_SITE_URL=https://www.tallkarol.com/
GOOGLE_PROJECT_ID=…
GOOGLE_SERVICE_ACCOUNT_EMAIL=…@….iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
```

The Insights hub then lights up: 90-day daily series (7/28/90-day windows with previous-period deltas are derived from it — switching ranges never refetches), top-25 queries/pages with position movement, channels/events/devices/countries, the GA4 ↔ CRM conversions join on the house site, per-table CSV export, and month archives that freeze automatically for report PDFs. Source status and these setup steps live on each property's Health tab.

## Wiring the service account

Don't hand-paste the private key — the newlines are the usual failure. Download
the JSON from GCP → IAM & Admin → Service Accounts → Keys, then:

```
npm run google:link -- ~/Downloads/<key>.json   # writes the 3 vars to .env.local
npm run google:check                            # proves GA4, GSC, and Calendar
```

`google:check` mints a token and calls each API, then prints exactly which
grants are still missing and where to add them. Copy the same three values into
Railway when it comes back clean.

The robot's `client_email` is what you add as a GA4 **Viewer**, a Search Console
user, and a calendar share target. It needs no IAM roles on the GCP project.

## Sites

Each property is a row in `sites`, and each gets its own snapshot under the
`insights:<slug>` cache key, so refreshing one never clobbers another. Sites
link to `clients` via `client_id` — the hub's rail groups by client, and the
house property (no client) is the default view. Closed months freeze into
`snapshot_archive` (one row per site per month) and power the printable
reports on each property's Reports tab.

```
npm run site:list
npm run site:add -- <slug> "<Name>" <origin> <ga4PropertyId> <gscSiteUrl> [measurementId]
npm run site:add -- zemvelo "Zemvelo" https://zemvelo.com 123456789 sc-domain:zemvelo.com
```

`origin` and `measurementId` matter only for sites running the first-party
collector; leave `measurementId` empty elsewhere and the collector and
Measurement Protocol panels report as not applicable rather than broken.

`GA4_API_SECRET` is still a single env var — it is only used by the **Send test
hit** button, which is a tallkarol-specific tool.

To add a property, grant the robot on GA4 and Search Console first, then:

```
npm run site:discover
```

That lists every GA4 property and Search Console site the service account can
actually read, flags which are already tracked, and prints a ready-to-paste
`site:add` command for the rest. No hunting for property IDs, and no guessing
whether Search Console is a Domain or URL-prefix property — the real identifier
comes back from the API.

Then `npm run google:check` walks every site and names anything still missing.

Uptime is UptimeRobot. The CRM only ever reads — `UPTIMEROBOT_API_KEY` must be
the account's **read-only** key. `site:discover` lists the monitors that key
can see; attach one with:

```
npm run site:set -- tallkarol uptimeMonitorId 803857404
npm run site:set -- karolbuczek uptimeMonitorId 803859654
npm run site:set -- zemvelo uptimeMonitorId 803863305
npm run site:set -- mycustommanufacturer uptimeMonitorId 803863309
```

House plus Zemvelo and Mineralife (mycustommanufacturer.com) are monitored.
The live board is `/uptime`, grouped by client; the Health tab picks the same
source up on Refresh. No monitor id, no uptime number — by rule.

## PageSpeed

The `pagespeed` source runs for any site with an `origin` set. It **requires
`PAGESPEED_API_KEY`** — the keyless pool is a shared anonymous project whose
daily quota is permanently exhausted (verified 2 Sep 2026), and the API takes
keys only, so the service account cannot cover it. Enable the PageSpeed
Insights API in the GCP project, create an API key under Credentials, and set
it locally and on Railway. Each Refresh then runs a live mobile + desktop
Lighthouse audit (15–30 s each, so refreshes take up to a minute), storing
category scores and CrUX field vitals (LCP/INP/CLS, once Google has enough
real traffic) in the snapshot under `pagespeed`. A failed run keeps the last
good scores. Month freezes carry the scores as of the freeze — PSI has no
history.

## Client portal

`/portal/insights` shows customers their own sites' snapshot: GA4 KPIs and
trends, Search Console queries/pages with position movement, Google Ads spend
and campaigns, PageSpeed scores, and search-index health from the GSC scans.
It reads only the cached snapshot and the local scan tables — never Google —
so it is exactly as fresh as the last admin Refresh. The printable month
report (`/insights-report/<slug>?period=…`) and the CSV export also accept
portal customers now, scoped to sites whose `client_id` they hold a grant for.

## Cursor analytics-mcp (optional, read-only)

```
brew install pipx && pipx ensurepath
pipx install analytics-mcp
```

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "analytics-mcp": {
      "command": "pipx",
      "args": ["run", "analytics-mcp"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/sa.json",
        "GOOGLE_PROJECT_ID": "your-gcp-project-id"
      }
    }
  }
}
```

Restart Cursor. It can read reports. It cannot mark key events or build Explorations.
