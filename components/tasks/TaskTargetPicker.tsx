"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { updateTask } from "@/lib/task-actions"

export type PickerClient = { id: string; name: string; slug: string }
export type PickerProject = { id: string; name: string; clientId: string }
export type PickerProduct = { id: string; name: string; clientId: string | null }
export type PickerDeliverable = {
  id: string
  label: string
  title: string
  projectId: string
}

/**
 * Where a task belongs. This is the whole reason the peek existed and didn't
 * work: the schema has had these columns since the beginning and there was no
 * way to set any of them.
 *
 * Picking a project fills in its client, exactly like a punch.
 */
export function TaskTargetPicker({
  taskId,
  clientId,
  projectId,
  productId,
  deliverableId,
  clients,
  projects,
  products,
  deliverables,
}: {
  taskId: string
  clientId: string | null
  projectId: string | null
  productId: string | null
  deliverableId: string | null
  clients: PickerClient[]
  projects: PickerProject[]
  products: PickerProduct[]
  deliverables: PickerDeliverable[]
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function apply(patch: Parameters<typeof updateTask>[1]) {
    setError(null)
    startTransition(async () => {
      const result = await updateTask(taskId, patch)
      if (!result.ok) setError(result.error)
      router.refresh()
    })
  }

  const clientProjects = projects.filter(
    (p) => !clientId || p.clientId === clientId
  )
  const listedProducts = products
  const projectDeliverables = deliverables.filter(
    (d) => d.projectId === projectId
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          value={clientId ?? ""}
          disabled={busy}
          onChange={(value) =>
            // Changing client drops a project that belonged to the old one.
            apply({
              clientId: value || null,
              projectId: null,
              productId: null,
              deliverableId: null,
            })
          }
          swatch={clientId ? clientColor(clients.find((c) => c.id === clientId)?.slug ?? "") : undefined}
          empty="No client"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
        />

        <Select
          value={projectId ?? ""}
          disabled={busy || clientProjects.length === 0}
          onChange={(value) =>
            apply({
              projectId: value || null,
              productId: null,
              deliverableId: null,
            })
          }
          empty={clientProjects.length === 0 ? "No projects" : "No project"}
          options={clientProjects.map((p) => ({ value: p.id, label: p.name }))}
        />

        {listedProducts.length > 0 ? (
          <Select
            value={productId ?? ""}
            disabled={busy}
            onChange={(value) =>
              apply({
                productId: value || null,
                projectId: null,
                deliverableId: null,
              })
            }
            empty="No product"
            options={listedProducts.map((p) => ({ value: p.id, label: p.name }))}
          />
        ) : null}

        {projectId ? (
          <Select
            value={deliverableId ?? ""}
            disabled={busy || projectDeliverables.length === 0}
            onChange={(value) => apply({ deliverableId: value || null })}
            empty={
              projectDeliverables.length === 0 ? "No deliverables" : "No deliverable"
            }
            options={projectDeliverables.map((d) => ({
              value: d.id,
              label: d.title ? `${d.label} · ${d.title}` : d.label,
            }))}
          />
        ) : null}
      </div>

      {error ? (
        <p className="text-xs font-semibold text-red-700" role="status">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function Select({
  value,
  options,
  empty,
  swatch,
  disabled,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  empty: string
  swatch?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: swatch }}
        />
      ) : null}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={empty}
        className={cn(
          "rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:border-tk-teal disabled:opacity-50",
          value
            ? "border-line bg-well text-tk-slate"
            : "border-dashed border-line-strong bg-card text-ink-3"
        )}
      >
        <option value="">{empty}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  )
}
