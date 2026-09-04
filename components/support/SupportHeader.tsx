import { PageHeader } from "@/components/PageHeader"
import { CopyAction } from "@/components/support/CopyButton"
import {
  connectSheet,
  enableInstantSync,
  refreshTickets,
} from "@/app/(admin)/support/actions"
import type { SmartsheetConfig } from "@/lib/smartsheet"
import { Card } from "@/components/ui/Card"

type ClientOption = { id: string; name: string; slug: string }

export function SupportHeader({
  config,
  tokenPresent,
  clients,
  ticketCount,
  appUrl,
}: {
  config: SmartsheetConfig
  tokenPresent: boolean
  clients: ClientOption[]
  ticketCount: number
  appUrl: string
}) {
  const connected = tokenPresent && Boolean(config.sheetId)
  const showConnect = !connected && ticketCount === 0
  const zemvelo = clients.find((c) => c.slug === "zemvelo")

  const curl = [
    `curl -X POST ${appUrl}/api/support/ingest \\`,
    `  -H "Authorization: Bearer $SUPPORT_INGEST_SECRET" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "client": "zemvelo",`,
    `    "platform": "Shopify",`,
    `    "source": "app",`,
    `    "title": "Checkout 500 on discount code",`,
    `    "description": "Every order using SPRING20 fails at payment.",`,
    `    "priority": "urgent",`,
    `    "submittedBy": "Dana Whitfield",`,
    `    "contactEmail": "dana@zemvelo.com",`,
    `    "tags": ["checkout"],`,
    `    "env": { "Store": "zemvelo.myshopify.com", "Theme": "Dawn 15.2.0" },`,
    `    "payloads": [`,
    `      { "label": "Function error", "lang": "json", "body": "{ \\"errors\\": [] }" }`,
    `    ]`,
    `  }'`,
  ].join("\n")

  return (
    <>
      <PageHeader
        title="Support"
        actions={
          connected ? (
            <div className="flex flex-wrap items-center gap-2">
              {config.lastSyncAt ? (
                <span className="font-mono text-[11px] text-ink-3">
                  synced{" "}
                  {new Date(config.lastSyncAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
              {config.webhookId ? (
                <span className="rounded-full bg-tk-teal/10 px-2.5 py-1 text-[11px] font-semibold text-tk-teal">
                  webhook live
                </span>
              ) : (
                <form action={enableInstantSync}>
                  <button className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                    Enable instant sync
                  </button>
                </form>
              )}
              <form action={refreshTickets}>
                <button className="rounded-full bg-accent px-3.5 py-1 text-xs font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90">
                  Refresh from Smartsheet
                </button>
              </form>
            </div>
          ) : null
        }
      />

      {showConnect ? (
        <Card className="mt-6 max-w-2xl p-6">
          <h2 className="text-sm font-semibold text-tk-onyx">Connect Smartsheet</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-tk-slate">
            <li className={tokenPresent ? "line-through opacity-50" : ""}>
              Smartsheet → Personal Settings → <b>API Access</b> → generate a token. Add it as{" "}
              <code className="rounded bg-well px-1.5 py-0.5 text-xs">
                SMARTSHEET_ACCESS_TOKEN
              </code>{" "}
              in <code className="rounded bg-well px-1.5 py-0.5 text-xs">crm/.env.local</code>{" "}
              and on Railway.
              {tokenPresent ? " ✓ done" : ""}
            </li>
            <li>
              Open the sheet → File → <b>Properties</b> → copy the Sheet ID and paste it below.
            </li>
          </ol>
          <form action={connectSheet} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-xs font-medium text-ink-3">Sheet ID</span>
              <input
                name="sheetId"
                placeholder="4583173393803140"
                inputMode="numeric"
                className="mt-1 w-56 rounded-lg border border-line bg-well px-3 py-2 text-sm tabular-nums focus:border-tk-teal"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-ink-3">Tickets belong to</span>
              <select
                name="clientId"
                defaultValue={zemvelo?.id ?? ""}
                className="mt-1 rounded-lg border border-line bg-well px-3 py-2 text-sm focus:border-tk-teal"
              >
                <option value="">— no client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!tokenPresent}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-50"
            >
              Connect &amp; sync
            </button>
          </form>
          {!tokenPresent ? (
            <p className="mt-2 text-xs text-ink-3">
              The connect button unlocks once the token env var is set.
            </p>
          ) : null}
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">
            Smartsheet is one source, not the only one — sites and apps can post tickets
            straight to the ingest endpoint below.
          </p>
        </Card>
      ) : null}

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-3 hover:text-tk-teal">
          <span className="transition-transform group-open:rotate-90">›</span>
          Send tickets from a site or app
        </summary>
        <Card radius="xl" elevation="none" className="mt-2 max-w-3xl p-4">
          <p className="text-[13px] text-tk-slate">
            Any site or app you maintain can open a ticket — an error handler, a “report a
            problem” form, or a scheduled audit. Payloads arrive as labelled code blocks.
          </p>
          <pre className="tk-payload mt-3 overflow-x-auto rounded-lg bg-tk-onyx px-3.5 py-3 font-mono text-[11px] leading-relaxed text-[#CFD8D4]">
            <code>{curl}</code>
          </pre>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CopyAction label="Copy example" text={curl} />
            <span className="font-mono text-[11px] text-ink-3">
              secret: SUPPORT_INGEST_SECRET (falls back to INGEST_SECRET)
            </span>
          </div>
        </Card>
      </details>
    </>
  )
}
