"use client"

import { useState, useTransition } from "react"
import { Check, Copy, Plus } from "lucide-react"
import { createDeviceToken, killDeviceToken, saveWorkspaceTimezone } from "@/lib/punch-actions"

export type DeviceRow = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

/**
 * Issue one token per device. The plaintext is shown once and never again —
 * losing it costs a new token, not a password reset.
 */
export function DeviceTokenManager({
  devices,
  appUrl,
  timezone,
}: {
  devices: DeviceRow[]
  appUrl: string
  timezone: string
}) {
  const [name, setName] = useState("")
  const [issued, setIssued] = useState<{ name: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zone, setZone] = useState(timezone)
  const [zoneSaved, setZoneSaved] = useState(false)
  const [busy, startTransition] = useTransition()

  const live = devices.filter((row) => !row.revokedAt)
  const revoked = devices.filter((row) => row.revokedAt)

  function issue() {
    setError(null)
    startTransition(async () => {
      const result = await createDeviceToken(name)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setIssued({ name: result.data.name, token: result.data.token })
      setCopied(false)
      setName("")
    })
  }

  function revoke(id: string, label: string) {
    if (!window.confirm(`Revoke "${label}"? Anything using it stops working.`)) return
    setError(null)
    startTransition(async () => {
      const result = await killDeviceToken(id)
      if (!result.ok) setError(result.error)
    })
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setError("Could not reach the clipboard — select the token and copy it.")
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">Add a device</h2>
        <p className="mt-1 text-sm text-tk-slate/70">
          Name it after the thing holding it, so revoking the right one later is
          obvious.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") issue()
            }}
            placeholder="Karol's Apple Watch"
            aria-label="Device name"
            className="w-64 rounded-lg border border-tk-slate/20 bg-white px-3 py-1.5 text-sm text-tk-onyx outline-none placeholder:text-tk-slate/35 focus:border-tk-teal"
          />
          <button
            type="button"
            onClick={issue}
            disabled={busy || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-tk-teal px-3.5 py-1.5 text-xs font-semibold text-tk-linen disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            {busy ? "Issuing…" : "Issue token"}
          </button>
        </div>

        {issued ? (
          <div className="mt-4 rounded-xl border border-tk-teal/30 bg-tk-teal/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-tk-teal">
              {issued.name} — copy this now
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-tk-onyx">
                {issued.token}
              </code>
              <button
                type="button"
                onClick={() => copy(issued.token)}
                className="inline-flex items-center gap-1.5 rounded-full border border-tk-teal/40 px-3 py-1.5 text-xs font-semibold text-tk-teal"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-tk-slate/70">
              This is the only time it is shown. It is stored hashed — nobody,
              including this page, can read it back.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm font-semibold text-red-700" role="status">
            {error}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
        <h2 className="border-b border-tk-slate/10 px-5 py-3 text-sm font-semibold text-tk-onyx">
          Devices
        </h2>
        {live.length === 0 && revoked.length === 0 ? (
          <p className="px-5 py-6 text-sm text-tk-slate/60">
            No devices yet. Issue one above, then point a watch app, a phone
            shortcut, or a curl command at the clock API.
          </p>
        ) : (
          <ul>
            {[...live, ...revoked].map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-tk-slate/10 px-5 py-3 text-sm last:border-0"
              >
                <span
                  className={
                    row.revokedAt
                      ? "font-medium text-tk-slate/45 line-through"
                      : "font-medium text-tk-onyx"
                  }
                >
                  {row.name}
                </span>
                <span className="text-xs text-tk-slate/60">
                  {row.revokedAt
                    ? `revoked ${stamp(row.revokedAt)}`
                    : row.lastUsedAt
                      ? `last used ${stamp(row.lastUsedAt)}`
                      : "never used"}
                </span>
                {!row.revokedAt ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => revoke(row.id, row.name)}
                    className="ml-auto rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate/70 hover:border-red-400 hover:text-red-700 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">Workspace timezone</h2>
        <p className="mt-1 text-sm text-tk-slate/70">
          Punches are stored as real timestamps. This is the zone they turn into
          a day and a wall-clock time on the sheet.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={zone}
            onChange={(event) => {
              setZone(event.target.value)
              setZoneSaved(false)
            }}
            aria-label="Timezone"
            placeholder="America/New_York"
            className="w-56 rounded-lg border border-tk-slate/20 bg-white px-3 py-1.5 text-sm text-tk-onyx outline-none focus:border-tk-teal"
          />
          <button
            type="button"
            disabled={busy || !zone.trim()}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const result = await saveWorkspaceTimezone(zone)
                if (result.ok) setZoneSaved(true)
                else setError(result.error)
              })
            }}
            className="rounded-full border border-tk-slate/20 px-3.5 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal disabled:opacity-50"
          >
            {zoneSaved ? "Saved" : "Save"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-tk-onyx">Clock API</h2>
        <p className="mt-1 text-sm text-tk-slate/70">
          Every route takes{" "}
          <code className="rounded bg-tk-linen px-1.5 py-0.5 font-mono text-xs">
            Authorization: Bearer &lt;token&gt;
          </code>
          .
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-tk-onyx px-4 py-3 font-mono text-xs leading-relaxed text-tk-linen">
{`GET  ${appUrl}/api/time/status
GET  ${appUrl}/api/time/projects
POST ${appUrl}/api/time/clock-in    { projectId | clientId, note?, at?, switch? }
POST ${appUrl}/api/time/clock-out   { note?, at? }
POST ${appUrl}/api/time/punches/:id/approve`}
        </pre>
        <p className="mt-3 text-xs text-tk-slate/60">
          Send a <code className="font-mono">clientRequestId</code> with a
          clock-in and a retry over a bad connection is a no-op instead of a
          duplicate. Send <code className="font-mono">at</code> as an ISO
          timestamp (within 24 hours) to sync a punch that happened offline.
        </p>
      </section>
    </div>
  )
}

function stamp(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
