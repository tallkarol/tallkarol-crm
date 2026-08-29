"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Calendar, FileText, Mail } from "lucide-react"
import { PageHeader } from "@/components/PageHeader"
import { cn } from "@/lib/cn"
import {
  QUALIFICATION_LABEL,
  SALES_STAGES,
  leadCounts,
  leadMatchesStage,
  type LeadListItem,
  type LeadStage,
  type LeadState,
  type Qualification,
} from "@/lib/lead"
import { SalesBoard } from "@/components/leads/SalesBoard"
import {
  TemplateCard,
  TemplatePreviewModal,
} from "@/components/leads/TemplatePreview"
import {
  EMAIL_TEMPLATES,
  ONESHEET_TEMPLATES,
  type OutreachTemplate,
} from "@/lib/lead-templates"

const COUNT_KEY: Record<string, keyof ReturnType<typeof leadCounts>> = {
  "needs-look": "needsLook",
  fit: "fit",
  meeting: "meeting",
  sent: "sent",
  closed: "closed",
}

const STAGES: { id: LeadStage; label: string; countKey: keyof ReturnType<typeof leadCounts> }[] = [
  { id: "all", label: "All", countKey: "total" },
  ...SALES_STAGES.map((s) => ({
    id: s.id as LeadStage,
    label: s.label,
    countKey: COUNT_KEY[s.id],
  })),
]

function isStage(value: string | null): value is LeadStage {
  return STAGES.some((s) => s.id === value)
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function LeadsDashboard({ leads: initial }: { leads: LeadListItem[] }) {
  const router = useRouter()
  const search = useSearchParams()
  const [leads, setLeads] = useState(initial)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setLeads(initial)
  }, [initial])

  const stageParam = search.get("stage")
  const stage: LeadStage = isStage(stageParam) ? stageParam : "all"
  const selectedId = search.get("lead")
  const selected =
    leads.find((l) => l.id === selectedId) ??
    (stage === "all" ? null : leads.find((l) => leadMatchesStage(l, stage))) ??
    null

  const counts = leadCounts(leads)
  const visible = useMemo(
    () => leads.filter((l) => leadMatchesStage(l, stage)),
    [leads, stage]
  )
  const upcoming = leads
    .filter((l) => l.lead.meetingAt && Date.parse(l.lead.meetingAt) >= Date.now())
    .sort(
      (a, b) => Date.parse(a.lead.meetingAt!) - Date.parse(b.lead.meetingAt!)
    )
    .slice(0, 4)

  function setQuery(next: { lead?: string | null; stage?: LeadStage }) {
    const params = new URLSearchParams(search.toString())
    if (next.stage) {
      if (next.stage === "all") params.delete("stage")
      else params.set("stage", next.stage)
    }
    if (next.lead !== undefined) {
      if (next.lead) params.set("lead", next.lead)
      else params.delete("lead")
    }
    const qs = params.toString()
    router.replace(qs ? `/leads?${qs}` : "/leads", { scroll: false })
  }

  function patchLocal(id: string, lead: LeadState, status?: LeadListItem["status"]) {
    setLeads((rows) =>
      rows.map((row) =>
        row.id === id
          ? { ...row, lead, status: status ?? row.status }
          : row
      )
    )
  }

  async function saveLead(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/inquiries/${id}/lead`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error("save failed")
    const data = (await res.json()) as { lead: LeadState }
    patchLocal(id, data.lead)
    startTransition(() => router.refresh())
  }

  return (
    <>
      <PageHeader title="Leads" />

      <SalesBoard leads={leads} onSelect={(id) => setQuery({ lead: id })} />

      {upcoming.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-tk-slate/70">
            Upcoming meetings
          </h2>
          <ul className="mt-3 flex flex-wrap gap-3">
            {upcoming.map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  onClick={() => setQuery({ lead: lead.id, stage: "meeting" })}
                  className="rounded-xl border border-tk-slate/15 px-3 py-2 text-left hover:border-tk-teal/40"
                >
                  <p className="text-sm font-medium text-tk-onyx">{lead.name}</p>
                  <p className="text-xs text-tk-slate/70">
                    {formatWhen(lead.lead.meetingAt!)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div
        className={cn("flex flex-wrap gap-2", upcoming.length > 0 ? "mt-4" : "mt-8")}
      >
        {STAGES.map((item) => {
          const active = stage === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setQuery({ stage: item.id })}
              className={
                active
                  ? "rounded-full bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen"
                  : "rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
              }
            >
              {item.label}
              <span className="ml-1.5 tabular-nums opacity-80">
                {counts[item.countKey]}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
          <div className="border-b border-tk-slate/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-tk-onyx">
              {visible.length} {visible.length === 1 ? "lead" : "leads"}
            </h2>
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-sm text-tk-slate/70">
              Nothing in this view.
            </p>
          ) : (
            <ul className="max-h-[40rem] divide-y divide-tk-slate/10 overflow-y-auto">
              {visible.map((lead) => {
                const active = selected?.id === lead.id
                return (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => setQuery({ lead: lead.id })}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors",
                        active ? "bg-tk-teal/10" : "hover:bg-tk-linen/60"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate font-medium text-tk-onyx">
                          {lead.name}
                          {lead.company ? (
                            <span className="font-normal text-tk-slate/70">
                              {" "}
                              · {lead.company}
                            </span>
                          ) : null}
                        </p>
                        <span className="shrink-0 rounded-full bg-tk-linen px-2 py-0.5 text-[11px] font-semibold text-tk-slate">
                          {QUALIFICATION_LABEL[lead.lead.qualification]}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-tk-slate/70">
                        {lead.email}
                        {lead.projectTypes.length
                          ? ` · ${lead.projectTypes.join(", ")}`
                          : lead.engagement
                            ? ` · ${lead.engagement}`
                            : ""}
                      </p>
                      <p className="mt-1 text-xs text-tk-slate/70">
                        {lead.attributionLabel ?? lead.source}
                        {lead.lead.meetingAt
                          ? ` · ${formatWhen(lead.lead.meetingAt)}`
                          : ""}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <LeadWorkspace
          lead={selected}
          busy={pending}
          onSave={saveLead}
          onSent={(id, lead, status) => patchLocal(id, lead, status)}
        />
      </div>
    </>
  )
}

function LeadWorkspace({
  lead,
  busy,
  onSave,
  onSent,
}: {
  lead: LeadListItem | null
  busy: boolean
  onSave: (id: string, body: Record<string, unknown>) => Promise<void>
  onSent: (
    id: string,
    lead: LeadState,
    status: LeadListItem["status"]
  ) => void
}) {
  const [preview, setPreview] = useState<OutreachTemplate | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!lead) {
    return (
      <section className="flex min-h-[28rem] flex-col items-center justify-center rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-tk-onyx">Pick a lead</p>
        <p className="mt-1 max-w-sm text-sm text-tk-slate/70">
          Form answers, qualification, a meeting, and the templates live in this
          pane.
        </p>
      </section>
    )
  }

  const current = lead

  async function qualify(qualification: Qualification) {
    setError(null)
    try {
      await onSave(current.id, { qualification })
    } catch {
      setError("Could not save qualification.")
    }
  }

  async function persistMeeting(meetingAt: string, meetingNotes: string) {
    setError(null)
    try {
      await onSave(current.id, {
        meetingAt: fromLocalInput(meetingAt),
        meetingNotes,
      })
    } catch {
      setError("Could not save the meeting.")
    }
  }

  async function persistNotes(notes: string) {
    try {
      await onSave(current.id, { notes })
    } catch {
      setError("Could not save notes.")
    }
  }

  async function sendPreview() {
    if (!preview) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/inquiries/${current.id}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: preview.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "send failed")
      onSent(current.id, data.lead, data.status)
      setPreview(null)
    } catch {
      setError("Could not send. Check Resend, then try again.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-tk-onyx">
              {lead.name}
            </h2>
            <p className="mt-1 text-sm text-tk-slate/70">
              {lead.email}
              {lead.company ? ` · ${lead.company}` : ""}
            </p>
            <p className="mt-1 text-xs text-tk-slate/70">
              {lead.source}
              {lead.attributionLabel ? ` · ${lead.attributionLabel}` : ""}
              {` · ${formatWhen(lead.createdAt)}`}
            </p>
          </div>
          <a
            href={`mailto:${encodeURIComponent(lead.email)}`}
            className="rounded-full bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
          >
            Open mail
          </a>
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-tk-slate/70">
            Qualify
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["fit", "maybe", "pass", "unreviewed"] as const).map((value) => {
              const active = lead.lead.qualification === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  onClick={() => qualify(value)}
                  className={
                    active
                      ? "rounded-full bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen"
                      : "rounded-full border border-tk-slate/20 px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal disabled:opacity-50"
                  }
                >
                  {QUALIFICATION_LABEL[value]}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {lead.formLines.length > 0 || lead.projectTypes.length > 0 ? (
        <section className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-tk-onyx">What they sent</h3>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {lead.projectTypes.length > 0 ? (
              <div>
                <dt className="text-xs text-tk-slate/70">Project types</dt>
                <dd className="text-sm text-tk-onyx">
                  {lead.projectTypes.join(", ")}
                </dd>
              </div>
            ) : null}
            {lead.formLines.map((line) => (
              <div key={`${line.label}-${line.value}`}>
                <dt className="text-xs text-tk-slate/70">{line.label}</dt>
                <dd className="text-sm text-tk-onyx">{line.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-tk-teal" aria-hidden />
          <h3 className="text-sm font-semibold text-tk-onyx">Meeting</h3>
        </div>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr]"
          onSubmit={(e) => {
            e.preventDefault()
            const form = e.currentTarget
            const meetingAt = (
              form.elements.namedItem("meetingAt") as HTMLInputElement
            ).value
            const meetingNotes = (
              form.elements.namedItem("meetingNotes") as HTMLInputElement
            ).value
            void persistMeeting(meetingAt, meetingNotes)
          }}
        >
          <label className="block text-sm">
            <span className="text-xs font-medium text-tk-slate/70">When</span>
            <input
              name="meetingAt"
              type="datetime-local"
              defaultValue={toLocalInput(lead.lead.meetingAt)}
              key={`${lead.id}-meeting-${lead.lead.meetingAt ?? "none"}`}
              className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-tk-slate/70">Notes</span>
            <input
              name="meetingNotes"
              defaultValue={lead.lead.meetingNotes}
              key={`${lead.id}-mnotes-${lead.lead.meetingNotes}`}
              placeholder="Zoom, their timezone…"
              className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full border border-tk-slate/20 px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal disabled:opacity-50"
            >
              Save meeting
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="text-sm font-semibold text-tk-onyx">Notes</span>
          <textarea
            key={`${lead.id}-notes-${lead.lead.notes}`}
            defaultValue={lead.lead.notes}
            rows={3}
            placeholder="Fit, politics, what you'd send next…"
            onBlur={(e) => {
              if (e.target.value !== lead.lead.notes) {
                void persistNotes(e.target.value)
              }
            }}
            className="mt-2 w-full rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-tk-teal" aria-hidden />
          <h3 className="text-sm font-semibold text-tk-onyx">Email templates</h3>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {EMAIL_TEMPLATES.map((template) => (
            <li key={template.id}>
              <TemplateCard
                template={template}
                lead={current}
                onPreview={() => setPreview(template)}
              />
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-2">
          <FileText className="size-4 text-tk-teal" aria-hidden />
          <h3 className="text-sm font-semibold text-tk-onyx">One-sheets</h3>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {ONESHEET_TEMPLATES.map((template) => (
            <li key={template.id}>
              <TemplateCard
                template={template}
                lead={current}
                onPreview={() => setPreview(template)}
              />
            </li>
          ))}
        </ul>

        {preview ? (
          <TemplatePreviewModal
            template={preview}
            lead={current}
            sending={sending}
            onClose={() => setPreview(null)}
            onSend={() => void sendPreview()}
          />
        ) : null}

        {lead.lead.sends.length > 0 ? (
          <ul className="mt-4 space-y-1 text-xs text-tk-slate/70">
            {lead.lead.sends.map((send, i) => (
              <li key={`${send.at}-${i}`}>
                Sent {send.templateTitle} · {formatWhen(send.at)}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {error ? <p className="text-sm text-tk-teal">{error}</p> : null}
    </div>
  )
}

