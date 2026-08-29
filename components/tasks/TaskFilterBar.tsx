"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Columns3, Rows3, CalendarDays, Search, X } from "lucide-react"
import {
  Dropdown,
  MenuHead,
  MenuLabel,
  MenuOption,
  MenuRule,
} from "@/components/ui/Dropdown"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { saveView } from "@/lib/task-actions"
import { GROUPS, SORTS, STATES, type TaskCriteria, type ViewRow } from "@/lib/task-view"

export type BarState = {
  view: string
  q: string
  clients: string[]
  projects: string[]
  state: string
  group: string
  sort: string
  layout: string
}

export type BarOption = { id: string; label: string; count: number; swatch?: string }

/**
 * One row of controls. The lens names the question the list is answering; each
 * filter states what it is doing while closed; and the second line only exists
 * when something is actually applied.
 *
 * Every control writes to the URL, so a view is a link.
 */
export function TaskFilterBar({
  views,
  current,
  bar,
  clients,
  projects,
  total,
  shown,
  dirty,
}: {
  views: ViewRow[]
  current: ViewRow | null
  bar: BarState
  clients: BarOption[]
  projects: BarOption[]
  total: number
  shown: number
  /** The bar differs from the saved view — offer to overwrite it. */
  dirty: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState(bar.q)
  const [saving, setSaving] = useState(false)

  useEffect(() => setQ(bar.q), [bar.q])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const el = document.activeElement
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement | null)?.isContentEditable
      if (event.key === "/" && !typing) {
        event.preventDefault()
        document.getElementById("task-search")?.focus()
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  function push(next: Partial<BarState>) {
    const merged = { ...bar, ...next }
    const params = new URLSearchParams()
    if (merged.view) params.set("view", merged.view)
    if (merged.q) params.set("q", merged.q)
    if (merged.clients.length) params.set("client", merged.clients.join(","))
    if (merged.projects.length) params.set("project", merged.projects.join(","))
    if (merged.state) params.set("state", merged.state)
    if (merged.group) params.set("group", merged.group)
    if (merged.sort) params.set("sort", merged.sort)
    if (merged.layout) params.set("layout", merged.layout)
    const query = params.toString()
    router.push(query ? `/tasks?${query}` : "/tasks")
  }

  function toggle(key: "clients" | "projects", value: string) {
    const list = bar[key]
    push({
      [key]: list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    } as Partial<BarState>)
  }

  const clientLabel = bar.clients.length
    ? `${clients.find((c) => c.id === bar.clients[0])?.label ?? bar.clients[0]}${
        bar.clients.length > 1 ? ` +${bar.clients.length - 1}` : ""
      }`
    : "Clients"

  const projectLabel = bar.projects.length
    ? `${projects.find((p) => p.id === bar.projects[0])?.label ?? "Project"}${
        bar.projects.length > 1 ? ` +${bar.projects.length - 1}` : ""
      }`
    : "Project"

  const stateLabel = STATES.find((s) => s.id === (bar.state || "all"))?.label ?? "Any state"

  const pills: { key: string; label: string; swatch?: string; clear: () => void }[] = []
  if (current && current.slug !== "all") {
    pills.push({
      key: "view",
      label: current.name,
      clear: () => push({ view: "all" }),
    })
  }
  for (const slug of bar.clients) {
    pills.push({
      key: `c-${slug}`,
      label: clients.find((c) => c.id === slug)?.label ?? slug,
      swatch: clientColor(slug),
      clear: () => toggle("clients", slug),
    })
  }
  for (const id of bar.projects) {
    pills.push({
      key: `p-${id}`,
      label: projects.find((p) => p.id === id)?.label ?? "Project",
      clear: () => toggle("projects", id),
    })
  }
  if (bar.state && bar.state !== "all") {
    pills.push({
      key: "state",
      label: stateLabel,
      clear: () => push({ state: "" }),
    })
  }
  if (bar.q) {
    pills.push({ key: "q", label: `“${bar.q}”`, clear: () => push({ q: "" }) })
  }

  async function overwrite() {
    if (!current) return
    setSaving(true)
    const criteria: TaskCriteria = {
      ...current.criteria,
      clients: bar.clients.length ? bar.clients : undefined,
      projects: bar.projects.length ? bar.projects : undefined,
      state: bar.state || current.criteria.state,
    }
    await saveView({
      id: current.id,
      name: current.name,
      criteria,
      layout: bar.layout,
      grouping: bar.group,
      sortBy: bar.sort,
    })
    setSaving(false)
    router.refresh()
  }

  async function saveAsNew() {
    const name = window.prompt("Name this view")
    if (!name?.trim()) return
    setSaving(true)
    const result = await saveView({
      name,
      criteria: {
        clients: bar.clients.length ? bar.clients : undefined,
        projects: bar.projects.length ? bar.projects : undefined,
        state: bar.state || "open",
      },
      layout: bar.layout,
      grouping: bar.group,
      sortBy: bar.sort,
    })
    setSaving(false)
    if (result.ok) push({ view: result.data.slug })
  }

  // No overflow-hidden on the shell: the dropdowns are absolutely positioned
  // and have to escape it. The pill strip rounds its own bottom corners, and
  // z-20 lifts the open menus above the composer and rows below.
  return (
    <div className="relative z-20 mt-5 rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2">
        <Dropdown
          label={current?.name ?? "All tasks"}
          icon={<span className="text-tk-teal">◈</span>}
          align="left"
        >
          {(close) => (
            <>
              <MenuHead>Saved views</MenuHead>
              {views.map((view) => (
                <MenuOption
                  key={view.slug}
                  checked={bar.view === view.slug}
                  label={view.name}
                  onSelect={() => {
                    close()
                    // A lens resets the ad-hoc filters; its own criteria take over.
                    router.push(`/tasks?view=${encodeURIComponent(view.slug)}`)
                  }}
                />
              ))}
              <MenuRule />
              <button
                type="button"
                onClick={() => {
                  close()
                  void saveAsNew()
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-tk-teal hover:bg-tk-linen"
              >
                Save this view…
              </button>
            </>
          )}
        </Dropdown>

        <label className="flex min-w-[160px] flex-1 items-center gap-2 rounded-lg border border-tk-slate/15 bg-tk-linen/60 px-2.5 py-1.5">
          <Search aria-hidden className="size-3.5 shrink-0 text-tk-slate/40" />
          <input
            id="task-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") push({ q })
              if (e.key === "Escape") {
                setQ("")
                push({ q: "" })
              }
            }}
            onBlur={() => {
              if (q !== bar.q) push({ q })
            }}
            placeholder="Search tasks, notes, client…"
            aria-label="Search tasks"
            className="min-w-0 flex-1 bg-transparent text-xs text-tk-onyx outline-none placeholder:text-tk-slate/40"
          />
          <kbd className="shrink-0 rounded border border-tk-slate/20 px-1 font-mono text-[10px] text-tk-slate/40">
            /
          </kbd>
        </label>

        <Dropdown label={clientLabel} on={bar.clients.length > 0} count={bar.clients.length}>
          {() => (
            <>
              <MenuHead onClear={bar.clients.length ? () => push({ clients: [] }) : undefined}>
                Clients
              </MenuHead>
              {clients.map((c) => (
                <MenuOption
                  key={c.id}
                  kind="check"
                  checked={bar.clients.includes(c.id)}
                  swatch={clientColor(c.id)}
                  label={c.label}
                  count={c.count}
                  onSelect={() => toggle("clients", c.id)}
                />
              ))}
            </>
          )}
        </Dropdown>

        <Dropdown
          label={projectLabel}
          on={bar.projects.length > 0}
          count={bar.projects.length}
        >
          {() => (
            <>
              <MenuHead
                onClear={bar.projects.length ? () => push({ projects: [] }) : undefined}
              >
                Project
              </MenuHead>
              {projects.length === 0 ? (
                <p className="px-2 py-2 text-xs text-tk-slate/50">
                  No projects have tasks yet.
                </p>
              ) : (
                projects.map((p) => (
                  <MenuOption
                    key={p.id}
                    kind="check"
                    checked={bar.projects.includes(p.id)}
                    label={p.label}
                    count={p.count}
                    onSelect={() => toggle("projects", p.id)}
                  />
                ))
              )}
            </>
          )}
        </Dropdown>

        <Dropdown label={stateLabel} on={Boolean(bar.state) && bar.state !== "all"}>
          {(close) => (
            <>
              <MenuHead>State</MenuHead>
              {STATES.map((s) => (
                <MenuOption
                  key={s.id}
                  checked={(bar.state || "all") === s.id}
                  label={s.label}
                  onSelect={() => {
                    close()
                    push({ state: s.id === "all" ? "" : s.id })
                  }}
                />
              ))}
            </>
          )}
        </Dropdown>

        <span aria-hidden className="mx-0.5 h-5 w-px bg-tk-slate/15" />

        <Dropdown label="⋯" align="right" title="Group, sort">
          {() => (
            <>
              <MenuLabel>Group</MenuLabel>
              {GROUPS.map((g) => (
                <MenuOption
                  key={g.id}
                  checked={(bar.group || "none") === g.id}
                  label={g.label}
                  onSelect={() => push({ group: g.id === "none" ? "" : g.id })}
                />
              ))}
              <MenuRule />
              <MenuLabel>Sort</MenuLabel>
              {SORTS.map((s) => (
                <MenuOption
                  key={s.id}
                  checked={(bar.sort || "due") === s.id}
                  label={s.label}
                  onSelect={() => push({ sort: s.id })}
                />
              ))}
            </>
          )}
        </Dropdown>

        <div
          role="group"
          aria-label="Layout"
          className="ml-auto flex rounded-lg border border-tk-slate/15 bg-tk-linen/60 p-0.5"
        >
          {(
            [
              { id: "list", label: "List", Icon: Rows3 },
              { id: "board", label: "Board", Icon: Columns3 },
              { id: "week", label: "Week", Icon: CalendarDays },
            ] as const
          ).map(({ id, label, Icon }) => {
            const on = (bar.layout || "list") === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => push({ layout: id })}
                aria-pressed={on}
                title={label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11.5px] font-semibold transition-colors",
                  on
                    ? "bg-white text-tk-onyx shadow-sm"
                    : "text-tk-slate/60 hover:text-tk-onyx"
                )}
              >
                <Icon className="size-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {pills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-b-[15px] border-t border-tk-slate/10 bg-tk-linen/40 px-3 py-1.5">
          {pills.map((pill) => (
            <span
              key={pill.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-tk-slate/20 bg-white py-0.5 pl-2.5 pr-1 text-[11.5px] text-tk-slate"
            >
              {pill.swatch ? (
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: pill.swatch }}
                />
              ) : null}
              <b className="font-semibold">{pill.label}</b>
              <button
                type="button"
                onClick={pill.clear}
                aria-label={`Remove ${pill.label} filter`}
                className="rounded p-0.5 text-tk-slate/40 hover:bg-tk-linen hover:text-red-700"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={() => router.push("/tasks?view=all")}
            className="text-[11.5px] font-semibold text-tk-teal hover:underline"
          >
            Clear all
          </button>

          {dirty && current ? (
            <button
              type="button"
              disabled={saving}
              onClick={overwrite}
              className="text-[11.5px] font-semibold text-tk-teal hover:underline disabled:opacity-50"
            >
              {saving ? "Saving…" : `Save to “${current.name}”`}
            </button>
          ) : null}

          <span className="ml-auto font-mono text-[11px] tabular-nums text-tk-slate/55">
            {shown} of {total} tasks
          </span>
        </div>
      ) : null}
    </div>
  )
}
