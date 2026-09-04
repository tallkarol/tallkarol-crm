import { Card as TkCard } from "@/components/ui/Card"
/**
 * Renders a `spec` document (schemaVersion 1) from the daedalus-hive-mind
 * spec-sheet tool. Defensive by design: every field is optional, unknown
 * fields are ignored, nothing here invents a value the tool did not read.
 */

type Dep = { name: string; declared?: string; resolved?: string | null }
type StackItem = { name: string; package?: string; declared?: string; resolved?: string | null; category?: string }
type Theme = { dir: string; name?: string; version?: string; template?: string; requiresPhp?: string; requiresWp?: string }
type Plugin = { dir: string; name?: string; version?: string }
type Component = {
  slug: string
  path: string
  type: string
  name?: string
  version?: string
  summary?: string
  runtime?: Record<string, string | null | undefined>
  packageManager?: { name?: string; lockfile?: string; declared?: string }
  stack?: StackItem[]
  dependencies?: { count?: number; dev?: number; prod?: Dep[]; devList?: Dep[] }
  scripts?: Record<string, string>
  configFiles?: string[]
  deploy?: { kind: string; file: string; detail?: Record<string, unknown> }[]
  ci?: { file: string; name?: string }[]
  env?: { files?: string[]; names?: string[]; integrations?: { name: string; vars: string[] }[] }
  database?: { orm?: string; engine?: string; migrations?: string; sources?: string[] }
  wordpress?: {
    version?: string
    multisite?: boolean
    subdomainInstall?: boolean
    environmentType?: string
    hosting?: string
    themes?: Theme[]
    plugins?: Plugin[]
    muPlugins?: string[]
  }
  shopify?: { themeName?: string; themeVersion?: string; themeAuthor?: string; sections?: number; snippets?: number; templates?: number }
  docker?: { from?: string[]; services?: string[] }
  sources?: string[]
}
type Spec = {
  summary?: string
  root?: { path?: string; name?: string }
  git?: { remote?: string; branch?: string; commit?: string; commitDate?: string; dirty?: boolean; commits?: number } | null
  components?: Component[]
  languages?: { language: string; ext?: string; files: number }[]
  filesScanned?: number
  docs?: string[]
  notes?: string[]
}

const TYPE_LABEL: Record<string, string> = {
  node: "Node app",
  wordpress: "WordPress",
  "shopify-theme": "Shopify theme",
  composer: "PHP (Composer)",
  python: "Python",
  docker: "Docker",
  static: "Static site",
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <TkCard>
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="text-[13px] font-bold text-tk-onyx">{title}</h2>
        {right}
      </div>
      <div className="px-5 pb-4">{children}</div>
    </TkCard>
  )
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "")
  if (!shown.length) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words text-tk-onyx">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px]">{children}</span>
}

function DepTable({ deps }: { deps: Dep[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-[10.5px] uppercase tracking-wide text-ink-3">
          <th className="py-1 font-semibold">package</th>
          <th className="py-1 font-semibold">declared</th>
          <th className="py-1 font-semibold">installed</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {deps.map((d) => (
          <tr key={d.name}>
            <td className="py-1 pr-3 font-mono text-tk-onyx">{d.name}</td>
            <td className="py-1 pr-3 font-mono text-ink-3">{d.declared ?? "—"}</td>
            <td className="py-1 font-mono text-ink-3">{d.resolved ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ComponentCard({ c }: { c: Component }) {
  const wp = c.wordpress
  const sh = c.shopify
  return (
    <Card
      title={`${c.name || c.slug}${c.version ? ` ${c.version}` : ""}`}
      right={
        <span className="rounded-full bg-well px-2 py-0.5 text-[10.5px] font-semibold text-ink-3">
          {TYPE_LABEL[c.type] ?? c.type} · <Mono>{c.path}</Mono>
        </span>
      }
    >
      {c.summary ? <p className="mb-3 text-sm text-tk-onyx">{c.summary}</p> : null}

      {c.stack?.length ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {c.stack.map((s) => (
            <span key={s.package ?? s.name} className="rounded-md border border-line px-2 py-0.5 text-[11px] text-tk-onyx" title={s.category}>
              {s.name}
              {s.resolved || s.declared ? <span className="text-ink-3"> {s.resolved ?? s.declared}</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      <Facts
        rows={[
          ["runtime", c.runtime ? Object.entries(c.runtime).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(" · ") : null],
          ["package manager", c.packageManager ? [c.packageManager.declared ?? c.packageManager.name, c.packageManager.lockfile].filter(Boolean).join(" · ") : null],
          ["database", c.database ? [c.database.orm, c.database.engine, c.database.migrations].filter(Boolean).join(" · ") : null],
          ["deploy", c.deploy?.length ? c.deploy.map((d) => `${d.kind} (${d.file})`).join(" · ") : null],
          ["ci", c.ci?.length ? c.ci.map((w) => w.name || w.file).join(" · ") : null],
          ["config", c.configFiles?.length ? <Mono>{c.configFiles.join("  ")}</Mono> : null],
          ["docker", c.docker ? [c.docker.from?.length ? `FROM ${c.docker.from.join(", ")}` : null, c.docker.services?.length ? `services: ${c.docker.services.join(", ")}` : null].filter(Boolean).join(" · ") : null],
        ]}
      />

      {wp ? (
        <div className="mt-3 space-y-2">
          <Facts
            rows={[
              ["WordPress", [wp.version, wp.multisite ? (wp.subdomainInstall ? "multisite (subdomains)" : "multisite (subdirectories)") : null, wp.environmentType ? `env ${wp.environmentType}` : null, wp.hosting].filter(Boolean).join(" · ")],
              ["mu-plugins", wp.muPlugins?.length ? <Mono>{wp.muPlugins.join("  ")}</Mono> : null],
            ]}
          />
          {wp.themes?.length ? (
            <details className="text-xs" open={wp.themes.length <= 6}>
              <summary className="transition-colors duration-[120ms] hover:text-accent-ink cursor-pointer font-semibold text-tk-onyx">{wp.themes.length} themes</summary>
              <ul className="mt-1 divide-y divide-line">
                {wp.themes.map((t) => (
                  <li key={t.dir} className="flex flex-wrap items-baseline gap-x-3 py-1">
                    <span className="text-tk-onyx">{t.name || t.dir}</span>
                    <span className="font-mono text-ink-3">{t.version}</span>
                    {t.template ? <span className="text-ink-3">child of {t.template}</span> : null}
                    {t.requiresPhp ? <span className="text-ink-3">PHP ≥{t.requiresPhp}</span> : null}
                    <span className="ml-auto font-mono text-[10.5px] text-ink-3">{t.dir}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {wp.plugins?.length ? (
            <details className="text-xs">
              <summary className="transition-colors duration-[120ms] hover:text-accent-ink cursor-pointer font-semibold text-tk-onyx">{wp.plugins.length} plugins</summary>
              <ul className="mt-1 divide-y divide-line">
                {wp.plugins.map((p) => (
                  <li key={p.dir} className="flex items-baseline gap-x-3 py-1">
                    <span className="text-tk-onyx">{p.name || p.dir}</span>
                    <span className="font-mono text-ink-3">{p.version}</span>
                    <span className="ml-auto font-mono text-[10.5px] text-ink-3">{p.dir}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {sh ? (
        <div className="mt-3">
          <Facts
            rows={[
              ["theme", [sh.themeName, sh.themeVersion, sh.themeAuthor ? `by ${sh.themeAuthor}` : null].filter(Boolean).join(" · ")],
              ["liquid", [sh.sections != null ? `${sh.sections} sections` : null, sh.snippets != null ? `${sh.snippets} snippets` : null, sh.templates != null ? `${sh.templates} templates` : null].filter(Boolean).join(" · ")],
            ]}
          />
        </div>
      ) : null}

      {c.dependencies?.prod?.length ? (
        <details className="mt-3 text-xs" open={c.dependencies.prod.length <= 12}>
          <summary className="transition-colors duration-[120ms] hover:text-accent-ink cursor-pointer font-semibold text-tk-onyx">
            {c.dependencies.prod.length} dependencies{c.dependencies.dev ? ` · ${c.dependencies.dev} dev` : ""}
          </summary>
          <div className="mt-1 overflow-x-auto">
            <DepTable deps={c.dependencies.prod} />
          </div>
          {c.dependencies.devList?.length ? (
            <details className="mt-2">
              <summary className="transition-colors duration-[120ms] hover:text-accent-ink cursor-pointer text-ink-3">dev dependencies</summary>
              <div className="mt-1 overflow-x-auto">
                <DepTable deps={c.dependencies.devList} />
              </div>
            </details>
          ) : null}
        </details>
      ) : null}

      {c.scripts && Object.keys(c.scripts).length ? (
        <details className="mt-3 text-xs">
          <summary className="transition-colors duration-[120ms] hover:text-accent-ink cursor-pointer font-semibold text-tk-onyx">{Object.keys(c.scripts).length} scripts</summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {Object.entries(c.scripts).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-tk-onyx">{k}</dt>
                <dd className="min-w-0 truncate font-mono text-ink-3" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}

      {c.env?.names?.length ? (
        <details className="mt-3 text-xs">
          <summary className="transition-colors duration-[120ms] hover:text-accent-ink cursor-pointer font-semibold text-tk-onyx">
            {c.env.names.length} environment variables{c.env.integrations?.length ? ` · ${c.env.integrations.map((i) => i.name).join(", ")}` : ""}
          </summary>
          <p className="mt-1 font-mono text-[11px] leading-5 text-ink-3">{c.env.names.join("  ")}</p>
          <p className="mt-1 text-[10.5px] text-ink-3">names only, from {c.env.files?.join(", ")} — values are never read</p>
        </details>
      ) : null}

      {c.sources?.length ? (
        <p className="mt-3 text-[10.5px] text-ink-3">read from <Mono>{c.sources.join("  ")}</Mono></p>
      ) : null}
    </Card>
  )
}

export function SpecSheet({ data }: { data: Record<string, unknown> }) {
  const spec = data as Spec
  return (
    <div className="flex flex-col gap-4">
      <Card title="Overview">
        {spec.summary ? <p className="mb-2 text-sm text-tk-onyx">{spec.summary}</p> : null}
        <Facts
          rows={[
            ["repository", spec.git?.remote ? <Mono>{spec.git.remote}</Mono> : "no git remote"],
            ["branch", spec.git ? [spec.git.branch, spec.git.commit ? `@ ${spec.git.commit}` : null, spec.git.commitDate ? spec.git.commitDate.slice(0, 10) : null, spec.git.dirty ? "uncommitted changes at scan time" : null].filter(Boolean).join(" · ") : null],
            ["languages", spec.languages?.length ? spec.languages.map((l) => `${l.language} ${l.files}`).join(" · ") : null],
            ["docs", spec.docs?.length ? <Mono>{spec.docs.join("  ")}</Mono> : null],
            ["files scanned", spec.filesScanned != null ? String(spec.filesScanned) : null],
          ]}
        />
      </Card>
      {(spec.components ?? []).map((c) => (
        <ComponentCard key={`${c.path}:${c.slug}`} c={c} />
      ))}
      {spec.notes?.length ? (
        <Card title="Could not determine">
          <ul className="list-disc pl-4 text-xs text-ink-3">
            {spec.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
