import type { CsvTable } from "@/lib/insights/csv"

/** Download one snapshot table as CSV — served from the cache, never Google. */
export function CsvLink({ slug, table, label = "CSV" }: { slug: string; table: CsvTable; label?: string }) {
  return (
    <a
      href={`/api/insights/export?site=${encodeURIComponent(slug)}&table=${table}`}
      download
      className="rounded-md border border-tk-slate/20 bg-white px-2 py-1 text-[10.5px] font-semibold text-tk-slate transition-colors hover:border-tk-teal hover:text-tk-teal"
    >
      {label} ↓
    </a>
  )
}
