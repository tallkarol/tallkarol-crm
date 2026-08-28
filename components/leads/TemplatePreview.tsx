"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"
import type { LeadListItem } from "@/lib/lead"
import {
  renderTemplate,
  type OutreachTemplate,
} from "@/lib/lead-templates"

export function TemplatePreviewModal({
  template,
  lead,
  sending,
  onClose,
  onSend,
}: {
  template: OutreachTemplate
  lead: LeadListItem
  sending?: boolean
  onClose: () => void
  onSend: () => void
}) {
  const rendered = renderTemplate(template, lead)
  const isSheet = template.kind === "onesheet"
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-tk-onyx/45"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-preview-title"
        className="relative flex max-h-[min(44rem,90dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-tk-slate/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-tk-slate/70">
              {isSheet ? "One-sheet preview" : "Email preview"}
            </p>
            <h2
              id="template-preview-title"
              className="mt-0.5 text-lg font-semibold tracking-tight text-tk-onyx"
            >
              {template.title}
            </h2>
            <p className="mt-1 text-sm text-tk-slate/70">
              Personalized for {lead.name}. Nothing has been sent.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-tk-onyx hover:bg-tk-linen"
            aria-label="Close preview"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-tk-linen/80 px-5 py-5">
          {isSheet ? (
            <article className="mx-auto max-w-lg rounded-sm bg-white px-8 py-10 shadow-sm ring-1 ring-tk-slate/10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tk-teal">
                Tall Karol
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-tk-onyx">
                {rendered.subject}
              </h3>
              <div className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-tk-slate">
                {rendered.body}
              </div>
            </article>
          ) : (
            <article className="rounded-xl bg-white shadow-sm ring-1 ring-tk-slate/10">
              <dl className="divide-y divide-tk-slate/10 border-b border-tk-slate/10 px-5 py-3 text-sm">
                <div className="flex gap-3 py-1.5">
                  <dt className="w-16 shrink-0 text-tk-slate/70">From</dt>
                  <dd className="text-tk-onyx">Karol at Tall Karol</dd>
                </div>
                <div className="flex gap-3 py-1.5">
                  <dt className="w-16 shrink-0 text-tk-slate/70">To</dt>
                  <dd className="break-all text-tk-onyx">{lead.email}</dd>
                </div>
                <div className="flex gap-3 py-1.5">
                  <dt className="w-16 shrink-0 text-tk-slate/70">Subject</dt>
                  <dd className="font-medium text-tk-onyx">{rendered.subject}</dd>
                </div>
              </dl>
              <div className="whitespace-pre-wrap px-5 py-5 text-[15px] leading-relaxed text-tk-slate">
                {rendered.body}
              </div>
            </article>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-tk-slate/10 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-tk-slate/20 px-4 py-2 text-sm font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
          >
            Back
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={onSend}
            className="rounded-full bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-50"
          >
            {sending ? "Sending…" : `Send to ${lead.email}`}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}

export function TemplateCard({
  template,
  lead,
  onPreview,
}: {
  template: OutreachTemplate
  lead: LeadListItem
  onPreview: () => void
}) {
  const rendered = renderTemplate(template, lead)
  const excerpt = rendered.body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1, 3)
    .join(" ")

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl border border-tk-slate/15 bg-white px-3 py-3"
      )}
    >
      <p className="text-sm font-semibold text-tk-onyx">{template.title}</p>
      <p className="mt-1 text-xs text-tk-slate/70">{template.blurb}</p>
      <p className="mt-3 text-xs font-medium text-tk-onyx">{rendered.subject}</p>
      <p className="mt-1 line-clamp-3 flex-1 text-xs leading-relaxed text-tk-slate/70">
        {excerpt}
      </p>
      <button
        type="button"
        onClick={onPreview}
        className="mt-3 self-start rounded-full border border-tk-slate/20 px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
      >
        Preview
      </button>
    </article>
  )
}
