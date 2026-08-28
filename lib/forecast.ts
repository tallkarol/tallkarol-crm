export type ForecastRetainer = {
  id: string
  name: string
  slug: string
  hoursPerMonth: number
  rateCents: number | null
  status: "active" | "paused" | "ended"
  startsOn: string | null
  endsOn: string | null
  client: { slug: string; name: string }
}

export type ForecastInvoice = {
  id: string
  number: string
  issuedOn: string
  amountCents: number
  hours: string | null
  retainerId: string | null
  projectId: string | null
  client: { slug: string; name: string }
}

export type ForecastProject = {
  id: string
  name: string
  slug: string
  client: { id?: string; slug: string; name: string }
}

export type ForecastEntry = {
  occurredOn: string
  hours: string
  invoiceId: string | null
  retainerId: string | null
  projectId: string | null
  client: { slug: string; name: string }
}

export type ForecastKind = "retainer" | "project" | "other"
export type ForecastSource = "invoiced" | "logged" | "expected"

export type ForecastLine = {
  id: string
  kind: ForecastKind
  source: ForecastSource
  slug: string
  name: string
  clientSlug: string
  retainerSlug?: string
  projectSlug?: string
  invoiceNumber?: string
  loggedHours: number
  expectedHours: number | null
  cents: number | null
}

export type ForecastMonth = {
  key: string
  heading: string
  month: string
  lines: ForecastLine[]
}

export const FORECAST_VIEWS = [
  { id: "earnings", label: "All earnings" },
  { id: "retainers", label: "Retainer hours" },
  { id: "projects", label: "Project hours" },
  { id: "timecard", label: "Timecard" },
] as const

export type ForecastView = (typeof FORECAST_VIEWS)[number]["id"]

const HEADINGS = ["This month", "Next month", "Following"] as const
const KIND_ORDER: ForecastKind[] = ["retainer", "project", "other"]

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Inclusive YYYY-MM window. Null start/end means open. */
export function retainerCoversMonth(
  retainer: Pick<ForecastRetainer, "status" | "startsOn" | "endsOn">,
  key: string
) {
  if (retainer.status !== "active") return false
  if (retainer.startsOn && retainer.startsOn.slice(0, 7) > key) return false
  if (retainer.endsOn && retainer.endsOn.slice(0, 7) < key) return false
  return true
}

export function formatRetainerWindow(
  startsOn: string | null,
  endsOn: string | null
) {
  if (!startsOn && !endsOn) return null
  const label = (iso: string) => {
    const [y, m] = iso.split("-").map(Number)
    if (!y || !m) return iso
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    })
  }
  if (startsOn && endsOn) return `${label(startsOn)} – ${label(endsOn)}`
  if (startsOn) return `from ${label(startsOn)}`
  return `through ${label(endsOn!)}`
}

function addHours(map: Map<string, number>, id: string, hours: number) {
  map.set(id, (map.get(id) ?? 0) + hours)
}

function inferRetainerRate(
  retainer: ForecastRetainer,
  invoices: ForecastInvoice[]
) {
  if (retainer.rateCents != null) return retainer.rateCents
  const billed = invoices
    .filter((i) => i.retainerId === retainer.id && i.amountCents > 0)
    .sort((a, b) => (a.issuedOn < b.issuedOn ? 1 : -1))
  for (const inv of billed) {
    const hours = inv.hours != null ? Number(inv.hours) : 0
    if (hours > 0) return Math.round(inv.amountCents / hours)
  }
  if (billed[0] && retainer.hoursPerMonth > 0) {
    return Math.round(billed[0].amountCents / retainer.hoursPerMonth)
  }
  return null
}

function sortLines(lines: ForecastLine[], order: string[]) {
  return [...lines].sort((a, b) => {
    const ai = order.indexOf(a.slug)
    const bi = order.indexOf(b.slug)
    const ao = ai === -1 ? 99 : ai
    const bo = bi === -1 ? 99 : bi
    if (ao !== bo) return ao - bo
    const ak = KIND_ORDER.indexOf(a.kind)
    const bk = KIND_ORDER.indexOf(b.kind)
    if (ak !== bk) return ak - bk
    return a.name.localeCompare(b.name)
  })
}

function linesForMonth(
  key: string,
  retainers: ForecastRetainer[],
  invoices: ForecastInvoice[],
  projects: ForecastProject[],
  entries: ForecastEntry[],
  rates: Map<string, number | null>,
  order: string[]
): ForecastLine[] {
  const loggedRetainer = new Map<string, number>()
  const loggedProject = new Map<string, number>()
  const unbilledProject = new Map<string, number>()
  const loggedOther = new Map<string, { hours: number; name: string; slug: string }>()

  for (const entry of entries) {
    if (!entry.occurredOn.startsWith(key)) continue
    const hours = Number(entry.hours)
    if (!Number.isFinite(hours) || hours <= 0) continue
    if (entry.retainerId) {
      addHours(loggedRetainer, entry.retainerId, hours)
    } else if (entry.projectId) {
      addHours(loggedProject, entry.projectId, hours)
      if (!entry.invoiceId) addHours(unbilledProject, entry.projectId, hours)
    } else {
      const current = loggedOther.get(entry.client.slug)
      loggedOther.set(entry.client.slug, {
        hours: (current?.hours ?? 0) + hours,
        name: entry.client.name,
        slug: entry.client.slug,
      })
    }
  }

  const lines: ForecastLine[] = []
  const invoicedRetainers = new Set<string>()
  const invoicedProjects = new Set<string>()

  for (const inv of invoices) {
    if (!inv.issuedOn.startsWith(key)) continue
    const retainer = retainers.find((r) => r.id === inv.retainerId)
    const project = projects.find((p) => p.id === inv.projectId)
    const kind: ForecastKind = retainer
      ? "retainer"
      : project
        ? "project"
        : "other"
    if (retainer) invoicedRetainers.add(retainer.id)
    if (project) invoicedProjects.add(project.id)
    const loggedHours = retainer
      ? (loggedRetainer.get(retainer.id) ?? 0)
      : project
        ? (loggedProject.get(project.id) ?? 0)
        : 0
    lines.push({
      id: `inv-${inv.id}`,
      kind,
      source: "invoiced",
      slug: inv.client.slug,
      name: retainer?.name ?? project?.name ?? inv.client.name,
      clientSlug: inv.client.slug,
      retainerSlug: retainer?.slug,
      projectSlug: project?.slug,
      invoiceNumber: inv.number,
      loggedHours,
      expectedHours: retainer?.hoursPerMonth ?? null,
      cents: inv.amountCents,
    })
  }

  for (const retainer of retainers) {
    if (!retainerCoversMonth(retainer, key)) continue
    if (invoicedRetainers.has(retainer.id)) continue
    const logged = loggedRetainer.get(retainer.id) ?? 0
    const rate = rates.get(retainer.id)
    const expected = retainer.hoursPerMonth
    lines.push({
      id: `ret-${retainer.id}-${key}`,
      kind: "retainer",
      source: logged > 0 ? "logged" : "expected",
      slug: retainer.client.slug,
      name: retainer.name,
      clientSlug: retainer.client.slug,
      retainerSlug: retainer.slug,
      loggedHours: logged,
      expectedHours: expected,
      cents: rate != null ? Math.round(expected * rate) : null,
    })
  }

  const rateByClient = new Map<string, number>()
  for (const retainer of retainers) {
    const rate = rates.get(retainer.id)
    if (rate == null) continue
    if (!rateByClient.has(retainer.client.slug)) {
      rateByClient.set(retainer.client.slug, rate)
    }
  }

  for (const project of projects) {
    const unbilled = unbilledProject.get(project.id) ?? 0
    if (unbilled <= 0 || invoicedProjects.has(project.id)) continue
    const rate = rateByClient.get(project.client.slug)
    lines.push({
      id: `proj-${project.id}-${key}`,
      kind: "project",
      source: "logged",
      slug: project.client.slug,
      name: project.name,
      clientSlug: project.client.slug,
      projectSlug: project.slug,
      loggedHours: unbilled,
      expectedHours: null,
      cents: rate != null ? Math.round(unbilled * rate) : null,
    })
  }

  for (const row of Array.from(loggedOther.values())) {
    if (row.hours <= 0) continue
    lines.push({
      id: `other-${row.slug}-${key}`,
      kind: "other",
      source: "logged",
      slug: row.slug,
      name: row.name,
      clientSlug: row.slug,
      loggedHours: row.hours,
      expectedHours: null,
      cents: null,
    })
  }

  return sortLines(lines, order)
}

export function buildForecast(
  input: {
    retainers: ForecastRetainer[]
    invoices: ForecastInvoice[]
    projects: ForecastProject[]
    entries: ForecastEntry[]
    order: string[]
  },
  now = new Date()
): { months: ForecastMonth[] } {
  const rates = new Map(
    input.retainers.map((r) => [r.id, inferRetainerRate(r, input.invoices)])
  )

  const months = HEADINGS.map((heading, offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const key = monthKey(d)
    return {
      key,
      heading,
      month: d.toLocaleDateString("en-US", { month: "long" }),
      lines: linesForMonth(
        key,
        input.retainers,
        input.invoices,
        input.projects,
        input.entries,
        rates,
        input.order
      ),
    }
  })

  return { months }
}

export function linesForView(lines: ForecastLine[], view: ForecastView) {
  switch (view) {
    case "earnings":
      return lines.filter((line) => line.cents != null && line.cents > 0)
    case "retainers":
      return lines.filter((line) => line.kind === "retainer")
    case "projects":
      return lines.filter((line) => line.kind === "project")
    case "timecard":
      return lines.filter((line) => line.loggedHours > 0)
  }
}

export function monthTotal(
  lines: ForecastLine[],
  view: ForecastView,
  future: boolean
) {
  const visible = linesForView(lines, view)
  if (view === "earnings") {
    return {
      cents: visible.reduce((sum, line) => sum + (line.cents ?? 0), 0),
    }
  }
  if (view === "retainers") {
    return {
      hours: visible.reduce(
        (sum, line) =>
          sum +
          (future ? (line.expectedHours ?? line.loggedHours) : line.loggedHours),
        0
      ),
    }
  }
  const hours = visible.reduce((sum, line) => sum + line.loggedHours, 0)
  if (view === "projects" && hours === 0) {
    return {
      cents: visible.reduce((sum, line) => sum + (line.cents ?? 0), 0),
    }
  }
  return { hours }
}
