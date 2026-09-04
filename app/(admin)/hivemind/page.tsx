import { PageHeader } from "@/components/PageHeader"
import { HivemindGraph } from "@/components/hivemind/HivemindGraph"
import { HIVE, KIND_STYLE, scanAge, type NodeKind } from "@/lib/hivemind"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Hive mind" }

/* The counts worth reading as numbers rather than hunting for in the graph. */
const HEADLINE: NodeKind[] = ["agent", "skill", "command", "routine"]

export default function HivemindPage() {
  const { counts, plugin, scannedAt } = HIVE

  return (
    <>
      <PageHeader
        title="Hive mind"
        actions={
          <p className="font-mono text-[11px] text-ink-3">
            {plugin.name} v{plugin.version} · scanned {scanAge(scannedAt)}
          </p>
        }
      />

      <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-tk-slate">
        Every skill, specialist, command and routine currently wired into the
        plugin, and what each one loads. Read from{" "}
        <span className="font-mono text-[12px]">{plugin.root}</span> by{" "}
        <span className="font-mono text-[12px]">npm run hivemind:scan</span> — rerun
        it after changing the hive and this map changes with it.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {HEADLINE.map((kind) => (
          <Card radius="xl" className="px-4 py-2.5" key={kind}>
            <p className="font-display text-2xl font-semibold tabular-nums leading-none text-tk-onyx">
              {counts[kind] ?? 0}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-3">
              {KIND_STYLE[kind].label}s
            </p>
          </Card>
        ))}
      </div>

      <section className="mt-5">
        <HivemindGraph graph={HIVE} />
      </section>
    </>
  )
}
