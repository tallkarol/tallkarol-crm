export const VAULT_KINDS = ["login", "api", "ssh", "other"] as const
export type VaultKind = (typeof VAULT_KINDS)[number]

export const VAULT_KIND_LABEL: Record<VaultKind, string> = {
  login: "Login",
  api: "API key",
  ssh: "SSH",
  other: "Other",
}

export function isVaultKind(value: string): value is VaultKind {
  return (VAULT_KINDS as readonly string[]).includes(value)
}

export type VaultClient = {
  id: string
  name: string
  slug: string
}

export type VaultEntryView = {
  id: string
  title: string
  kind: VaultKind
  url: string
  username: string
  notes: string
  hasSecret: boolean
  client: VaultClient | null
  updatedAt: Date
}

export type VaultGroup = {
  key: string
  label: string
  slug: string | null
  entries: VaultEntryView[]
}

export function asVaultKind(value: string): VaultKind {
  return isVaultKind(value) ? value : "other"
}

export function filterVaultEntries(
  entries: VaultEntryView[],
  q: string,
  clientSlug: string
) {
  const needle = q.trim().toLowerCase()
  return entries.filter((entry) => {
    if (clientSlug === "workspace" && entry.client) return false
    if (clientSlug && clientSlug !== "workspace" && entry.client?.slug !== clientSlug) {
      return false
    }
    if (!needle) return true
    const hay = [
      entry.title,
      entry.username,
      entry.url,
      entry.notes,
      entry.client?.name ?? "",
      VAULT_KIND_LABEL[entry.kind],
    ]
      .join(" ")
      .toLowerCase()
    return hay.includes(needle)
  })
}

export function groupVaultEntries(entries: VaultEntryView[]): VaultGroup[] {
  const workspace = entries.filter((entry) => !entry.client)
  const byClient = new Map<string, VaultGroup>()
  for (const entry of entries) {
    if (!entry.client) continue
    const existing = byClient.get(entry.client.id)
    if (existing) {
      existing.entries.push(entry)
      continue
    }
    byClient.set(entry.client.id, {
      key: entry.client.id,
      label: entry.client.name,
      slug: entry.client.slug,
      entries: [entry],
    })
  }
  const groups = Array.from(byClient.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  )
  if (workspace.length > 0) {
    groups.unshift({
      key: "workspace",
      label: "Workspace",
      slug: null,
      entries: workspace,
    })
  }
  return groups
}
